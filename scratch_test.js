const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const orgId = "ec2f8436-05dc-4621-8a7f-57202f865b8e";
  const user1 = "28caf0b5-57fd-47c9-8d9c-ed1166171bee";
  const user2 = "d5b082b5-18c4-4507-a814-edd74eb38ad7";

  console.log("Checking existing...");
  const { data: existingChats, error: err1 } = await supabase
    .from('team_chat_members')
    .select('chat_id')
    .eq('user_id', user1);
  console.log("Existing for user1:", existingChats, err1);

  console.log("Creating new...");
  const { data: newChat, error: err2 } = await supabase
    .from('team_chats')
    .insert({ org_id: orgId, type: 'direct' })
    .select()
    .single();
  console.log("New chat:", newChat, err2);

  if (newChat) {
    const { error: err3 } = await supabase
      .from('team_chat_members')
      .insert([
        { chat_id: newChat.id, user_id: user1 },
        { chat_id: newChat.id, user_id: user2 }
      ]);
    console.log("Members insert error:", err3);
  }
}
run();
