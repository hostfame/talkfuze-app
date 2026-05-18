require('dotenv').config({ path: '.env.production' })
const { createClient } = require('@supabase/supabase-js')
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
async function go() {
  const { data, error } = await supabase.auth.admin.listUsers()
  if (error) console.error(error)
  else console.log(data.users.map(u => u.email))
}
go()
