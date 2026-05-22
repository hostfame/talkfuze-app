require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
global.WebSocket = require('ws');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});
async function run() {
  const { data, error } = await supabase.from('ai_draft_logs')
    .select('created_at, ai_draft, agent_sent, correction_feedback')
    .order('created_at', { ascending: false })
    .limit(5);
  
  if (error) console.error(error);
  else console.log(JSON.stringify(data, null, 2));
}
run();
