const { createClient } = require('@supabase/supabase-js');
global.WebSocket = require('ws');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const sql = `
  CREATE TABLE IF NOT EXISTS public.widget_otps (
    email text PRIMARY KEY,
    code text NOT NULL,
    expires bigint NOT NULL,
    client_id bigint NOT NULL,
    conversation_id text NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
  );
  `;
  const { data, error } = await supabase.rpc('exec_sql', { query: sql });
  if (error && error.message.includes('function "exec_sql" does not exist')) {
    console.log("No exec_sql, please use psql or manual creation.");
  } else {
    console.log(error ? error.message : "Table created!");
  }
}
run();
