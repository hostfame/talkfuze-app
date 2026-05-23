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
      .or('call_type.is.null,call_type.neq.browser') // Only return actual SIP telephony calls, exclude browser calls
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

export async function logSipCallDirect(params: {
  orgId: string
  direction: string
  fromNumber: string
  toNumber: string
  durationSeconds: number
  status: string
  agentName: string
  conversationId: string | null
}) {
  try {
    // Log to call history
    await supabaseAdmin.from('call_logs').insert({
      org_id: params.orgId,
      direction: params.direction,
      from_number: params.fromNumber,
      to_number: params.toNumber,
      duration_seconds: params.durationSeconds,
      status: params.status,
      recording_url: null,
      agent_name: params.agentName,
      call_type: 'sip',
      conversation_id: params.conversationId
    })

    // If there is a conversation, log a badge in the chat thread
    if (params.conversationId) {
      const agentId = (await supabaseAdmin.from('users').select('id').eq('name', params.agentName).limit(1).maybeSingle()).data?.id;
      const formattedDuration = params.durationSeconds >= 60 
        ? `${Math.floor(params.durationSeconds / 60)}m ${params.durationSeconds % 60}s` 
        : `${params.durationSeconds}s`;

      // DEDUPLICATION: Prevent multiple agents in a ring group from spamming the chat
      // with identical call records (e.g., 4 agents ringing -> 3 cancelled, 1 answered)
      // The CANCELLED event from other agents happened exactly when this call was ANSWERED.
      // So if this call took 'durationSeconds', the CANCELLED event is roughly 'durationSeconds' ago.
      const targetTimeMs = Date.now() - (params.durationSeconds * 1000);
      const windowStart = new Date(targetTimeMs - 60000).toISOString();
      const windowEnd = new Date(targetTimeMs + 60000).toISOString();

      const { data: recentMsgs } = await supabaseAdmin
        .from('messages')
        .select('id, metadata, content')
        .eq('conversation_id', params.conversationId)
        .in('content', ['Voice call', 'Missed voice call'])
        .gte('created_at', windowStart)
        .lte('created_at', windowEnd)
        .order('created_at', { ascending: false })
        .limit(1);
        
      const recentMsg = recentMsgs && recentMsgs.length > 0 ? recentMsgs[0] : null;

      let shouldInsertMessage = true;
      const contentStr = params.status === 'CANCELLED' ? 'Missed voice call' : 'Voice call';

      if (recentMsg) {
        const recentMeta = typeof recentMsg.metadata === 'string' ? JSON.parse(recentMsg.metadata) : (recentMsg.metadata || {});
        
        if (params.status === 'CANCELLED') {
          // If we are cancelled, and there's ANY recent call message (answered or cancelled), skip our insert
          shouldInsertMessage = false;
        } else if (params.status === 'ANSWERED' && recentMeta.status === 'CANCELLED') {
          // If we ANSWERED, but a CANCELLED message was already inserted (race condition),
          // we should UPDATE the existing message to reflect the answered state!
          await supabaseAdmin.from('messages').update({
            sender_id: agentId || null,
            content: contentStr,
            metadata: JSON.stringify({ 
              event: 'voice_call',
              agent_name: params.agentName,
              duration: formattedDuration,
              status: params.status,
              direction: params.direction
            })
          }).eq('id', recentMsg.id);
          
          shouldInsertMessage = false;
        } else if (params.status === 'ANSWERED' && recentMeta.status === 'ANSWERED') {
          // Unlikely, but if two agents somehow both answered (or same agent double fired)
          shouldInsertMessage = false;
        }
      }

      if (shouldInsertMessage) {
        await supabaseAdmin.from('messages').insert({
          org_id: params.orgId,
          conversation_id: params.conversationId,
          sender_type: 'system',
          sender_id: agentId || null,
          content: contentStr,
          content_type: 'system',
          status: 'delivered',
          metadata: JSON.stringify({ 
            event: 'voice_call',
            agent_name: params.agentName,
            duration: formattedDuration,
            status: params.status,
            direction: params.direction
          })
        })
        
        await supabaseAdmin.from('conversations').update({ last_message_at: new Date().toISOString() }).eq('id', params.conversationId)
      }
    }

    return { success: true }
  } catch (err: any) {
    console.error('logSipCallDirect exception:', err)
    return { success: false, error: err.message }
  }
}
