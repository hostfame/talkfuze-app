"use server"

import { supabaseAdmin } from "@/lib/supabase-admin"

export async function getQuickReplies(orgId: string) {
  const { data, error } = await supabaseAdmin
    .from('channels')
    .select('config')
    .eq('org_id', orgId)
    .eq('type', 'settings_quick_replies')
    .single()
    
  if (error || !data || !data.config?.items) {
    return []
  }
  return data.config.items
}

export async function getCrmData(orgId: string, phone: string) {
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
    const headers: any = {
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

export async function replyToConversation(
  orgId: string, 
  conversationId: string, 
  content: string, 
  isInternal: boolean = false,
  contentType: string = 'text',
  metadata: any = {}
) {
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
      content_type: contentType,
      metadata: metadata,
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

export async function searchConversations(orgId: string, query: string) {
  if (!query) return [];
  const cleanQuery = query.toLowerCase();

  // 1. Find matching contacts
  const { data: contacts } = await supabaseAdmin
    .from("contacts")
    .select("id")
    .eq("org_id", orgId)
    .or(`name.ilike.%${cleanQuery}%,platform_id.ilike.%${cleanQuery}%`);
  
  const contactIds = contacts?.map(c => c.id) || [];

  // 2. Find matching messages
  const { data: messages } = await supabaseAdmin
    .from("messages")
    .select("conversation_id")
    .eq("org_id", orgId)
    .ilike("content", `%${cleanQuery}%`)
    .limit(50);
  
  const msgConvIds = messages?.map(m => m.conversation_id) || [];

  // Combine and deduplicate conversation IDs
  // We don't have conversation IDs for the contacts yet, we just filter by contact_id
  
  let convQuery = supabaseAdmin
    .from("conversations")
    .select(`
      *,
      contact:contacts(*),
      assignee:users!assigned_to(*),
      channels(type)
    `)
    .eq("org_id", orgId);
    
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
  return data;
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
  const cleanPhone = phone.replace(/\\D/g, '');
  
  let { data: contact } = await supabaseAdmin
    .from("contacts")
    .select("*")
    .eq("org_id", orgId)
    .eq("platform_id", phone)
    .single();

  if (!contact) {
    // If exact match not found, try stripping formatting (if DB stores formatted, this is harder, but we assume exact for now, or insert exact)
    const { data: newContact, error: insertContactError } = await supabaseAdmin
      .from("contacts")
      .insert({
        org_id: orgId,
        platform_type: "whatsapp",
        platform_id: phone,
        name: phone,
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
    .single();

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
