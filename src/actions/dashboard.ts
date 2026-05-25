"use server"

import { supabaseAdmin } from "@/lib/supabase-admin"
import { createClient } from "@/lib/supabase/server"
import type { ChannelConfig, MessageMetadata, Relation } from "@/lib/types"
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3"
import { fetchWhmcsClient } from "@/actions/whmcs"
import { processInternalAiFeedback } from "@/actions/ai-learning"
import { unstable_noStore as noStore } from 'next/cache'

type ConversationChannelRelation = Relation<{
  type?: string | null
  config?: ChannelConfig | null
}>

type ConversationContactRelation = Relation<{
  id?: string | null
  platform_id?: string | null
  email?: string | null
  phone?: string | null
}>

function firstRelation<T>(relation: Relation<T> | undefined) {
  return Array.isArray(relation) ? relation[0] : relation
}


export async function getCrmData(orgId: string, phone: string) {
  noStore();
  const { data, error } = await supabaseAdmin
    .from('channels')
    .select('config')
    .eq('org_id', orgId)
    .eq('type', 'settings_crm_webhook')
    .single()
    
  if (error || !data || !data.config?.enabled || !data.config?.url) {
    return null
  }

  const { url, secret } = data.config;

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    if (secret) {
      headers['Authorization'] = `Bearer ${secret}`;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ phone })
    });

    if (!response.ok) {
      console.error("CRM Webhook returned error:", response.status);
      return null;
    }

    return await response.json();
  } catch (e) {
    console.error("Failed to fetch CRM data:", e);
    return null;
  }
}

export async function getConversations(orgId: string, filter: 'all' | 'unassigned' | 'assigned' | 'archived' | 'ticketed' | string = 'all', agentId?: string) {
  noStore();
  let query = supabaseAdmin
    .from("conversations")
    .select(`
      *,
      contact:contacts(*),
      assignee:users!assigned_to(*),
      channels(type),
      participants:conversation_participants(id),
      messages(id, content, sender_type, content_type, created_at, status, platform_message_id, is_internal, metadata)
    `)
    .eq("org_id", orgId)
    .order("created_at", { foreignTable: "messages", ascending: false })
    .limit(10, { foreignTable: "messages" })
    .order("last_message_at", { ascending: false });

  if (filter === 'archived') {
    query = query.eq("is_archived", true);
  } else if (filter === 'ticketed') {
    query = query.eq("is_archived", true).contains("tags", ['ticketed']);
  } else {
    query = query.eq("is_archived", false);
    // Hide snoozed conversations unless snooze time has passed
    query = query.or(`snoozed_until.is.null,snoozed_until.lte.${new Date().toISOString()}`);
    
    if (filter === 'unassigned') {
      query = query.is("assigned_to", null);
    } else if (filter === 'assigned' && agentId) {
      query = query.eq("assigned_to", agentId);
    }
  }

  const { data, error } = await query;

  if (error) {
    console.error(error)
    return []
  }
  return data
}

export async function assignConversation(orgId: string, conversationId: string, agentId: string | null) {
  const { error } = await supabaseAdmin
    .from("conversations")
    .update({ assigned_to: agentId })
    .eq("id", conversationId)
    .eq("org_id", orgId);

  if (error) throw new Error(error.message);
  return { success: true };
}

export async function getMessages(conversationId: string, limit: number = 50, beforeTimestamp?: string) {
  noStore();
  if (!conversationId) return []
  
  let query = supabaseAdmin
    .from("messages")
    .select("*")
    .eq("conversation_id", conversationId)
    
  if (beforeTimestamp) {
    query = query.lt("created_at", beforeTimestamp)
  }
  
  const { data, error } = await query
    .order("created_at", { ascending: false })
    .limit(limit)

  if (error) {
    console.error(error)
    return []
  }
  return data.reverse()
}

export async function replyToConversation(
  orgId: string, 
  conversationId: string, 
  content: string, 
  isInternal: boolean = false,
  contentType: string = 'text',
  metadata: MessageMetadata = {},
  createdAt?: string
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  
  // We can trust the client's orgId if RLS is enabled, but let's fetch it securely
  const { data: profile } = await supabaseAdmin.from("users").select("org_id").eq("id", user.id).single();
  if (!profile) throw new Error("Profile not found");
  
  const realOrgId = profile.org_id;
  const senderId = user.id;
  // First get the conversation details to know the channel and contact
  const { data: conv, error: convError } = await supabaseAdmin
    .from("conversations")
    .select(`
      id,
      contact_id,
      contact:contacts(id, platform_id, email, phone),
      channel:channels(type, config)
    `)
    .eq("id", conversationId)
    .single();

  if (convError || !conv) throw new Error("Conversation not found");

  const insertData: any = {
    org_id: realOrgId,
    conversation_id: conversationId,
    sender_type: "agent",
    sender_id: senderId,
    content: content,
    content_type: contentType,
    metadata: metadata,
    is_internal: isInternal,
    status: isInternal ? 'delivered' : (metadata.scheduled_delay ? 'sending' : 'sent')
  };

  if (createdAt) {
    insertData.created_at = createdAt;
  }

  // Insert into DB first so UI updates instantly
  const { data: insertedMessage, error } = await supabaseAdmin
    .from("messages")
    .insert(insertData)
    .select("id")
    .single()

  if (error) throw error
  
  // Update conversation last_message_at
  await supabaseAdmin
    .from("conversations")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", conversationId)

  // Route the outbound message to the correct platform
  // Supabase might return relations as arrays or single objects depending on schema
  const channelData = firstRelation(conv.channel as ConversationChannelRelation);
  const channelType = channelData?.type;
  const channelConfig = channelData?.config;
  const contactData = firstRelation(conv.contact as ConversationContactRelation);
  const recipientId = contactData?.platform_id;

  // Kick off background routing and integration pipelines (non-blocking for extreme WhatsApp-like speed)
  (async () => {
    try {
      // Auto-bind WHMCS if it's WhatsApp and contact has no email linked yet
      if (channelType === 'whatsapp' && contactData?.id && !contactData?.email && recipientId) {
        const rawNum = recipientId.includes('@') ? recipientId.split('@')[0] : recipientId;
        const cleanNum = rawNum.replace(/\D/g, '');
        if (cleanNum.length >= 8) {
          try {
            const whmcsClient = (await fetchWhmcsClient(cleanNum)) as any;
            if (whmcsClient && whmcsClient.email) {
              await supabaseAdmin.from('contacts').update({ email: whmcsClient.email }).eq('id', contactData.id);
              if (!contactData.phone && whmcsClient.phonenumber && !whmcsClient.phonenumber.includes('@')) {
                let cleanPhoneNum = whmcsClient.phonenumber.replace(/\D/g, '');
                if (cleanPhoneNum.length === 10 && cleanPhoneNum.startsWith('1')) {
                  cleanPhoneNum = '880' + cleanPhoneNum;
                } else if (cleanPhoneNum.length === 11 && cleanPhoneNum.startsWith('01')) {
                  cleanPhoneNum = '88' + cleanPhoneNum;
                }
                if (cleanPhoneNum.length >= 9) {
                  await supabaseAdmin.from('contacts').update({ phone: cleanPhoneNum }).eq('id', contactData.id);
                }
              }
            }
          } catch (e) {
            console.error("Auto-binding in replyToConversation failed:", e);
          }
        }
      }

      // Do not send to external platforms if it's an internal note
      if (isInternal) {
        // Kick off AI teaching pipeline in the background
        processInternalAiFeedback(conversationId, content);
        return;
      }

      if (channelType === 'messenger' || channelType === 'instagram') {
        const pageAccessToken = channelConfig?.access_token;
        if (!pageAccessToken) {
          console.warn("No access_token found in channel config. Message saved in DB but not sent to Meta.");
          return;
        }

        try {
          const endpoint = `https://graph.facebook.com/v20.0/me/messages?access_token=${pageAccessToken}`;

          const response = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              recipient: { id: recipientId },
              message: { text: content },
              messaging_type: "RESPONSE"
            })
          });

          const responseData = await response.json();
          if (!response.ok) {
            console.error("Meta API Error:", responseData);
            await supabaseAdmin
              .from("messages")
              .update({
                status: "failed",
                metadata: {
                  ...metadata,
                  delivery_error: responseData?.error?.message || "Meta API send failed",
                  delivery_failed_at: new Date().toISOString()
                }
              })
              .eq("id", insertedMessage.id);
          } else if (responseData?.message_id) {
            await supabaseAdmin
              .from("messages")
              .update({
                platform_message_id: responseData.message_id,
                status: "delivered"
              })
              .eq("id", insertedMessage.id);
          }
        } catch (e) {
          console.error("Failed to send Meta reply:", e);
          await supabaseAdmin
            .from("messages")
            .update({
              status: "failed",
              metadata: {
                ...metadata,
                delivery_error: e instanceof Error ? e.message : "Meta send failed",
                delivery_failed_at: new Date().toISOString()
              }
            })
            .eq("id", insertedMessage.id);
        }
      }
    } catch (bgErr) {
      console.error("Background routing execution failed:", bgErr);
    }
  })();

  return true
}

export async function searchConversations(orgId: string, query: string) {
  noStore();
  if (!query) return [];
  const cleanQuery = query.toLowerCase();

  // 1. Find matching contacts using highly flexible query patterns (matching dots, dashes, local, or international formats)
  let contactOrFilter = `name.ilike.%${cleanQuery}%,platform_id.ilike.%${cleanQuery}%`;

  const digits = query.replace(/\D/g, '');
  if (digits.length >= 3) {
    contactOrFilter += `,platform_id.ilike.%${digits}%`;
    
    // Support local format (starting with 0, e.g. 01868...) by stripping the leading 0 to match international 8801868...
    if (digits.startsWith('0')) {
      const strippedLocal = digits.substring(1);
      if (strippedLocal.length >= 3) {
        contactOrFilter += `,platform_id.ilike.%${strippedLocal}%`;
      }
    }
  }

  const { data: contacts } = await supabaseAdmin
    .from("contacts")
    .select("id")
    .eq("org_id", orgId)
    .or(contactOrFilter);
  
  const contactIds = contacts?.map(c => c.id) || [];

  // 2. Find matching messages
  const { data: messages } = await supabaseAdmin
    .from("messages")
    .select("conversation_id, content, sender_type, content_type")
    .eq("org_id", orgId)
    .ilike("content", `%${cleanQuery}%`)
    .limit(50);
  
  const msgConvIds = messages?.map(m => m.conversation_id) || [];

  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanQuery);
  if (isUuid && !msgConvIds.includes(cleanQuery)) {
    msgConvIds.push(cleanQuery);
  }

  // Combine and deduplicate conversation IDs
  // We don't have conversation IDs for the contacts yet, we just filter by contact_id
  
  let convQuery = supabaseAdmin
    .from("conversations")
    .select(`
      *,
      contact:contacts(*),
      assignee:users!assigned_to(*),
      channels(type),
      participants:conversation_participants(id),
      messages(id, content, sender_type, content_type, created_at, status, platform_message_id)
    `)
    .eq("org_id", orgId)
    .order("created_at", { foreignTable: "messages", ascending: false })
    .limit(10, { foreignTable: "messages" });
    
  if (contactIds.length > 0 && msgConvIds.length > 0) {
    convQuery = convQuery.or(`contact_id.in.(${contactIds.join(',')}),id.in.(${msgConvIds.join(',')})`);
  } else if (contactIds.length > 0) {
    convQuery = convQuery.in("contact_id", contactIds);
  } else if (msgConvIds.length > 0) {
    convQuery = convQuery.in("id", msgConvIds);
  } else {
    return []; // No matches found
  }

  const { data, error } = await convQuery.order("last_message_at", { ascending: false }).limit(20);

  if (error) {
    console.error(error);
    return [];
  }
  
  // Inject the matched message if it exists so the UI can show the highlighted snippet
  const enrichedData = data?.map(conv => {
    const matchedMsg = messages?.find(m => m.conversation_id === conv.id);
    if (matchedMsg) {
      return { ...conv, matched_message: matchedMsg };
    }
    return conv;
  });

  return enrichedData;
}

export async function createConversation(orgId: string, phone: string) {
  // 1. Get default WhatsApp channel
  const { data: channels, error: channelError } = await supabaseAdmin
    .from("channels")
    .select("id, type")
    .eq("org_id", orgId)
    .eq("type", "whatsapp")
    .limit(1);

  if (channelError || !channels || channels.length === 0) {
    throw new Error("No active WhatsApp channel found for this organization.");
  }
  const channelId = channels[0].id;

  // 2. Find or create contact
  // Strip non-numeric characters for search
  let cleanPhone = phone.replace(/\D/g, '');
  
  // Auto-format BD local numbers to international (880...)
  if (cleanPhone.length === 10 && cleanPhone.startsWith('1')) {
    cleanPhone = '880' + cleanPhone;
  } else if (cleanPhone.length === 11 && cleanPhone.startsWith('01')) {
    cleanPhone = '88' + cleanPhone;
  }
  let { data: contact } = await supabaseAdmin
    .from("contacts")
    .select("*")
    .eq("org_id", orgId)
    .eq("platform_id", cleanPhone)
    .single();

  if (!contact) {
    // If exact match not found, try stripping formatting (if DB stores formatted, this is harder, but we assume exact for now, or insert exact)
    const { data: newContact, error: insertContactError } = await supabaseAdmin
      .from("contacts")
      .insert({
        org_id: orgId,
        platform_type: "whatsapp",
        platform_id: cleanPhone,
        phone: cleanPhone,
        name: cleanPhone,
        status: "active"
      })
      .select()
      .single();

    if (insertContactError) throw insertContactError;
    contact = newContact;
  }

  // 3. Find or create conversation
  let { data: conversation } = await supabaseAdmin
    .from("conversations")
    .select("id")
    .eq("org_id", orgId)
    .eq("contact_id", contact.id)
    .eq("channel_id", channelId)
    .eq("status", "open")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!conversation) {
    const { data: newConversation, error: insertConvError } = await supabaseAdmin
      .from("conversations")
      .insert({
        org_id: orgId,
        contact_id: contact.id,
        channel_id: channelId,
        status: "open",
        last_message_at: new Date().toISOString()
      })
      .select()
      .single();

    if (insertConvError) throw insertConvError;
    conversation = newConversation;
  }
  if (!conversation) {
    throw new Error("Failed to create or find conversation");
  }

  return conversation.id;
}

// ─────────────────────────────────────────────
// Phase 3: Multi-Agent Collaboration
// ─────────────────────────────────────────────

export async function getParticipants(conversationId: string) {
  noStore();
  const { data, error } = await supabaseAdmin
    .from('conversation_participants')
    .select('id, user_id, joined_at, user:users(id, name, avatar_url, role)')
    .eq('conversation_id', conversationId)
    .order('joined_at', { ascending: true })

  if (error) return []
  return data || []
}

export async function joinConversation(conversationId: string, createdAt?: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  // Get agent profile
  const { data: profile } = await supabaseAdmin
    .from('users')
    .select('id, name, org_id')
    .eq('id', user.id)
    .single()

  if (!profile) throw new Error('Agent profile not found')

  // Check if already joined
  const { data: existingParticipant } = await supabaseAdmin
    .from('conversation_participants')
    .select('id')
    .eq('conversation_id', conversationId)
    .eq('user_id', profile.id)
    .single()

  if (!existingParticipant) {
    // Insert participant (idempotent - ignore conflict via upsert)
    const { error: insertError } = await supabaseAdmin
      .from('conversation_participants')
      .upsert(
        { conversation_id: conversationId, user_id: profile.id },
        { onConflict: 'conversation_id,user_id', ignoreDuplicates: true }
      )

    if (insertError) {
      throw new Error(insertError.message)
    }

    const insertData: any = {
      conversation_id: conversationId,
      org_id: profile.org_id,
      sender_type: 'system',
      sender_id: profile.id,
      content: `${profile.name} joined the conversation`,
      content_type: 'system',
      is_internal: false,
      status: 'delivered',
    };
    
    if (createdAt) {
      insertData.created_at = createdAt;
    }

    // Insert system message
    await supabaseAdmin.from('messages').insert(insertData)
  }

  return getParticipants(conversationId)
}

export async function leaveConversation(conversationId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data: profile } = await supabaseAdmin
    .from('users')
    .select('id, name, org_id')
    .eq('id', user.id)
    .single()

  if (!profile) throw new Error('Agent profile not found')

  await supabaseAdmin
    .from('conversation_participants')
    .delete()
    .eq('conversation_id', conversationId)
    .eq('user_id', profile.id)

  await supabaseAdmin.from('messages').insert({
    conversation_id: conversationId,
    org_id: profile.org_id,
    sender_type: 'system',
    sender_id: profile.id,
    content: `${profile.name} left the conversation`,
    content_type: 'system',
    is_internal: false,
    status: 'delivered',
  })

  return getParticipants(conversationId)
}

// ─────────────────────────────────────────────
// Phase 4: Ticket Lifecycle
// ─────────────────────────────────────────────

export async function resolveConversation(conversationId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { error } = await supabaseAdmin
    .from('conversations')
    .update({ status: 'resolved' })
    .eq('id', conversationId)

  if (error) throw new Error(error.message)
  return { success: true }
}

export async function reopenConversation(conversationId: string) {
  const { error } = await supabaseAdmin
    .from('conversations')
    .update({ status: 'open' })
    .eq('id', conversationId)

  if (error) throw new Error(error.message)
  return { success: true }
}

export async function snoozeConversation(conversationId: string, until: Date | null) {
  const updateData: any = { snoozed_until: until ? until.toISOString() : null };
  if (until) {
    updateData.status = 'pending';
  } else {
    updateData.status = 'open';
  }

  const { error } = await supabaseAdmin
    .from('conversations')
    .update(updateData)
    .eq('id', conversationId)

  if (error) throw new Error(error.message)
  return { success: true }
}

// ─────────────────────────────────────────────
// Thread Management (Pin, Mute, Leave, Delete)
// ─────────────────────────────────────────────

export async function toggleConversationFlag(conversationId: string, flag: 'is_pinned' | 'is_unread' | 'is_muted' | 'is_archived', value: boolean) {
  const updateData: any = { [flag]: value }
  if (flag === 'is_archived' && value === true) {
    updateData.status = 'resolved'
  }
  const { error } = await supabaseAdmin
    .from('conversations')
    .update(updateData)
    .eq('id', conversationId)

  if (error) throw new Error(error.message)
  return { success: true }
}



export async function deleteConversation(conversationId: string) {
  const { error } = await supabaseAdmin
    .from('conversations')
    .delete()
    .eq('id', conversationId)

  if (error) throw new Error(error.message)
  return { success: true }
}

export async function updateConversationStatus(conversationId: string, status: 'open' | 'pending' | 'resolved' | 'closed') {
  const { error } = await supabaseAdmin
    .from('conversations')
    .update({ status })
    .eq('id', conversationId)

  if (error) throw new Error(error.message)
  return { success: true }
}




export async function toggleContactBanStatus(contactId: string, currentStatus: string) {
  const newStatus = currentStatus === 'banned' ? 'active' : 'banned'
  const { data, error } = await supabaseAdmin
    .from('contacts')
    .update({ status: newStatus })
    .eq('id', contactId)
    .select()
    .single()

  if (error) throw new Error(error.message)
  return data
}

export async function uploadAgentMedia(formData: FormData) {
  const file = formData.get('file') as File;
  if (!file) {
    return { success: false, error: "No file provided" };
  }

  const fileExt = file.name ? file.name.split('.').pop() : 'png';
  const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;
  const filePath = `agent-uploads/${fileName}`;

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
    console.error("uploadAgentMedia error:", err);
    return { success: false, error: err.message || "Failed to upload to R2" };
  }
}

export async function editMessage(messageId: string, newContent: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data: existingMsg } = await supabaseAdmin
    .from('messages')
    .select('metadata')
    .eq('id', messageId)
    .single()

  const updatedMetadata = {
    ...(existingMsg?.metadata || {}),
    edited_at: new Date().toISOString()
  }

  const { data, error } = await supabaseAdmin
    .from('messages')
    .update({ content: newContent, metadata: updatedMetadata })
    .eq('id', messageId)
    .select()
    .single()

  if (error) throw new Error(error.message)
  return { success: true }
}

export async function recallMessage(messageId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const { error } = await supabaseAdmin
    .from('messages')
    .update({ status: 'recalled' })
    .eq('id', messageId)

  if (error) {
    console.error('[recallMessage] Supabase error:', error);
    return { success: false, error: error.message }
  }
  return { success: true }
}
