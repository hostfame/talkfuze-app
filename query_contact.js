require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
global.WebSocket = require('ws');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});
async function run() {
  const { data, error } = await supabase.from('contacts').select('*').like('platform_id', '%120363419139392123%');
  console.log(JSON.stringify(data, null, 2));
}
run();
