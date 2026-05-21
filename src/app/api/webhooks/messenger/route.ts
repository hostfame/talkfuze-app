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

    // Check if this is an event from a page or instagram subscription
    if (body.object === 'page' || body.object === 'instagram') {
      const channelType = body.object === 'instagram' ? 'instagram' : 'messenger';
      
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
            // For Instagram, the pageId is the Instagram Business Account ID, which might not match the stored Facebook page_id
            const { data: channels, error: chFetchErr } = await supabaseAdmin
              .from("channels")
              .select("id, org_id, config, type")
              .in("type", ["messenger", "instagram"]);

            if (chFetchErr) throw chFetchErr;

            let channel = channels?.find(c => 
              c.config?.page_id === pageId || 
              c.config?.instagram_id === pageId ||
              c.config?.instagram_business_account === pageId
            ) || null;

            // Fallback: If no strict match but there are channels (common for single-tenant), use one.
            // Prefer 'instagram' type if it exists, otherwise fallback to 'messenger'
            if (!channel && channels && channels.length > 0) {
              channel = channels.find(c => c.type === 'instagram') || channels[0];
            }
            if (!channel) {
              console.warn(`${channelType} webhook received event for unconnected page/account ${pageId}`);
              continue;
            }
            const orgId = channel.org_id;

            // 2. Get or Create Contact based on Facebook/Instagram Sender ID
            const { data: contacts, error: contactFetchErr } = await supabaseAdmin
              .from("contacts")
              .select("id")
              .eq("org_id", orgId)
              .eq("platform_type", channelType)
              .eq("platform_id", senderId)
              .limit(1);

            if (contactFetchErr) throw contactFetchErr;

            let contact = contacts && contacts.length > 0 ? contacts[0] : null;

            if (!contact) {
              // Use channel-appropriate default name
              const defaultPrefix = channelType === 'instagram' ? 'Instagram User' : 'FB User';
              let contactName = `${defaultPrefix} ${senderId.slice(-4)}`;
              let avatarUrl = null;

              if (channel.config?.access_token) {
                try {
                  if (channelType === 'instagram') {
                    // For Instagram, fetch via the Instagram-scoped user ID
                    const igRes = await fetch(`https://graph.facebook.com/v20.0/${senderId}?fields=name,username,profile_pic&access_token=${channel.config.access_token}`);
                    const igProfile = await igRes.json();
                    if (!igProfile.error) {
                      if (igProfile.username) contactName = `@${igProfile.username}`;
                      else if (igProfile.name) contactName = igProfile.name;
                      if (igProfile.profile_pic) {
                        const imgRes = await fetch(igProfile.profile_pic);
                        if (imgRes.ok) {
                          const buffer = Buffer.from(await imgRes.arrayBuffer());
                          const fileName = `avatars/${senderId}_${Date.now()}.jpg`;
                          const { error: uploadError } = await supabaseAdmin.storage.from('media').upload(fileName, buffer, { contentType: 'image/jpeg', upsert: true });
                          if (!uploadError) {
                            const { data: urlData } = supabaseAdmin.storage.from('media').getPublicUrl(fileName);
                            avatarUrl = urlData.publicUrl;
                          }
                        }
                      }
                    }
                  } else {
                    // Messenger: fetch FB profile
                    let fbProfileRes = await fetch(`https://graph.facebook.com/v20.0/${senderId}?fields=first_name,last_name,profile_pic&access_token=${channel.config.access_token}`);
                    let fbProfile = await fbProfileRes.json();
                    if (fbProfile.error) {
                      fbProfileRes = await fetch(`https://graph.facebook.com/v20.0/${senderId}?fields=first_name,last_name&access_token=${channel.config.access_token}`);
                      fbProfile = await fbProfileRes.json();
                    }
                    if (fbProfile.first_name || fbProfile.last_name) {
                      contactName = `${fbProfile.first_name || ''} ${fbProfile.last_name || ''}`.trim();
                    }
                    if (fbProfile.profile_pic) {
                      const imgRes = await fetch(fbProfile.profile_pic);
                      if (imgRes.ok) {
                        const buffer = Buffer.from(await imgRes.arrayBuffer());
                        const fileName = `avatars/${senderId}_${Date.now()}.jpg`;
                        const { error: uploadError } = await supabaseAdmin.storage.from('media').upload(fileName, buffer, { contentType: 'image/jpeg', upsert: true });
                        if (!uploadError) {
                          const { data: urlData } = supabaseAdmin.storage.from('media').getPublicUrl(fileName);
                          avatarUrl = urlData.publicUrl;
                        }
                      }
                    }
                  }
                } catch (e) {
                  console.error("Failed to fetch profile:", e);
                }
              }

              const { data: newContact, error: contactErr } = await supabaseAdmin
                .from("contacts")
                .insert({
                  org_id: orgId,
                  platform_type: channelType,
                  platform_id: senderId,
                  name: contactName,
                  avatar_url: avatarUrl
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

            // 6. Update conversation last_message_at so it bubbles to top of inbox
            await supabaseAdmin
              .from("conversations")
              .update({ last_message_at: new Date().toISOString() })
              .eq("id", conversation.id);

            // 7. Dynamic Messenger Auto-Reply Trigger
            if (channelType === 'messenger') {
              const pageAccessToken = channel.config?.access_token;
              if (pageAccessToken) {
                const autoReplyText = `আসসালামু আলাইকুম। এই মুহূর্তে আমরা মেসেঞ্জারে সাপোর্ট প্রদান করছি না। \n\nতাৎক্ষণিক সাপোর্টের জন্য অনুগ্রহ করে আমাদের হোয়াটসঅ্যাপ নম্বরে মেসেজ করুন অথবা আমাদের ওয়েবসাইট (https://hostnin.com) থেকে লাইভ চ্যাটে মেসেজ দিন। আমরা হোয়াটসঅ্যাপ ও ওয়েবসাইট চ্যাটে ১৫ সেকেন্ডের মধ্যে রিপ্লাই দিয়ে থাকি! ❤️\n\n---\n\nHello! We are not providing active support on Messenger right now. \n\nFor instant support, please message us on WhatsApp or use the live chat on our website (https://hostnin.com). We typically reply within 15 seconds on WhatsApp and Website chat!`;

                try {
                  // 1. Insert auto-reply message into Database as "ai" sender so agents see it instantly
                  const { data: insertedMsg } = await supabaseAdmin
                    .from("messages")
                    .insert({
                      org_id: orgId,
                      conversation_id: conversation.id,
                      sender_type: "ai",
                      sender_id: null,
                      content: autoReplyText,
                      content_type: "text",
                      status: "sending"
                    })
                    .select("id")
                    .single();

                  // 2. Post to Meta API to send the actual response to the user's Messenger inbox
                  const endpoint = `https://graph.facebook.com/v20.0/me/messages?access_token=${pageAccessToken}`;
                  const fbResponse = await fetch(endpoint, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      recipient: { id: senderId },
                      message: { text: autoReplyText },
                      messaging_type: "RESPONSE"
                    })
                  });

                  const fbResult = await fbResponse.json();
                  if (fbResponse.ok && fbResult?.message_id && insertedMsg) {
                    await supabaseAdmin
                      .from("messages")
                      .update({
                        platform_message_id: fbResult.message_id,
                        status: "delivered"
                      })
                      .eq("id", insertedMsg.id);
                  } else if (insertedMsg) {
                    console.error("Auto-reply Meta send failed:", fbResult);
                    await supabaseAdmin
                      .from("messages")
                      .update({
                        status: "failed",
                        metadata: { delivery_error: fbResult?.error?.message || "Meta API send failed" }
                      })
                      .eq("id", insertedMsg.id);
                  }
                } catch (sendErr) {
                  console.error("Failed to send/save Messenger auto-reply:", sendErr);
                }
              }
            }
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
