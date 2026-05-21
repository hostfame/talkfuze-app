require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
global.WebSocket = require('ws');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});

async function run() {
  const { data: convs, error } = await supabase
    .from('conversations')
    .select('id, contact_id, tags, last_message_at, contact:contacts(name, phone)')
    .contains('tags', ['alert']);

  if (error) {
    console.error(error);
    return;
  }

  console.log(`Total conversations with 'alert' tag: ${convs.length}`);
  console.log(JSON.stringify(convs.map(c => ({
    id: c.id,
    contact_name: c.contact?.name,
    phone: c.contact?.phone,
    tags: c.tags,
    last_message_at: c.last_message_at
  })), null, 2));
}
run();
