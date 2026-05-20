require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
global.WebSocket = require('ws');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});
async function run() {
  const { data, error } = await supabase.from('conversations').select('id, contact_id, status, created_at').eq('contact_id', '71e738b3-6a4d-4bc4-a452-48abbdfa5ede');
  console.log(JSON.stringify(data, null, 2));
}
run();
