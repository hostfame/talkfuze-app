import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = "https://fyuymnldgvfvdqcnbsxh.supabase.co"
const SUPABASE_SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ5dXltbmxkZ3ZmdmRxY25ic3hoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODgxNzUwNiwiZXhwIjoyMDk0MzkzNTA2fQ.fkZvxGkgW3yktVkLUxmOaEEdVRTymtrFK4uOj9Wa66A"

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

async function test() {
  const { data: messages, error: err2 } = await supabaseAdmin.from('team_messages').select('*').order('created_at', { ascending: false }).limit(5)
  console.log('Recent messages:', messages, err2)
}
test()
