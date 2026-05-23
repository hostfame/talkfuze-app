import { supabaseAdmin } from "./src/lib/supabase-admin";

async function run() {
  const { data: convs } = await supabaseAdmin
    .from('conversations')
    .select('id, last_message_at')
    .order('last_message_at', { ascending: false })
    .limit(10);
    
  console.log("Top conversations:", JSON.stringify(convs, null, 2));

  for (const c of convs || []) {
    const { data: msgs } = await supabaseAdmin
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
