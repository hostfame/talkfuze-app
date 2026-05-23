const { createClient } = require('@supabase/supabase-js');
const ws = require('ws');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false }
});

async function run() {
  const { data, error } = await supabase.from('ai_draft_logs').select('*').limit(1);
  console.log("Cols:", Object.keys(data[0] || {}));
}
run();
