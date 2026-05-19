const { createClient } = require('@supabase/supabase-js');
global.WebSocket = require('ws');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data, error } = await supabase.from('otp_codes').select('*').limit(1);
  console.log(error ? error.message : "otp_codes exists");
  
  const { data: d2, error: e2 } = await supabase.from('contacts').select('*').limit(1);
  console.log(e2 ? e2.message : "contacts exists");
}
run();
