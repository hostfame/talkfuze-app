require('dotenv').config({ path: '.env.local' });
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function run() {
  const cRes = await fetch(`${url}/rest/v1/conversations?title=eq.Website%20Visitor%20%23130&select=id,last_message_at,title`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` }
  });
  const convs = await cRes.json();
  console.log(convs);
  
  if (convs.length > 0) {
    const cid = convs[0].id;
    const allRes = await fetch(`${url}/rest/v1/messages?conversation_id=eq.${cid}&select=created_at,content,metadata,sender_type&order=created_at.desc&limit=20`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` }
    });
    console.log(await allRes.json());
  }
}
run();
