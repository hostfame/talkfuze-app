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
