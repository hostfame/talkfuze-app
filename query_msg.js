const { createClient } = require('@supabase/supabase-js');
global.WebSocket = require('ws');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data } = await supabase.from('messages').select('*').order('created_at', {ascending: false}).limit(10);
  console.log(JSON.stringify(data.filter(m => m.content === '[Attachment]'), null, 2));
}
run();
