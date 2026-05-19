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
app.use(express.json({ limit: '100mb' }));

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function unwrapMessage(msg) {
  if (!msg) return null;
  let m = msg.message;
  if (!m) return null;

  // Ignore system, protocol, reactions and distribution messages
  if (
    m.senderKeyDistributionMessage ||
    m.protocolMessage ||
    m.reactionMessage
  ) {
    return null;
  }

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

  // Verify that unwrapped result isn't an ignored type
  if (m && (m.senderKeyDistributionMessage || m.protocolMessage || m.reactionMessage)) {
    return null;
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
  let normalizedJid = jid;
  if (normalizedJid && normalizedJid.endsWith('@lid')) {
    normalizedJid = normalizedJid.replace('@lid', '@s.whatsapp.net');
  }

  // 1. Direct platform_id check
  let { data: existing } = await supabase
    .from('contacts')
    .select('id, name, platform_id, metadata, phone')
    .eq('org_id', ORG_ID)
    .eq('platform_type', 'whatsapp')
    .eq('platform_id', normalizedJid)
    .maybeSingle();

  // 2. Fallback check by matching real_phone, phone, or platform_id clean digits
  if (!existing && normalizedJid && !normalizedJid.endsWith('@g.us')) {
    const cleanNumber = normalizedJid.split('@')[0].replace(/\D/g, '');
    
    if (cleanNumber.length >= 9) {
      const { data: matchedContacts } = await supabase
        .from('contacts')
        .select('id, name, platform_id, metadata, phone')
        .eq('org_id', ORG_ID)
        .eq('platform_type', 'whatsapp');

      if (matchedContacts && matchedContacts.length > 0) {
        existing = matchedContacts.find(c => {
          const cPhone = c.phone ? c.phone.replace(/\D/g, '') : null;
          const cRealPhone = c.metadata?.real_phone ? String(c.metadata.real_phone).replace(/\D/g, '') : null;
          const cPlatformNumber = c.platform_id ? c.platform_id.split('@')[0].replace(/\D/g, '') : null;
          
          return (cPhone && cPhone === cleanNumber) || 
                 (cRealPhone && cRealPhone === cleanNumber) ||
                 (cPlatformNumber && cPlatformNumber === cleanNumber);
        });

        if (existing) {
          console.log(`[UPSERT-CONTACT] Matched incoming ${normalizedJid} to existing contact ID ${existing.id} (Name: ${existing.name})`);
        }
      }
    }
  }

  if (existing) {
    // If incoming JID is different from stored JID (e.g. one is Phone, other is LID)
    // we want to merge them by saving the real_phone/metadata on the primary record.
    const cleanNumber = normalizedJid.split('@')[0].replace(/\D/g, '');
    const currentRealPhone = existing.metadata?.real_phone;
    
    if (!currentRealPhone && cleanNumber.length >= 9 && !normalizedJid.endsWith('@g.us')) {
      const updatedMetadata = { ...(existing.metadata || {}), real_phone: cleanNumber };
      await supabase
        .from('contacts')
        .update({ metadata: updatedMetadata })
        .eq('id', existing.id);
    }

    // Update name if we got a better one
    if (name && name !== existing.name && !normalizedJid.endsWith('@g.us')) {
      await supabase.from('contacts').update({ name }).eq('id', existing.id);
    }
    return existing.id;
  }

  // Create new contact
  const cleanNumber = normalizedJid.split('@')[0].replace(/\D/g, '');
  const displayName = name || cleanNumber.slice(-10);
  const metadata = {};
  if (cleanNumber.length >= 9 && !normalizedJid.endsWith('@g.us')) {
    metadata.real_phone = cleanNumber;
  }

  const { data: created } = await supabase.from('contacts').insert({
    org_id: ORG_ID,
    platform_id: normalizedJid,
    platform_type: 'whatsapp',
    name: displayName,
    phone: cleanNumber.length >= 9 ? cleanNumber : null,
    metadata
  }).select('id').single();

  return created.id;
}

// ─────────────────────────────────────────────
// Upsert conversation
// ─────────────────────────────────────────────

async function upsertConversation(contactId, channelId) {
  const { data: existing } = await supabase
    .from('conversations')
    .select('id, status')
    .eq('org_id', ORG_ID)
    .eq('contact_id', contactId)
    .eq('channel_id', channelId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) {
    if (existing.status !== 'open') {
      // Reopen the conversation if it was closed
      await supabase
        .from('conversations')
        .update({ status: 'open', last_message_at: new Date().toISOString() })
        .eq('id', existing.id);
    }
    return existing.id;
  }

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

async function downloadAndUploadMedia(msg, contentType, conversationJid) {
  const msgId = msg.key?.id;
  try {
    const res = await fetch(`${EVOLUTION_API_URL}/chat/getBase64FromMediaMessage/${EVOLUTION_INSTANCE}`, {
      method: 'POST',
      headers: {
        'apikey': EVOLUTION_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ message: msg, convertToMp4: false })
    });

    if (!res.ok) {
      console.error(`Evolution base64 fetch failed: ${res.status} ${res.statusText}`);
      return null;
    }
    const data = await res.json();
    if (!data.base64 || !data.mediaType) {
      console.error('[MEDIA] Missing base64 or mediaType in response');
      return null;
    }

    const buffer = Buffer.from(data.base64, 'base64');
    
    // Parse and sanitize mimetype and extension
    let mimeType = data.mediaType.split(';')[0].trim();
    if (mimeType.startsWith('data:')) {
      mimeType = mimeType.substring(5);
    }
    let ext = data.mediaType.split('/')[1]?.split(';')[0] || 'bin';
    ext = ext.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();

    // Safe fallbacks for malformed or missing mimeTypes (like Baileys internal types "imageMessage", "audioMessage")
    const mimeRegex = /^[a-zA-Z0-9\-]+\/[a-zA-Z0-9\-\.\+\*]+$/;
    if (!mimeType || !mimeRegex.test(mimeType) || mimeType.endsWith('Message')) {
      console.log(`[MEDIA-WARNING] Invalid mimeType "${mimeType}", using fallback for contentType "${contentType}"`);
      if (contentType === 'image') {
        mimeType = 'image/jpeg';
        ext = 'jpg';
      } else if (contentType === 'audio') {
        mimeType = 'audio/ogg';
        ext = 'ogg';
      } else if (contentType === 'video') {
        mimeType = 'video/mp4';
        ext = 'mp4';
      } else {
        mimeType = 'application/octet-stream';
        ext = 'bin';
      }
    }

    const fileName = `${conversationJid.replace('@', '_')}/${Date.now()}.${ext}`;

    console.log(`[MEDIA] Uploading filename: ${fileName}, mimeType: ${mimeType}, size: ${buffer.length} bytes`);

    const { error } = await supabase.storage
      .from('media')
      .upload(fileName, buffer, { contentType: mimeType, upsert: false });

    if (error) {
      console.error('[MEDIA] Supabase upload failed:', error.message, error);
      return null;
    }

    const { data: urlData } = supabase.storage.from('media').getPublicUrl(fileName);
    return { url: urlData.publicUrl, mimeType, fileName };
  } catch (err) {
    console.error('Media download error:', err.message);
    return null;
  }
}

// In-memory concurrency locks to prevent race conditions on parallel message processing for the same user
const locks = new Map();

async function acquireLock(key) {
  while (locks.has(key)) {
    await locks.get(key);
  }
  let resolveLock;
  const lockPromise = new Promise(resolve => {
    resolveLock = resolve;
  });
  locks.set(key, lockPromise);
  return () => {
    locks.delete(key);
    resolveLock();
  };
}

async function processMessage(msg) {
  // Skip protocol, distribution, and reaction messages
  const unwrapped = unwrapMessage(msg);
  if (!unwrapped) return;

  // Skip status messages
  let conversationJid = getConversationJid(msg);
  if (conversationJid === 'status@broadcast') return;

  if (conversationJid && conversationJid.endsWith('@lid')) {
    conversationJid = conversationJid.replace('@lid', '@s.whatsapp.net');
  }

  const release = await acquireLock(conversationJid);

  try {
    const isGroup = conversationJid.endsWith('@g.us');
    let senderJid = getSender(msg);
    if (senderJid && senderJid.endsWith('@lid')) {
      senderJid = senderJid.replace('@lid', '@s.whatsapp.net');
    }

    const senderName = resolveName(msg);
    const text = extractText(msg);
    const contentType = getContentType(msg);
    const msgId = msg.key?.id;
    const fromMe = isFromMe(msg);

    // Drop incoming text messages with empty or blank content (junk, reaction stub noise)
    if (contentType === 'text' && !text.trim()) {
      console.log(`[MSG] Skipping empty text message: ${msgId}`);
      return;
    }

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
      const media = await downloadAndUploadMedia(msg, contentType, conversationJid);
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
      sender_type: fromMe ? 'agent' : 'contact',
      sender_id: fromMe ? null : contactId,
      content: text || (contentType !== 'text' ? mediaPlaceholder(contentType) : ''),
      content_type: contentType,
      metadata,
      status: 'delivered'
    });

    // Update conversation last_message_at
    await supabase.from('conversations')
      .update({ last_message_at: new Date().toISOString() })
      .eq('id', conversationId);

    console.log(`[MSG] ${isGroup ? 'Group' : 'DM'} from ${fromMe ? 'Agent (Me)' : (senderName || senderJid)}: "${text.slice(0, 60)}"`);
  } catch (err) {
    console.error('[processMessage] Error:', err.message);
  } finally {
    release();
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

const supabaseRealtime = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
  realtime: { transport: WebSocket }
});

// Outbound message processor
async function processOutboundMessage(msg) {
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
      .select('platform_id, phone, metadata')
      .eq('id', conv.contact_id)
      .single();

    if (!contact) return;

    let jid = contact.platform_id.includes('@')
      ? contact.platform_id
      : `${contact.platform_id}@s.whatsapp.net`;

    if (jid.endsWith('@lid')) {
      jid = jid.replace('@lid', '@s.whatsapp.net');
    }

    // Resolve LID to PN (Phone Number) JID if real phone is available in metadata or phone
    const realPhone = contact.metadata?.real_phone || contact.phone;
    if (realPhone) {
      const cleanPhone = realPhone.replace(/[^0-9]/g, '');
      if (cleanPhone.length >= 9 && !realPhone.includes('@')) {
        const phoneJid = `${cleanPhone}@s.whatsapp.net`;
        console.log(`[OUTBOUND] Resolving JID from LID ${jid} to verified Phone JID ${phoneJid}`);
        jid = phoneJid;
      }
    }

    let sentResult;
    if (msg.metadata?.media_url) {
      sentResult = await sendMediaMessage(
        jid,
        msg.metadata.media_url,
        msg.content !== '[Image]' && msg.content !== '[Video]' && msg.content !== '[Attachment]' && msg.content !== '[Audio Voice Message]' ? msg.content : '',
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
}

// Self-healing sweep for pending outbound messages sent while worker was restarting/offline
async function sendPendingOutboundMessages() {
  try {
    const { data: pending, error } = await supabaseRealtime
      .from('messages')
      .select('*')
      .eq('status', 'sent')
      .in('sender_type', ['agent', 'ai'])
      .is('platform_message_id', null)
      .is('is_internal', false);

    if (error) {
      console.error('[SELF-HEAL] Failed to fetch pending messages:', error.message);
      return;
    }

    if (pending && pending.length > 0) {
      console.log(`[SELF-HEAL] Found ${pending.length} pending outbound messages. Processing...`);
      for (const msg of pending) {
        await processOutboundMessage(msg);
      }
    }
  } catch (err) {
    console.error('[SELF-HEAL] Sweep error:', err.message);
  }
}



supabaseRealtime
  .channel('outbound_messages')
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'messages',
    filter: `org_id=eq.${ORG_ID}`
  }, async (payload) => {
    await processOutboundMessage(payload.new);
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

  // Sweep for and send any outbound messages created while worker was offline
  await sendPendingOutboundMessages();
  
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
