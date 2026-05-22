require('dotenv').config({path: '.env.local'});
global.WebSocket = require('ws');

async function run() {
  const payload = {
    type: "INSERT",
    table: "messages",
    record: {
      conversation_id: "00000000-0000-0000-0000-000000000000",
      content: "I want to buy the premium package. How much is it?",
      sender_type: "contact"
    }
  };
  
  const { createClient } = require('@supabase/supabase-js');
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  
  const { data: convs } = await supabase.from('conversations').select('id, tags').limit(1);
  if (convs && convs.length > 0) {
    payload.record.conversation_id = convs[0].id;
    await supabase.from('conversations').update({ tags: [] }).eq('id', convs[0].id);
  }
  
  console.log("Testing with conversation:", payload.record.conversation_id);
  
  const response = await fetch(process.env.NEXT_PUBLIC_SUPABASE_URL + '/functions/v1/auto-tag', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    },
    body: JSON.stringify(payload)
  });
  
  console.log("Status:", response.status);
  console.log("Response:", await response.text());
  
  const { data: updated } = await supabase.from('conversations').select('tags').eq('id', payload.record.conversation_id).single();
  console.log("Updated tags:", updated.tags);
}

run().catch(console.error);
