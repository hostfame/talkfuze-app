const { createClient } = require('@supabase/supabase-js');

async function run() {
  const url = 'https://fyuymnldgvfvdqcnbsxh.supabase.co/rest/v1';
  const apikey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ5dXltbmxkZ3ZmdmRxY25ic3hoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODgxNzUwNiwiZXhwIjoyMDk0MzkzNTA2fQ.fkZvxGkgW3yktVkLUxmOaEEdVRTymtrFK4uOj9Wa66A';
  const headers = {
    'apikey': apikey,
    'Authorization': `Bearer ${apikey}`
  };

  const res = await fetch(`${url}/messages?id=eq.e1399448-dc8a-4163-9747-d694441bd96c&select=conversation_id`, { headers });
  const msg = await res.json();
  const convId = msg[0].conversation_id;

  const res2 = await fetch(`${url}/conversations?id=eq.${convId}&select=channel_id`, { headers });
  const conv = await res2.json();
  const channelId = conv[0].channel_id;

  const res3 = await fetch(`${url}/channels?id=eq.${channelId}&select=*`, { headers });
  const channel = await res3.json();
  
  console.log("CHANNEL:", JSON.stringify(channel, null, 2));
}

run();
