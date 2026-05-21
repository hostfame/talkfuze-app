require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const ws = require('ws');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin = createClient(supabaseUrl, serviceKey, {
  auth: {
    persistSession: false
  },
  realtime: {
    transport: ws
  }
});

async function check() {
  // Let's find latest messages containing login code or Hostnin
  const { data: msgs, error: msgsError } = await supabaseAdmin
    .from('messages')
    .select('id, content, sender_type, status, error, created_at, conversation_id')
    .like('content', '%Hostnin%')
    .order('created_at', { ascending: false })
    .limit(10);

  if (msgsError) {
    console.error('Error fetching msgs:', msgsError);
    return;
  }

  console.log('Latest Hostnin Outbound Messages:');
  for (const m of msgs) {
    console.log(`- Message ID: ${m.id}`);
    console.log(`  Created: ${m.created_at}`);
    console.log(`  Content: "${m.content.slice(0, 100).replace(/\n/g, ' ')}"`);
    console.log(`  Sender Type: ${m.sender_type}`);
    console.log(`  Status: ${m.status}`);
    console.log(`  Error: ${m.error}`);
    console.log(`  Conversation ID: ${m.conversation_id}`);
    
    // Fetch conversation details
    const { data: conv } = await supabaseAdmin
      .from('conversations')
      .select('*')
      .eq('id', m.conversation_id)
      .maybeSingle();
      
    if (conv) {
      console.log(`  Conversation details:`, conv);
    }
    console.log('----------------------------------------------------');
  }
}

check();
