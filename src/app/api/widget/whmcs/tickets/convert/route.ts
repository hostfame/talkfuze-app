import { NextRequest, NextResponse } from 'next/server'
import { convertChatToTicket } from '@/actions/whmcs'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { conversationId, clientId } = body

    if (!conversationId || !clientId) {
      return NextResponse.json({ success: false, error: 'conversationId and clientId are required.' }, { status: 400 })
    }

    // Call the robust backend function that handles attachments and system messages
    const result = await convertChatToTicket(conversationId, clientId, 1)

    return NextResponse.json(result)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An unexpected error occurred.'
    console.error('[WHMCS Ticket Convert POST]', message)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
