import { NextRequest, NextResponse } from 'next/server'
import { whmcsRequest, getClientDetailsByEmailFast, openTicket } from '@/lib/whmcs'
import { supabaseAdmin } from '@/lib/supabase-admin'

// In-memory OTP store. For production scale, move to Supabase or Redis.
// Key: email, Value: { code, expires, clientId, conversationId }
const otpStore = new Map<string, { code: string; expires: number; clientId: number; conversationId: string }>()

function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString()
}

// POST /api/widget/otp
// action: "send" | "verify"
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { action, email, otp, conversationId, orgId } = body

    if (action === 'send') {
      if (!email || !email.includes('@')) {
        return NextResponse.json({ success: false, error: 'Valid email required.' }, { status: 400 })
      }

      // Look up client in WHMCS
      const client = await getClientDetailsByEmailFast(email)
      if (!client || !client.id) {
        return NextResponse.json({ success: false, error: 'No account found for this email. Please check and try again.' }, { status: 404 })
      }

      const code = generateOTP()
      const expires = Date.now() + 10 * 60 * 1000 // 10 minutes

      // Store OTP
      otpStore.set(email.toLowerCase(), { code, expires, clientId: client.id, conversationId })

      // Send email via WHMCS SendEmail API
      const subject = `Your Support Chat Login OTP: ${code}`
      const message = `
Hello ${client.firstname},

Your one-time login code for Support Chat is:
<h1 style="font-size:36px;letter-spacing:8px;color:#0070f3;font-family:monospace;margin:10px 0;">${code}</h1>
This code expires in <strong>10 minutes</strong>.

If you did not request this, you can safely ignore this email.

- Hostnin Support Team
`

      await whmcsRequest('SendEmail', {
        customtype: 'general',
        id: client.id,
        customsubject: subject,
        custommessage: message,
      }, 15000, 1, true)

      return NextResponse.json({ success: true, name: client.firstname })
    }

    if (action === 'verify') {
      if (!email || !otp) {
        return NextResponse.json({ success: false, error: 'Email and OTP required.' }, { status: 400 })
      }

      const record = otpStore.get(email.toLowerCase())
      if (!record) {
        return NextResponse.json({ success: false, error: 'No OTP request found. Please send a new code.' }, { status: 400 })
      }

      if (Date.now() > record.expires) {
        otpStore.delete(email.toLowerCase())
        return NextResponse.json({ success: false, error: 'OTP expired. Please request a new one.' }, { status: 400 })
      }

      if (record.code !== otp.trim()) {
        return NextResponse.json({ success: false, error: 'Incorrect code. Please try again.' }, { status: 400 })
      }

      // OTP valid - convert chat to ticket
      const { data: messages } = await supabaseAdmin
        .from('messages')
        .select('*')
        .eq('conversation_id', record.conversationId)
        .order('created_at', { ascending: false })
        .limit(20)

      let ticketId: string | null = null

      if (messages && messages.length > 0) {
        messages.reverse()
        const subjectMsg = messages.find((m: { sender_type: string; content: string }) => m.sender_type !== 'agent' && m.content)
        const subject = subjectMsg ? subjectMsg.content.substring(0, 60) + (subjectMsg.content.length > 60 ? '...' : '') : 'WhatsApp Chat Escalation'
        const transcript = messages.map((m: { sender_type: string; agent?: { name?: string }; content: string }) => {
          if (m.sender_type === 'system') return `* ${m.content} *`
          if (m.sender_type === 'ai') return `AI Assistant:\n${m.content}`
          const name = m.sender_type === 'agent' ? m.agent?.name || 'Support Agent' : 'Myself'
          return `${name}:\n${m.content}`
        }).join('\n\n')

        const finalMessage = `Hi Team! 👋\n\nThis ticket was created from my recent live chat. Please read the chat and help me further.\n\n--- Chat History ---\n\n${transcript}`
        const result = await openTicket(record.clientId, 1, subject, finalMessage)
        ticketId = result.tid || null
      }

      // Cleanup
      otpStore.delete(email.toLowerCase())

      return NextResponse.json({
        success: true,
        ticketId,
        message: ticketId
          ? `Ticket #${ticketId} created successfully! Our team will respond shortly.`
          : 'Verified! Our team has received your request.',
      })
    }

    return NextResponse.json({ success: false, error: 'Invalid action.' }, { status: 400 })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An unexpected error occurred.'
    console.error('[OTP API]', message)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
