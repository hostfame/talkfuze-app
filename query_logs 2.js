require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function run() {
  const { data, error, count } = await supabase
    .from('ai_draft_logs')
    .select('id', { count: 'exact' })
    .eq('was_edited', true)
    .not('correction_feedback', 'is', null);
  if(error) console.error(error);
  console.log("Corrections learned:", count);
}
run();
