require('dotenv').config();
global.WebSocket = require('ws');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers, downloadMediaMessage } = require('@whiskeysockets/baileys');
const { createClient } = require('@supabase/supabase-js');
const pino = require('pino');
const qrcode = require('qrcode-terminal');
const QRCodeBase64 = require('qrcode');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const ORG_ID = process.env.ORG_ID; // In MVP, hardcoded org id

if (!SUPABASE_URL || !SUPABASE_KEY || !ORG_ID) {
  console.error("Missing environment variables");
  process.exit(1);
}

const fs = require('fs');
const path = require('path');
const logStream = fs.createWriteStream(path.join(__dirname, 'crash.log'), { flags: 'a' });

process.on('uncaughtException', (err) => {
  const timestamp = new Date().toISOString();
  const logMsg = `[${timestamp}] UNCAUGHT EXCEPTION: ${err.message}\nStack: ${err.stack}\n\n`;
  console.error(logMsg);
  logStream.write(logMsg);
});

process.on('unhandledRejection', (reason, promise) => {
  const timestamp = new Date().toISOString();
  const logMsg = `[${timestamp}] UNHANDLED REJECTION at: ${promise}\nReason: ${reason}\n\n`;
  console.error(logMsg);
  logStream.write(logMsg);
});

const WebSocket = require('ws');
const { messageQueue } = require('./queue');

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
  realtime: {
    transport: WebSocket
  }
});

// Store removed for Baileys v7 compatibility

async function registerChannel() {
  const { data: existing } = await supabase
    .from('channels')
    .select('id, config')
    .eq('org_id', ORG_ID)
    .eq('type', 'whatsapp')
    .limit(1);

  if (!existing || existing.length === 0) {
    await supabase.from('channels').insert({
      org_id: ORG_ID,
      type: 'whatsapp',
      config: {}
    });
    console.log("Registered WhatsApp channel in DB.");
  }
}

// Listen for outgoing messages from Supabase
supabase
  .channel('whatsapp_outbound')
  .on('postgres_changes', { 
    event: 'INSERT', 
    schema: 'public', 
    table: 'messages',
    filter: `org_id=eq.${ORG_ID}`
  }, async (payload) => {
    const newMsg = payload.new;
    console.log("Realtime INSERT received:", JSON.stringify(newMsg));
    
    // If it's an agent or AI replying, and it doesn't have a platform_message_id yet, and it's not an internal note
    if ((newMsg.sender_type === 'agent' || newMsg.sender_type === 'ai') && !newMsg.platform_message_id && !newMsg.is_internal) {
      try {
        const { data: conv } = await supabase
          .from('conversations')
          .select('contact_id, channels!inner(id, type, config)')
          .eq('id', newMsg.conversation_id)
          .single();

        if (conv && conv.channels.type === 'whatsapp') {
          const { data: contact } = await supabase
            .from('contacts')
            .select('platform_id')
            .eq('id', conv.contact_id)
            .single();

          if (contact && global.sock) {
            // Check if it's a raw number or already contains the domain (like @lid or @s.whatsapp.net)
            const jid = contact.platform_id.includes('@') 
              ? contact.platform_id 
              : `${contact.platform_id}@s.whatsapp.net`;
              
            let sentMsg;
            if (newMsg.content_type === 'image' || newMsg.content_type === 'file' || newMsg.content_type === 'audio') {
              const mediaUrl = newMsg.metadata?.media_url;
              if (mediaUrl) {
                const res = await fetch(mediaUrl);
                const arrayBuffer = await res.arrayBuffer();
                const buffer = Buffer.from(arrayBuffer);
                
                if (newMsg.content_type === 'image') {
                  sentMsg = await global.sock.sendMessage(jid, { image: buffer, caption: newMsg.content === '[Attachment]' || newMsg.content === '[Image]' ? '' : newMsg.content });
                } else if (newMsg.content_type === 'audio') {
                  sentMsg = await global.sock.sendMessage(jid, { audio: buffer, ptt: true, mimetype: 'audio/mp4' });
                } else {
                  sentMsg = await global.sock.sendMessage(jid, { document: buffer, mimetype: newMsg.metadata?.mimetype || 'application/octet-stream', fileName: newMsg.metadata?.filename || 'Document' });
                }
              } else {
                sentMsg = await global.sock.sendMessage(jid, { text: newMsg.content });
              }
            } else {
              sentMsg = await global.sock.sendMessage(jid, { text: newMsg.content });
            }
            
            // Optionally update the message with the platform_message_id so we know it was sent successfully
            if (sentMsg && sentMsg.key) {
              await supabase
                .from('messages')
                .update({ platform_message_id: sentMsg.key.id })
                .eq('id', newMsg.id);
            }
            
            
            console.log(`Sent reply to ${jid}`);
          }
        } else if (conv && (conv.channels.type === 'messenger' || conv.channels.type === 'instagram')) {
          const { data: contact } = await supabase
            .from('contacts')
            .select('platform_id')
            .eq('id', conv.contact_id)
            .single();

          if (contact && conv.channels.config && conv.channels.config.access_token) {
            const pageAccessToken = conv.channels.config.access_token;
            const recipientId = contact.platform_id;
            
            const payload = {
              recipient: { id: recipientId },
              message: { text: newMsg.content }
            };

            const fbRes = await fetch(`https://graph.facebook.com/v20.0/me/messages?access_token=${pageAccessToken}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload)
            });
            const fbData = await fbRes.json();
            
            if (fbData.message_id) {
              await supabase
                .from('messages')
                .update({ platform_message_id: fbData.message_id, status: 'sent' })
                .eq('id', newMsg.id);
              console.log(`Sent ${conv.channels.type} reply to ${recipientId}`);
            } else {
              console.error(`${conv.channels.type} send error:`, fbData);
            }
          }
        }
      } catch (e) {
        console.error("Error sending outbound message:", e);
      }
    }
  })
  .subscribe((status) => {
    console.log('Realtime status:', status);
  });

async function startWhatsApp() {
  await registerChannel();

  const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: true,
    browser: Browsers.macOS('Desktop'),
    logger: pino({ level: "silent" })
  });
  
  global.sock = sock;
  
  global.sock = sock;

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;
    
    if (qr) {
      console.log("Scan this QR code in WhatsApp!");
      try {
        const qrBase64 = await QRCodeBase64.toDataURL(qr);
        await supabase
          .from('channels')
          .update({ config: { status: 'pending', qr_code: qrBase64 } })
          .eq('org_id', ORG_ID)
          .eq('type', 'whatsapp');
        console.log("Pushed QR code to Supabase for UI.");
      } catch (err) {
        console.error("Failed to generate/push Base64 QR", err);
      }
    }

    if (connection === 'close') {
      const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log('Connection closed due to ', lastDisconnect.error, ', reconnecting ', shouldReconnect);
      
      if (!shouldReconnect) {
        await supabase
          .from('channels')
          .update({ config: { status: 'disconnected' } })
          .eq('org_id', ORG_ID)
          .eq('type', 'whatsapp');
      } else {
        startWhatsApp();
      }
    } else if (connection === 'open') {
      console.log('✅ WhatsApp Web connected!');
      await supabase
        .from('channels')
        .update({ config: { status: 'connected' } })
        .eq('org_id', ORG_ID)
        .eq('type', 'whatsapp');
    }
  });

  sock.ev.on('messages.upsert', async (m) => {
    const msg = m.messages[0];
    if (!msg.message) return; // ignore system events
    if (msg.key.remoteJid === 'status@broadcast') return; // ignore status updates

    let senderJid = msg.key.remoteJid;
    let senderNumber = senderJid.split('@')[0];
    let realPhone = null;
    if (msg.key.remoteJidAlt) {
      realPhone = msg.key.remoteJidAlt.split('@')[0];
    } else if (!senderJid.includes('@lid')) {
      realPhone = senderNumber;
    }
    let text = msg.message.conversation || msg.message.extendedTextMessage?.text;
    
    console.log("DEBUG MSG:", JSON.stringify({ key: msg.key, senderPn: msg.senderPn, participant: msg.participant }));
    let pushName = msg.pushName || `+${senderNumber}`;
    
    // If this is a group, fetch the actual group name instead of the sender's name
    if (senderJid.endsWith('@g.us')) {
      try {
        const groupMeta = await sock.groupMetadata(senderJid);
        if (groupMeta && groupMeta.subject) {
          pushName = groupMeta.subject;
        }
      } catch (err) {
        console.error("Could not fetch group metadata:", err);
      }
    }
    
    let isFromMe = msg.key.fromMe;
    let messageId = msg.key.id;
    
    let isMedia = false;
    let mimeType = null;
    let fileName = null;
    let mediaUrl = null;
    let contentType = 'text';

    if (msg.message.imageMessage) {
      isMedia = true;
      mimeType = msg.message.imageMessage.mimetype;
      contentType = 'image';
      text = msg.message.imageMessage.caption || '[Image]';
    } else if (msg.message.documentMessage) {
      isMedia = true;
      mimeType = msg.message.documentMessage.mimetype;
      fileName = msg.message.documentMessage.fileName || 'Document';
      contentType = 'file';
      text = msg.message.documentMessage.caption || '[Attachment]';
    } else if (msg.message.audioMessage) {
      isMedia = true;
      mimeType = msg.message.audioMessage.mimetype;
      contentType = 'audio';
      text = '[Audio Voice Message]';
    } else if (msg.message.videoMessage) {
      isMedia = true;
      mimeType = msg.message.videoMessage.mimetype;
      contentType = 'video';
      text = msg.message.videoMessage.caption || '[Video]';
    } else if (msg.message.stickerMessage) {
      isMedia = true;
      mimeType = msg.message.stickerMessage.mimetype;
      contentType = 'image'; // Treat stickers as images for UI simplicity
      text = '[Sticker]';
    }

    if (!text && !isMedia) return;

    if (isMedia) {
      try {
        const buffer = await downloadMediaMessage(
          msg,
          'buffer',
          { },
          { logger: pino({ level: 'silent' }) }
        );
        
        // Upload to Supabase Storage
        const fileExt = mimeType ? mimeType.split('/')[1].split(';')[0] : 'bin';
        const supabaseFileName = `${ORG_ID}/${senderNumber}/${Date.now()}.${fileExt}`;
        
        const { error: uploadError } = await supabase.storage.from('media').upload(supabaseFileName, buffer, { contentType: mimeType || 'application/octet-stream' });
        
        if (!uploadError) {
          const { data: urlData } = supabase.storage.from('media').getPublicUrl(supabaseFileName);
          mediaUrl = urlData.publicUrl;
        } else {
          console.error("Supabase Storage Upload Error:", uploadError);
        }
      } catch (err) {
        console.error("Failed to download or upload media:", err);
      }
    }

    console.log(`Received message ${isFromMe ? 'FROM ME to ' : 'FROM '}${senderNumber}: ${text || contentType}`);

    try {
      let { data: channels } = await supabase
        .from('channels')
        .select('id')
        .eq('org_id', ORG_ID)
        .eq('type', 'whatsapp')
        .limit(1);
      
      if (!channels || channels.length === 0) return;
      const channelId = channels[0].id;

      // Check if contact exists
      // We search by full JID so @lid accounts are properly separated and tracked
      let { data: contacts } = await supabase
        .from('contacts')
        .select('id, name, avatar_url, metadata')
        .eq('org_id', ORG_ID)
        .eq('platform_type', 'whatsapp')
        .eq('platform_id', senderJid)
        .limit(1);

      let contact = contacts && contacts.length > 0 ? contacts[0] : null;

      if (!contact) {
        // Fallback: Check if it was saved using the old format (just the number)
        // If it exists in old format, we will use it and the outbound logic handles it.
        const { data: oldContacts } = await supabase
          .from('contacts')
          .select('id, name, avatar_url')
          .eq('org_id', ORG_ID)
          .eq('platform_type', 'whatsapp')
          .eq('platform_id', senderNumber)
          .limit(1);
          
        if (oldContacts && oldContacts.length > 0) {
          contact = oldContacts[0];
          // Update the DB to use the full JID so future messages map correctly
          await supabase.from('contacts').update({ platform_id: senderJid }).eq('id', contact.id);
        }
      }

      // Helper: fetch WhatsApp profile pic and save to Supabase Storage
      async function fetchAndSaveAvatar(jid, contactId) {
        try {
          const ppUrl = await sock.profilePictureUrl(jid, 'image');
          if (!ppUrl) return null;
          const response = await fetch(ppUrl);
          if (!response.ok) return null;
          const buffer = Buffer.from(await response.arrayBuffer());
          const path = `avatars/${contactId}.jpg`;
          const { error } = await supabase.storage.from('media').upload(path, buffer, {
            contentType: 'image/jpeg',
            upsert: true
          });
          if (error) return null;
          const { data: urlData } = supabase.storage.from('media').getPublicUrl(path);
          const avatarUrl = urlData.publicUrl;
          await supabase.from('contacts').update({ avatar_url: avatarUrl }).eq('id', contactId);
          return avatarUrl;
        } catch (err) {
          return null; // Privacy restricted - silently ignore
        }
      }

      if (!contact) {
        const { data: newContact } = await supabase
          .from('contacts')
          .insert({
            org_id: ORG_ID,
            platform_type: 'whatsapp',
            platform_id: senderJid, // Save FULL JID!
            name: pushName,
            avatar_url: null,
            metadata: realPhone ? { real_phone: realPhone } : {}
          })
          .select('id, name, metadata')
          .single();
        contact = newContact;
        // Fetch profile picture for new contact (fire and forget)
        if (contact) fetchAndSaveAvatar(senderJid, contact.id);
      } else {
        // Only update if name differs significantly from default
        let updatePayload = {};
        
        if (pushName && pushName !== `+${senderNumber}` && contact.name.startsWith('+')) {
          updatePayload.name = pushName;
        } else if (contact.name.startsWith('WA User ')) {
          updatePayload.name = pushName;
        }
        
        if (realPhone && (!contact.metadata || contact.metadata.real_phone !== realPhone)) {
          updatePayload.metadata = { ...(contact.metadata || {}), real_phone: realPhone };
        }
        
        if (Object.keys(updatePayload).length > 0) {
          // Fire and forget contact update so it doesn't block message insertion!
          supabase.from('contacts').update(updatePayload).eq('id', contact.id).then();
        }
        
        // Fetch avatar if not set yet (fire and forget)
        if (!contact.avatar_url) fetchAndSaveAvatar(senderJid, contact.id);
      }

      let { data: convs } = await supabase
        .from('conversations')
        .select('id')
        .eq('org_id', ORG_ID)
        .eq('contact_id', contact.id)
        .eq('status', 'open')
        .order('created_at', { ascending: false })
        .limit(1);

      let conversation = convs && convs.length > 0 ? convs[0] : null;

      if (!conversation) {
        const { data: newConv } = await supabase
          .from('conversations')
          .insert({
            org_id: ORG_ID,
            channel_id: channelId,
            contact_id: contact.id,
            status: 'open'
          })
          .select('id')
          .single();
        conversation = newConv;
      }

      // Check if this message ID already exists (to prevent dupes on reconnect)
      const { data: existingMsg } = await supabase
        .from('messages')
        .select('id')
        .eq('platform_message_id', messageId)
        .limit(1);

      if (!existingMsg || existingMsg.length === 0) {
        // Enqueue the message to be processed safely by BullMQ
        await messageQueue.add('insert-message', {
          ORG_ID,
          conversation,
          isFromMe,
          contactId: contact.id,
          text,
          contentType,
          mediaUrl,
          mimeType,
          fileName,
          messageId
        }, {
          attempts: 5,
          backoff: { type: 'exponential', delay: 1000 }
        });
        
        console.log(`[Queue] Added message ${messageId} to processing queue.`);
      }
    } catch (e) {
      console.error("Error processing incoming message:", e);
    }
  });

  sock.ev.on('messages.update', async (updates) => {
    for (const update of updates) {
      if (update.update.status) {
        const messageId = update.key.id;
        const status = update.update.status;
        let dbStatus = null;
        if (status === 3) dbStatus = 'delivered'; // WAMessageStatus.DELIVERY_ACK
        if (status === 4) dbStatus = 'read';      // WAMessageStatus.READ

        if (dbStatus) {
          try {
            await supabase
              .from('messages')
              .update({ status: dbStatus })
              .eq('platform_message_id', messageId);
            console.log(`Updated message ${messageId} status to ${dbStatus}`);
          } catch (e) {
            console.error(`Failed to update status for ${messageId}`, e);
          }
        }
      }
    }
  });

  // Handle Incoming Typing Indicators (Customer -> Agent)
  sock.ev.on('presence.update', async (json) => {
    try {
      const jid = json.id;
      const presences = Object.values(json.presences || {});
      if (presences.length === 0) return;
      
      const lastKnown = presences[0].lastKnownPresence;
      const isTyping = lastKnown === 'composing';
      
      // Look up contact by JID
      const { data: contacts } = await supabase
        .from('contacts')
        .select('id')
        .eq('org_id', ORG_ID)
        .eq('platform_id', jid)
        .limit(1);
        
      if (contacts && contacts.length > 0) {
        // Look up open conversation
        const { data: convs } = await supabase
          .from('conversations')
          .select('id')
          .eq('contact_id', contacts[0].id)
          .eq('status', 'open')
          .limit(1);
          
        if (convs && convs.length > 0) {
          const conversationId = convs[0].id;
          
          supabase.channel(`typing:${ORG_ID}`).send({
            type: 'broadcast',
            event: 'typingStatus',
            payload: { conversation_id: conversationId, direction: 'contact', is_typing: isTyping }
          });
        }
      }
    } catch (e) {
      console.error('Error handling presence update:', e);
    }
  });

  // Handle Outgoing Typing Indicators (Agent -> Customer)
  supabase.channel(`typing:${ORG_ID}`)
    .on('broadcast', { event: 'typingStatus' }, async (payload) => {
      // Only process agent typing
      if (payload.payload.direction === 'agent') {
        try {
          const isTyping = payload.payload.is_typing;
          const conversationId = payload.payload.conversation_id;
          
          // Get contact JID from conversation
          const { data: conv } = await supabase
            .from('conversations')
            .select('contact_id')
            .eq('id', conversationId)
            .single();
            
          if (conv) {
            const { data: contact } = await supabase
              .from('contacts')
              .select('platform_id')
              .eq('id', conv.contact_id)
              .single();
              
            if (contact && contact.platform_id) {
              await sock.sendPresenceUpdate(isTyping ? 'composing' : 'paused', contact.platform_id);
            }
          }
        } catch (e) {
          console.error('Error sending presence to WA:', e);
        }
      }
    })
    .subscribe();
}

startWhatsApp();
