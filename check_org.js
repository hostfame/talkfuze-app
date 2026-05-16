const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8');
const urlMatch = env.match(/NEXT_PUBLIC_SUPABASE_URL="(.*?)"/);
const keyMatch = env.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY="(.*?)"/);
const supabase = createClient(urlMatch[1], keyMatch[1]);
async function run() {
  const { data, error } = await supabase.from('orgs').select('*');
  console.log('Orgs:', data);
  if (error) console.error(error);
}
run();
