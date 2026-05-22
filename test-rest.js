require('dotenv').config({ path: '/Users/imran/Documents/Talkfuze/.env.local' });
async function run() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL + '/rest/v1/messages?content_type=eq.audio&select=id&order=created_at.desc&limit=1';
  const res = await fetch(url, {
    headers: {
      'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': 'Bearer ' + process.env.SUPABASE_SERVICE_ROLE_KEY
    }
  });
  const data = await res.json();
  if (!data || data.length === 0) return console.log("No audio messages");
  const msgId = data[0].id;
  console.log("Found ID:", msgId);

  const apiRes = await fetch('https://app.talkfuze.com/api/ai/transcribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messageId: msgId })
  });
  console.log("Status:", apiRes.status);
  console.log("Body:", await apiRes.text());
}
run();
