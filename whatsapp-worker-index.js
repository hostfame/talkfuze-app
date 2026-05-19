require('dotenv').config();
global.WebSocket = require('ws');

const express = require('express');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const ORG_ID = process.env.ORG_ID;
const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL || 'http://localhost:8080';
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY || 'talkfuze_evolution_key_2026';
const EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE || 'talkfuze';
const WEBHOOK_PORT = parseInt(process.env.WEBHOOK_PORT || '3001');
const WEBHOOK_PUBLIC_URL = process.env.WEBHOOK_PUBLIC_URL || `http://46.225.152.127:${WEBHOOK_PORT}`;

if (!SUPABASE_URL || !SUPABASE_KEY || !ORG_ID) {
  console.error('Missing environment variables');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false }
});

const app = express();
app.use(express.json({ limit: '50mb' }));

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function unwrapMessage(msg) {
  if (!msg) return null;
  let m = msg.message;
  if (!m) return null;

  // Recursively unwrap standard Baileys wrappers (like ephemeral, disappearing, or view-once messages)
  while (m) {
    if (m.ephemeralMessage?.message) {
      m = m.ephemeralMessage.message;
    } else if (m.viewOnceMessage?.message) {
      m = m.viewOnceMessage.message;
    } else if (m.viewOnceMessageV2?.message) {
      m = m.viewOnceMessageV2.message;
    } else if (m.documentWithCaptionMessage?.message) {
      m = m.documentWithCaptionMessage.message;
    } else {
      break;
    }
  }
  return m;
}

function extractText(msg) {
  const m = unwrapMessage(msg);
  if (!m) return '';
  return m.conversation
    || m.extendedTextMessage?.text
    || m.imageMessage?.caption
    || m.videoMessage?.caption
    || m.documentMessage?.caption
    || '';
}

function getContentType(msg) {
  const m = unwrapMessage(msg);
  if (!m) return 'text';
  if (m.imageMessage) return 'image';
  if (m.audioMessage || m.pttMessage) return 'audio';
  if (m.videoMessage) return 'video';
  if (m.documentMessage) return 'file';
  if (m.stickerMessage) return 'image';
  return 'text';
}

function isFromMe(msg) {
  return msg.key?.fromMe === true;
}

function getSender(msg) {
  const jid = msg.key?.participant || msg.key?.remoteJid || '';
  return jid;
}

function getConversationJid(msg) {
  return msg.key?.remoteJid || '';
}

function resolveName(msg) {
  return msg.pushName || msg.key?.participant?.split('@')[0] || '';
}

function mediaPlaceholder(contentType) {
  if (contentType === 'image') return '[Image]';
  if (contentType === 'audio') return '[Audio Voice Message]';
  if (contentType === 'video') return '[Video]';
  return '[Attachment]';
}

function formatQrCode(base64) {
  if (!base64) return null;
  return base64.startsWith('data:') ? base64 : `data:image/png;base64,${base64}`;
}

function extractSentMessageId(result) {
  return result?.key?.id
    || result?.message?.key?.id
    || result?.data?.key?.id
    || result?.data?.message?.key?.id
    || null;
}

// ─────────────────────────────────────────────
// Channel bootstrap
// ─────────────────────────────────────────────

let whatsappChannelId = null;

async function getOrCreateChannel() {
  const { data: existing } = await supabase
    .from('channels')
    .select('id')
    .eq('org_id', ORG_ID)
    .eq('type', 'whatsapp')
    .limit(1)
    .maybeSingle();

  if (existing) {
    return existing.id;
  }

  const { data: created } = await supabase.from('channels').insert({
    org_id: ORG_ID,
    type: 'whatsapp',
    config: { status: 'pending' },
    is_active: true
  }).select('id').single();

  return created.id;
}

// ─────────────────────────────────────────────
// Upsert contact
// ─────────────────────────────────────────────

async function upsertContact(jid, name) {
  const { data: existing } = await supabase
    .from('contacts')
    .select('id, name')
    .eq('org_id', ORG_ID)
    .eq('platform_type', 'whatsapp')
    .eq('platform_id', jid)
    .maybeSingle();

  if (existing) {
    // Update name if we got a better one
    if (name && name !== existing.name && !jid.endsWith('@g.us')) {
      await supabase.from('contacts').update({ name }).eq('id', existing.id);
    }
    return existing.id;
  }

  const displayName = name || jid.split('@')[0].replace(/\D/g, '').slice(-10);
  const { data: created } = await supabase.from('contacts').insert({
    org_id: ORG_ID,
    platform_id: jid,
    platform_type: 'whatsapp',
    name: displayName,
  }).select('id').single();

  return created.id;
}

// ─────────────────────────────────────────────
// Upsert conversation
// ─────────────────────────────────────────────

async function upsertConversation(contactId, channelId) {
  const { data: existing } = await supabase
    .from('conversations')
    .select('id')
    .eq('org_id', ORG_ID)
    .eq('contact_id', contactId)
    .eq('channel_id', channelId)
    .limit(1)
    .maybeSingle();

  if (existing) return existing.id;

  const { data: created } = await supabase.from('conversations').insert({
    org_id: ORG_ID,
    contact_id: contactId,
    channel_id: channelId,
    status: 'open'
  }).select('id').single();

  return created.id;
}

// ─────────────────────────────────────────────
// Download media via Evolution API
// ─────────────────────────────────────────────

async function downloadAndUploadMedia(msgId, contentType, conversationJid) {
  try {
    const res = await fetch(`${EVOLUTION_API_URL}/chat/getBase64FromMediaMessage/${EVOLUTION_INSTANCE}`, {
      method: 'POST',
      headers: {
        'apikey': EVOLUTION_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ message: { key: { id: msgId } }, convertToMp4: false })
    });

    if (!res.ok) return null;
    const data = await res.json();
    if (!data.base64 || !data.mediaType) return null;

    const buffer = Buffer.from(data.base64, 'base64');
    const ext = data.mediaType.split('/')[1]?.split(';')[0] || 'bin';
    const fileName = `${conversationJid.replace('@', '_')}/${Date.now()}.${ext}`;
    const mimeType = data.mediaType;

    const { error } = await supabase.storage
      .from('media')
      .upload(fileName, buffer, { contentType: mimeType, upsert: false });

    if (error) {
      console.error('Storage upload error:', error.message);
      return null;
    }

    const { data: urlData } = supabase.storage.from('media').getPublicUrl(fileName);
    return { url: urlData.publicUrl, mimeType, fileName };
  } catch (err) {
    console.error('Media download error:', err.message);
    return null;
  }
}

// ─────────────────────────────────────────────
// Process inbound message
// ─────────────────────────────────────────────

async function processMessage(msg) {
  // Skip messages sent by us (handled by the send endpoint)
  if (isFromMe(msg)) return;
  // Skip status messages
  const conversationJid = getConversationJid(msg);
  if (conversationJid === 'status@broadcast') return;

  const isGroup = conversationJid.endsWith('@g.us');
  const senderJid = getSender(msg);
  const senderName = resolveName(msg);
  const text = extractText(msg);
  const contentType = getContentType(msg);
  const msgId = msg.key?.id;

  try {
    if (msgId) {
      const { data: existingMessage } = await supabase
        .from('messages')
        .select('id')
        .eq('org_id', ORG_ID)
        .eq('platform_message_id', msgId)
        .limit(1)
        .maybeSingle();

      if (existingMessage) {
        console.log(`[MSG] Duplicate dropped: ${msgId}`);
        return;
      }
    }

    const channelId = await getOrCreateChannel();
    const contactId = await upsertContact(conversationJid, isGroup ? null : senderName);
    const conversationId = await upsertConversation(contactId, channelId);

    // Build metadata
    const metadata = {
      participant_jid: isGroup ? senderJid : null,
      participant_name: isGroup ? senderName : null,
    };

    // Handle media
    if (contentType !== 'text') {
      const media = await downloadAndUploadMedia(msgId, contentType, conversationJid);
      if (media) {
        metadata.media_url = media.url;
        metadata.mimetype = media.mimeType;
        metadata.filename = media.fileName;
      }
    }

    // Insert message
    await supabase.from('messages').insert({
      org_id: ORG_ID,
      conversation_id: conversationId,
      platform_message_id: msgId,
      sender_type: 'contact',
      sender_id: contactId,
      content: text || (contentType !== 'text' ? mediaPlaceholder(contentType) : ''),
      content_type: contentType,
      metadata,
      status: 'delivered'
    });

    // Update conversation last_message_at
    await supabase.from('conversations')
      .update({ last_message_at: new Date().toISOString() })
      .eq('id', conversationId);

    console.log(`[MSG] ${isGroup ? 'Group' : 'DM'} from ${senderName || senderJid}: "${text.slice(0, 60)}"`);
  } catch (err) {
    console.error('[processMessage] Error:', err.message);
  }
}

// ─────────────────────────────────────────────
// Webhooks (Incoming from Evolution API)
// ─────────────────────────────────────────────

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', uptime: process.uptime() });
});

app.post('/webhook/evolution', async (req, res) => {
  res.status(200).send('ok'); // respond fast

  const body = req.body;
  const event = body.event;

  if (event === 'messages.upsert') {
    const messages = body.data?.messages || (body.data ? [body.data] : []);
    for (const msg of messages) {
      await processMessage(msg).catch(err => console.error('processMessage failed:', err.message));
    }
  } else if (event === 'connection.update') {
    const state = body.data?.state;
    console.log(`[CONNECTION] Status: ${state}`);

    // Fetch existing channel config to preserve QR and pairing codes
    const { data: channel } = await supabase.from('channels')
      .select('config')
      .eq('org_id', ORG_ID)
      .eq('type', 'whatsapp')
      .maybeSingle();

    const currentConfig = channel?.config || {};
    const qrCode = currentConfig.qr_code || null;
    const pairingCode = currentConfig.pairing_code || null;

    if (state === 'open') {
      // Device linked, QR no longer needed
      await supabase.from('channels')
        .update({ 
          config: { status: 'connected', qr_code: null, pairing_code: null }, 
          is_active: true 
        })
        .eq('org_id', ORG_ID)
        .eq('type', 'whatsapp');
    } else if (state === 'close') {
      // Disconnected but keep the QR/pairing code so user can scan/reconnect
      await supabase.from('channels')
        .update({ 
          config: { status: 'disconnected', qr_code: qrCode, pairing_code: pairingCode }, 
          is_active: true 
        })
        .eq('org_id', ORG_ID)
        .eq('type', 'whatsapp');
    } else if (state === 'connecting') {
      // Connecting / starting up: preserve QR code so UI doesn't buffer infinitely
      await supabase.from('channels')
        .update({ 
          config: { status: 'pending', qr_code: qrCode, pairing_code: pairingCode }, 
          is_active: true 
        })
        .eq('org_id', ORG_ID)
        .eq('type', 'whatsapp');
    }
  } else if (event === 'qrcode.updated') {
    const qrBase64 = body.data?.qrcode?.base64 || body.data?.base64 || '';
    const pairingCode = body.data?.qrcode?.pairingCode || '';
    console.log('[QR] New QR code received!');
    if (pairingCode) console.log('[QR] Pairing Code:', pairingCode);
    console.log('[QR] Scan via Evolution Manager: http://46.225.152.127:8080/manager');
    if (qrBase64) console.log('[QR] Base64 length:', qrBase64.length, '(has content)');
    const channelId = await getOrCreateChannel();
    await supabase.from('channels')
      .update({
        config: {
          status: 'pending',
          qr_code: formatQrCode(qrBase64),
          pairing_code: pairingCode || null
        },
        is_active: true
      })
      .eq('id', channelId);
  }
});

// ─────────────────────────────────────────────
// Outbound: send message via Evolution API
// Used by the Supabase Realtime listener below
// ─────────────────────────────────────────────

async function sendTextMessage(jid, text) {
  const res = await fetch(`${EVOLUTION_API_URL}/message/sendText/${EVOLUTION_INSTANCE}`, {
    method: 'POST',
    headers: {
      'apikey': EVOLUTION_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ number: jid, text })
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Evolution sendText failed: ${err}`);
  }
  return res.json();
}

async function sendMediaMessage(jid, mediaUrl, caption, mimetype) {
  const mediaType = mimetype?.startsWith('image/') ? 'image'
    : mimetype?.startsWith('audio/') ? 'audio'
    : mimetype?.startsWith('video/') ? 'video'
    : 'document';

  const endpoint = mediaType === 'image' ? 'sendMedia'
    : mediaType === 'audio' ? 'sendWhatsAppAudio'
    : mediaType === 'video' ? 'sendMedia'
    : 'sendMedia';

  const res = await fetch(`${EVOLUTION_API_URL}/message/${endpoint}/${EVOLUTION_INSTANCE}`, {
    method: 'POST',
    headers: {
      'apikey': EVOLUTION_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      number: jid,
      mediatype: mediaType,
      media: mediaUrl,
      caption: caption || '',
      mimetype
    })
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Evolution sendMedia failed: ${err}`);
  }
  return res.json();
}

// ─────────────────────────────────────────────
// Supabase Realtime: watch for agent messages
// ─────────────────────────────────────────────

const WebSocket = require('ws');
const supabaseRealtime = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
  realtime: { transport: WebSocket }
});

supabaseRealtime
  .channel('outbound_messages')
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'messages',
    filter: `org_id=eq.${ORG_ID}`
  }, async (payload) => {
    const msg = payload.new;
    if (msg.sender_type !== 'agent' && msg.sender_type !== 'ai') return;
    if (msg.is_internal) return;
    if (msg.platform_message_id) return; // already sent

    try {
      const { data: conv } = await supabaseRealtime
        .from('conversations')
        .select('contact_id, channels!inner(type)')
        .eq('id', msg.conversation_id)
        .single();

      if (!conv || conv.channels?.type !== 'whatsapp') return;

      const { data: contact } = await supabaseRealtime
        .from('contacts')
        .select('platform_id')
        .eq('id', conv.contact_id)
        .single();

      if (!contact) return;

      const jid = contact.platform_id.includes('@')
        ? contact.platform_id
        : `${contact.platform_id}@s.whatsapp.net`;

      let sentResult;
      if (msg.metadata?.media_url) {
        sentResult = await sendMediaMessage(
          jid,
          msg.metadata.media_url,
          msg.content !== '[Image]' && msg.content !== '[Video]' && msg.content !== '[Attachment]' ? msg.content : '',
          msg.metadata.mimetype
        );
      } else {
        sentResult = await sendTextMessage(jid, msg.content);
      }

      // Save platform message id for dedup
      const platformMessageId = extractSentMessageId(sentResult);
      if (platformMessageId) {
        await supabaseRealtime.from('messages')
          .update({ platform_message_id: platformMessageId, status: 'delivered' })
          .eq('id', msg.id);
      }

      console.log(`[OUTBOUND] Sent to ${jid}: "${msg.content?.slice(0, 60)}"`);
    } catch (err) {
      console.error('[OUTBOUND] Error:', err.message);
      await supabaseRealtime.from('messages')
        .update({
          status: 'failed',
          metadata: {
            ...(msg.metadata || {}),
            delivery_error: err.message,
            delivery_failed_at: new Date().toISOString()
          }
        })
        .eq('id', msg.id);
    }
  })
  .subscribe((status) => {
    console.log('[REALTIME] Status:', status);
  });

// ─────────────────────────────────────────────
// Register webhook with Evolution API on startup
// ─────────────────────────────────────────────

async function registerWebhook() {
  const selfUrl = `${WEBHOOK_PUBLIC_URL.replace(/\/$/, '')}/webhook/evolution`;

  try {
    const res = await fetch(`${EVOLUTION_API_URL}/webhook/set/${EVOLUTION_INSTANCE}`, {
      method: 'POST',
      headers: {
        'apikey': EVOLUTION_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        webhook: {
          enabled: true,
          url: selfUrl,
          webhook_by_events: false,
          webhook_base64: true,
          events: [
            'MESSAGES_UPSERT',
            'CONNECTION_UPDATE',
            'QRCODE_UPDATED'
          ]
        }
      })
    });
    const data = await res.json();
    if (data.id) {
      console.log('[WEBHOOK] Registered successfully. URL:', selfUrl);
    } else {
      console.error('[WEBHOOK] Registration failed:', JSON.stringify(data));
    }
  } catch (err) {
    console.error('[WEBHOOK] Register failed:', err.message);
  }
}

// ─────────────────────────────────────────────
// Start
// ─────────────────────────────────────────────

app.listen(WEBHOOK_PORT, '0.0.0.0', async () => {
  console.log(`[SERVER] TalkFuze Evolution Bridge running on port ${WEBHOOK_PORT}`);
  
  // Register webhook with Evolution API
  await registerWebhook();
  
  console.log('[READY] Listening for WhatsApp events...');
  
  // Signal PM2 that the application is ready (for wait_ready zero-downtime reloads)
  if (process.send) {
    process.send('ready');
  }
});

// ─────────────────────────────────────────────
// Error Boundaries & Graceful Shutdown
// ─────────────────────────────────────────────

process.on('uncaughtException', (err) => {
  console.error('[CRITICAL] Uncaught Exception:', err);
  // Give PM2 time to process the log before exiting
  setTimeout(() => process.exit(1), 500);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[CRITICAL] Unhandled Rejection at:', promise, 'reason:', reason);
});

async function gracefulShutdown(signal) {
  console.log(`\n[SHUTDOWN] Received ${signal}, starting graceful shutdown...`);
  // PM2 sends SIGINT by default on restart/reload
  try {
    // We could close db connections here if we had long-lived pools
    console.log('[SHUTDOWN] Cleanup complete. Exiting.');
    process.exit(0);
  } catch (err) {
    console.error('[SHUTDOWN] Error during cleanup:', err);
    process.exit(1);
  }
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
