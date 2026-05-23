require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
global.WebSocket = require('ws');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});
async function run() {
  const { data: updated, error } = await supabase
    .from('messages')
    .update({ status: 'delivered' })
    .eq('is_internal', true)
    .eq('status', 'sent')
    .select('id');

  if (error) {
    console.error(error);
    return;
  }

  console.log(`UPDATED ${updated?.length || 0} HISTORICAL INTERNAL MESSAGES TO 'delivered'`);
}
run();
