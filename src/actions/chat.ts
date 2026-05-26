"use server"
import { unstable_noStore as noStore } from "next/cache";

import { supabaseAdmin } from "@/lib/supabase-admin"
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3"

// Module-level cache for widget lookups (survives across requests in the same serverless instance)
const widgetCache: Record<string, { channelId: string; contactId: string; ts: number }> = {};
const WIDGET_CACHE_TTL = 10 * 60 * 1000; // 10 min

export async function sendWidgetMessage(orgId: string, deviceId: string, content: string, contentType: string = 'text', metadata: Record<string, any> = {}, targetConversationId?: string) {
  if (!orgId || !deviceId || !content) {
    throw new Error("Missing required fields")
  }

  const cacheKey = `${orgId}:${deviceId}`;
  const cached = widgetCache[cacheKey];
  let channelId: string;
  let contactId: string;

  if (cached && (Date.now() - cached.ts < WIDGET_CACHE_TTL)) {
    // Fast path: use cached IDs (99% of sends)
    channelId = cached.channelId;
    contactId = cached.contactId;
  } else {
    // Slow path: look up channel + contact in parallel
    const [channelResult, contactResult] = await Promise.all([
      supabaseAdmin.from("channels").select("id").eq("org_id", orgId).eq("type", "widget").limit(1),
      supabaseAdmin.from("contacts").select("id").eq("org_id", orgId).eq("platform_type", "widget").eq("platform_id", deviceId).limit(1)
    ]);

    if (channelResult.error) throw channelResult.error;
    if (contactResult.error) throw contactResult.error;

    let channel = channelResult.data?.[0];
    if (!channel) {
      const { data: newChannel, error: channelErr } = await supabaseAdmin
        .from("channels").insert({ org_id: orgId, type: "widget" }).select("id").single()
      if (channelErr) throw channelErr
      channel = newChannel
    }

    let contact = contactResult.data?.[0];
    if (!contact) {
      const { count } = await supabaseAdmin
        .from("contacts").select("id", { count: 'exact', head: true }).eq("org_id", orgId).eq("platform_type", "widget");
      const visitorNumber = (count || 0) + 1;
      const visitorName = `Website Visitor #${visitorNumber}`;
      const avatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(visitorName)}&background=random&color=fff&length=1`;
      const { data: newContact, error: contactErr } = await supabaseAdmin
        .from("contacts").insert({ org_id: orgId, platform_type: "widget", platform_id: deviceId, name: visitorName, avatar_url: avatarUrl }).select("id").single()
      if (contactErr) throw contactErr
      contact = newContact
    }

    channelId = channel!.id;
    contactId = contact!.id;
    widgetCache[cacheKey] = { channelId, contactId, ts: Date.now() };
  }

  // Get or Create Conversation
  let conversationId: string | null = null;

  if (targetConversationId && targetConversationId !== 'new') {
    const { data: targetConv } = await supabaseAdmin
      .from("conversations").select("id, status").eq("id", targetConversationId).eq("contact_id", contactId).single();
    if (targetConv) {
      if (targetConv.status === 'resolved' || targetConv.status === 'closed') {
        // Conversation is archived/resolved. We must start a NEW conversation.
        // So we explicitly do NOT set conversationId here, which forces creation below.
        conversationId = null;
      } else {
        conversationId = targetConv.id;
      }
    }
  }

  // If we didn't get a specific conversation, and we didn't explicitly request a 'new' one, look for an active one
  if (!conversationId && targetConversationId !== 'new') {
    const { data: convs } = await supabaseAdmin
      .from("conversations").select("id").eq("org_id", orgId).eq("contact_id", contactId).eq("status", "open").order('created_at', { ascending: false }).limit(1)
    conversationId = convs?.[0]?.id || null;
  }

  if (!conversationId) {
    const { data: newConv, error: convErr } = await supabaseAdmin
      .from("conversations").insert({ org_id: orgId, channel_id: channelId, contact_id: contactId, status: "open" }).select("id").single()
    if (convErr) throw convErr
    conversationId = newConv!.id;
  }

  // CRITICAL FIX: Prevent race conditions where the client-side timer fires the busy 
  // auto-reply right as an agent joins/replies. If an agent has already replied in this 
  // conversation, we MUST abort the busy message on the server side.
  if (metadata?.auto_reply) {
    const { data: agentMsgs } = await supabaseAdmin
      .from("messages")
      .select("id")
      .eq("conversation_id", conversationId)
      .eq("sender_type", "agent")
      .limit(1);
    
    if (agentMsgs && agentMsgs.length > 0) {
      return { success: true, conversationId, skipped: true, reason: "Agent already replied" };
    }
  }

  let senderType = "contact";
  let finalContentType = contentType;
  let finalSenderId: string | null = contactId;

  if (contentType === 'system') {
    senderType = "system";
    finalContentType = "text";
    finalSenderId = null;
  } else if (contentType === 'ai') {
    senderType = "ai";
    finalContentType = "text";
    finalSenderId = null;
  }

  const now = new Date().toISOString();
  
  const isPageView = metadata?.event === 'page_view' || content?.startsWith('Viewed:');
  
  const msgPromise = supabaseAdmin.from("messages").insert({
    org_id: orgId,
    conversation_id: conversationId,
    sender_type: senderType,
    sender_id: finalSenderId,
    content: content,
    content_type: finalContentType,
    metadata: Object.keys(metadata).length > 0 ? metadata : null
  });

  let msgResult;
  if (!isPageView) {
    const convPromise = supabaseAdmin.from("conversations").update({ last_message_at: now, is_archived: false }).eq("id", conversationId);
    const [msgRes] = await Promise.all([msgPromise, convPromise]);
    msgResult = msgRes;
  } else {
    msgResult = await msgPromise;
  }

  if (msgResult.error) throw msgResult.error;

  return { success: true, conversationId }
}

export async function getWidgetMessages(orgId: string, deviceId: string, conversationId?: string | null, _cacheBuster?: number, limit: number = 50, beforeTimestamp?: string) {
  noStore();
  if (!orgId || !deviceId) return [];
  
  try {
    // Find contact
    const { data: contacts, error: cErr } = await supabaseAdmin
      .from("contacts")
      .select("id")
      .eq("org_id", orgId)
      .eq("platform_type", "widget")
      .eq("platform_id", deviceId)
      .limit(1)
      
    if (cErr) console.error("getWidgetMessages contact err:", cErr);
    if (!contacts || contacts.length === 0) return [];
    
    let targetConvId = conversationId;
    
    if (!targetConvId) {
      // Find active conversation if not provided
      const { data: convs, error: convErr } = await supabaseAdmin
        .from("conversations")
        .select("id")
        .eq("contact_id", contacts[0].id)
        .order('last_message_at', { ascending: false })
        .limit(1)
        
      if (convErr) console.error("getWidgetMessages conv err:", convErr);
      if (!convs || convs.length === 0) return [];
      targetConvId = convs[0].id;
    }
    
    // Get messages
    let msgQuery = supabaseAdmin
      .from("messages")
      .select("*")
      .eq("conversation_id", targetConvId)
      .eq("is_internal", false)
      
    if (beforeTimestamp) {
      msgQuery = msgQuery.lt("created_at", beforeTimestamp)
    }
    
    let { data: messages, error: msgErr } = await msgQuery
      .order("created_at", { ascending: false })
      .limit(limit)
      
    if (messages) messages = messages.reverse()
      
    if (msgErr) console.error("getWidgetMessages msg err:", msgErr);
    
    if (!messages || messages.length === 0) return [];
    
    // Fetch agent details for agent/system messages (must be valid UUIDs)
    const agentIds = Array.from(new Set(
      messages
        .filter(m => m.sender_type === 'agent' || m.sender_type === 'system')
        .map(m => m.sender_id)
        .filter(id => id && id.length === 36 && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))
    ));
    
    let agentMap: Record<string, any> = {};
    if (agentIds.length > 0) {
      const { data: agents } = await supabaseAdmin
        .from('users')
        .select('id, name, avatar_url')
        .in('id', agentIds);
        
      if (agents) {
        agents.forEach(a => {
          agentMap[a.id] = a;
        });
      }
    }
    
    return messages.map(msg => {
      if (msg.sender_type === 'agent' || msg.sender_type === 'system') {
        return {
          ...msg,
          agent: agentMap[msg.sender_id] || null
        }
      }
      return msg;
    });
  } catch (e) {
    console.error("getWidgetMessages exception:", e);
    return [];
  }
}

export async function getAgentProfile(agentId: string) {
  noStore();
  if (!agentId) return null;
  try {
    const { data: agent } = await supabaseAdmin
      .from('users')
      .select('id, name, avatar_url')
      .eq('id', agentId)
      .single();
    return agent || null;
  } catch (e) {
    console.error("getAgentProfile error:", e);
    return null;
  }
}

export async function getWidgetSettings(orgId: string) {
  noStore();
  if (!orgId) return null;
  try {
    const { data: org, error } = await supabaseAdmin
      .from('organizations')
      .select('settings')
      .eq('id', orgId)
      .single()

    if (error) {
      console.error("Error fetching org settings:", error)
      return null
    }

    if (org && org.settings) {
      // Assuming settings is a JSON object that contains widget configs
      // e.g. { widget: { color: '#0070f3', greetingTitle: '...', greetingSubtitle: '...' } }
      return org.settings as Record<string, any>;
    }
    return null;
  } catch (e) {
    console.error("getWidgetSettings exception:", e);
    return null;
  }
}

export async function uploadWidgetMedia(formData: FormData) {
  const file = formData.get('file') as File;
  if (!file) {
    return { success: false, error: "No file provided" };
  }

  const fileExt = file.name ? file.name.split('.').pop() : 'webm';
  const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;
  const filePath = `widget-uploads/${fileName}`;

  try {
    const s3Client = new S3Client({
      region: "auto",
      endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID || "",
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || "",
      },
    });

    const buffer = Buffer.from(await file.arrayBuffer());

    await s3Client.send(
      new PutObjectCommand({
        Bucket: "talkfuze-media",
        Key: filePath,
        Body: buffer,
        ContentType: file.type || "application/octet-stream",
      })
    );

    const publicUrl = `${process.env.R2_PUBLIC_DOMAIN}/${filePath}`;
    return { success: true, url: publicUrl };
  } catch (err: any) {
    console.error("uploadWidgetMedia error:", err);
    return { success: false, error: err.message || "Failed to upload to R2" };
  }
}

export async function startNewConversation(orgId: string, deviceId: string) {
  noStore();
  if (!orgId || !deviceId) return { success: false };
  
  try {
    // Find contact
    const { data: contacts } = await supabaseAdmin
      .from("contacts")
      .select("id")
      .eq("org_id", orgId)
      .eq("platform_type", "widget")
      .eq("platform_id", deviceId)
      .limit(1);
      
    if (!contacts || contacts.length === 0) return { success: true }; // no contact yet, so no open convos
    
    // Mark all open conversations for this contact as resolved
    await supabaseAdmin
      .from("conversations")
      .update({ status: "resolved" })
      .eq("org_id", orgId)
      .eq("contact_id", contacts[0].id)
      .eq("status", "open");
      
    return { success: true };
  } catch (e) {
    console.error("startNewConversation err:", e);
    return { success: false };
  }
}

export async function getWidgetConversations(orgId: string, deviceId: string, _cacheBuster?: number) {
  noStore();
  if (!orgId || !deviceId) return [];
  
  try {
    // 1. Find contact
    const { data: contacts, error: cErr } = await supabaseAdmin
      .from("contacts")
      .select("id")
      .eq("org_id", orgId)
      .eq("platform_type", "widget")
      .eq("platform_id", deviceId)
      .limit(1);
      
    if (cErr) console.error("getWidgetConversations contact err:", cErr);
    if (!contacts || contacts.length === 0) return [];
    
    const contactId = contacts[0].id;
    
    // 2. Find all conversations for this contact
    const { data: convs, error: convErr } = await supabaseAdmin
      .from("conversations")
      .select("id, status, created_at, last_message_at")
      .eq("contact_id", contactId)
      .order("last_message_at", { ascending: false });
      
    if (convErr) console.error("getWidgetConversations conv err:", convErr);
    if (!convs || convs.length === 0) return [];
    
    // 3. For each conversation, fetch its latest message to show preview
    const convIds = convs.map((c: any) => c.id);
    
    const { data: latestMsgs, error: msgErr } = await supabaseAdmin
      .from("messages")
      .select("conversation_id, content, sender_type, sender_id, created_at")
      .in("conversation_id", convIds)
      .eq("is_internal", false)
      .neq("sender_type", "system")
      .order("created_at", { ascending: false });
      
    if (msgErr) console.error("getWidgetConversations msg err:", msgErr);
    
    // Group messages by conversation to find the latest
    const latestMsgByConv: Record<string, any> = {};
    if (latestMsgs) {
      latestMsgs.forEach(msg => {
        if (!latestMsgByConv[msg.conversation_id]) {
          latestMsgByConv[msg.conversation_id] = msg;
        }
      });
    }
    
    // 4. Fetch agent info if the latest message was from an agent
    const agentIds = Array.from(new Set(
      Object.values(latestMsgByConv)
        .filter((m: any) => m.sender_type === 'agent' || m.sender_type === 'system')
        .map((m: any) => m.sender_id)
        .filter(id => id && id.length === 36 && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))
    )) as string[];
    
    let agentMap: Record<string, any> = {};
    if (agentIds.length > 0) {
      const { data: agents } = await supabaseAdmin
        .from('users')
        .select('id, name, avatar_url')
        .in('id', agentIds);
        
      if (agents) {
        agents.forEach(a => {
          agentMap[a.id] = a;
        });
      }
    }
    
    // Assemble the final result
    return convs.map((c: any) => {
      const latestMsg = latestMsgByConv[c.id];
      let agent = null;
      if (latestMsg && (latestMsg.sender_type === 'agent' || latestMsg.sender_type === 'system')) {
        agent = agentMap[latestMsg.sender_id] || null;
      }
      return {
        ...c,
        latestMessage: latestMsg || null,
        agent: agent
      };
    });
    
  } catch (err) {
    console.error("getWidgetConversations err:", err);
    return [];
  }
}

export async function markMessagesAsRead(conversationId: string, role: 'contact' | 'agent') {
  if (!conversationId) return;
  try {
    // If role is contact, they are reading agent/system messages.
    // If role is agent, they are reading contact messages.
    const senderTypes = role === 'contact' ? ['agent', 'system'] : ['contact'];
    
    await supabaseAdmin
      .from('messages')
      .update({ status: 'read' })
      .eq('conversation_id', conversationId)
      .in('sender_type', senderTypes)
      .eq('status', 'delivered'); // or 'sent'
  } catch (e) {
    console.error('Failed to mark messages as read', e);
  }
}

export async function updateWidgetContactDetails(orgId: string, deviceId: string, name: string, phone: string) {
  noStore();
  if (!orgId || !deviceId) {
    throw new Error("Missing required parameters");
  }

  try {
    const { data: contacts } = await supabaseAdmin
      .from("contacts")
      .select("id")
      .eq("org_id", orgId)
      .eq("platform_type", "widget")
      .eq("platform_id", deviceId)
      .limit(1);

    const contact = contacts && contacts.length > 0 ? contacts[0] : null;

    if (!contact) {
      const avatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random&color=fff&length=1`;
      const { data: newContact, error: contactErr } = await supabaseAdmin
        .from("contacts")
        .insert({
          org_id: orgId,
          platform_type: "widget",
          platform_id: deviceId,
          name: name.trim(),
          phone: phone.trim() || null,
          avatar_url: avatarUrl
        })
        .select("id")
        .single();
        
      if (contactErr) throw contactErr;
    } else {
      const avatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random&color=fff&length=1`;
      const { error: updateErr } = await supabaseAdmin
        .from("contacts")
        .update({
          name: name.trim(),
          phone: phone.trim() || null,
          avatar_url: avatarUrl
        })
        .eq("id", contact.id);

      if (updateErr) throw updateErr;
    }

    return { success: true };
  } catch (e: any) {
    console.error("updateWidgetContactDetails error:", e);
    return { success: false, error: e.message };
  }
}

export async function getWidgetContact(orgId: string, deviceId: string) {
  noStore();
  if (!orgId || !deviceId) return null;
  
  try {
    const { data: contacts } = await supabaseAdmin
      .from("contacts")
      .select("name, phone")
      .eq("org_id", orgId)
      .eq("platform_type", "widget")
      .eq("platform_id", deviceId)
      .limit(1);
      
    if (contacts && contacts.length > 0) {
      return contacts[0];
    }
    return null;
  } catch (e) {
    console.error("getWidgetContact error:", e);
    return null;
  }
}

