require('dotenv').config({ path: '.env.local' });
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function run() {
  const mRes = await fetch(`${url}/rest/v1/messages?conversation_id=eq.39fc834a-93bf-4f5c-9975-8d88c021b421&created_at=gte.2026-05-23T09:11:00Z&select=created_at,content,metadata,sender_type`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` }
  });
  console.log(await mRes.json());
}
run();
