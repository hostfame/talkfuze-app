require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
global.WebSocket = require('ws');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});
async function run() {
  const { data, error } = await supabase.rpc('get_trigger_def', {});
  console.log(error);
}
run();
