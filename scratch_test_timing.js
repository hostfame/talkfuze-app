const { createClient } = require('@supabase/supabase-js');

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

async function test() {
  const start = Date.now();
  const chatId = 'aeb39cae-3de8-48d5-9dac-63ab0a8e1394';
  
  const { data, error } = await supabaseAdmin
    .from('team_messages')
    .select(`
      id,
      chat_id,
      sender_id,
      content,
      created_at,
      users!team_messages_sender_id_fkey(name, avatar_url)
    `)
    .eq('chat_id', chatId)
    .order('created_at', { ascending: true })
    .limit(100);
    
  console.log(`Time: ${Date.now() - start}ms`, { count: data?.length, error });
}

test();
