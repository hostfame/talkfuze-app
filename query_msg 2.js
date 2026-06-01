require('dotenv').config({ path: '.env.local' });
global.WebSocket = require('ws');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data, error } = await supabase
    .from('messages')
    .select('id, sender_type, sender_id, content, metadata, conversation_id, created_at')
    .in('content', ['Voice call', 'Missed voice call'])
    .order('created_at', { ascending: false })
    .limit(20);
    
  if (error) {
    console.error(error);
    return;
  }
  console.log(JSON.stringify(data, null, 2));
}
run();

