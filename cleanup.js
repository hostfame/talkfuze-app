require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

async function run() {
  // Find all system voice call messages
  const { data: msgs } = await supabase.from('messages')
    .select('id, conversation_id, metadata, created_at, content')
    .ilike('content', '%Voice call%')
    .order('created_at', { ascending: false });

  if (!msgs) return;

  const toDelete = [];
  const convMap = {};

  for (const msg of msgs) {
    if (!convMap[msg.conversation_id]) convMap[msg.conversation_id] = [];
    convMap[msg.conversation_id].push(msg);
  }

  for (const convId in convMap) {
    const list = convMap[convId];
    // Group messages by time proximity (within 30 seconds)
    let currentGroup = [];
    for (const msg of list) {
      if (currentGroup.length === 0) {
        currentGroup.push(msg);
      } else {
        const timeDiff = new Date(currentGroup[0].created_at).getTime() - new Date(msg.created_at).getTime();
        if (timeDiff < 30000) {
          currentGroup.push(msg);
        } else {
          // Process previous group
          processGroup(currentGroup, toDelete);
          currentGroup = [msg];
        }
      }
    }
    if (currentGroup.length > 0) processGroup(currentGroup, toDelete);
  }

  function processGroup(group, deleteList) {
    if (group.length <= 1) return;
    
    let hasAnswered = false;
    let answeredId = null;

    for (const m of group) {
      let meta = typeof m.metadata === 'string' ? JSON.parse(m.metadata) : (m.metadata || {});
      // Check if it's actually an answered call
      if (meta.status === 'ANSWERED' || (meta.duration && meta.duration !== '0s' && meta.duration !== '0:00')) {
        hasAnswered = true;
        answeredId = m.id;
        break;
      }
    }

    if (hasAnswered) {
      // Delete all others in this group
      for (const m of group) {
        if (m.id !== answeredId) deleteList.push(m.id);
      }
    } else {
      // Keep only one cancelled
      for (let i = 1; i < group.length; i++) {
        deleteList.push(group[i].id);
      }
    }
  }

  console.log('Found', toDelete.length, 'duplicates to delete');
  if (toDelete.length > 0) {
    for (const id of toDelete) {
       await supabase.from('messages').delete().eq('id', id);
    }
    console.log('Deleted successfully');
  }
}
run();
