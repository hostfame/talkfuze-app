const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
global.WebSocket = require('ws');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  // Fetch recently failed messages (created in the last 24 hours)
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data: messages, error } = await supabase
    .from('messages')
    .select('id, content, sender_type, metadata, status, created_at')
    .eq('status', 'failed')
    .in('sender_type', ['agent', 'ai'])
    .gt('created_at', oneDayAgo);

  if (error) {
    console.error('Fetch Error:', error);
    return;
  }

  console.log(`Found ${messages.length} failed outbound messages in last 24h.`);

  let resetCount = 0;
  for (const msg of messages) {
    console.log(`Resetting message ${msg.id}: "${msg.content.slice(0, 50)}..."`);
    
    // Clear delivery errors from metadata
    const updatedMeta = { ...(msg.metadata || {}) };
    delete updatedMeta.delivery_error;
    delete updatedMeta.delivery_failed_at;

    const { error: updateErr } = await supabase
      .from('messages')
      .update({
        status: 'sent',
        platform_message_id: null,
        metadata: updatedMeta
      })
      .eq('id', msg.id);

    if (updateErr) {
      console.error(`Failed to reset message ${msg.id}:`, updateErr.message);
    } else {
      resetCount++;
    }
  }

  console.log(`Successfully reset ${resetCount} failed messages to 'sent' status.`);
}

run();
