"use server"

import { supabaseAdmin } from "@/lib/supabase-admin"
import { unstable_noStore as noStore } from "next/cache"

export async function getCSATFeedback(orgId: string) {
  noStore()
  if (!orgId) return []
  const { data, error } = await supabaseAdmin
    .from("csat_feedbacks")
    .select(`
      *,
      conversation:conversations(
        id,
        contact:contacts(name, email, phone)
      ),
      agent:users(id, name, avatar_url)
    `)
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })

  if (error) {
    console.error("Error fetching CSAT feedback:", error)
    return []
  }
  return data || []
}

export async function submitCSATFeedback(
  orgId: string, 
  conversationId: string, 
  agentId: string | null, 
  rating: number, 
  comment: string | null
) {
  if (!orgId || !conversationId || !rating) throw new Error("Missing required fields")
  if (rating < 1 || rating > 5) throw new Error("Rating must be between 1 and 5")

  const { data, error } = await supabaseAdmin
    .from("csat_feedbacks")
    .insert([{
      org_id: orgId,
      conversation_id: conversationId,
      agent_id: agentId,
      rating,
      comment
    }])
    .select()

  if (error) {
    console.error("Error submitting CSAT feedback:", error)
    throw new Error(error.message)
  }
  return data[0]
}

export async function getCSATAverage(orgId: string) {
  noStore()
  if (!orgId) return { average: 0, count: 0 }
  const { data, error } = await supabaseAdmin
    .from("csat_feedbacks")
    .select("rating")
    .eq("org_id", orgId)

  if (error || !data || data.length === 0) {
    return { average: 0, count: 0 }
  }

  const sum = data.reduce((acc, curr) => acc + curr.rating, 0)
  const average = Math.round((sum / data.length) * 10) / 10
  return { average, count: data.length }
}
