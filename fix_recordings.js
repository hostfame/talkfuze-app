const dotenv = require('dotenv');
const fs = require('fs');

const envLocal = dotenv.parse(fs.readFileSync('.env.local'));
const SUPABASE_URL = envLocal.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = envLocal.SUPABASE_SERVICE_ROLE_KEY;

async function fix() {
  console.log("Fixing call_logs...");
  const res1 = await fetch(`${SUPABASE_URL}/rest/v1/call_logs?recording_url=eq.https://sip.talkfuze.com/recordings/None`, {
    method: 'PATCH',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    },
    body: JSON.stringify({ recording_url: null })
  });
  console.log(await res1.text());

  console.log("Fixing unpaid_invoice_calls...");
  const res2 = await fetch(`${SUPABASE_URL}/rest/v1/unpaid_invoice_calls?recording_url=eq.https://sip.talkfuze.com/recordings/None`, {
    method: 'PATCH',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    },
    body: JSON.stringify({ recording_url: null })
  });
  console.log(await res2.text());
}

fix();
