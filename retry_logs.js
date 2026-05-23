require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')
global.WebSocket = require('ws')

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function retry() {
  console.log("Fetching logs...")
  const { data: logs, error } = await supabase
    .from('ai_training_logs')
    .select('*')
    .in('status', ['pending', 'processing', 'failed'])

  if (error) {
    console.error(error)
    return
  }

  console.log(`Found ${logs.length} pending logs to retry.`)

  for (const log of logs) {
    console.log(`Triggering edge function for log: ${log.id}`)
    try {
      const res = await fetch('https://fyuymnldgvfvdqcnbsxh.supabase.co/functions/v1/distill-chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          type: 'INSERT',
          table: 'ai_training_logs',
          schema: 'public',
          record: log
        })
      })

      if (!res.ok) {
        console.error(`Error for ${log.id}: ${res.statusText}`)
        const errText = await res.text()
        console.error(errText)
      } else {
        console.log(`Success for ${log.id}`)
      }
    } catch (e) {
      console.error(e)
    }

    // Small delay
    await new Promise(r => setTimeout(r, 500))
  }
}

retry()
