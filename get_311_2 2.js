require('dotenv').config({ path: '.env.local' });
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function run() {
  const cRes = await fetch(`${url}/rest/v1/conversations?id=eq.39fc834a-93bf-4f5c-9975-8d88c021b421&select=id,last_message_at`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` }
  });
  console.log("Conv 39fc834a-93bf-4f5c-9975-8d88c021b421:", await cRes.json());
}
run();
