require('dotenv').config({path: '.env.local'});
global.WebSocket = require('ws');
const { createClient } = require('@supabase/supabase-js');
const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function test() {
  console.time('getConversations');
  const { data, error } = await supabaseAdmin
    .from("conversations")
    .select(`
      id,
      messages(content, sender_type, content_type)
    `)
    .order("created_at", { foreignTable: "messages", ascending: false })
    .limit(1, { foreignTable: "messages" })
    .limit(50);
  console.timeEnd('getConversations');
  if (error) console.error(error);
}
test();
