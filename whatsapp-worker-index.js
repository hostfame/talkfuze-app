require('dotenv').config();
global.WebSocket = require('ws');

const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const { uploadToR2 } = require('./r2.js');
const { registerUnblockRoute } = require('./unblock-ip.js');

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

function extractMentions(msg) {
  const m = unwrapMessage(msg);
  if (!m) return [];
  const contextInfo = m.extendedTextMessage?.contextInfo || m.imageMessage?.contextInfo || m.videoMessage?.contextInfo || m.documentMessage?.contextInfo || m.audioMessage?.contextInfo;
  return contextInfo?.mentionedJid || [];
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
// LID-to-Phone resolution (in-memory cache)
// WhatsApp LID numbers are NOT phone numbers.
// e.g. 186771535069352@lid != 8801889877754
// We must resolve LID -> real phone via Evolution API.
// ─────────────────────────────────────────────

const lidToPhoneCache = new Map();

async function resolveLidToPhone(lidJid) {
  // Only resolve @lid JIDs
  const rawLid = lidJid.endsWith('@lid') ? lidJid : lidJid.replace('@s.whatsapp.net', '@lid');
  const lidNumber = rawLid.split('@')[0];

  // Check cache first
  if (lidToPhoneCache.has(lidNumber)) {
    return lidToPhoneCache.get(lidNumber);
  }

  try {
    // Try to find contacts in Evolution that match this LID
    // The findContacts endpoint returns all contacts; we look for matching LID
    const res = await fetch(`${EVOLUTION_API_URL}/chat/findContacts/${EVOLUTION_INSTANCE}`, {
      method: 'POST',
      headers: { 'apikey': EVOLUTION_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ where: { id: rawLid } })
    });

    if (res.ok) {
      const contacts = await res.json();
      const match = Array.isArray(contacts)
        ? contacts.find(c => c.remoteJid === rawLid)
        : null;

      // If the contact has a pushName and we can find them by phone
      // Evolution stores separate entries for phone and LID
      if (match) {
        // Search all contacts for one with same pushName but phone-based JID
        const allRes = await fetch(`${EVOLUTION_API_URL}/chat/findContacts/${EVOLUTION_INSTANCE}`, {
          method: 'POST',
          headers: { 'apikey': EVOLUTION_API_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({})
        });

        if (allRes.ok) {
          const allContacts = await allRes.json();
          // Find a phone-based contact with matching pushName
          const phoneContact = allContacts.find(c =>
            c.remoteJid &&
            c.remoteJid.endsWith('@s.whatsapp.net') &&
            !c.remoteJid.endsWith('@g.us') &&
            c.pushName &&
            match.pushName &&
            c.pushName === match.pushName
          );

          if (phoneContact) {
            const phone = phoneContact.remoteJid.split('@')[0];
            lidToPhoneCache.set(lidNumber, phone);
            console.log(`[LID-RESOLVE] Resolved ${rawLid} -> ${phone} via pushName match`);
            return phone;
          }
        }
      }
    }
  } catch (err) {
    console.error(`[LID-RESOLVE] Error resolving ${rawLid}:`, err.message);
  }

  // Try checking our own DB for contacts that have this LID stored in metadata
  try {
    const { data: dbContacts } = await supabase
      .from('contacts')
      .select('phone, metadata, platform_id')
      .eq('org_id', ORG_ID)
      .eq('platform_type', 'whatsapp');

    if (dbContacts) {
      const match = dbContacts.find(c =>
        c.metadata?.lid === lidNumber ||
        c.metadata?.lid === rawLid
      );
      if (match && match.phone) {
        lidToPhoneCache.set(lidNumber, match.phone);
        console.log(`[LID-RESOLVE] Resolved ${rawLid} -> ${match.phone} via DB metadata.lid`);
        return match.phone;
      }
    }
  } catch (err) {
    console.error(`[LID-RESOLVE] DB fallback error:`, err.message);
  }

  console.log(`[LID-RESOLVE] Could not resolve ${rawLid} to phone number`);
  return null;
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
  const isGroup = jid.endsWith('@g.us');
  const isLid = jid.endsWith('@lid') || /^\d{12,}@s\.whatsapp\.net$/.test(jid);
  
  let canonicalJid = jid;
  let lidNumber = null;
  let resolvedPhone = null;

  // ── Step 1: If this is a LID, resolve to real phone number ──
  if (!isGroup && isLid) {
    lidNumber = jid.split('@')[0];
    resolvedPhone = await resolveLidToPhone(jid);
    
    if (resolvedPhone) {
      canonicalJid = `${resolvedPhone}@s.whatsapp.net`;
      console.log(`[UPSERT-CONTACT] LID ${jid} resolved to canonical ${canonicalJid}`);
    } else {
      // Can't resolve - use the LID as-is but normalized
      canonicalJid = jid.endsWith('@lid') ? jid.replace('@lid', '@s.whatsapp.net') : jid;
      console.log(`[UPSERT-CONTACT] LID ${jid} unresolved, using ${canonicalJid}`);
    }
  }

  // ── Step 1.5: Ensure canonicalJid uses correct BD country prefix ──
  if (!isGroup) {
    let cleanJidNum = canonicalJid.split('@')[0].replace(/[^0-9]/g, '');
    if (cleanJidNum.length === 10 && cleanJidNum.startsWith('1')) {
      cleanJidNum = '880' + cleanJidNum;
    } else if (cleanJidNum.length === 11 && cleanJidNum.startsWith('01')) {
      cleanJidNum = '88' + cleanJidNum;
    }
    canonicalJid = `${cleanJidNum}@s.whatsapp.net`;
  }

  // ── Step 2: Look up existing contact by canonical JID ──
  let { data: existing } = await supabase
    .from('contacts')
    .select('id, name, platform_id, metadata, phone')
    .eq('org_id', ORG_ID)
    .eq('platform_type', 'whatsapp')
    .eq('platform_id', canonicalJid)
    .maybeSingle();

  // ── Step 3: Fallback - search by phone, real_phone, or LID in metadata ──
  if (!existing && !isGroup) {
    const searchPhone = resolvedPhone || canonicalJid.split('@')[0].replace(/\D/g, '');

    if (searchPhone.length >= 9) {
      const { data: allContacts } = await supabase
        .from('contacts')
        .select('id, name, platform_id, metadata, phone')
        .eq('org_id', ORG_ID)
        .eq('platform_type', 'whatsapp');

      if (allContacts && allContacts.length > 0) {
        existing = allContacts.find(c => {
          const cPhone = c.phone ? c.phone.replace(/\D/g, '') : null;
          const cRealPhone = c.metadata?.real_phone ? String(c.metadata.real_phone).replace(/\D/g, '') : null;
          const cPlatformNumber = c.platform_id ? c.platform_id.split('@')[0].replace(/\D/g, '') : null;
          const cLid = c.metadata?.lid || null;

          // Match by phone number
          if (cPhone && cPhone === searchPhone) return true;
          if (cRealPhone && cRealPhone === searchPhone) return true;
          if (cPlatformNumber && cPlatformNumber === searchPhone) return true;
          // Match by stored LID
          if (lidNumber && cLid && cLid === lidNumber) return true;
          return false;
        });

        if (existing) {
          console.log(`[UPSERT-CONTACT] Fallback matched ${jid} to contact ${existing.id} (${existing.name})`);
        }
      }
    }
  }

  // ── Step 4: Update existing or create new ──
  if (existing) {
    const updates = {};
    const metaUpdates = { ...(existing.metadata || {}) };
    let needsMetaUpdate = false;

    // Store LID mapping in metadata
    if (lidNumber && !metaUpdates.lid) {
      metaUpdates.lid = lidNumber;
      needsMetaUpdate = true;
    }

    // Store real phone if resolved and not already stored
    if (resolvedPhone && !metaUpdates.real_phone) {
      metaUpdates.real_phone = resolvedPhone;
      needsMetaUpdate = true;
    }

    // If we resolved a phone and the stored platform_id is a LID-based fake JID, upgrade it
    if (resolvedPhone && existing.platform_id !== canonicalJid) {
      updates.platform_id = canonicalJid;
      console.log(`[UPSERT-CONTACT] Upgrading platform_id from ${existing.platform_id} to ${canonicalJid}`);
    }

    // Ensure existing contact's platform_id and phone field are normalized with prefix
    if (!isGroup) {
      if (existing.platform_id !== canonicalJid) {
        updates.platform_id = canonicalJid;
      }
      
      let cleanExistPhone = (existing.phone || '').replace(/\D/g, '');
      if (cleanExistPhone) {
        if (cleanExistPhone.length === 10 && cleanExistPhone.startsWith('1')) {
          cleanExistPhone = '880' + cleanExistPhone;
        } else if (cleanExistPhone.length === 11 && cleanExistPhone.startsWith('01')) {
          cleanExistPhone = '88' + cleanExistPhone;
        }
        if (existing.phone !== cleanExistPhone) {
          updates.phone = cleanExistPhone;
        }
      }
    }

    // Automatically clear whatsapp_invalid flag if they successfully sent us a message/activity
    if (metaUpdates.whatsapp_invalid) {
      delete metaUpdates.whatsapp_invalid;
      needsMetaUpdate = true;
      console.log(`[UPSERT-CONTACT] Cleared whatsapp_invalid flag for ${existing.id} due to inbound activity`);
    }

    // Update phone field if missing
    if (resolvedPhone && !existing.phone) {
      let cleanResolved = resolvedPhone.replace(/\D/g, '');
      if (cleanResolved.length === 10 && cleanResolved.startsWith('1')) {
        cleanResolved = '880' + cleanResolved;
      } else if (cleanResolved.length === 11 && cleanResolved.startsWith('01')) {
        cleanResolved = '88' + cleanResolved;
      }
      updates.phone = cleanResolved;
    }

    if (needsMetaUpdate) updates.metadata = metaUpdates;
    if (name && name !== existing.name && !isGroup) updates.name = name;

    if (Object.keys(updates).length > 0) {
      await supabase.from('contacts').update(updates).eq('id', existing.id);
    }

    return existing.id;
  }

  // ── Step 5: Create new contact ──
  const rawPhoneNumber = resolvedPhone || canonicalJid.split('@')[0].replace(/\D/g, '');
  let phoneNumber = rawPhoneNumber;
  if (!isGroup) {
    if (phoneNumber.length === 10 && phoneNumber.startsWith('1')) {
      phoneNumber = '880' + phoneNumber;
    } else if (phoneNumber.length === 11 && phoneNumber.startsWith('01')) {
      phoneNumber = '88' + phoneNumber;
    }
  }
  const displayName = name || phoneNumber.slice(-10);
  const metadata = {};
  if (phoneNumber.length >= 9 && !isGroup) {
    metadata.real_phone = phoneNumber;
  }
  if (lidNumber) {
    metadata.lid = lidNumber;
  }

  const { data: created } = await supabase.from('contacts').insert({
    org_id: ORG_ID,
    platform_id: canonicalJid,
    platform_type: 'whatsapp',
    name: displayName,
    phone: phoneNumber.length >= 9 ? phoneNumber : null,
    metadata
  }).select('id').single();

  console.log(`[UPSERT-CONTACT] Created new contact ${created.id} for ${canonicalJid} (${displayName})`);
  return created.id;
}

// ─────────────────────────────────────────────
// Upsert conversation
// ─────────────────────────────────────────────

async function upsertConversation(contactId, channelId, createdAt) {
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
        .update({ status: 'open', last_message_at: createdAt || new Date().toISOString() })
        .eq('id', existing.id);
    }
    return existing.id;
  }

  const { data: created } = await supabase.from('conversations').insert({
    org_id: ORG_ID,
    contact_id: contactId,
    channel_id: channelId,
    status: 'open',
    last_message_at: createdAt || new Date().toISOString()
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
        // For documents, try to extract original filename and mimetype from documentMessage to prevent .bin fallback
        const docMsg = unwrapMessage(msg)?.documentMessage;
        if (docMsg) {
          const originalMime = docMsg.mimetype;
          const originalFileName = docMsg.fileName || docMsg.filename || '';
          let detectedExt = '';
          if (originalFileName && originalFileName.includes('.')) {
            detectedExt = originalFileName.split('.').pop().toLowerCase().replace(/[^a-zA-Z0-9]/g, '');
          }
          
          if (originalMime && mimeRegex.test(originalMime)) {
            mimeType = originalMime;
          } else {
            mimeType = 'application/octet-stream';
          }
          
          if (detectedExt) {
            ext = detectedExt;
          } else {
            ext = 'bin';
          }
        } else {
          mimeType = 'application/octet-stream';
          ext = 'bin';
        }
      }
    }

    const fileName = `${conversationJid.replace('@', '_')}/${Date.now()}.${ext}`;

    console.log(`[MEDIA] Uploading filename: ${fileName}, mimeType: ${mimeType}, size: ${buffer.length} bytes`);

    const r2Url = await uploadToR2(buffer, fileName, mimeType);

    if (!r2Url) {
      console.error('[MEDIA] R2 upload failed');
      return null;
    }

    return { url: r2Url, mimeType, fileName };
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

    // Get actual message timestamp from WhatsApp
    let createdAt = new Date().toISOString();
    if (msg.messageTimestamp) {
      const ts = Number(msg.messageTimestamp);
      if (!isNaN(ts) && ts > 0) {
        createdAt = new Date(ts * 1000).toISOString();
      }
    } else if (msg.timestamp) {
      const ts = Number(msg.timestamp);
      if (!isNaN(ts) && ts > 0) {
        createdAt = new Date(ts * 1000).toISOString();
      }
    }

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
    const contactId = await upsertContact(conversationJid, (isGroup || fromMe) ? null : senderName);
    const conversationId = await upsertConversation(contactId, channelId, createdAt);

    // Smart Outbound WhatsApp Race Condition Deduplication
    if (fromMe) {
      const fifteenSecondsAgo = new Date(Date.now() - 15000).toISOString();
      const cleanText = text ? text.replace(/^\*.*?\*\n/, '').trim() : '';
      
      const { data: matchedOutbound } = await supabase
        .from('messages')
        .select('id, content, content_type')
        .eq('org_id', ORG_ID)
        .eq('conversation_id', conversationId)
        .eq('sender_type', 'agent')
        .is('platform_message_id', null)
        .gte('created_at', fifteenSecondsAgo)
        .order('created_at', { ascending: false });

      if (matchedOutbound && matchedOutbound.length > 0) {
        let bestMatch;
        if (contentType === 'text') {
          bestMatch = matchedOutbound.find(m => m.content_type === 'text' && (m.content || '').trim() === cleanText);
        } else {
          bestMatch = matchedOutbound.find(m => m.content_type === contentType);
        }
        
        if (!bestMatch) {
          bestMatch = matchedOutbound[0];
        }
        
        console.log(`[MSG] Found matching outbound agent message: ${bestMatch.id}. Associating with msgId: ${msgId}`);
        
        await supabase
          .from('messages')
          .update({
            platform_message_id: msgId,
            status: 'delivered'
          })
          .eq('id', bestMatch.id);
          
        return; // Complete match, prevent duplicate insertion!
      }
    }

    // Build metadata
    const metadata = {
      participant_jid: isGroup ? senderJid : null,
      participant_name: isGroup ? senderName : null,
    };

    // Handle mentions
    const mentions = extractMentions(msg);
    if (mentions.length > 0) {
      const mentionsMap = {};
      for (const jid of mentions) {
        const lidNumber = jid.split('@')[0];
        let resolvedPhone = await resolveLidToPhone(jid);
        const searchPhone = resolvedPhone || lidNumber.replace(/\D/g, '');

        // Default: just the number
        mentionsMap[searchPhone] = '+' + searchPhone;

        // Try to look up contact in DB
        try {
          const { data: contactMatch } = await supabase
            .from('contacts')
            .select('name')
            .eq('org_id', ORG_ID)
            .eq('platform_type', 'whatsapp')
            .filter('phone', 'eq', searchPhone)
            .limit(1)
            .maybeSingle();

          if (contactMatch && contactMatch.name) {
            mentionsMap[searchPhone] = contactMatch.name;
          }
        } catch (err) {
          console.error('[MENTION] DB lookup failed:', err.message);
        }
        
        // Also map the original LID number if different, so frontend can match it
        if (lidNumber !== searchPhone) {
          mentionsMap[lidNumber] = mentionsMap[searchPhone];
        }
      }
      metadata.mentions = mentionsMap;
    }

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
      status: 'delivered',
      created_at: createdAt
    });

    // Update conversation last_message_at and strip alert tags if customer replies
    if (!fromMe) {
      const { data: convData } = await supabase.from('conversations')
        .select('tags')
        .eq('id', conversationId)
        .maybeSingle();

      if (convData && convData.tags && convData.tags.includes('alert')) {
        const cleanedTags = convData.tags.filter(t => t !== 'alert' && t !== 'automation');
        await supabase.from('conversations')
          .update({ 
            last_message_at: createdAt,
            tags: cleanedTags
          })
          .eq('id', conversationId);
      } else {
        await supabase.from('conversations')
          .update({ last_message_at: createdAt })
          .eq('id', conversationId);
      }
    } else {
      await supabase.from('conversations')
        .update({ last_message_at: createdAt })
        .eq('id', conversationId);
    }

    console.log(`[MSG] ${isGroup ? 'Group' : 'DM'} from ${fromMe ? 'Agent (Me)' : (senderName || senderJid)}: "${text.slice(0, 60)}"`);
  } catch (err) {
    console.error('[processMessage] Error:', err.message);
  } finally {
    release();
  }
}

async function handleIncomingWhatsAppCall(callData) {
  const fromJid = callData.from;
  if (!fromJid) return;

  const rawPhone = fromJid.split('@')[0];
  let cleanPhone = rawPhone.replace(/\D/g, '');
  if (cleanPhone.length === 10 && cleanPhone.startsWith('1')) {
    cleanPhone = '880' + cleanPhone;
  } else if (cleanPhone.length === 11 && cleanPhone.startsWith('01')) {
    cleanPhone = '88' + cleanPhone;
  }

  const channelId = await getOrCreateChannel();
  const contactId = await upsertContact(fromJid, null);

  let callCreatedAt = new Date().toISOString();
  if (callData.timestamp) {
    const ts = Number(callData.timestamp);
    if (!isNaN(ts) && ts > 0) {
      callCreatedAt = new Date(ts * 1000).toISOString();
    }
  }

  const conversationId = await upsertConversation(contactId, channelId, callCreatedAt);

  const callMsgId = `wa-call-${callData.id}`;
  const { data: existingMsg } = await supabase
    .from('messages')
    .select('id')
    .eq('org_id', ORG_ID)
    .eq('platform_message_id', callMsgId)
    .limit(1)
    .maybeSingle();

  if (existingMsg) {
    console.log(`[CALL] Missed call webhook already handled: ${callData.id}`);
    return;
  }

  const missedCallContent = 'Missed WhatsApp voice call';
  await supabase.from('messages').insert({
    org_id: ORG_ID,
    conversation_id: conversationId,
    platform_message_id: callMsgId,
    sender_type: 'system',
    content: missedCallContent,
    content_type: 'text',
    metadata: {
      is_whatsapp_missed_call: true,
      whatsapp_call_id: callData.id,
      timestamp: callData.timestamp
    },
    status: 'delivered',
    created_at: callCreatedAt
  });

  const { data: conv } = await supabase.from('conversations')
    .select('tags')
    .eq('id', conversationId)
    .maybeSingle();

  const currentTags = conv?.tags || [];
  const updatedTags = Array.from(new Set([...currentTags, 'alert', 'automation']));
  
  await supabase.from('conversations')
    .update({
      last_message_at: callCreatedAt,
      tags: updatedTags
    })
    .eq('id', conversationId);

  console.log(`[CALL] Received incoming WhatsApp call from ${rawPhone}. Missed call logged.`);

  const { data: org } = await supabase
    .from('organizations')
    .select('settings')
    .eq('id', ORG_ID)
    .maybeSingle();

  const settings = org?.settings || {};
  if (settings.wa_call_auto_reply_enabled) {
    const rawReply = settings.wa_call_auto_reply_text || "Thank you for calling! We have moved our voice support to our direct hotline. You can reach us directly at {hotline}.";
    const hotline = settings.wa_call_hotline_number || "+880 9612 345678";
    const replyText = rawReply.replace(/{hotline}/gi, hotline);

    try {
      console.log(`[CALL-AUTOREPLY] Dispatching automated reply to ${fromJid}...`);
      await sendTextMessage(fromJid, replyText);

      await supabase.from('messages').insert({
        org_id: ORG_ID,
        conversation_id: conversationId,
        platform_message_id: `wa-call-autoreply-${callData.id}`,
        sender_type: 'ai',
        content: replyText,
        content_type: 'text',
        metadata: {
          is_whatsapp_autoreply: true
        },
        status: 'sent',
        created_at: new Date(Number(callData.timestamp) * 1000 + 1000).toISOString()
      });

      console.log(`[CALL-AUTOREPLY] Automated reply dispatched successfully!`);
    } catch (sendErr) {
      console.error(`[CALL-AUTOREPLY] Failed to send automated reply:`, sendErr.message);
    }
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
  } else if (event === 'call') {
    const callData = body.data;
    if (callData && !callData.fromMe) {
      await handleIncomingWhatsAppCall(callData).catch(err => console.error('handleIncomingWhatsAppCall failed:', err.message));
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

async function sendTextMessage(jid, text, quoted) {
  const payload = { number: jid, text };
  if (quoted) payload.quoted = quoted;

  const res = await fetch(`${EVOLUTION_API_URL}/message/sendText/${EVOLUTION_INSTANCE}`, {
    method: 'POST',
    headers: {
      'apikey': EVOLUTION_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Evolution sendText failed: ${err}`);
  }
  return res.json();
}

async function sendMediaMessage(jid, mediaUrl, caption, mimetype, originalFileName, quoted) {
  const mediaType = mimetype?.startsWith('image/') ? 'image'
    : mimetype?.startsWith('audio/') ? 'audio'
    : mimetype?.startsWith('video/') ? 'video'
    : 'document';

  // Audio: download webm -> send raw base64 to Evolution with encoding:true
  // Evolution's internal ffmpeg converts to ogg/opus and Baileys uploads to WhatsApp
  // This exact approach was confirmed working via manual curl test (12:39 AM messages)
  if (mediaType === 'audio') {
    try {
      // Download audio from Supabase
      const audioRes = await fetch(mediaUrl);
      if (!audioRes.ok) throw new Error(`Failed to download audio: ${audioRes.status}`);
      const audioBuffer = Buffer.from(await audioRes.arrayBuffer());
      const base64Audio = audioBuffer.toString('base64');
      const phoneNumber = jid.replace('@s.whatsapp.net', '');

      console.log(`[AUDIO] Sending ${audioBuffer.length}B webm as base64 (${base64Audio.length} chars) to ${phoneNumber}`);

      const payload = {
        number: phoneNumber,
        audio: base64Audio,
        encoding: true
      };
      if (quoted) payload.quoted = quoted;

      const res = await fetch(`${EVOLUTION_API_URL}/message/sendWhatsAppAudio/${EVOLUTION_INSTANCE}`, {
        method: 'POST',
        headers: {
          'apikey': EVOLUTION_API_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const resBody = await res.text();
      if (!res.ok) {
        throw new Error(`Evolution sendWhatsAppAudio failed: ${resBody}`);
      }

      const result = JSON.parse(resBody);
      const am = result?.message?.audioMessage || {};
      console.log(`[AUDIO] Evolution response: ptt=${am.ptt} fileLength=${am.fileLength} seconds=${am.seconds}`);
      return result;
    } catch (err) {
      console.error(`[AUDIO] Error: ${err.message}`);
      throw err;
    }
  }

  // Non-audio media (image, video, document)
  const payload = {
    number: jid,
    mediatype: mediaType,
    media: mediaUrl,
    caption: caption || '',
    mimetype,
    fileName: originalFileName || (mediaType === 'video' ? 'video.mp4' : mediaType === 'image' ? 'image.jpg' : 'document.pdf')
  };
  if (quoted) payload.quoted = quoted;

  const res = await fetch(`${EVOLUTION_API_URL}/message/sendMedia/${EVOLUTION_INSTANCE}`, {
    method: 'POST',
    headers: {
      'apikey': EVOLUTION_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
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

const activeTypingConversations = new Map();

// Sequential job queue per JID (conversation) to prevent race conditions and guarantee strict chronological ordering
class KeyedSequentialQueue {
  constructor() {
    this.queues = new Map();
  }

  async enqueue(key, task) {
    if (!this.queues.has(key)) {
      this.queues.set(key, Promise.resolve());
    }
    const currentPromise = this.queues.get(key);
    const nextPromise = currentPromise.then(async () => {
      try {
        await task();
      } catch (err) {
        console.error(`[QUEUE ERROR] Error executing task for key ${key}:`, err);
      }
    });
    this.queues.set(key, nextPromise);
    
    // Cleanup to prevent memory leaks when the queue is completely drained
    nextPromise.finally(() => {
      if (this.queues.get(key) === nextPromise) {
        this.queues.delete(key);
      }
    });
    
    return nextPromise;
  }
}

const outboundQueue = new KeyedSequentialQueue();

// Outbound message processor
async function processOutboundMessage(msg) {
  if (msg.sender_type !== 'agent' && msg.sender_type !== 'ai') return;
  if (msg.is_internal) return;
  if (msg.platform_message_id) return; // already sent

  let contact = null;
  try {
    const { data: conv } = await supabaseRealtime
      .from('conversations')
      .select('contact_id, channels!inner(type)')
      .eq('id', msg.conversation_id)
      .single();

    if (!conv || conv.channels?.type !== 'whatsapp') return;

    const { data: fetchedContact } = await supabaseRealtime
      .from('contacts')
      .select('id, platform_id, phone, metadata')
      .eq('id', conv.contact_id)
      .single();

    if (!fetchedContact) return;
    contact = fetchedContact;

    // Skip if contact has invalid WhatsApp number to avoid carrier-ban precheck penalty
    if (contact.metadata?.whatsapp_invalid) {
      console.log(`[OUTBOUND] Skipping send to contact ${contact.id} - marked as whatsapp_invalid`);
      await supabaseRealtime.from('messages')
        .update({
          status: 'failed',
          metadata: {
            ...(msg.metadata || {}),
            delivery_error: 'Skipped: Contact number is verified as not registered on WhatsApp',
            delivery_failed_at: new Date().toISOString()
          }
        })
        .eq('id', msg.id);
      return;
    }

    let jid = resolveBulletproofJid(contact);

    // Enqueue the sending task per JID to execute sequentially and preserve strict chronological order
    await outboundQueue.enqueue(jid, async () => {
      // Re-fetch the message to make sure its status hasn't been modified or recalled
      const { data: currentMsg } = await supabaseRealtime
        .from('messages')
        .select('status, content')
        .eq('id', msg.id)
        .single();
        
      if (currentMsg && (currentMsg.status === 'recalled' || currentMsg.status === 'deleted')) {
        console.log(`[OUTBOUND] Aborting send for message ${msg.id} - already recalled or deleted.`);
        return;
      }

      // Implement scheduled delay if requested by UI (e.g. realistic AI typing delay)
      // Since client-side already handles delay via setTimeout before insertion, we do not delay here to avoid double-delay.
      const scheduledDelayMs = msg.metadata?.scheduled_delay || 0;

      // ── CRITICAL CANCELATION PATTERN ──
      // If the customer has replied since this outbound message was originally drafted/enqueued, 
      // abort delivery of delayed chunks to prevent jumbled double-messaging context breaks!
      // We calculate originalDraftTime by subtracting the scheduled delay from created_at.
      // ──────────────────────────────────
      const { data: lastInbound } = await supabaseRealtime
        .from('messages')
        .select('created_at')
        .eq('conversation_id', msg.conversation_id)
        .eq('sender_type', 'contact')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const originalDraftTime = new Date(new Date(msg.created_at).getTime() - scheduledDelayMs).toISOString();

      if (lastInbound && lastInbound.created_at > originalDraftTime) {
        console.log(`[OUTBOUND] Customer replied at ${lastInbound.created_at} (after agent message was drafted at ${originalDraftTime}). Aborting out-of-context scheduled chunk.`);
        await supabaseRealtime.from('messages')
          .update({
            status: 'failed',
            metadata: {
              ...(msg.metadata || {}),
              delivery_error: 'Aborted: Customer replied before this delayed message was sent',
              delivery_failed_at: new Date().toISOString()
            }
          })
          .eq('id', msg.id);
        return;
      }

      let quoted = null;
      try {
        const parentMessageId = msg.metadata?.reply_to?.message_id;
        if (parentMessageId) {
          const { data: parentMsg } = await supabaseRealtime
            .from('messages')
            .select('platform_message_id, sender_type, content')
            .eq('id', parentMessageId)
            .single();

          if (parentMsg && parentMsg.platform_message_id) {
            quoted = {
              key: {
                id: parentMsg.platform_message_id,
                fromMe: parentMsg.sender_type === 'agent' || parentMsg.sender_type === 'ai',
                remoteJid: jid
              },
              message: {
                conversation: parentMsg.content || ''
              }
            };
            console.log(`[OUTBOUND] Replying to parent WhatsApp message: ${parentMsg.platform_message_id}`);
          }
        }
      } catch (parentErr) {
        console.warn(`[OUTBOUND] Failed to fetch parent message for reply metadata:`, parentErr.message);
      }

      // Fetch agent name dynamically for prepending
      let agentName = null;
      if (msg.sender_type === 'agent' && msg.sender_id) {
        try {
          const { data: agentUser } = await supabaseRealtime
            .from('users')
            .select('name')
            .eq('id', msg.sender_id)
            .maybeSingle();
          if (agentUser && agentUser.name) {
            agentName = agentUser.name;
          }
        } catch (agentErr) {
          console.warn(`[OUTBOUND] Failed to fetch agent name for user ${msg.sender_id}:`, agentErr.message);
        }
      } else if (msg.sender_type === 'ai') {
        agentName = 'Aisha Siddika';
      }

      let formattedContent = msg.content || '';
      if (agentName) {
        formattedContent = `*${agentName}*\n${formattedContent}`;
      }

      let sentResult;
      if (msg.metadata?.media_url) {
        const captionText = msg.content !== '[Image]' && msg.content !== '[Video]' && msg.content !== '[Attachment]' && msg.content !== '[Audio Voice Message]'
          ? formattedContent
          : (agentName ? `*${agentName}*` : '');
        sentResult = await sendMediaMessage(
          jid,
          msg.metadata.media_url,
          captionText,
          msg.metadata.mimetype,
          msg.metadata?.filename,
          quoted
        );
      } else {
        sentResult = await sendTextMessage(jid, formattedContent, quoted);
      }

      // Save platform message id for dedup
      const platformMessageId = extractSentMessageId(sentResult);
      if (platformMessageId) {
        await supabaseRealtime.from('messages')
          .update({ 
            platform_message_id: platformMessageId, 
            status: 'delivered'
          })
          .eq('id', msg.id);
      }

      console.log(`[OUTBOUND] Sent to ${jid}: "${msg.content?.slice(0, 60)}"`);
    });
  } catch (err) {
    console.error('[OUTBOUND] Error:', err.message);

    // If Evolution returns that number is not registered on WhatsApp, flag contact to prevent Meta ban
    if (contact) {
      let isInvalidNumber = false;
      try {
        const errMsg = String(err.message).toLowerCase();
        if (
          errMsg.includes('"exists":false') || 
          errMsg.includes('"exists": false') || 
          errMsg.includes('exists:false') || 
          errMsg.includes('exists: false') ||
          errMsg.includes('not registered on whatsapp')
        ) {
          isInvalidNumber = true;
        }
      } catch (_) {}

      if (isInvalidNumber) {
        console.log(`[OUTBOUND] Auto-flagging contact ${contact.id} as whatsapp_invalid`);
        const updatedMeta = { ...(contact.metadata || {}), whatsapp_invalid: true };
        await supabaseRealtime.from('contacts')
          .update({ metadata: updatedMeta })
          .eq('id', contact.id);
      }
    }

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
    const oneHourAgo = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString();
    const { data: pending, error } = await supabaseRealtime
      .from('messages')
      .select('*')
      .eq('status', 'sent')
      .in('sender_type', ['agent', 'ai'])
      .is('platform_message_id', null)
      .is('is_internal', false)
      .gt('created_at', oneHourAgo);

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

// Outbound presence sync (typing/recording indicators)
async function sendWhatsAppPresence(jid, presence, delayMs = 1200) {
  try {
    const res = await fetch(`${EVOLUTION_API_URL}/chat/sendPresence/${EVOLUTION_INSTANCE}`, {
      method: 'POST',
      headers: {
        'apikey': EVOLUTION_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        number: jid,
        presence: presence,
        delay: delayMs
      })
    });
    if (!res.ok) {
      const err = await res.text();
      console.error(`[PRESENCE] Evolution sendPresence failed: ${err}`);
    }
  } catch (err) {
    console.error(`[PRESENCE] Error sending presence to ${jid}:`, err.message);
  }
}

// Outbound read receipt sync (blue ticks)
async function markWhatsAppMessageAsRead(jid, msgId) {
  try {
    const payload = {
      readMessages: [
        {
          remoteJid: jid,
          fromMe: false,
          id: msgId
        }
      ]
    };

    const res = await fetch(`${EVOLUTION_API_URL}/chat/markMessageAsRead/${EVOLUTION_INSTANCE}`, {
      method: 'POST',
      headers: {
        'apikey': EVOLUTION_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const err = await res.text();
      console.error(`[READ-RECEIPT] Evolution markMessageAsRead failed: ${err}`);
    } else {
      console.log(`[READ-RECEIPT] Sent blue tick for message ${msgId} (JID ${jid})`);
    }
  } catch (err) {
    console.error(`[READ-RECEIPT] Error sending read receipt for ${jid}:`, err.message);
  }
}

function resolveBulletproofJid(contact) {
  let jid = contact.platform_id.includes('@')
    ? contact.platform_id
    : `${contact.platform_id}@s.whatsapp.net`;

  if (jid.endsWith('@lid')) {
    jid = jid.replace('@lid', '@s.whatsapp.net');
  }

  const realPhone = contact.metadata?.real_phone || contact.phone;
  if (realPhone) {
    let cleanPhone = realPhone.replace(/[^0-9]/g, '');
    if (cleanPhone.length === 10 && cleanPhone.startsWith('1')) {
      cleanPhone = '880' + cleanPhone;
    } else if (cleanPhone.length === 11 && cleanPhone.startsWith('01')) {
      cleanPhone = '88' + cleanPhone;
    }
    if (cleanPhone.length >= 9 && !realPhone.includes('@')) {
      jid = `${cleanPhone}@s.whatsapp.net`;
    }
  }

  let cleanJidNumber = jid.split('@')[0].replace(/[^0-9]/g, '');
  if (cleanJidNumber.length === 10 && cleanJidNumber.startsWith('1')) {
    cleanJidNumber = '880' + cleanJidNumber;
  } else if (cleanJidNumber.length === 11 && cleanJidNumber.startsWith('01')) {
    cleanJidNumber = '88' + cleanJidNumber;
  }
  return `${cleanJidNumber}@s.whatsapp.net`;
}

// Outbound message updates (editing and deletion/recalling)
async function processOutboundMessageUpdate(oldMsg, newMsg) {
  const isAgent = newMsg.sender_type === 'agent' || newMsg.sender_type === 'ai';
  
  if (!isAgent) {
    // If contact message status changed to 'read', send blue ticks to WhatsApp
    if (newMsg.sender_type === 'contact' && newMsg.status === 'read' && oldMsg.status !== 'read') {
      try {
        const { data: conv } = await supabaseRealtime
          .from('conversations')
          .select('contact_id, channels!inner(type)')
          .eq('id', newMsg.conversation_id)
          .single();

        if (!conv || conv.channels?.type !== 'whatsapp') return;

        const { data: contact } = await supabaseRealtime
          .from('contacts')
          .select('platform_id, phone, metadata')
          .eq('id', conv.contact_id)
          .single();

        if (!contact) return;

        let jid = resolveBulletproofJid(contact);

        await markWhatsAppMessageAsRead(jid, newMsg.platform_message_id);
      } catch (err) {
        console.error('[READ-SYNC] Error:', err.message);
      }
    }
    return;
  }

  let platformMessageId = newMsg.platform_message_id;
  
  // 1. Message Recall/Deletion
  if ((newMsg.status === 'recalled' || newMsg.status === 'deleted') && oldMsg.status !== 'recalled' && oldMsg.status !== 'deleted') {
    if (!platformMessageId) return; // Cannot recall if not sent
    try {
      const { data: conv } = await supabaseRealtime
        .from('conversations')
        .select('contact_id, channels!inner(type)')
        .eq('id', newMsg.conversation_id)
        .single();

      if (!conv || conv.channels?.type !== 'whatsapp') return;

      const { data: contact } = await supabaseRealtime
        .from('contacts')
        .select('platform_id, phone, metadata')
        .eq('id', conv.contact_id)
        .single();

      if (!contact) return;

      let jid = resolveBulletproofJid(contact);

      console.log(`[RECALL] Recalling message ${platformMessageId} for customer ${jid}`);
      
      const payload = {
        remoteJid: jid,
        fromMe: true,
        id: platformMessageId
      };

      const res = await fetch(`${EVOLUTION_API_URL}/chat/deleteMessageForEveryone/${EVOLUTION_INSTANCE}`, {
        method: 'DELETE',
        headers: {
          'apikey': EVOLUTION_API_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Evolution deleteMessage failed: ${err}`);
      }

      console.log(`[RECALL] Message ${platformMessageId} successfully deleted on WhatsApp`);
    } catch (err) {
      console.error('[RECALL] Error:', err.message);
    }
  }

  // 2. Message Editing
  else if (newMsg.content_type === 'text' && newMsg.metadata?.edited_at && newMsg.metadata.edited_at !== newMsg.metadata?.whatsapp_edit_synced_at) {
    // If user edited very fast, platform_message_id might still be null. Retry fetching it for up to 5 seconds.
    if (!platformMessageId) {
      console.log(`[EDIT] platform_message_id is null for ${newMsg.id}. Waiting for it to be assigned...`);
      for (let i = 0; i < 10; i++) {
        await new Promise(res => setTimeout(res, 500));
        const { data: latestMsg } = await supabaseRealtime
          .from('messages')
          .select('platform_message_id')
          .eq('id', newMsg.id)
          .single();
        if (latestMsg && latestMsg.platform_message_id) {
          platformMessageId = latestMsg.platform_message_id;
          console.log(`[EDIT] Fetched assigned platform_message_id: ${platformMessageId}`);
          break;
        }
      }
      if (!platformMessageId) {
        console.warn(`[EDIT] Giving up on edit for ${newMsg.id} - platform_message_id never assigned.`);
        return;
      }
    }
    
    try {
      const { data: conv } = await supabaseRealtime
        .from('conversations')
        .select('contact_id, channels!inner(type)')
        .eq('id', newMsg.conversation_id)
        .single();

      if (!conv || conv.channels?.type !== 'whatsapp') return;

      const { data: contact } = await supabaseRealtime
        .from('contacts')
        .select('platform_id, phone, metadata')
        .eq('id', conv.contact_id)
        .single();

      if (!contact) return;

      let jid = resolveBulletproofJid(contact);

      let editedText = newMsg.content;
      
      let agentName = null;
      if (newMsg.sender_type === 'agent' && newMsg.sender_id) {
        const { data: agentUser } = await supabaseRealtime
          .from('users')
          .select('name')
          .eq('id', newMsg.sender_id)
          .maybeSingle();
        if (agentUser && agentUser.name) {
          agentName = agentUser.name;
        }
      } else if (newMsg.sender_type === 'ai') {
        agentName = 'Aisha Siddika';
      }

      if (agentName) {
        editedText = `*${agentName}*\n${editedText}`;
      }

      console.log(`[EDIT] Editing message ${platformMessageId} to: "${editedText.slice(0, 40)}"`);

      const payload = {
        number: jid.split('@')[0],
        key: {
          remoteJid: jid,
          fromMe: true,
          id: platformMessageId
        },
        text: editedText
      };

      const res = await fetch(`${EVOLUTION_API_URL}/chat/updateMessage/${EVOLUTION_INSTANCE}`, {
        method: 'POST',
        headers: {
          'apikey': EVOLUTION_API_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      
      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Evolution updateMessage failed: ${err}`);
      }

      console.log(`[EDIT] Message ${platformMessageId} successfully updated on WhatsApp`);

      await supabaseRealtime.from('messages').update({
        metadata: {
          ...(newMsg.metadata || {}),
          whatsapp_edit_synced_at: newMsg.metadata.edited_at
        }
      }).eq('id', newMsg.id);

    } catch (err) {
      console.error('[EDIT] Error:', err.message);
    }
  }
}

// Supabase Realtime Channels setup
supabaseRealtime
  .channel('outbound_messages')
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'messages',
    filter: `org_id=eq.${ORG_ID}`
  }, async (payload) => {
    payload.new.received_at_local = Date.now();
    await processOutboundMessage(payload.new);
  })
  .on('postgres_changes', {
    event: 'UPDATE',
    schema: 'public',
    table: 'messages',
    filter: `org_id=eq.${ORG_ID}`
  }, async (payload) => {
    await processOutboundMessageUpdate(payload.old, payload.new);
  })
  .subscribe((status) => {
    console.log('[REALTIME-MESSAGES] Status:', status);
  });

// Supabase Broadcast Channel for agent activity and typing status
supabaseRealtime
  .channel(`typing:${ORG_ID}`)
  .on('broadcast', { event: 'typingStatus' }, async (payload) => {
    const { conversation_id, direction, is_typing } = payload.payload;
    if (direction !== 'agent') return;

    try {
      const { data: conv } = await supabaseRealtime
        .from('conversations')
        .select('contact_id, channels!inner(type)')
        .eq('id', conversation_id)
        .single();

      if (!conv || conv.channels?.type !== 'whatsapp') return;

      const { data: contact } = await supabaseRealtime
        .from('contacts')
        .select('platform_id')
        .eq('id', conv.contact_id)
        .single();

      if (!contact) return;

      let jid = contact.platform_id.includes('@') ? contact.platform_id : `${contact.platform_id}@s.whatsapp.net`;
      if (jid.endsWith('@lid')) {
        jid = jid.replace('@lid', '@s.whatsapp.net');
      }

      await sendWhatsAppPresence(jid, is_typing ? 'composing' : 'paused');
    } catch (err) {
      console.error('[TYPING-SYNC] Error:', err.message);
    }
  })
  .subscribe((status) => {
    console.log('[REALTIME-TYPING] Status:', status);
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
            'QRCODE_UPDATED',
            'CALL'
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

// Register IP unblock endpoint
registerUnblockRoute(app);

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
