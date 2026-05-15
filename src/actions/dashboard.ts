"use server"

import { supabaseAdmin } from "@/lib/supabase-admin"

export async function getConversations(orgId: string) {
  const { data, error } = await supabaseAdmin
    .from("conversations")
    .select(`
      *,
      contact:contacts(*)
    `)
    .eq("org_id", orgId)
    .order("last_message_at", { ascending: false })

  if (error) {
    console.error(error)
    return []
  }
  return data
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

export async function replyToConversation(orgId: string, conversationId: string, content: string) {
  const { error } = await supabaseAdmin
    .from("messages")
    .insert({
      org_id: orgId,
      conversation_id: conversationId,
      sender_type: "agent",
      sender_id: "agent-1", // Dummy agent ID for now
      content: content
    })

  if (error) throw error
  
  // Update conversation last_message_at
  await supabaseAdmin
    .from("conversations")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", conversationId)

  return true
}
