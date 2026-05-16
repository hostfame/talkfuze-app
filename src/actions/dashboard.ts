"use server"

import { supabaseAdmin } from "@/lib/supabase-admin"

export async function getConversations(orgId: string, filter: 'all' | 'unassigned' | 'assigned' = 'all', agentId?: string) {
  let query = supabaseAdmin
    .from("conversations")
    .select(`
      *,
      contact:contacts(*),
      assignee:users!assigned_to(*),
      channels(type)
    `)
    .eq("org_id", orgId)
    .order("last_message_at", { ascending: false });

  if (filter === 'unassigned') {
    query = query.is("assigned_to", null);
  } else if (filter === 'assigned' && agentId) {
    query = query.eq("assigned_to", agentId);
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

  if (error) throw error;
  return true;
}

export async function getMessages(conversationId: string) {
  if (!conversationId) return []
  
  const { data, error } = await supabaseAdmin
    .from("messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })

  if (error) {
    console.error(error)
    return []
  }
  return data
}

export async function replyToConversation(orgId: string, conversationId: string, content: string, isInternal: boolean = false) {
  // First get the conversation details to know the channel and contact
  const { data: conv, error: convError } = await supabaseAdmin
    .from("conversations")
    .select(`
      id,
      contact:contacts(platform_id),
      channel:channels(type, config)
    `)
    .eq("id", conversationId)
    .single();

  if (convError || !conv) throw new Error("Conversation not found");

  // Insert into DB first so UI updates instantly
  const { error } = await supabaseAdmin
    .from("messages")
    .insert({
      org_id: orgId,
      conversation_id: conversationId,
      sender_type: "agent",
      sender_id: "agent-1", // Dummy agent ID for now
      content: content,
      is_internal: isInternal
    })

  if (error) throw error
  
  // Update conversation last_message_at
  await supabaseAdmin
    .from("conversations")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", conversationId)

  // Route the outbound message to the correct platform
  // Supabase might return relations as arrays or single objects depending on schema
  const channelData: any = conv.channel;
  const channelType = Array.isArray(channelData) ? channelData[0]?.type : channelData?.type;
  const channelConfig = Array.isArray(channelData) ? channelData[0]?.config : channelData?.config;

  // Do not send to external platforms if it's an internal note
  if (isInternal) {
    return true;
  }

  if (channelType === 'messenger') {
    const pageAccessToken = channelConfig?.access_token;
    if (!pageAccessToken) {
      console.warn("No access_token found in channel config. Message saved in DB but not sent to Meta.");
      return true;
    }

    try {
      const contactData: any = conv.contact;
      const recipientId = Array.isArray(contactData) ? contactData[0]?.platform_id : contactData?.platform_id;
      const response = await fetch(`https://graph.facebook.com/v19.0/me/messages?access_token=${pageAccessToken}`, {
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
      }
    } catch (e) {
      console.error("Failed to send Messenger reply:", e);
    }
  }
  // If it's WhatsApp, the Baileys worker will automatically pick it up via Supabase Realtime

  return true
}
