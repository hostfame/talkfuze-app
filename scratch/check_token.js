require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const ws = require('ws');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Pass ws constructor for Realtime connection
const supabaseAdmin = createClient(supabaseUrl, serviceKey, {
  auth: {
    persistSession: false
  },
  realtime: {
    transport: ws
  }
});

async function check() {
  const token = "e58d7b1f868172449d6cf77214207cf8f2d5ea737df431f4696d4402194b27b3";
  
  // Let's find ALL organizations to see their whmcs_tokens
  const { data: orgs, error: orgsError } = await supabaseAdmin
    .from('organizations')
    .select('id, name, settings');

  if (orgsError) {
    console.error('Error fetching orgs:', orgsError);
    return;
  }

  console.log('Organizations list:');
  orgs.forEach(o => {
    console.log(`- ${o.name} (${o.id}): whmcs_token = "${o.settings?.whmcs_token}"`);
  });

  const matchingOrg = orgs.find(o => o.settings?.whmcs_token === token);
  if (!matchingOrg) {
    console.log('\n❌ No organization has whmcs_token matching:', token);
    return;
  }

  console.log('\n✅ Found matching org:', matchingOrg.name);

  // Check active channels for this organization
  const { data: channels, error: chanError } = await supabaseAdmin
    .from('channels')
    .select('*')
    .eq('org_id', matchingOrg.id);

  if (chanError) {
    console.error('Error fetching channels:', chanError);
    return;
  }

  console.log('Channels found for matching org:', channels.map(c => ({
    id: c.id,
    type: c.type,
    name: c.name,
    status: c.status,
    phone: c.phone
  })));
}

check();
