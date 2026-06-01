import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { updateClient } from '@/lib/whmcs'

// PATCH /api/widget/whmcs/profile
// Updates WHMCS client profile + Supabase contact from the widget.
// Auth: verifies clientId ownership via deviceId+orgId contact record.
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json()
    const { clientId, deviceId, orgId, firstname, lastname, phonenumber, companyname } = body

    if (!clientId || !deviceId || !orgId) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Security: verify this deviceId actually owns this clientId for this org
    const { data: contacts, error: cErr } = await supabaseAdmin
      .from('contacts')
      .select('id, name, metadata')
      .eq('org_id', orgId)
      .eq('platform_type', 'widget')
      .eq('platform_id', deviceId)
      .limit(1)

    if (cErr || !contacts || contacts.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Contact not found' },
        { status: 404 }
      )
    }

    const contact = contacts[0]
    const existingMeta = (contact.metadata || {}) as Record<string, any>

    // Verify the stored whmcs_client_id matches the claimed clientId
    if (existingMeta.whmcs_client_id && String(existingMeta.whmcs_client_id) !== String(clientId)) {
      return NextResponse.json(
        { success: false, error: 'Client ID mismatch' },
        { status: 403 }
      )
    }

    // Build WHMCS update payload (only include provided fields)
    const whmcsUpdate: Record<string, string> = {}
    if (firstname !== undefined) whmcsUpdate.firstname = String(firstname).trim()
    if (lastname !== undefined) whmcsUpdate.lastname = String(lastname).trim()
    if (phonenumber !== undefined) whmcsUpdate.phonenumber = String(phonenumber).trim()
    if (companyname !== undefined) whmcsUpdate.companyname = String(companyname).trim()

    if (Object.keys(whmcsUpdate).length === 0) {
      return NextResponse.json({ success: false, error: 'No fields to update' }, { status: 400 })
    }

    // Update WHMCS
    const whmcsRes = await updateClient(parseInt(String(clientId), 10), whmcsUpdate)
    if (!whmcsRes || (whmcsRes as any).result !== 'success') {
      console.error('[Widget Profile] WHMCS update failed:', whmcsRes)
      return NextResponse.json(
        { success: false, error: 'Failed to update WHMCS profile' },
        { status: 500 }
      )
    }

    // Build display name for Supabase contact
    const newDisplayName = [
      firstname !== undefined ? firstname.trim() : '',
      lastname !== undefined ? lastname.trim() : ''
    ].filter(Boolean).join(' ') || contact.name

    const avatarUrl = newDisplayName
      ? `https://ui-avatars.com/api/?name=${encodeURIComponent(newDisplayName)}&background=0070f3&color=fff&length=1`
      : undefined

    // Update TalkFuze contact record
    const contactUpdate: Record<string, any> = { name: newDisplayName }
    if (avatarUrl) contactUpdate.avatar_url = avatarUrl
    if (phonenumber !== undefined) contactUpdate.phone = phonenumber.trim()

    await supabaseAdmin
      .from('contacts')
      .update(contactUpdate)
      .eq('id', contact.id)

    return NextResponse.json({
      success: true,
      name: newDisplayName,
      firstname: whmcsUpdate.firstname,
      lastname: whmcsUpdate.lastname,
      phonenumber: whmcsUpdate.phonenumber,
      companyname: whmcsUpdate.companyname
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An unexpected error occurred.'
    console.error('[Widget Profile PATCH]', message)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}

// GET /api/widget/whmcs/profile
// Fetches full WHMCS client details for the widget profile view.
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const clientId = searchParams.get('clientId')
    const deviceId = searchParams.get('deviceId')
    const orgId = searchParams.get('orgId')

    if (!clientId || !deviceId || !orgId) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Verify ownership
    const { data: contacts, error: cErr } = await supabaseAdmin
      .from('contacts')
      .select('id, name, phone, email, metadata')
      .eq('org_id', orgId)
      .eq('platform_type', 'widget')
      .eq('platform_id', deviceId)
      .limit(1)

    if (cErr || !contacts || contacts.length === 0) {
      return NextResponse.json({ success: false, error: 'Contact not found' }, { status: 404 })
    }

    const contact = contacts[0]
    const existingMeta = (contact.metadata || {}) as Record<string, any>

    if (existingMeta.whmcs_client_id && String(existingMeta.whmcs_client_id) !== String(clientId)) {
      return NextResponse.json({ success: false, error: 'Client ID mismatch' }, { status: 403 })
    }

    // Import and call getClientDetails
    const { getClientDetails } = await import('@/lib/whmcs')
    const clientRes = await getClientDetails(parseInt(String(clientId), 10))

    if ((clientRes as any).result !== 'success' || !(clientRes as any).client) {
      return NextResponse.json({ success: false, error: 'Failed to fetch WHMCS profile' }, { status: 500 })
    }

    const client = (clientRes as any).client as Record<string, any>

    return NextResponse.json({
      success: true,
      profile: {
        firstname: client.firstname || '',
        lastname: client.lastname || '',
        email: client.email || contact.email || '',
        phonenumber: client.phonenumber || contact.phone || '',
        companyname: client.companyname || '',
      }
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An unexpected error occurred.'
    console.error('[Widget Profile GET]', message)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
