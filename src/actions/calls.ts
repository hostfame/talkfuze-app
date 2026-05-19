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
