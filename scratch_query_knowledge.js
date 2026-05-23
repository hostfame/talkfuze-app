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
    .from('ai_knowledge_base')
    .select('id, question, answer, created_at')
    .order('created_at', { ascending: false })
    .limit(15);

  if (error) {
    console.error("Supabase Error:", error);
    return;
  }

  console.log(`Latest 15 AI knowledge entries:`);
  console.log(JSON.stringify(data, null, 2));
}
run();
