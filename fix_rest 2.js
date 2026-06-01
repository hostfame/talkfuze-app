require('dotenv').config({ path: '.env.local' });
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function run() {
  console.log('Fetching conversations...');
  const res = await fetch(`${url}/rest/v1/conversations?select=id,last_message_at&order=last_message_at.desc&limit=500`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` }
  });
  const convs = await res.json();
  
  let fixedCount = 0;
  
  for (const c of convs) {
    const mRes = await fetch(`${url}/rest/v1/messages?conversation_id=eq.${c.id}&select=created_at,sender_type,metadata&order=created_at.desc&limit=20`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` }
    });
    const msgs = await mRes.json();
    if (!msgs || msgs.length === 0) continue;
    
    let realLastMsg = null;
    for (const m of msgs) {
      if (m.sender_type === 'system') {
        const meta = typeof m.metadata === 'string' ? JSON.parse(m.metadata) : m.metadata;
        if (meta?.event === 'page_view') continue;
      }
      realLastMsg = m;
      break;
    }
    
    if (realLastMsg && realLastMsg.created_at !== c.last_message_at) {
      const dbTime = new Date(c.last_message_at).getTime();
      const realTime = new Date(realLastMsg.created_at).getTime();
      
      if (Math.abs(dbTime - realTime) > 1000) {
        console.log(`Fixing conv ${c.id}: ${c.last_message_at} -> ${realLastMsg.created_at}`);
        await fetch(`${url}/rest/v1/conversations?id=eq.${c.id}`, {
          method: 'PATCH',
          headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ last_message_at: realLastMsg.created_at })
        });
        fixedCount++;
      }
    }
  }
  
  console.log(`Done! Fixed ${fixedCount} conversations.`);
}

run();
