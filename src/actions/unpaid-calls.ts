"use server"

import { supabaseAdmin } from "@/lib/supabase-admin"

export async function getUnpaidInvoiceCalls() {
  try {
    const { data, error } = await supabaseAdmin
      .from('unpaid_invoice_calls')
      .select('*')

    if (error) throw error
    return data || []
  } catch (error) {
    console.error("Failed to fetch unpaid invoice calls:", error)
    return []
  }
}

export async function upsertUnpaidInvoiceCall(params: {
  invoice_id: number;
  client_id: number;
  status?: string | null;
  will_renew?: string | null;
  notes?: string | null;
  duration_seconds?: number | null;
  recording_url?: string | null;
  pressed_digit?: string | null;
  agent_talked?: string | null;
  call_type?: string | null;
  scheduled_at?: string | null;
}) {
  try {
    const { invoice_id, client_id, status, will_renew, notes, duration_seconds, recording_url, pressed_digit, agent_talked, call_type, scheduled_at } = params
    
    // First try to check if it exists (use maybeSingle to avoid PGRST116 error on 0 rows)
    const { data: existing, error: fetchError } = await supabaseAdmin
      .from('unpaid_invoice_calls')
      .select('id')
      .eq('invoice_id', invoice_id)
      .maybeSingle()

    if (fetchError) throw fetchError;

    const payload: any = {
      client_id,
      updated_at: new Date().toISOString()
    }
    if (status !== undefined) payload.status = status
    if (will_renew !== undefined) payload.will_renew = will_renew
    if (notes !== undefined) payload.notes = notes
    if (duration_seconds !== undefined) payload.duration_seconds = duration_seconds
    if (recording_url !== undefined) payload.recording_url = recording_url
    if (pressed_digit !== undefined) payload.pressed_digit = pressed_digit
    if (agent_talked !== undefined) payload.agent_talked = agent_talked
    if (call_type !== undefined) payload.call_type = call_type
    if (scheduled_at !== undefined) payload.scheduled_at = scheduled_at

    if (existing) {
      const { data, error } = await supabaseAdmin
        .from('unpaid_invoice_calls')
        .update(payload)
        .eq('invoice_id', invoice_id)
        .select()
        .single()
        
      if (error) throw error
      return { success: true, data }
    } else {
      payload.invoice_id = invoice_id
      const { data, error } = await supabaseAdmin
        .from('unpaid_invoice_calls')
        .insert([payload])
        .select()
        .single()
        
      if (error) throw error
      return { success: true, data }
    }
  } catch (error: any) {
    console.error("Failed to upsert unpaid invoice call:", error)
    return { success: false, error: error.message }
  }
}

export async function getCallHistoryForPhone(phoneNumber: string) {
  try {
    const cleanNumber = phoneNumber.replace(/\D/g, '')
    const last10 = cleanNumber.slice(-10)
    
    // We only want outbound SIP calls in this context, or any call matching this phone
    const { data, error } = await supabaseAdmin
      .from('call_logs')
      .select('*')
      .or(`from_number.like.%${last10},to_number.like.%${last10}`)
      .order('created_at', { ascending: false })
      .limit(10)

    if (error) {
      console.error('getCallHistoryForPhone error:', error)
      return []
    }
    return data || []
  } catch (err) {
    console.error('getCallHistoryForPhone failed:', err)
    return []
  }
}

export async function triggerAsteriskRobocall(params: {
  invoice_id: number;
  phone: string;
  client_id: number;
}) {
  try {
    const { invoice_id, phone, client_id } = params
    
    const response = await fetch(`http://103.174.51.123:5000/call`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        phone,
        secret: "tf_worker_sec_x9k2m7pQwR4nVhJ8"
      })
    })
    
    if (!response.ok) {
      const text = await response.text()
      throw new Error(text || "Failed to trigger outbound robocall")
    }
    
    const result = await response.json()
    if (!result.success) {
      throw new Error("Failed to trigger outbound robocall daemon")
    }
    
    // Log the call status as Dialing
    await upsertUnpaidInvoiceCall({
      invoice_id,
      client_id,
      status: "Dialing"
    })
    
    return { success: true }
  } catch (error: any) {
    console.error("Failed to trigger robocall:", error)
    return { success: false, error: error.message }
  }
}

