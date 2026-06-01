import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { orgId, deviceId, attributes } = body

    if (!orgId || !deviceId || !attributes || typeof attributes !== 'object') {
      return NextResponse.json({ success: false, error: 'Missing required fields or invalid attributes format' }, { status: 400 })
    }

    // Get current attributes
    const { data: contact, error: fetchError } = await supabase
      .from('contacts')
      .select('custom_attributes')
      .eq('org_id', orgId)
      .eq('device_id', deviceId)
      .single()

    if (fetchError && fetchError.code !== 'PGRST116') {
      console.error('[API] Error fetching contact for attributes:', fetchError)
      return NextResponse.json({ success: false, error: fetchError.message }, { status: 500 })
    }

    const existingAttributes = contact?.custom_attributes || {}
    const newAttributes = { ...existingAttributes, ...attributes }

    // Update with merged attributes
    const { error: updateError } = await supabase
      .from('contacts')
      .update({ custom_attributes: newAttributes })
      .eq('org_id', orgId)
      .eq('device_id', deviceId)

    if (updateError) {
      console.error('[API] Error updating custom attributes:', updateError)
      return NextResponse.json({ success: false, error: updateError.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, custom_attributes: newAttributes })
  } catch (err: any) {
    console.error('[API] Custom attributes update error:', err)
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
