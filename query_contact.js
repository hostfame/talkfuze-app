require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
global.WebSocket = require('ws');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});
async function run() {
  const { data: msg, error: err1 } = await supabase
    .from('messages')
    .select('id, conversation_id, content, metadata')
    .eq('id', 'e217c714-f7e7-48ec-a5f2-0e9ef6f4a286')
    .single();
  if (err1) {
    console.error(err1);
    return;
  }
  console.log("MESSAGE DETAILS:", JSON.stringify(msg, null, 2));

  const { data: conv, error: err2 } = await supabase
    .from('conversations')
    .select('id, contact_id, channel_id')
    .eq('id', msg.conversation_id)
    .single();
  if (err2) {
    console.error(err2);
    return;
  }
  console.log("CONVERSATION DETAILS:", JSON.stringify(conv, null, 2));

  const { data: contact, error: err3 } = await supabase
    .from('contacts')
    .select('id, name, phone, platform_id, metadata')
    .eq('id', conv.contact_id)
    .single();
  if (err3) {
    console.error(err3);
    return;
  }
  console.log("CONTACT DETAILS:", JSON.stringify(contact, null, 2));
}
run();
