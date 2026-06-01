require('dotenv').config({ path: '.env.local' });
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function run() {
  const mRes = await fetch(`${url}/rest/v1/messages?created_at=gte.2026-05-23T10:18:00Z&created_at=lte.2026-05-23T10:20:00Z&select=conversation_id,created_at,content,metadata,sender_type&order=created_at.desc`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` }
  });
  console.log(await mRes.json());
}
run();
