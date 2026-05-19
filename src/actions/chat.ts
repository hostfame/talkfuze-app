"use server"
import { unstable_noStore as noStore } from "next/cache";

import { supabaseAdmin } from "@/lib/supabase-admin"

export async function sendWidgetMessage(orgId: string, deviceId: string, content: string, contentType: string = 'text', metadata: Record<string, any> = {}) {
  if (!orgId || !deviceId || !content) {
    throw new Error("Missing required fields")
  }

  // 1. Get or Create Widget Channel for this Org
  const { data: channels, error: chFetchErr } = await supabaseAdmin
    .from("channels")
    .select("id")
    .eq("org_id", orgId)
    .eq("type", "widget")
    .limit(1)

  if (chFetchErr) throw chFetchErr

  let channel = channels && channels.length > 0 ? channels[0] : null;

  if (!channel) {
    const { data: newChannel, error: channelErr } = await supabaseAdmin
      .from("channels")
      .insert({ org_id: orgId, type: "widget" })
      .select("id")
      .single()
    if (channelErr) throw channelErr
    channel = newChannel
  }

  // 2. Get or Create Contact based on deviceId
  const { data: contacts, error: contactFetchErr } = await supabaseAdmin
    .from("contacts")
    .select("id")
    .eq("org_id", orgId)
    .eq("platform_type", "widget")
    .eq("platform_id", deviceId)
    .limit(1)

  if (contactFetchErr) throw contactFetchErr

  let contact = contacts && contacts.length > 0 ? contacts[0] : null;

  if (!contact) {
    const { data: newContact, error: contactErr } = await supabaseAdmin
      .from("contacts")
      .insert({
        org_id: orgId,
        platform_type: "widget",
        platform_id: deviceId,
        name: "Website Visitor"
      })
      .select("id")
      .single()
    if (contactErr) throw contactErr
    contact = newContact
  }

  // 3. Get or Create Open Conversation
  const { data: convs, error: convFetchErr } = await supabaseAdmin
    .from("conversations")
    .select("id")
    .eq("org_id", orgId)
    .eq("contact_id", contact.id)
    .eq("status", "open")
    .order('created_at', { ascending: false })
    .limit(1)

  if (convFetchErr) throw convFetchErr

  let conversation = convs && convs.length > 0 ? convs[0] : null;

  if (!conversation) {
    const { data: newConv, error: convErr } = await supabaseAdmin
      .from("conversations")
      .insert({
        org_id: orgId,
        channel_id: channel.id,
        contact_id: contact.id,
        status: "open"
      })
      .select("id")
      .single()
    if (convErr) throw convErr
    conversation = newConv
  }

  // 4. Insert the Message
  const { error: msgErr } = await supabaseAdmin
    .from("messages")
    .insert({
      org_id: orgId,
      conversation_id: conversation.id,
      sender_type: "contact",
      sender_id: contact.id,
      content: content,
      content_type: contentType,
      metadata: Object.keys(metadata).length > 0 ? metadata : null
    })

  if (msgErr) throw msgErr

  // Update conversation last_message_at so it floats to the top of the inbox
  await supabaseAdmin
    .from("conversations")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", conversation.id)

  return { success: true, conversationId: conversation.id }
}

export async function getWidgetMessages(orgId: string, deviceId: string) {
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
    
    // Find active conversation
    const { data: convs, error: convErr } = await supabaseAdmin
      .from("conversations")
      .select("id")
      .eq("contact_id", contacts[0].id)
      .order('created_at', { ascending: false })
      .limit(1)
      
    if (convErr) console.error("getWidgetMessages conv err:", convErr);
    if (!convs || convs.length === 0) return [];
    
    // Get messages
    const { data: messages, error: msgErr } = await supabaseAdmin
      .from("messages")
      .select("*")
      .eq("conversation_id", convs[0].id)
      .order("created_at", { ascending: true })
      
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

export async function getWidgetSettings(orgId: string) {
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

  const { error: uploadError } = await supabaseAdmin.storage
    .from('media')
    .upload(filePath, file);

  if (uploadError) {
    console.error("uploadWidgetMedia error:", uploadError);
    return { success: false, error: uploadError.message };
  }

  const { data: urlData } = supabaseAdmin.storage
    .from('media')
    .getPublicUrl(filePath);

  return { success: true, url: urlData.publicUrl };
}
