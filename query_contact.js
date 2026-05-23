require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
global.WebSocket = require('ws');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});
async function run() {
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  const { data: messages, error } = await supabase
    .from('messages')
    .select('id, content, status, conversation_id, created_at')
    .in('sender_type', ['agent', 'ai'])
    .eq('status', 'sent')
    .gt('created_at', twoHoursAgo);

  if (error) {
    console.error(error);
    return;
  }

  console.log(`PENDING 'sent' MESSAGES (Last 2h): ${messages.length}`);
  for (const m of messages) {
    // Fetch conversation & contact
    const { data: conv } = await supabase
      .from('conversations')
      .select('contact_id')
      .eq('id', m.conversation_id)
      .single();

    let contactName = 'Unknown';
    if (conv) {
      const { data: contact } = await supabase
        .from('contacts')
        .select('name, phone, platform_id, metadata')
        .eq('id', conv.contact_id)
        .single();
      if (contact) {
        contactName = `${contact.name} (${contact.phone}) [Platform JID: ${contact.platform_id}] Metadata: ${JSON.stringify(contact.metadata)}`;
      }
    }
    console.log(`- MSG ID: ${m.id} | To: ${contactName} | Content: "${m.content.slice(0, 40)}..."`);
  }
}
run();
