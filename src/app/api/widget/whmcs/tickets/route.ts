import { NextRequest, NextResponse } from 'next/server'
import { getTickets } from '@/lib/whmcs'

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams
    const clientIdStr = searchParams.get('clientId')
    const status = searchParams.get('status') || undefined // e.g. "Open"

    if (!clientIdStr) {
      return NextResponse.json({ success: false, error: 'clientId is required.' }, { status: 400 })
    }

    const clientId = parseInt(clientIdStr)
    const result = await getTickets(clientId, 0, 50, status)

    return NextResponse.json({ success: true, tickets: result.tickets, total: result.totalResults })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An unexpected error occurred.'
    console.error('[WHMCS Tickets GET]', message)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
