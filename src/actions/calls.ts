"use server"

import { createClient } from "@/lib/supabase/server"
import { supabaseAdmin } from "@/lib/supabase-admin"

export async function getCallLogs(orgId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Unauthorized")

  try {
    const { data, error } = await supabaseAdmin
      .from('call_logs')
      .select('*')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) {
      console.error('Error fetching call logs:', error)
      return []
    }
    
    return data || []
  } catch (err) {
    console.error("Call logs fetch failed. Table might not exist yet.", err)
    return []
  }
}
