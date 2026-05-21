"use server"

import { supabaseAdmin } from "@/lib/supabase-admin"

import { createClient } from "@/lib/supabase/server"
import type { Contact } from "@/lib/types"

type ContactConversation = {
  id: string
  last_message_at: string | null
  channels?: { type?: string | null } | null
}

type ContactWithConversations = Contact & {
  conversations?: ContactConversation[] | null
}

export async function getContacts() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Unauthorized")
  
  const { data: profile } = await supabaseAdmin.from("users").select("org_id").eq("id", user.id).single()
  if (!profile) throw new Error("Profile not found")

  const { data, error } = await supabaseAdmin
    .from('contacts')
    .select(`
      *,
      conversations (id, last_message_at, channels (type))
    `)
    .eq('org_id', profile.org_id)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching contacts:', error)
    return []
  }
  
  // Transform data to match UI needs
  return (data as ContactWithConversations[]).map(contact => {
    // Sort conversations to find the latest one
    const sortedConvs = [...(contact.conversations || [])].sort((a, b) => {
      const timeA = a.last_message_at ? new Date(a.last_message_at).getTime() : 0
      const timeB = b.last_message_at ? new Date(b.last_message_at).getTime() : 0
      return timeB - timeA
    }) || []

    const latestConv = sortedConvs[0]

    return {
      ...contact,
      conversation_count: contact.conversations?.length || 0,
      last_contacted_at: latestConv?.last_message_at || contact.created_at,
      channel_type: latestConv?.channels?.type || 'unknown'
    }
  })
}

export async function updateContactName(contactId: string, newName: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Unauthorized")

  const { error } = await supabaseAdmin
    .from('contacts')
    .update({ name: newName })
    .eq('id', contactId)
    
  if (error) {
    console.error('Error updating contact name:', error)
    return { success: false, error: error.message }
  }
  
  return { success: true }
}

export async function updateContactPhone(contactId: string, newPhone: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Unauthorized")

  const { error } = await supabaseAdmin
    .from('contacts')
    .update({ phone: newPhone || null }) // null if empty
    .eq('id', contactId)
    
  if (error) {
    console.error('Error updating contact phone:', error)
    return { success: false, error: error.message }
  }
  
  return { success: true }
}

export async function updateContactEmail(contactId: string, newEmail: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Unauthorized")

  const { error } = await supabaseAdmin
    .from('contacts')
    .update({ email: newEmail || null }) // null if empty
    .eq('id', contactId)
    
  if (error) {
    console.error('Error updating contact email:', error)
    return { success: false, error: error.message }
  }
  
  return { success: true }
}
