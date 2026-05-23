require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const ws = require('ws');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    realtime: {
      transport: ws
    }
  }
);

async function run() {
  const logIdPrefix = 'a31b2d1b';
  
  // Lexicographical range query for UUID prefix
  const { data, error } = await supabase
    .from('ai_draft_logs')
    .select('*')
    .gte('id', `${logIdPrefix}-0000-0000-0000-000000000000`)
    .lte('id', `${logIdPrefix}-ffff-ffff-ffff-ffffffffffff`);

  if (error) {
    console.error("Supabase Error:", error);
    return;
  }

  if (data.length === 0) {
    console.log(`No logs found with ID starting with: ${logIdPrefix}`);
    return;
  }

  console.log(JSON.stringify(data, null, 2));
}
run();
