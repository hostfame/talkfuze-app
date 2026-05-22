import { NextRequest, NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase-admin"

const WEBHOOK_SECRET = process.env.WHMCS_BRIDGE_SECRET || ''

export async function POST(req: NextRequest) {
  try {
    // Verify webhook secret to prevent unauthorized call log injection
    const secret = req.headers.get('x-webhook-secret')
    if (!WEBHOOK_SECRET || secret !== WEBHOOK_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await req.json()
    const { org_id, direction, from, to, duration, status, recording, agent_name } = body

    if (!org_id || !direction || !from || !to) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    const recording_url = recording ? `https://sip.talkfuze.com/recordings/${recording}` : null
    
    // Delay slightly to prevent race conditions where PBX webhook arrives before the frontend logs the final SIP call leg
    await new Promise(resolve => setTimeout(resolve, 3000))

    // Check if the frontend already logged this call (within the last 5 minutes)
    const fiveMinsAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
    
    let matchQuery = supabaseAdmin
      .from('call_logs')
      .select('id')
      .eq('org_id', org_id)
      .is('recording_url', null)
      .gte('created_at', fiveMinsAgo)
      .order('created_at', { ascending: false })

    if (direction === 'outbound') {
      matchQuery = matchQuery.eq('to_number', to)
    } else {
      matchQuery = matchQuery.eq('from_number', from)
    }

    const { data: existingLogs } = await matchQuery

    if (existingLogs && existingLogs.length > 0) {
      // Update ALL existing browser-initiated logs with recording (handles transfers where multiple legs exist)
      const idsToUpdate = existingLogs.map(log => log.id)
      const { error } = await supabaseAdmin.from('call_logs').update({
        recording_url,
        call_type: 'pbx',
        duration_seconds: parseInt(duration) || 0,
        status: status || 'UNKNOWN'
      }).in('id', idsToUpdate)
      
      if (error) {
        console.error("Failed to update call log:", error)
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
    } else {
      // Insert new log if not found (e.g., standard PBX call)
      const { error } = await supabaseAdmin.from('call_logs').insert({
        org_id,
        direction,
        from_number: from,
        to_number: to,
        duration_seconds: parseInt(duration) || 0,
        status: status || 'UNKNOWN',
        recording_url,
        agent_name: agent_name || null,
        call_type: 'pbx'
      })

      if (error) {
        console.error("Failed to insert call log:", error)
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error("Webhook Error:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
