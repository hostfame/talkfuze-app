import { NextRequest, NextResponse } from 'next/server'
import { getTicket } from '@/lib/whmcs'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const ticketId = parseInt(id)

    if (isNaN(ticketId)) {
      return NextResponse.json({ success: false, error: 'Invalid ticket ID.' }, { status: 400 })
    }

    const ticket = await getTicket(ticketId)

    return NextResponse.json({ success: true, ticket })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An unexpected error occurred.'
    console.error('[WHMCS Ticket GET]', message)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
