require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  const { data: convs } = await supabase
    .from('conversations')
    .select('id, last_message_at')
    .order('last_message_at', { ascending: false })
    .limit(10);
    
  console.log("Top conversations:", JSON.stringify(convs, null, 2));

  for (const c of convs) {
    const { data: msgs } = await supabase
      .from('messages')
      .select('created_at, content, metadata, sender_type')
      .eq('conversation_id', c.id)
      .order('created_at', { ascending: false })
      .limit(3);
    console.log(`\nMessages for ${c.id}:`);
    console.log(JSON.stringify(msgs, null, 2));
  }
}
run();
