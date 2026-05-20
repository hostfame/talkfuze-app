const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
  const orgId = 'ec2f8436-05dc-4621-8a7f-57202f865b8e';
  
  // Get current settings
  const { data, error } = await supabaseAdmin
    .from('organizations')
    .select('settings')
    .eq('id', orgId)
    .single();
    
  if (error) {
    console.error('Error fetching:', error);
    return;
  }
  
  const currentSettings = data.settings || {};
  currentSettings.logo_url = 'https://hostnin.com/images/hostnin_logo.png';
  
  // Update
  const { error: updateErr } = await supabaseAdmin
    .from('organizations')
    .update({ settings: currentSettings })
    .eq('id', orgId);
    
  if (updateErr) {
    console.error('Error updating:', updateErr);
  } else {
    console.log('Successfully updated logo_url to Hostnin logo!');
  }
}

main();
