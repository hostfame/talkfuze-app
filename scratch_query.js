const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
global.WebSocket = require('ws');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function run() {
  const { data, error } = await supabase.from('whatsapp_templates').select('*');
  console.log(data);
}
run();
