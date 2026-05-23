require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  console.log('Fetching conversations with recent activity...');
  
  // Just get all conversations that have a recent last_message_at
  const { data: convs, error } = await supabase
    .from('conversations')
    .select('id, last_message_at')
    .order('last_message_at', { ascending: false })
    .limit(500);
    
  if (error) {
    console.error(error);
    return;
  }
  
  let fixedCount = 0;
  
  for (const c of convs) {
    // Find the real last message (not system page_view)
    const { data: msgs } = await supabase
      .from('messages')
      .select('created_at, sender_type, metadata')
      .eq('conversation_id', c.id)
      .order('created_at', { ascending: false })
      .limit(20);
      
    if (!msgs || msgs.length === 0) continue;
    
    let realLastMsg = null;
    for (const m of msgs) {
      if (m.sender_type === 'system') {
        const meta = typeof m.metadata === 'string' ? JSON.parse(m.metadata) : m.metadata;
        if (meta?.event === 'page_view') continue;
      }
      realLastMsg = m;
      break;
    }
    
    if (realLastMsg && realLastMsg.created_at !== c.last_message_at) {
      const dbTime = new Date(c.last_message_at).getTime();
      const realTime = new Date(realLastMsg.created_at).getTime();
      
      // If the difference is more than 1 second, fix it
      if (Math.abs(dbTime - realTime) > 1000) {
        console.log(`Fixing conv ${c.id}: ${c.last_message_at} -> ${realLastMsg.created_at}`);
        await supabase
          .from('conversations')
          .update({ last_message_at: realLastMsg.created_at })
          .eq('id', c.id);
        fixedCount++;
      }
    }
  }
  
  console.log(`Done! Fixed ${fixedCount} conversations.`);
}

run();
