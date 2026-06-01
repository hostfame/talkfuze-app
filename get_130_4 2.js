require('dotenv').config({ path: '.env.local' });
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function run() {
  const mRes = await fetch(`${url}/rest/v1/messages?content=ilike.%25Rafy%20Chowdhury%20joined%20the%20chat%25&select=conversation_id,created_at,content,sender_type&order=created_at.desc&limit=5`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` }
  });
  const msgs = await mRes.json();
  console.log(msgs);
  
  if (msgs.length > 0) {
    const cid = msgs[0].conversation_id;
    const cRes = await fetch(`${url}/rest/v1/conversations?id=eq.${cid}&select=id,last_message_at,contact_id`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` }
    });
    console.log(await cRes.json());
    
    const allRes = await fetch(`${url}/rest/v1/messages?conversation_id=eq.${cid}&select=created_at,content,metadata,sender_type&order=created_at.desc&limit=5`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` }
    });
    console.log(await allRes.json());
  }
}
run();
