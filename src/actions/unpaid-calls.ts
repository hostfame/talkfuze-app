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
  status?: string;
  will_renew?: string;
  notes?: string;
}) {
  try {
    const { invoice_id, client_id, status, will_renew, notes } = params
    
    // First try to check if it exists
    const { data: existing } = await supabaseAdmin
      .from('unpaid_invoice_calls')
      .select('id')
      .eq('invoice_id', invoice_id)
      .single()

    const payload: any = {
      client_id,
      updated_at: new Date().toISOString()
    }
    if (status !== undefined) payload.status = status
    if (will_renew !== undefined) payload.will_renew = will_renew
    if (notes !== undefined) payload.notes = notes

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
