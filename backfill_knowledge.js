require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')
global.WebSocket = require('ws')

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function backfill() {
  console.log("Starting backfill for chats older than 24h...")

  // Find conversations older than 24h that are not closed
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  
  const { data: convs, error: fetchErr } = await supabase
    .from('conversations')
    .select('id, status, last_message_at')
    .neq('status', 'closed')
    .lt('last_message_at', twentyFourHoursAgo)

  if (fetchErr) {
    console.error("Error fetching conversations:", fetchErr)
    return
  }

  console.log(`Found ${convs.length} conversations to archive and process.`)

  if (convs.length === 0) {
    console.log("No old conversations found.")
    return
  }

  // Update them to closed. The webhook will automatically trigger for each!
  for (const conv of convs) {
    console.log(`Closing conversation: ${conv.id}`)
    const { error: updateErr } = await supabase
      .from('conversations')
      .update({ status: 'closed' })
      .eq('id', conv.id)

    if (updateErr) {
      console.error(`Error closing ${conv.id}:`, updateErr)
    } else {
      console.log(`Successfully closed ${conv.id} - Webhook triggered!`)
    }
    
    // Slight delay to avoid hammering the webhook/OpenAI
    await new Promise(r => setTimeout(r, 500))
  }

  console.log("Backfill complete! Check the AI Dashboard.")
}

backfill()
