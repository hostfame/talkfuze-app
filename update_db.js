const { createClient } = require('@supabase/supabase-js');

async function run() {
  const url = 'https://fyuymnldgvfvdqcnbsxh.supabase.co/rest/v1';
  const apikey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ5dXltbmxkZ3ZmdmRxY25ic3hoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODgxNzUwNiwiZXhwIjoyMDk0MzkzNTA2fQ.fkZvxGkgW3yktVkLUxmOaEEdVRTymtrFK4uOj9Wa66A';
  const headers = {
    'apikey': apikey,
    'Authorization': `Bearer ${apikey}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
  };

  // Get current config
  const res = await fetch(`${url}/channels?id=eq.cfc85770-9870-4b19-9c6c-8c91f571444b&select=*`, { headers: { apikey, Authorization: headers.Authorization } });
  const channels = await res.json();
  const channel = channels[0];

  // Update access token
  channel.config.access_token = "EAAXz3IbQJssBRZAqs4UUpODqFMM2aa4VZAh1p46g59TmxQbNCv4eIZAzWYcagaWlR9HDYKwUcg3mJ4sZCwZBaV7zyuuj60tjdILCxCi9QXYrzqaYbry33eiWJzHQfqOZAvn2YDuP5f3N9qLNKCReB9PlRfkaUwYZBRQZAoqoZCdwC3v9nM7haUvaXQVLs7SQ4PmF01XkOrcWO4aCCJVQ0XwlSKcGZAcixinrysPTb6hNfYXQZDZD";

  const patchRes = await fetch(`${url}/channels?id=eq.cfc85770-9870-4b19-9c6c-8c91f571444b`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ config: channel.config })
  });

  const updated = await patchRes.json();
  console.log("UPDATED CHANNEL:", JSON.stringify(updated, null, 2));
}

run();
