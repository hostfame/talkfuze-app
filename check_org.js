const fetch = global.fetch;

async function run() {
  const supabaseUrl = 'https://fyuymnldgvfvdqcnbsxh.supabase.co';
  const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ5dXltbmxkZ3ZmdmRxY25ic3hoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODgxNzUwNiwiZXhwIjoyMDk0MzkzNTA2fQ.fkZvxGkgW3yktVkLUxmOaEEdVRTymtrFK4uOj9Wa66A';

  const headers = {
    apikey: supabaseKey,
    Authorization: `Bearer ${supabaseKey}`,
    'Content-Type': 'application/json'
  };

  const res = await fetch(`${supabaseUrl}/rest/v1/users?email=eq.imran@hostnin.com`, { headers });
  const users = await res.json();
  console.log("Users:", users);

  const resCalls = await fetch(`${supabaseUrl}/rest/v1/call_logs?select=*`, { headers });
  const calls = await resCalls.json();
  console.log("Total calls in DB:", calls.length);
  if (calls.length > 0) {
    console.log("Last call:", calls[calls.length - 1]);
  }
}

run().catch(console.error);
