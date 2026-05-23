const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
global.WebSocket = require('ws');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: contacts, error: contactError } = await supabase
    .from('contacts')
    .select('id, name, platform_id, phone, metadata')
    .ilike('name', '%Mamun%');
    
  if (contactError) {
    console.error('Contact Error:', contactError);
    return;
  }
  
  console.log('Contacts:', JSON.stringify(contacts, null, 2));
}

run();
