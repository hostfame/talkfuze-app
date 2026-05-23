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
  const { data, error } = await supabase
    .from('ai_draft_logs')
    .select('id, created_at, ai_draft, customer_context, language, was_edited, correction_feedback')
    .order('created_at', { ascending: false })
    .limit(3);

  if (error) {
    console.error("Supabase Error:", error);
    return;
  }

  console.log(JSON.stringify(data, null, 2));
}
run();
