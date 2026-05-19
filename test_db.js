require('dotenv').config({ path: '.env.local' });
async function run() {
  const apiKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;

  const agentIds = ['f328082f-2047-421e-abae-dbc11fc8cc32']; // dummy
  
  const aRes = await fetch(`${url}/rest/v1/users?select=id,name,avatar_url&id=in.(${agentIds.join(',')})`, {
    headers: { apikey: apiKey, Authorization: `Bearer ${apiKey}` }
  });
  console.log("Agents res status:", aRes.status);
  const text = await aRes.text();
  console.log("Agents res:", text);
}
run();
