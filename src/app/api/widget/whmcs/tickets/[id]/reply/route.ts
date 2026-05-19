import { NextRequest, NextResponse } from 'next/server'
import { addTicketReply } from '@/lib/whmcs'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const ticketId = parseInt(id)
    if (isNaN(ticketId)) {
      return NextResponse.json({ success: false, error: 'Invalid ticket ID.' }, { status: 400 })
    }

    const body = await req.json()
    const { clientId, message: replyMessage } = body

    if (!clientId) {
      return NextResponse.json({ success: false, error: 'clientId is required.' }, { status: 400 })
    }
    if (!replyMessage || !replyMessage.trim()) {
      return NextResponse.json({ success: false, error: 'Message is required.' }, { status: 400 })
    }

    const result = await addTicketReply(ticketId, replyMessage, clientId)

    return NextResponse.json({ success: true, result })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An unexpected error occurred.'
    console.error('[WHMCS Ticket Reply POST]', message)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
