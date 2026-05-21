require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
global.WebSocket = require('ws');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});

async function run() {
  // Query contact
  console.log("=== CONTACT ===");
  const { data: contacts, error: cErr } = await supabase
    .from('contacts')
    .select('*')
    .or('phone.eq.8801718091811,platform_id.eq.8801718091811,platform_id.eq.8801718091811@s.whatsapp.net');
  console.log(JSON.stringify(contacts, null, 2));

  if (contacts && contacts.length > 0) {
    const contactIds = contacts.map(c => c.id);
    
    // Query conversations
    console.log("\n=== CONVERSATIONS ===");
    const { data: convs, error: convErr } = await supabase
      .from('conversations')
      .select('*')
      .in('contact_id', contactIds);
    console.log(JSON.stringify(convs, null, 2));

    if (convs && convs.length > 0) {
      const convIds = convs.map(c => c.id);
      
      // Query messages
      console.log("\n=== MESSAGES ===");
      const { data: msgs, error: msgErr } = await supabase
        .from('messages')
        .select('*')
        .in('conversation_id', convIds)
        .order('created_at', { ascending: true });
      console.log(JSON.stringify(msgs.map(m => ({
        id: m.id,
        sender_type: m.sender_type,
        content: m.content,
        created_at: m.created_at,
        platform_message_id: m.platform_message_id
      })), null, 2));
    }
  }
}
run();
