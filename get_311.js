require('dotenv').config({ path: '.env.local' });
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function run() {
  const mRes = await fetch(`${url}/rest/v1/messages?created_at=gte.2026-05-23T09:10:00Z&created_at=lte.2026-05-23T09:12:00Z&select=conversation_id,created_at,content,sender_type&order=created_at.desc&limit=10`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` }
  });
  const msgs = await mRes.json();
  console.log(msgs);
}
run();
