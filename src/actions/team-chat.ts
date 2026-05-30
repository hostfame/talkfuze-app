"use server"

import { createClient } from "@/lib/supabase/server"
import { supabaseAdmin } from "@/lib/supabase-admin"

export async function fetchTeamChats(orgId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  // FAST FETCH: avoid RLS loops by using admin after verifying context
  const { data: memberships } = await supabaseAdmin
    .from('team_chat_members')
    .select('chat_id')
    .eq('user_id', user.id)

  if (!memberships || memberships.length === 0) return []
  
  const chatIds = memberships.map(m => m.chat_id)

  const { data: chats, error } = await supabaseAdmin
    .from('team_chats')
    .select(`
      id,
      org_id,
      type,
      name,
      team_chat_members(user_id, last_read_at)
    `)
    .in('id', chatIds)
    .eq('org_id', orgId)
    .order('updated_at', { ascending: false })

  if (error) {
    console.error("Error fetching team chats:", error)
    return []
  }

  return chats
}

export async function fetchTeamMessages(chatId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  // Verify membership fast
  const { data: membership } = await supabaseAdmin
    .from('team_chat_members')
    .select('chat_id')
    .eq('chat_id', chatId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!membership) return []

  // Fast fetch
  const { data: messages, error } = await supabaseAdmin
    .from('team_messages')
    .select(`
      id,
      chat_id,
      sender_id,
      content,
      created_at,
      users (name, avatar_url)
    `)
    .eq('chat_id', chatId)
    .order('created_at', { ascending: true })
    .limit(100)

  if (error) {
    console.error("Error fetching team messages:", error)
    return []
  }

  return messages.map((m: any) => ({
    id: m.id,
    chat_id: m.chat_id,
    sender_id: m.sender_id,
    content: m.content,
    created_at: m.created_at,
    sender_name: m.users?.name || null,
    sender_avatar: m.users?.avatar_url || null
  }))
}

export async function sendTeamMessage(chatId: string, content: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Not authenticated")

  // Verify membership fast
  const { data: membership } = await supabaseAdmin
    .from('team_chat_members')
    .select('chat_id')
    .eq('chat_id', chatId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!membership) throw new Error("Not a member of this chat")

  const { data, error } = await supabaseAdmin
    .from('team_messages')
    .insert({
      chat_id: chatId,
      sender_id: user.id,
      content
    })
    .select()
    .single()

  if (error) {
    console.error("Error sending team message:", error)
    throw error
  }

  // Update chat updated_at
  await supabaseAdmin
    .from('team_chats')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', chatId)

  return data
}

export async function getOrCreateDirectChat(orgId: string, otherUserId: string) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: "Not authenticated" }

    // Check if direct chat already exists between these two users (fast via admin)
    const { data: existingChats, error: fetchError } = await supabaseAdmin
      .from('team_chat_members')
      .select('chat_id')
      .eq('user_id', user.id)

    if (fetchError) return { error: "Fetch existing chats failed: " + fetchError.message }

    if (existingChats && existingChats.length > 0) {
      const chatIds = existingChats.map(c => c.chat_id)
      const { data: otherMemberChats, error: fetchError2 } = await supabaseAdmin
        .from('team_chat_members')
        .select('chat_id')
        .in('chat_id', chatIds)
        .eq('user_id', otherUserId)
        
      if (fetchError2) return { error: "Fetch other member chats failed: " + fetchError2.message }

      if (otherMemberChats && otherMemberChats.length > 0) {
        // Find one that is of type 'direct'
        const { data: directChat, error: typeError } = await supabaseAdmin
          .from('team_chats')
          .select('id')
          .in('id', otherMemberChats.map(c => c.chat_id))
          .eq('type', 'direct')
          .maybeSingle()

        if (directChat) return { data: directChat.id }
      }
    }

    // Create new direct chat
    const { data: newChat, error: createError } = await supabaseAdmin
      .from('team_chats')
      .insert({
        org_id: orgId,
        type: 'direct'
      })
      .select()
      .single()

    if (createError) {
      console.error("Failed to create team_chats:", createError)
      return { error: "Create chat failed: " + createError.message }
    }

    // Add members
    const { error: membersError } = await supabaseAdmin
      .from('team_chat_members')
      .insert([
        { chat_id: newChat.id, user_id: user.id },
        { chat_id: newChat.id, user_id: otherUserId }
      ])

    if (membersError) {
      console.error("Failed to add members:", membersError)
      return { error: "Add members failed: " + membersError.message }
    }

    return { data: newChat.id }
  } catch (err: any) {
    console.error("getOrCreateDirectChat catch block:", err)
    return { error: "Unexpected server error: " + err.message }
  }
}
