require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')
global.WebSocket = require('ws')

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function check() {
  const { data, error } = await supabase.rpc('execute_sql', { sql: 'SELECT * FROM net._http_response ORDER BY id DESC LIMIT 5;' })
  if (error) console.error(error)
  else console.log(data)
}
check()
