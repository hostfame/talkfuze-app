import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

function getMessengerContent(message: {
  text?: string
  attachments?: Array<{ type?: string; payload?: Record<string, unknown> }>
}) {
  if (message.text) {
    return {
      content: message.text,
      contentType: 'text',
      metadata: {}
    }
  }

  const attachment = message.attachments?.[0]
  if (!attachment) return null

  const attachmentType = attachment.type || 'file'
  const contentType = ['image', 'audio', 'video'].includes(attachmentType) ? attachmentType : 'file'
  const labels: Record<string, string> = {
    image: '[Image]',
    audio: '[Audio Voice Message]',
    video: '[Video]',
    file: '[Attachment]'
  }

  return {
    content: labels[contentType] || '[Attachment]',
    contentType,
    metadata: {
      messenger_attachment_type: attachmentType,
      attachments: message.attachments
    }
  }
}

// GET handler for Meta Webhook Verification
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  // Check if a token and mode is in the query string of the request
  if (mode && token) {
    // Check the mode and token sent is correct
    if (mode === 'subscribe' && token === process.env.META_VERIFY_TOKEN) {
      // Respond with the challenge token from the request
      console.log('WEBHOOK_VERIFIED');
      return new NextResponse(challenge, { status: 200 });
    } else {
      // Respond with '403 Forbidden' if verify tokens do not match
      return new NextResponse('Forbidden', { status: 403 });
    }
  }

  return new NextResponse('Bad Request', { status: 400 });
}

// POST handler for receiving messages
export async function POST(request: Request) {
  try {
    const body = await request.json();
    console.log("\n\n🔥 WEBHOOK HIT THE SERVER! Payload:", JSON.stringify(body, null, 2), "\n\n");

    // Check if this is an event from a page subscription
    if (body.object === 'page') {
      
      // Iterate over each entry - there may be multiple if batched
      for (const entry of body.entry) {
        // Get the page ID
        const pageId = entry.id;
        
        // Combine messaging and standby arrays to capture all incoming messages
        // If another app (like ManyChat or an auto-responder) is the Primary Receiver,
        // Facebook routes messages to the "standby" array instead of "messaging".
        const allEvents = [
          ...(entry.messaging || []),
          ...(entry.standby || [])
        ];

        // Iterate over each messaging event
        for (const webhook_event of allEvents) {
          
          if (webhook_event.message && !webhook_event.message.is_echo) {
            const senderId = webhook_event.sender.id;
            const messageContent = getMessengerContent(webhook_event.message);
            const messageId = webhook_event.message.mid;

            if (!messageContent) continue;

            // 1. Get or Create Messenger Channel for this Org
            // Note: We use the pageId from the payload to match the correct channel!
            const { data: channels, error: chFetchErr } = await supabaseAdmin
              .from("channels")
              .select("id, org_id")
              .eq("type", "messenger")
              .eq("config->>page_id", pageId)
              .limit(1);

            if (chFetchErr) throw chFetchErr;

            const channel = channels && channels.length > 0 ? channels[0] : null;
            if (!channel) {
              console.warn(`Messenger webhook received event for unconnected page ${pageId}`);
              continue;
            }
            const orgId = channel.org_id;

            // 2. Get or Create Contact based on Facebook Sender ID
            const { data: contacts, error: contactFetchErr } = await supabaseAdmin
              .from("contacts")
              .select("id")
              .eq("org_id", orgId)
              .eq("platform_type", "messenger")
              .eq("platform_id", senderId)
              .limit(1);

            if (contactFetchErr) throw contactFetchErr;

            let contact = contacts && contacts.length > 0 ? contacts[0] : null;

            if (!contact) {
              // Try to get user profile from Graph API if we have access token
              // For MVP, just create basic contact
              const { data: newContact, error: contactErr } = await supabaseAdmin
                .from("contacts")
                .insert({
                  org_id: orgId,
                  platform_type: "messenger",
                  platform_id: senderId,
                  name: `FB User ${senderId.slice(-4)}`
                })
                .select("id")
                .single();
              if (contactErr) throw contactErr;
              contact = newContact;
            }

            // 3. Get or Create Open Conversation
            const { data: convs, error: convFetchErr } = await supabaseAdmin
              .from("conversations")
              .select("id")
              .eq("org_id", orgId)
              .eq("contact_id", contact.id)
              .eq("status", "open")
              .order('created_at', { ascending: false })
              .limit(1);

            if (convFetchErr) throw convFetchErr;

            let conversation = convs && convs.length > 0 ? convs[0] : null;

            if (!conversation) {
              const { data: newConv, error: convErr } = await supabaseAdmin
                .from("conversations")
                .insert({
                  org_id: orgId,
                  channel_id: channel.id,
                  contact_id: contact.id,
                  status: "open"
                })
                .select("id")
                .single();
              if (convErr) throw convErr;
              conversation = newConv;
            }

            // 4. Check if message already exists (prevent duplicates from retry)
            const { data: existingMsg } = messageId
              ? await supabaseAdmin
                  .from("messages")
                  .select("id")
                  .eq("org_id", orgId)
                  .eq("conversation_id", conversation.id)
                  .eq("platform_message_id", messageId)
                  .limit(1)
              : { data: null };

            if (existingMsg && existingMsg.length > 0) {
              console.log("Duplicate message dropped", messageId);
              continue;
            }

            // 5. Insert the Message
            const { error: msgErr } = await supabaseAdmin
              .from("messages")
              .insert({
                org_id: orgId,
                conversation_id: conversation.id,
                sender_type: "contact",
                sender_id: contact.id,
                content: messageContent.content,
                content_type: messageContent.contentType,
                metadata: messageContent.metadata,
                platform_message_id: messageId
              });

            if (msgErr) throw msgErr;
          }
        }
      }

      // Return a '200 OK' response to all requests
      return new NextResponse('EVENT_RECEIVED', { status: 200 });
    } else {
      // Return a '404 Not Found' if event is not from a page subscription
      return new NextResponse('Not Found', { status: 404 });
    }
  } catch (error) {
    console.error("Webhook Error:", error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
