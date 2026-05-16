"use server"

import { supabaseAdmin } from "@/lib/supabase-admin"

// Hardcoded for MVP
const ORG_ID = "ec2f8436-05dc-4621-8a7f-57202f865b8e"

export async function getContacts() {
  const { data, error } = await supabaseAdmin
    .from('contacts')
    .select(`
      *,
      conversations (id, last_message_at, channels (type))
    `)
    .eq('org_id', ORG_ID)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching contacts:', error)
    return []
  }
  
  // Transform data to match UI needs
  return data.map(contact => {
    // Sort conversations to find the latest one
    const sortedConvs = contact.conversations?.sort((a: any, b: any) => {
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
