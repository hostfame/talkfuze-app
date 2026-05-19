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
    const { clientId, message: replyMessage, attachments, videoLinks } = body

    if (!clientId) {
      return NextResponse.json({ success: false, error: 'clientId is required.' }, { status: 400 })
    }
    const hasAttachments = Array.isArray(attachments) && attachments.length > 0;
    const hasVideoLinks = Array.isArray(videoLinks) && videoLinks.length > 0;

    if ((!replyMessage || !replyMessage.trim()) && !hasAttachments && !hasVideoLinks) {
      return NextResponse.json({ success: false, error: 'Message or attachment is required.' }, { status: 400 })
    }

    let finalMessage = replyMessage || '';
    if (hasVideoLinks) {
      const validLinks = videoLinks.filter((l: string) => l && l.trim().length > 0);
      if (validLinks.length > 0) {
        finalMessage += (finalMessage ? '\n\n' : '') + 'Video Attached:\n' + validLinks.join('\n');
      }
    }

    // Limit to 3 physical attachments
    const safeAttachments = Array.isArray(attachments) ? attachments.slice(0, 3) : undefined;

    const result = await addTicketReply(ticketId, finalMessage, clientId, safeAttachments)

    return NextResponse.json({ success: true, result })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An unexpected error occurred.'
    console.error('[WHMCS Ticket Reply POST]', message)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
