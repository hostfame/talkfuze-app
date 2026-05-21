require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
global.WebSocket = require('ws');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});

async function run() {
  console.log("Fetching conversations with 'alert' tags...");
  const { data: convs, error } = await supabase
    .from('conversations')
    .select('id, tags, contact:contacts(name)')
    .contains('tags', ['alert']);

  if (error) {
    console.error("Error fetching conversations:", error);
    return;
  }

  console.log(`Found ${convs.length} conversations with 'alert' tags.`);

  let restoredCount = 0;

  for (const conv of convs) {
    // Check if there is at least one message from the contact
    const { data: contactMsgs, error: msgErr } = await supabase
      .from('messages')
      .select('id')
      .eq('conversation_id', conv.id)
      .eq('sender_type', 'contact')
      .limit(1);

    if (msgErr) {
      console.error(`Error fetching messages for conversation ${conv.id}:`, msgErr);
      continue;
    }

    if (contactMsgs && contactMsgs.length > 0) {
      const cleanedTags = conv.tags.filter(t => t !== 'alert' && t !== 'automation');
      const contactName = conv.contact?.name || "Unknown";
      
      console.log(`Restoring thread for "${contactName}" (ID: ${conv.id}) - removing alert tags...`);
      
      const { error: updateErr } = await supabase
        .from('conversations')
        .update({ tags: cleanedTags })
        .eq('id', conv.id);

      if (updateErr) {
        console.error(`  -> Failed to update tags for ${conv.id}:`, updateErr);
      } else {
        restoredCount++;
        console.log(`  -> Successfully restored thread!`);
      }
    }
  }

  console.log(`\nSelective tags cleanup complete. Restored ${restoredCount} customer conversations to the main inbox.`);
}

run();
