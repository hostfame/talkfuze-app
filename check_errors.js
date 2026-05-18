const { createClient } = require('@supabase/supabase-js');

async function run() {
  const url = 'https://fyuymnldgvfvdqcnbsxh.supabase.co/rest/v1';
  const apikey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ5dXltbmxkZ3ZmdmRxY25ic3hoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODgxNzUwNiwiZXhwIjoyMDk0MzkzNTA2fQ.fkZvxGkgW3yktVkLUxmOaEEdVRTymtrFK4uOj9Wa66A';
  const headers = {
    'apikey': apikey,
    'Authorization': `Bearer ${apikey}`
  };

  const res = await fetch(`${url}/messages?status=eq.failed&select=id,content,metadata,created_at&order=created_at.desc&limit=5`, { headers });
  const messages = await res.json();
  console.log("FAILED MESSAGES:", JSON.stringify(messages, null, 2));
}

run();
