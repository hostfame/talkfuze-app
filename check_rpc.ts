import { supabaseAdmin } from "./src/lib/supabase-admin";

async function run() {
  const { data, error } = await supabaseAdmin.rpc('get_conversations', { 
    org_uuid: 'bc8e38d4-539c-4573-b31c-c2b64b182d33', 
    filter_type: 'all', 
    agent_id: null 
  });
  console.log(data?.[0]?.latestMessage);
}
run();
