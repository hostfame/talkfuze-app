require('dotenv').config({ path: '.env.local' });
const orgId = "ec2f8436-05dc-4621-8a7f-57202f865b8e";
const deviceId = "cee603f8-5130-46e6-874b-c036a1d987fb"; 

async function run() {
  const apiKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;

  const cRes = await fetch(`${url}/rest/v1/contacts?org_id=eq.${orgId}&platform_type=eq.widget&platform_id=eq.${deviceId}`, {
    headers: { apikey: apiKey, Authorization: `Bearer ${apiKey}` }
  });
  const contacts = await cRes.json();
  const contactId = contacts[0].id;
  
  const convRes = await fetch(`${url}/rest/v1/conversations?select=id,status,created_at,updated_at&contact_id=eq.${contactId}&order=created_at.desc`, {
    headers: { apikey: apiKey, Authorization: `Bearer ${apiKey}` }
  });
  const convs = await convRes.json();
  console.log("CONVS RAW:", convs);
}
run();
