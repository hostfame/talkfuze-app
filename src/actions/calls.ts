"use server"

import { createClient } from "@/lib/supabase/server"
import { supabaseAdmin } from "@/lib/supabase-admin"

export async function getCallLogs(orgId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Unauthorized")

  try {
    const { data: logs, error: logsError } = await supabaseAdmin
      .from('call_logs')
      .select('*')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
      .limit(50)

    if (logsError) {
      console.error('Error fetching call logs:', logsError)
      return []
    }

    if (!logs || logs.length === 0) return []

    // Fetch contacts to enrich logs with customer names in-memory
    const { data: contacts } = await supabaseAdmin
      .from('contacts')
      .select('phone, name, platform_id')
      .eq('org_id', orgId)
      .eq('platform_type', 'whatsapp')

    const enrichedLogs = logs.map(log => {
      const customerPhone = log.direction === 'inbound' ? log.from_number : log.to_number
      const cleanCustomer = customerPhone ? customerPhone.replace(/\D/g, '') : ''

      let matchedContactName = null
      if (cleanCustomer && contacts) {
        const contact = contacts.find(c => {
          const cPhone = c.phone ? c.phone.replace(/\D/g, '') : ''
          const cPlatform = c.platform_id ? c.platform_id.split('@')[0].replace(/\D/g, '') : ''
          return (cPhone && cPhone === cleanCustomer) || (cPlatform && cPlatform === cleanCustomer)
        })
        if (contact) {
          matchedContactName = contact.name
        }
      }

      return {
        ...log,
        customer_name: matchedContactName
      }
    })
    
    return enrichedLogs
  } catch (err) {
    console.error("Call logs fetch failed. Table might not exist yet.", err)
    return []
  }
}

export async function logBrowserCall(params: {
  orgId: string
  direction: 'browser_inbound' | 'browser_outbound'
  durationSeconds: number
  status: 'ANSWERED' | 'NO ANSWER' | 'MISSED'
  conversationId?: string
  agentName?: string
  contactName?: string
}) {
  try {
    const { error } = await supabaseAdmin.from('call_logs').insert({
      org_id: params.orgId,
      direction: params.direction,
      from_number: 'Browser',
      to_number: params.contactName || 'Web Visitor',
      duration_seconds: params.durationSeconds,
      status: params.status,
      recording_url: null,
      agent_name: params.agentName || null,
      call_type: 'browser',
      conversation_id: params.conversationId || null
    })
    if (error) {
      console.error('Failed to log browser call:', error)
      return { success: false, error: error.message }
    }
    return { success: true }
  } catch (err: any) {
    console.error('logBrowserCall exception:', err)
    return { success: false, error: err.message }
  }
}

export async function getLastCallForNumber(orgId: string, phoneNumber: string) {
  try {
    const cleanNumber = phoneNumber.replace(/\D/g, '')
    const last10 = cleanNumber.slice(-10)
    
    const { data, error } = await supabaseAdmin
      .from('call_logs')
      .select('created_at, duration_seconds, direction, status')
      .eq('org_id', orgId)
      .or(`from_number.like.%${last10},to_number.like.%${last10}`)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error || !data) return null
    return data
  } catch (err) {
    console.error('getLastCallForNumber failed:', err)
    return null
  }
}

export async function findConversationByPhone(orgId: string, phoneNumber: string) {
  try {
    const cleanNumber = phoneNumber.replace(/\D/g, '')
    const last10 = cleanNumber.slice(-10)

    // Find contact matching the phone number
    const { data: contact } = await supabaseAdmin
      .from('contacts')
      .select('id')
      .eq('org_id', orgId)
      .or(`phone.like.%${last10},platform_id.like.%${last10}`)
      .limit(1)
      .maybeSingle()

    if (!contact) return null

    // Find most recent conversation for this contact
    const { data: conversation } = await supabaseAdmin
      .from('conversations')
      .select('id')
      .eq('org_id', orgId)
      .eq('contact_id', contact.id)
      .order('last_message_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    return conversation?.id || null
  } catch (err) {
    console.error('findConversationByPhone failed:', err)
    return null
  }
}

export async function saveCallNote(orgId: string, conversationId: string, note: string, agentId: string) {
  try {
    const { error } = await supabaseAdmin
      .from('messages')
      .insert({
        org_id: orgId,
        conversation_id: conversationId,
        sender_type: 'agent',
        sender_id: agentId,
        content: `📞 Call Note: ${note}`,
        content_type: 'text',
        is_internal: true,
        status: 'delivered'
      })

    if (error) {
      console.error('saveCallNote insert failed:', error)
      return { success: false, error: error.message }
    }

    // Update conversation last_message_at
    await supabaseAdmin
      .from('conversations')
      .update({ last_message_at: new Date().toISOString() })
      .eq('id', conversationId)

    return { success: true }
  } catch (err: any) {
    console.error('saveCallNote exception:', err)
    return { success: false, error: err.message }
  }
}
