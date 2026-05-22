require('dotenv').config({path: '.env.local'});
global.WebSocket = require('ws');
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function test() {
  console.time('DB Query 1');
  await supabase.from("ai_draft_logs").select("ai_draft, language").eq("org_id", "some_org").eq("was_edited", false).order("created_at", { ascending: false }).limit(50);
  console.timeEnd('DB Query 1');
  
  console.time('DB Query 2');
  await supabase.from("ai_draft_logs").select("correction_insight").eq("org_id", "some_org").eq("was_edited", true).not("correction_insight", "is", null).order("created_at", { ascending: false }).limit(10);
  console.timeEnd('DB Query 2');
}
test();
