import { createClient } from "@supabase/supabase-js";
import ws from "ws";

const supabaseUrl = "https://fyuymnldgvfvdqcnbsxh.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ5dXltbmxkZ3ZmdmRxY25ic3hoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODgxNzUwNiwiZXhwIjoyMDk0MzkzNTA2fQ.fkZvxGkgW3yktVkLUxmOaEEdVRTymtrFK4uOj9Wa66A";

const supabaseAdmin = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false },
  realtime: { transport: ws },
});

async function run() {
  const { data, error } = await supabaseAdmin.rpc('exec_sql', { sql: 'SELECT * FROM pg_trigger;' });
  if (error) {
    console.error("No exec_sql function:", error.message);
  } else {
    console.log(data);
  }
}
run();
