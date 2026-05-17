"use server"

import { supabaseAdmin } from "@/lib/supabase-admin"

export async function sendWidgetMessage(orgId: string, deviceId: string, content: string) {
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
      content: content
    })

  if (msgErr) throw msgErr

  return { success: true, conversationId: conversation.id }
}

export async function getWidgetMessages(orgId: string, deviceId: string) {
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
    return messages || [];
  } catch (e) {
    console.error("getWidgetMessages exception:", e);
    return [];
  }
}
