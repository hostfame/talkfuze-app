const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({path: '.env.local'});
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function run() {
  const { data } = await supabase.from('conversations').select('id, metadata').limit(5);
  console.log('Conversations:', JSON.stringify(data, null, 2));
  
  const { data: contacts } = await supabase.from('contacts').select('id, metadata').limit(5);
  console.log('Contacts:', JSON.stringify(contacts, null, 2));

  const { data: msgs } = await supabase.from('messages').select('id, metadata, content').eq('content', 'Viewed:').limit(1);
  console.log('Messages:', JSON.stringify(msgs, null, 2));
}
run();
