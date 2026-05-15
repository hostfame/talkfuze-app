require('dotenv').config({ path: '.env.local' });

async function check() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL + '/rest/v1';
  const headers = {
    'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY,
    'Authorization': 'Bearer ' + process.env.SUPABASE_SERVICE_ROLE_KEY
  };

  const msgs = await fetch(`${url}/messages?select=*&order=created_at.desc&limit=5`, { headers }).then(r => r.json());
  console.log("MESSAGES:", JSON.stringify(msgs, null, 2));
  
  const convs = await fetch(`${url}/conversations?select=*&order=created_at.desc&limit=5`, { headers }).then(r => r.json());
  console.log("CONVERSATIONS:", JSON.stringify(convs, null, 2));
}
check();
