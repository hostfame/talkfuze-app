const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
  const { data, error } = await supabase.rpc('run_sql', {
    sql_query: "SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'messages';"
  });
  
  if (error) {
    console.error("RPC Error:", error.message);
    console.log("Trying direct postgres connection if possible or fallback.");
  } else {
    console.log("Indexes:", data);
  }
}
check();
