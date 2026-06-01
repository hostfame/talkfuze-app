import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function test() {
  const orgId = "e57cb8c0-c75c-43f1-94ef-65bc08b981de" // Assuming this is valid from some known org
  // I will just fetch an org id and two users to test
  const { data: users } = await supabase.from('users').select('id, org_id').limit(2)
  if (users && users.length === 2) {
    console.log("Users:", users)
    const res = await supabase.from('team_chats').insert({
      org_id: users[0].org_id,
      type: 'direct'
    }).select().single()
    console.log("Insert result:", res)
  }
}
test()
