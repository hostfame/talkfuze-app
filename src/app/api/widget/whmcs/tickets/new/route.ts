import { NextRequest, NextResponse } from 'next/server'
import { openTicket } from '@/lib/whmcs'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { clientId, deptid, subject, message: ticketMessage, attachments, videoLinks } = body

    if (!clientId) {
      return NextResponse.json({ success: false, error: 'clientId is required.' }, { status: 400 })
    }
    if (!deptid) {
      return NextResponse.json({ success: false, error: 'Department ID (deptid) is required.' }, { status: 400 })
    }
    if (!subject || !subject.trim()) {
      return NextResponse.json({ success: false, error: 'Subject is required.' }, { status: 400 })
    }
    const hasAttachments = Array.isArray(attachments) && attachments.length > 0;
    const hasVideoLinks = Array.isArray(videoLinks) && videoLinks.length > 0;

    if ((!ticketMessage || !ticketMessage.trim()) && !hasAttachments && !hasVideoLinks) {
      return NextResponse.json({ success: false, error: 'Message or attachment is required.' }, { status: 400 })
    }

    let finalMessage = ticketMessage || '';
    if (hasVideoLinks) {
      const validLinks = videoLinks.filter((l: string) => l && l.trim().length > 0);
      if (validLinks.length > 0) {
        finalMessage += (finalMessage ? '\n\n' : '') + 'Video Attached:\n' + validLinks.join('\n');
      }
    }

    // Limit to 3 physical attachments
    const safeAttachments = Array.isArray(attachments) ? attachments.slice(0, 3) : undefined;

    const result = await openTicket(clientId, deptid, subject, finalMessage, undefined, safeAttachments)

    return NextResponse.json({ success: true, result })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An unexpected error occurred.'
    console.error('[WHMCS Ticket Open POST]', message)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
