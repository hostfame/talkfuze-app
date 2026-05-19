import { NextRequest, NextResponse } from 'next/server'
import { openTicket } from '@/lib/whmcs'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { clientId, deptid, subject, message: ticketMessage } = body

    if (!clientId) {
      return NextResponse.json({ success: false, error: 'clientId is required.' }, { status: 400 })
    }
    if (!deptid) {
      return NextResponse.json({ success: false, error: 'Department ID (deptid) is required.' }, { status: 400 })
    }
    if (!subject || !subject.trim()) {
      return NextResponse.json({ success: false, error: 'Subject is required.' }, { status: 400 })
    }
    if (!ticketMessage || !ticketMessage.trim()) {
      return NextResponse.json({ success: false, error: 'Message is required.' }, { status: 400 })
    }

    const result = await openTicket(clientId, deptid, subject, ticketMessage)

    return NextResponse.json({ success: true, result })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An unexpected error occurred.'
    console.error('[WHMCS Ticket Open POST]', message)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
