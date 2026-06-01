global.WebSocket = require('ws');
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

dotenv.config({ path: '/Users/imran/Documents/Talkfuze/.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ORG_ID = 'ec2f8436-05dc-4621-8a7f-57202f865b8e';

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase configuration");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 3) {
    console.error("Usage: node send_to_talkfuze_db.js <phone> <text> <platform_message_id>");
    process.exit(1);
  }

  const phone = args[0].replace('@s.whatsapp.net', '').trim();
  const text = args[1];
  const platformMessageId = args[2];

  console.log(`Syncing message to TalkFuze DB for phone: ${phone}, msgId: ${platformMessageId}`);

  try {
    // 1. Fetch contact
    let { data: contact, error: contactErr } = await supabase
      .from('contacts')
      .select('id')
      .eq('org_id', ORG_ID)
      .eq('phone', phone)
      .maybeSingle();

    if (contactErr) throw contactErr;

    if (!contact) {
      // Create contact if it doesn't exist
      const jid = `${phone}@s.whatsapp.net`;
      const { data: newContact, error: insertContactErr } = await supabase
        .from('contacts')
        .insert({
          org_id: ORG_ID,
          phone: phone,
          platform_id: jid,
          name: phone,
          created_at: new Date().toISOString()
        })
        .select()
        .single();

      if (insertContactErr) throw insertContactErr;
      contact = newContact;
      console.log(`Created new contact: ${contact.id}`);
    }

    // 2. Fetch or create conversation
    let { data: conversation, error: convErr } = await supabase
      .from('conversations')
      .select('id')
      .eq('org_id', ORG_ID)
      .eq('contact_id', contact.id)
      .maybeSingle();

    if (convErr) throw convErr;

    let conversationId;
    if (!conversation) {
      // Find or create a default channel ID
      const { data: channels, error: channelErr } = await supabase
        .from('channels')
        .select('id')
        .eq('org_id', ORG_ID)
        .limit(1);

      if (channelErr) throw channelErr;
      const channelId = channels && channels.length > 0 ? channels[0].id : null;

      const { data: newConv, error: insertConvErr } = await supabase
        .from('conversations')
        .insert({
          org_id: ORG_ID,
          contact_id: contact.id,
          channel_id: channelId,
          status: 'open',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select()
        .single();

      if (insertConvErr) throw insertConvErr;
      conversationId = newConv.id;
      console.log(`Created new conversation: ${conversationId}`);
    } else {
      conversationId = conversation.id;
    }

    // 3. Insert message
    const { error: insertMsgErr } = await supabase
      .from('messages')
      .insert({
        org_id: ORG_ID,
        conversation_id: conversationId,
        platform_message_id: platformMessageId,
        sender_type: 'ai',
        content: text,
        content_type: 'text',
        status: 'delivered',
        created_at: new Date().toISOString()
      });

    if (insertMsgErr) throw insertMsgErr;

    // 4. Update conversation updated_at
    await supabase
      .from('conversations')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', conversationId);

    console.log("Successfully inserted message and synced to TalkFuze DB!");
  } catch (err) {
    console.error("Failed to sync to TalkFuze DB:", err.message);
    process.exit(1);
  }
}

main();
