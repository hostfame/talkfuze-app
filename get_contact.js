const { createClient } = require('@supabase/supabase-js');
const WebSocket = require('ws');
require('dotenv').config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
  realtime: { transport: WebSocket } // Add this for Node 20
});
async function run() {
  const { data, error } = await supabase.from('contacts').select('*').eq('id', 'b43a691f-a690-4416-9ff0-4ba8fd768009').single();
  console.log(data || error);
}
run();
