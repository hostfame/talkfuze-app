"use server"

import { supabaseAdmin } from "@/lib/supabase-admin"
import { unstable_noStore as noStore } from "next/cache"
import { format } from "date-fns"

export async function getVolumeStats(orgId: string, days: number = 30) {
  noStore()
  if (!orgId) return []

  // Calculate local time for Bangladesh (UTC+6)
  const now = new Date()
  const bdNow = new Date(now.getTime() + 6 * 60 * 60 * 1000)
  bdNow.setUTCHours(0, 0, 0, 0)
  const localMidnight = new Date(bdNow.getTime() - 6 * 60 * 60 * 1000)

  let startDate = new Date(localMidnight)
  startDate.setDate(localMidnight.getDate() - days + 1)

  const { data: messages, error: messagesError } = await supabaseAdmin
    .from('messages')
    .select('id, created_at, sender_type')
    .eq('org_id', orgId)
    .gte('created_at', startDate.toISOString())
    .order('created_at', { ascending: true })

  const { data: conversations, error: convError } = await supabaseAdmin
    .from('conversations')
    .select('id, created_at')
    .eq('org_id', orgId)
    .gte('created_at', startDate.toISOString())

  if (messagesError) console.error("Error fetching messages for reports:", messagesError)
  if (convError) console.error("Error fetching conversations for reports:", convError)

  const grouped: Record<string, { date: string, messages: number, customerMessages: number, agentMessages: number, newChats: number }> = {}

  for (let i = 0; i < days; i++) {
    const d = new Date(startDate)
    d.setDate(startDate.getDate() + i)
    // Offset for BD time formatting
    const dStr = format(new Date(d.getTime() + 6 * 60 * 60 * 1000), 'yyyy-MM-dd')
    grouped[dStr] = { date: dStr, messages: 0, customerMessages: 0, agentMessages: 0, newChats: 0 }
  }

  if (messages) {
    messages.forEach(msg => {
      const msgDate = new Date(msg.created_at)
      const bdTime = new Date(msgDate.getTime() + 6 * 60 * 60 * 1000)
      const dStr = format(bdTime, 'yyyy-MM-dd')
      if (grouped[dStr]) {
        grouped[dStr].messages++
        if (msg.sender_type === 'contact') grouped[dStr].customerMessages++
        if (msg.sender_type === 'agent') grouped[dStr].agentMessages++
      }
    })
  }

  if (conversations) {
    conversations.forEach(conv => {
      const convDate = new Date(conv.created_at)
      const bdTime = new Date(convDate.getTime() + 6 * 60 * 60 * 1000)
      const dStr = format(bdTime, 'yyyy-MM-dd')
      if (grouped[dStr]) {
        grouped[dStr].newChats++
      }
    })
  }

  return Object.values(grouped).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
}
