require('dotenv').config({path: '.env.local'});
const url = process.env.NEXT_PUBLIC_SUPABASE_URL + '/rest/v1/messages?select=id&limit=1';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

fetch(url, {
  headers: {
    'apikey': key,
    'Authorization': 'Bearer ' + key
  }
}).then(r => r.json()).then(console.log).catch(console.error);

fetch(process.env.NEXT_PUBLIC_SUPABASE_URL + '/rest/v1/rpc/current_org_id', {
  method: 'POST',
  headers: {
    'apikey': key,
    'Authorization': 'Bearer ' + key,
    'Content-Type': 'application/json'
  }
}).then(r => r.text()).then(t => console.log("current_org_id result:", t)).catch(e => console.log("current_org_id error"));

