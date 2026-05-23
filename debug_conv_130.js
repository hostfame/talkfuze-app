require('dotenv').config({ path: '.env.local' });
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function run() {
  const res = await fetch(`${url}/rest/v1/conversations?select=id,last_message_at&order=last_message_at.desc&limit=10`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` }
  });
  const convs = await res.json();
  
  for (const c of convs) {
    const mRes = await fetch(`${url}/rest/v1/messages?conversation_id=eq.${c.id}&select=created_at,content,metadata,sender_type&order=created_at.desc&limit=5`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` }
    });
    const msgs = await mRes.json();
    console.log(`\nMessages for ${c.id} (last_message_at: ${c.last_message_at}):`);
    console.log(JSON.stringify(msgs, null, 2));
  }
}
run();
