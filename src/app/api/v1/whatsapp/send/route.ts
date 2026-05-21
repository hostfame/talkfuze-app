import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { createConversation } from '@/actions/dashboard'

// POST /api/v1/whatsapp/send
export async function POST(req: NextRequest) {
  try {
    // 1. Authenticate via Bearer Token
    const authHeader = req.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ success: false, error: 'Unauthorized. Missing or invalid Authorization header.' }, { status: 401 })
    }

    const token = authHeader.substring(7).trim()
    if (!token) {
      return NextResponse.json({ success: false, error: 'Unauthorized. Empty Bearer token.' }, { status: 401 })
    }

    // Find the organization matching this token in their settings
    const { data: org, error: orgError } = await supabaseAdmin
      .from('organizations')
      .select('id, name')
      .eq('settings->>whmcs_token', token)
      .limit(1)
      .maybeSingle()

    if (orgError || !org) {
      return NextResponse.json({ success: false, error: 'Unauthorized. Invalid API token.' }, { status: 401 })
    }

    // 2. Parse request body
    const body = await req.json()
    const { to, message, event, params = {} } = body

    if (!to) {
      return NextResponse.json({ success: false, error: 'Recipient phone number (to) is required.' }, { status: 400 })
    }

    let finalMessageContent = ''

    if (event) {
      // 3. Template-based dispatch
      const { data: templateRec, error: templateError } = await supabaseAdmin
        .from('whatsapp_templates')
        .select('*')
        .eq('org_id', org.id)
        .eq('name', event)
        .limit(1)
        .maybeSingle()

      if (templateError) {
        console.error('[WHMCS_API] Error fetching template:', templateError)
        return NextResponse.json({ success: false, error: 'Internal database error fetching template.' }, { status: 500 })
      }

      if (!templateRec) {
        return NextResponse.json({ success: false, error: `Template for event '${event}' not found.` }, { status: 404 })
      }

      if (!templateRec.active) {
        return NextResponse.json({ success: true, message: `Notification skipped: Template '${event}' is disabled.` })
      }

      // Replace placeholders: e.g. {firstname} -> params.firstname
      let bodyText = templateRec.template || ''
      
      // Perform case-insensitive replacement for all parameters passed
      for (const [key, value] of Object.entries(params)) {
        const placeholderRegex = new RegExp(`{${key}}`, 'gi')
        bodyText = bodyText.replace(placeholderRegex, String(value || ''))
      }

      finalMessageContent = bodyText
    } else if (message) {
      // 4. Raw text-based dispatch
      finalMessageContent = message.trim()
    } else {
      return NextResponse.json({ success: false, error: 'Either event or raw message must be provided.' }, { status: 400 })
    }

    if (!finalMessageContent) {
      return NextResponse.json({ success: false, error: 'Rendered message content is empty.' }, { status: 400 })
    }

    // 5. Clean phone number format and fetch/create conversation
    let cleanPhone = to.replace(/\D/g, '')
    if (cleanPhone.length === 10 && cleanPhone.startsWith('1')) {
      cleanPhone = '880' + cleanPhone
    } else if (cleanPhone.length === 11 && cleanPhone.startsWith('01')) {
      cleanPhone = '88' + cleanPhone
    }

    let conversationId: string
    try {
      conversationId = await createConversation(org.id, cleanPhone)
    } catch (convErr: any) {
      console.error('[WHMCS_API] Failed to resolve/create conversation:', convErr)
      return NextResponse.json({ success: false, error: convErr.message || 'Failed to initialize recipient contact thread.' }, { status: 500 })
    }

    // 6. Insert message into messages table as outbound system/AI transaction alert
    const { data: insertedMsg, error: msgError } = await supabaseAdmin
      .from('messages')
      .insert({
        org_id: org.id,
        conversation_id: conversationId,
        sender_type: 'ai', // Triggers worker to send
        content: finalMessageContent,
        content_type: 'text',
        status: 'sent',
        is_internal: false
      })
      .select('id')
      .single()

    if (msgError || !insertedMsg) {
      console.error('[WHMCS_API] Error inserting message:', msgError)
      return NextResponse.json({ success: false, error: 'Database insert failed.' }, { status: 500 })
    }

    // 7. Update last_message_at and tag as 'alert' for filtering
    const { data: convData } = await supabaseAdmin
      .from('conversations')
      .select('tags')
      .eq('id', conversationId)
      .maybeSingle()

    const currentTags = convData?.tags || []
    const updatedTags = currentTags.includes('alert') ? currentTags : [...currentTags, 'alert']

    await supabaseAdmin
      .from('conversations')
      .update({ 
        last_message_at: new Date().toISOString(),
        tags: updatedTags
      })
      .eq('id', conversationId)

    return NextResponse.json({
      success: true,
      message: 'Notification enqueued successfully.',
      messageId: insertedMsg.id,
      conversationId
    })
  } catch (error: any) {
    console.error('[WHMCS_API] Unhandled Error:', error)
    return NextResponse.json({ success: false, error: error.message || 'An unexpected server error occurred.' }, { status: 500 })
  }
}
