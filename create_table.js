const { createClient } = require('@supabase/supabase-js');
const ws = require('ws');
require('dotenv').config({ path: '.env.local' });

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { realtime: { transport: ws }, auth: { persistSession: false } }
);

async function create() {
  const { error } = await supabaseAdmin.rpc('run_sql', {
    sql_query: `
      CREATE TABLE IF NOT EXISTS public.ai_system_rules (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        org_id UUID NOT NULL,
        rules_markdown TEXT NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `
  });
  if (error) {
    console.error("RPC failed, trying raw query...", error.message);
    // If no RPC, let's just create a migration or use postgres
  } else {
    console.log("Table created.");
  }
}
create();
