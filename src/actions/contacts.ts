"use server"

import { supabaseAdmin } from "@/lib/supabase-admin"

import { createClient } from "@/lib/supabase/server"
import type { Contact } from "@/lib/types"
import { unstable_noStore as noStore } from "next/cache"

type ContactConversation = {
  id: string
  last_message_at: string | null
  channels?: { type?: string | null } | null
}

type ContactWithConversations = Contact & {
  conversations?: ContactConversation[] | null
}

export async function getContacts(page: number = 1, pageSize: number = 100) {
  noStore();
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Unauthorized")
  
  const { data: profile } = await supabaseAdmin.from("users").select("org_id").eq("id", user.id).single()
  if (!profile) throw new Error("Profile not found")

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const { data, error, count } = await supabaseAdmin
    .from('contacts')
    .select(`
      *,
      conversations (id, last_message_at, channels (type))
    `, { count: 'exact' })
    .eq('org_id', profile.org_id)
    .order('created_at', { ascending: false })
    .range(from, to)

  if (error) {
    console.error('Error fetching contacts:', error)
    return { contacts: [], totalCount: 0 }
  }
  
  // Transform data to match UI needs
  const contacts = (data as ContactWithConversations[]).map(contact => {
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

  return { contacts, totalCount: count || 0 }
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


export async function updateContactNotes(contactId: string, notes: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Unauthorized")

  // fetch current metadata
  const { data, error: fetchErr } = await supabaseAdmin
    .from('contacts')
    .select('metadata')
    .eq('id', contactId)
    .single()

  if (fetchErr) {
    return { success: false, error: fetchErr.message }
  }

  const existingMeta = (data?.metadata as Record<string, any>) || {}
  const newMeta = { ...existingMeta, notes }

  const { error } = await supabaseAdmin
    .from('contacts')
    .update({ metadata: newMeta })
    .eq('id', contactId)
    
  if (error) {
    console.error('Error updating contact notes:', error)
    return { success: false, error: error.message }
  }
  
  return { success: true }
}
