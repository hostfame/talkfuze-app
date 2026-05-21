require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
global.WebSocket = require('ws');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});

async function run() {
  const { data: contacts, error } = await supabase
    .from('contacts')
    .select('id, name, phone, platform_id, metadata, created_at')
    .eq('platform_type', 'whatsapp');
  
  if (error) {
    console.error(error);
    return;
  }

  console.log(`Total WhatsApp Contacts: ${contacts.length}`);
  
  const hostninContacts = contacts.filter(c => c.name === 'Hostnin' || c.name.toLowerCase().includes('agent') || c.name === 'The Nawaz');
  console.log(`\nContacts named 'Hostnin' or agent-like: ${hostninContacts.length}`);
  console.log(JSON.stringify(hostninContacts, null, 2));

  // Count other potentially overwritten names
  const overwritten = contacts.filter(c => {
    // If name is Hostnin or has been modified by the bug
    return c.name === 'Hostnin';
  });
  console.log(`\nOverwritten count: ${overwritten.length}`);
}
run();
