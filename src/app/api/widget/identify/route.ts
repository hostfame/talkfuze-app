import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import * as crypto from 'crypto'

const WIDGET_SECRET = process.env.TALKFUZE_WIDGET_SECRET || ''

function verifySignature(email: string, clientId: string, orgId: string, timestamp: string, signature: string): boolean {
  if (!WIDGET_SECRET) {
    console.error('[Widget Identify] TALKFUZE_WIDGET_SECRET not configured')
    return false
  }

  const message = `${email}|${clientId}|${orgId}|${timestamp}`
  const expected = crypto.createHmac('sha256', WIDGET_SECRET).update(message).digest('hex')
  
  // Timing-safe comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'))
  } catch {
    return false
  }
}

// POST /api/widget/identify
// Accepts signed identity from host page, verifies, and resolves contact
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { email, name, clientId, orgId, deviceId, timestamp, signature } = body

    // Validate required fields
    if (!email || !clientId || !orgId || !deviceId || !timestamp || !signature) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Check timestamp freshness (reject if > 5 minutes old)
    const now = Math.floor(Date.now() / 1000)
    const ts = parseInt(timestamp, 10)
    if (isNaN(ts) || Math.abs(now - ts) > 300) {
      return NextResponse.json(
        { success: false, error: 'Expired or invalid timestamp' },
        { status: 401 }
      )
    }

    // Verify HMAC signature
    if (!verifySignature(email, String(clientId), orgId, timestamp, signature)) {
      console.warn('[Widget Identify] Invalid signature for', email)
      return NextResponse.json(
        { success: false, error: 'Invalid signature' },
        { status: 401 }
      )
    }

    // 1. Primary lookup: find contact by whmcs_client_id (cross-device persistent history).
    // If same WHMCS client opens widget on a new device, we find their existing contact
    // (with full chat history) instead of creating a fresh anonymous one.
    const { data: clientIdContacts } = await supabaseAdmin
      .from('contacts')
      .select('id, name, email, metadata, platform_id')
      .eq('org_id', orgId)
      .eq('platform_type', 'widget')
      .filter('metadata->>whmcs_client_id', 'eq', String(clientId))
      .limit(1)

    const clientIdContact = clientIdContacts && clientIdContacts.length > 0 ? clientIdContacts[0] : null

    if (clientIdContact) {
      // Found existing contact by WHMCS client ID (may be on a different device)
      const existingMeta = (clientIdContact.metadata || {}) as Record<string, any>
      const displayName = name || clientIdContact.name || email.split('@')[0]
      const avatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=0070f3&color=fff&length=1`
      const isCrossDevice = clientIdContact.platform_id !== deviceId

      // Refresh identity and update platform_id to this device so device-based
      // lookups (messages, conversations) also work here
      await supabaseAdmin
        .from('contacts')
        .update({
          name: displayName,
          email: email.toLowerCase(),
          avatar_url: avatarUrl,
          platform_id: deviceId,
          metadata: { ...existingMeta, whmcs_client_id: clientId, identified_at: new Date().toISOString() }
        })
        .eq('id', clientIdContact.id)

      return NextResponse.json({
        success: true,
        contactId: clientIdContact.id,
        name: displayName,
        clientId: parseInt(String(clientId), 10),
        merged: true,
        crossDevice: isCrossDevice
      })
    }

    // 2. Fallback: look for anonymous contact by deviceId (same device, first identification)
    const { data: existingContacts } = await supabaseAdmin
      .from('contacts')
      .select('id, name, email, metadata')
      .eq('org_id', orgId)
      .eq('platform_type', 'widget')
      .eq('platform_id', deviceId)
      .limit(1)

    const existingContact = existingContacts && existingContacts.length > 0 ? existingContacts[0] : null
    const displayName = name || email.split('@')[0]
    const avatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=0070f3&color=fff&length=1`

    if (existingContact) {
      // Update existing anonymous contact with real identity
      const existingMeta = (existingContact.metadata || {}) as Record<string, any>
      const { error: updateErr } = await supabaseAdmin
        .from('contacts')
        .update({
          name: displayName,
          email: email.toLowerCase(),
          avatar_url: avatarUrl,
          metadata: { ...existingMeta, whmcs_client_id: clientId, identified_at: new Date().toISOString() }
        })
        .eq('id', existingContact.id)

      if (updateErr) {
        console.error('[Widget Identify] Update error:', updateErr)
        return NextResponse.json(
          { success: false, error: 'Failed to update contact' },
          { status: 500 }
        )
      }

      return NextResponse.json({
        success: true,
        contactId: existingContact.id,
        name: displayName,
        clientId: parseInt(String(clientId), 10),
        merged: true,
        crossDevice: false
      })
    } else {
      // No existing contact - create one pre-identified
      const { data: newContact, error: insertErr } = await supabaseAdmin
        .from('contacts')
        .insert({
          org_id: orgId,
          platform_type: 'widget',
          platform_id: deviceId,
          name: displayName,
          email: email.toLowerCase(),
          avatar_url: avatarUrl,
          metadata: { whmcs_client_id: clientId, identified_at: new Date().toISOString() }
        })
        .select('id')
        .single()

      if (insertErr) {
        console.error('[Widget Identify] Insert error:', insertErr)
        return NextResponse.json(
          { success: false, error: 'Failed to create contact' },
          { status: 500 }
        )
      }

      return NextResponse.json({
        success: true,
        contactId: newContact!.id,
        name: displayName,
        clientId: parseInt(String(clientId), 10),
        merged: false,
        crossDevice: false
      })
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An unexpected error occurred.'
    console.error('[Widget Identify]', message)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
