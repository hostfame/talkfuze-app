require('dotenv').config({ path: '/Users/imran/Documents/Talkfuze/.env.local' });
async function run() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL + '/rest/v1/messages?content_type=eq.audio&select=id,metadata&order=created_at.desc&limit=3';
  const res = await fetch(url, {
    headers: {
      'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': 'Bearer ' + process.env.SUPABASE_SERVICE_ROLE_KEY
    }
  });
  console.log(await res.json());
}
run();
