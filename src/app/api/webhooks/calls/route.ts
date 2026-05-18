import { NextRequest, NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase-admin"

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { org_id, direction, from, to, duration, status, recording } = body

    if (!org_id || !direction || !from || !to) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    const recording_url = recording ? `https://sip.talkfuze.com/recordings/${recording}` : null

    const { error } = await supabaseAdmin.from('call_logs').insert({
      org_id,
      direction,
      from_number: from,
      to_number: to,
      duration_seconds: parseInt(duration) || 0,
      status: status || 'UNKNOWN',
      recording_url
    })

    if (error) {
      console.error("Failed to insert call log:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error("Webhook Error:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
