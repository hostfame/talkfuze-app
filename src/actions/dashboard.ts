"use server"

import { supabaseAdmin } from "@/lib/supabase-admin"

export async function getConversations(orgId: string, filter: 'all' | 'unassigned' | 'assigned' = 'all', agentId?: string) {
  let query = supabaseAdmin
    .from("conversations")
    .select(`
      *,
      contact:contacts(*),
      assignee:users!assigned_to(*)
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
