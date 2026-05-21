const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  const { data: org, error } = await supabase.from('organizations').select('*').limit(1).single();
  if (error) {
    console.error('Error fetching organization:', error);
  } else {
    console.log('Org columns:', Object.keys(org));
    console.log('Org settings structure:', JSON.stringify(org.settings, null, 2));
  }
}

main();
