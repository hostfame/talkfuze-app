const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '/Users/imran/Documents/Talkfuze/.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data } = await supabase.from('messages').select('id, content_type').eq('content_type', 'audio').order('created_at', { ascending: false }).limit(1);
  if (!data || data.length === 0) return console.log("No audio messages found");
  const msgId = data[0].id;
  console.log("Testing with message ID:", msgId);

  const fetch = (await import('node-fetch')).default;
  const res = await fetch('https://app.talkfuze.com/api/ai/transcribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messageId: msgId })
  });
  console.log("Status:", res.status);
  console.log("Body:", await res.text());
}
run();
