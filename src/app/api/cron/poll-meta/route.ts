import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { processIdleConversationsForLearning } from '@/actions/ai-learning';

// Cron secret to prevent unauthorized access
const CRON_SECRET = process.env.CRON_SECRET || '';

// Poll the Meta Conversations API for new messages
// This bypasses the webhook restriction in Development mode
export async function GET(request: Request) {
  // Verify cron secret (Vercel cron or external caller)
  const authHeader = request.headers.get('authorization');
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    // Also allow query param for simple cron tools
    const { searchParams } = new URL(request.url);
    if (searchParams.get('secret') !== CRON_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const results: { messenger: number; instagram: number; errors: string[] } = {
    messenger: 0,
    instagram: 0,
    errors: []
  };

  try {
    // 1. Get all active messenger channels with page tokens
    const { data: messengerChannels } = await supabaseAdmin
      .from('channels')
      .select('id, org_id, config, type')
      .eq('type', 'messenger')
      .eq('is_active', true);

    // 2. Get all active instagram channels
    const { data: instagramChannels } = await supabaseAdmin
      .from('channels')
      .select('id, org_id, config, type')
      .eq('type', 'instagram')
      .eq('is_active', true);

    // 3. Poll Messenger conversations
    if (messengerChannels) {
      for (const channel of messengerChannels) {
        const token = channel.config?.page_access_token || channel.config?.access_token;
        const pageId = channel.config?.page_id;
        if (!token || !pageId) continue;

        try {
          const count = await pollMessengerConversations(channel, token, pageId);
          results.messenger += count;
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          results.errors.push(`Messenger ${pageId}: ${msg}`);
        }
      }
    }

    // 4. Poll Instagram conversations (via page-scoped endpoint)
    if (instagramChannels) {
      for (const channel of instagramChannels) {
        const token = channel.config?.page_access_token || channel.config?.access_token;
        const fbPageId = channel.config?.facebook_page_id;
        if (!token || !fbPageId) continue;

        try {
          const count = await pollInstagramConversations(channel, token, fbPageId);
          results.instagram += count;
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          results.errors.push(`Instagram ${fbPageId}: ${msg}`);
        }
      }
    }

    // ====================================
    // AI LEARNING CYCLE (runs every 30 min)
    // Piggybacks on poll-meta since it already bypasses Vercel deployment protection
    // ====================================
    const currentMinute = new Date().getMinutes();
    let aiLearningResults: { autoResolved?: number; learned?: number } = {};
    
    if (currentMinute % 30 < 1) {
      try {
        // Step 1: Auto-resolve conversations idle for 30+ minutes
        const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
        const { data: idleConvs, error: resolveErr } = await supabaseAdmin
          .from('conversations')
          .update({ status: 'resolved' })
          .eq('status', 'open')
          .lt('last_message_at', thirtyMinAgo)
          .select('id');
        
        if (!resolveErr) {
          aiLearningResults.autoResolved = idleConvs?.length || 0;
          if (aiLearningResults.autoResolved > 0) {
            console.log(`[AutoResolve] Resolved ${aiLearningResults.autoResolved} idle conversations`);
          }
        }

        // Step 2: Learn from conversations idle for 1+ hour
        const learnResult = await processIdleConversationsForLearning();
        aiLearningResults.learned = learnResult.processed;
      } catch (aiErr) {
        console.error('[AI Learning Cycle] Error:', aiErr);
      }
    }

    return NextResponse.json({
      ok: true,
      polled_at: new Date().toISOString(),
      new_messages: results.messenger + results.instagram,
      ...results,
      ...(aiLearningResults.autoResolved !== undefined ? { ai_learning: aiLearningResults } : {})
    });
  } catch (error) {
    console.error('[Poll Meta] Fatal error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

async function pollMessengerConversations(
  channel: { id: string; org_id: string; config: Record<string, unknown> },
  token: string,
  pageId: string
): Promise<number> {
  let newMessages = 0;

  // Fetch recent conversations (last 10, sorted by updated_time)
  const convUrl = `https://graph.facebook.com/v20.0/${pageId}/conversations?fields=id,updated_time,participants,messages.limit(5){id,message,from,created_time,attachments}&limit=10&access_token=${token}`;
  const convRes = await fetch(convUrl);
  const convData = await convRes.json();

  if (convData.error) {
    throw new Error(convData.error.message);
  }

  if (!convData.data) return 0;

  for (const conv of convData.data) {
    if (!conv.messages?.data) continue;

    for (const msg of conv.messages.data) {
      // Skip messages FROM the page itself (outbound)
      if (msg.from?.id === pageId) continue;

      const senderId = msg.from?.id;
      const senderName = msg.from?.name || `FB User ${senderId?.slice(-4)}`;
      if (!senderId || !msg.id) continue;

      // Check duplicate by platform_message_id
      const { data: existing } = await supabaseAdmin
        .from('messages')
        .select('id')
        .eq('platform_message_id', msg.id)
        .limit(1);

      if (existing && existing.length > 0) continue;

      // Get or create contact
      const contact = await getOrCreateContact(
        channel.org_id,
        'messenger',
        senderId,
        senderName,
        token
      );

      // Get or create conversation
      const conversation = await getOrCreateConversation(
        channel.org_id,
        channel.id,
        contact.id
      );

      // Parse message content
      const content = parseMessageContent(msg);
      if (!content) continue;

      // Insert message
      const createdAt = msg.created_time
        ? new Date(msg.created_time).toISOString()
        : new Date().toISOString();

      await supabaseAdmin.from('messages').insert({
        org_id: channel.org_id,
        conversation_id: conversation.id,
        sender_type: 'contact',
        sender_id: contact.id,
        content: content.content,
        content_type: content.contentType,
        metadata: content.metadata,
        platform_message_id: msg.id,
        created_at: createdAt
      });

      // Update conversation timestamp
      await supabaseAdmin
        .from('conversations')
        .update({ last_message_at: createdAt })
        .eq('id', conversation.id);

      newMessages++;
    }
  }

  return newMessages;
}

async function pollInstagramConversations(
  channel: { id: string; org_id: string; config: Record<string, unknown> },
  token: string,
  fbPageId: string
): Promise<number> {
  let newMessages = 0;

  // Instagram conversations via the page-scoped endpoint
  const convUrl = `https://graph.facebook.com/v20.0/${fbPageId}/conversations?fields=id,updated_time,participants,messages.limit(5){id,message,from,created_time,attachments}&platform=instagram&limit=10&access_token=${token}`;
  const convRes = await fetch(convUrl);
  const convData = await convRes.json();

  if (convData.error) {
    throw new Error(convData.error.message);
  }

  if (!convData.data) return 0;

  // Get the Instagram Business Account ID for filtering outbound messages
  const igAccountId = channel.config?.page_id as string || '';

  for (const conv of convData.data) {
    if (!conv.messages?.data) continue;

    for (const msg of conv.messages.data) {
      // Skip outbound messages (from the IG business account)
      if (msg.from?.id === igAccountId) continue;

      const senderId = msg.from?.id;
      const senderName = msg.from?.name || msg.from?.username || `IG User ${senderId?.slice(-4)}`;
      if (!senderId || !msg.id) continue;

      // Check duplicate
      const { data: existing } = await supabaseAdmin
        .from('messages')
        .select('id')
        .eq('platform_message_id', msg.id)
        .limit(1);

      if (existing && existing.length > 0) continue;

      // Get or create contact
      const contact = await getOrCreateContact(
        channel.org_id,
        'instagram',
        senderId,
        senderName,
        token,
        true
      );

      // Get or create conversation
      const conversation = await getOrCreateConversation(
        channel.org_id,
        channel.id,
        contact.id
      );

      // Parse message
      const content = parseMessageContent(msg);
      if (!content) continue;

      const createdAt = msg.created_time
        ? new Date(msg.created_time).toISOString()
        : new Date().toISOString();

      await supabaseAdmin.from('messages').insert({
        org_id: channel.org_id,
        conversation_id: conversation.id,
        sender_type: 'contact',
        sender_id: contact.id,
        content: content.content,
        content_type: content.contentType,
        metadata: content.metadata,
        platform_message_id: msg.id,
        created_at: createdAt
      });

      await supabaseAdmin
        .from('conversations')
        .update({ last_message_at: createdAt })
        .eq('id', conversation.id);

      newMessages++;
    }
  }

  return newMessages;
}

async function getOrCreateContact(
  orgId: string,
  platformType: string,
  platformId: string,
  fallbackName: string,
  token: string,
  isInstagram = false
) {
  // Check existing
  const { data: existing } = await supabaseAdmin
    .from('contacts')
    .select('id')
    .eq('org_id', orgId)
    .eq('platform_type', platformType)
    .eq('platform_id', platformId)
    .limit(1);

  if (existing && existing.length > 0) return existing[0];

  // Fetch profile from Meta
  let contactName = fallbackName;
  let avatarUrl = null;

  try {
    if (isInstagram) {
      const res = await fetch(
        `https://graph.facebook.com/v20.0/${platformId}?fields=name,username,profile_pic&access_token=${token}`
      );
      const profile = await res.json();
      if (!profile.error) {
        if (profile.username) contactName = `@${profile.username}`;
        else if (profile.name) contactName = profile.name;
        // Skip avatar upload for speed in polling
      }
    } else {
      const res = await fetch(
        `https://graph.facebook.com/v20.0/${platformId}?fields=first_name,last_name&access_token=${token}`
      );
      const profile = await res.json();
      if (!profile.error && (profile.first_name || profile.last_name)) {
        contactName = `${profile.first_name || ''} ${profile.last_name || ''}`.trim();
      }
    }
  } catch {
    // Use fallback name
  }

  const { data: newContact, error } = await supabaseAdmin
    .from('contacts')
    .insert({
      org_id: orgId,
      platform_type: platformType,
      platform_id: platformId,
      name: contactName,
      avatar_url: avatarUrl
    })
    .select('id')
    .single();

  if (error) throw error;
  return newContact;
}

async function getOrCreateConversation(
  orgId: string,
  channelId: string,
  contactId: string
) {
  // Find existing open conversation
  const { data: existing } = await supabaseAdmin
    .from('conversations')
    .select('id')
    .eq('org_id', orgId)
    .eq('contact_id', contactId)
    .eq('status', 'open')
    .order('created_at', { ascending: false })
    .limit(1);

  if (existing && existing.length > 0) return existing[0];

  // Create new conversation
  const { data: newConv, error } = await supabaseAdmin
    .from('conversations')
    .insert({
      org_id: orgId,
      channel_id: channelId,
      contact_id: contactId,
      status: 'open'
    })
    .select('id')
    .single();

  if (error) throw error;
  return newConv;
}

function parseMessageContent(msg: {
  message?: string;
  attachments?: { data?: Array<{ mime_type?: string; name?: string; size?: number; image_data?: { url?: string }; video_data?: { url?: string }; file_url?: string }> };
}) {
  if (msg.message) {
    return { content: msg.message, contentType: 'text', metadata: {} };
  }

  const att = msg.attachments?.data?.[0];
  if (!att) return null;

  const mime = att.mime_type || '';
  let contentType = 'file';
  let content = '[Attachment]';

  if (mime.startsWith('image/') || att.image_data) {
    contentType = 'image';
    content = '[Image]';
  } else if (mime.startsWith('video/') || att.video_data) {
    contentType = 'video';
    content = '[Video]';
  } else if (mime.startsWith('audio/')) {
    contentType = 'audio';
    content = '[Audio Voice Message]';
  }

  return {
    content,
    contentType,
    metadata: { attachments: msg.attachments?.data }
  };
}
