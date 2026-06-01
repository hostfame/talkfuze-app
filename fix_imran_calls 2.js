require('dotenv').config({ path: '.env.local' });
global.WebSocket = require('ws');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const fixes = [
    { id: 'd65d7220-394d-49e8-bf02-9f76d8aadc6e', agent: 'Rafy Chowdhury', duration: '25s' },
    { id: '640ab824-b368-4aa0-b10f-4b619f220189', agent: 'Rafy Chowdhury', duration: '46s' }
  ];

  for (const fix of fixes) {
    const { data: msg } = await supabase.from('messages').select('metadata').eq('id', fix.id).single();
    if (msg) {
      const meta = typeof msg.metadata === 'string' ? JSON.parse(msg.metadata) : msg.metadata;
      meta.agent_name = fix.agent;
      meta.duration = fix.duration;
      await supabase.from('messages').update({ metadata: JSON.stringify(meta) }).eq('id', fix.id);
      console.log(`Fixed message ${fix.id}`);
    }
  }
}
run();
