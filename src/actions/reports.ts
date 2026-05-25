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

  // Fetch all messages overcoming the 1000 row limit
  let messages: any[] = []
  let hasMoreMessages = true
  let msgPage = 0
  const pageSize = 1000

  while (hasMoreMessages) {
    const { data, error } = await supabaseAdmin
      .from('messages')
      .select('id, created_at, sender_type')
      .eq('org_id', orgId)
      .gte('created_at', startDate.toISOString())
      .range(msgPage * pageSize, (msgPage + 1) * pageSize - 1)
      .order('created_at', { ascending: true })

    if (error) {
      console.error("Error fetching messages for reports:", error)
      break
    }
    
    if (data) {
      messages.push(...data)
      if (data.length < pageSize) hasMoreMessages = false
      else msgPage++
    } else {
      hasMoreMessages = false
    }
  }

  // Fetch all conversations overcoming the 1000 row limit
  let conversations: any[] = []
  let hasMoreConv = true
  let convPage = 0

  while (hasMoreConv) {
    const { data, error } = await supabaseAdmin
      .from('conversations')
      .select('id, created_at')
      .eq('org_id', orgId)
      .gte('created_at', startDate.toISOString())
      .range(convPage * pageSize, (convPage + 1) * pageSize - 1)

    if (error) {
      console.error("Error fetching conversations for reports:", error)
      break
    }
    
    if (data) {
      conversations.push(...data)
      if (data.length < pageSize) hasMoreConv = false
      else convPage++
    } else {
      hasMoreConv = false
    }
  }

  const grouped: Record<string, { date: string, messages: number, customerMessages: number, agentMessages: number, newChats: number, revenue: number }> = {}

  for (let i = 0; i < days; i++) {
    const d = new Date(startDate)
    d.setDate(startDate.getDate() + i)
    // Offset for BD time formatting
    const dStr = format(new Date(d.getTime() + 6 * 60 * 60 * 1000), 'yyyy-MM-dd')
    grouped[dStr] = { date: dStr, messages: 0, customerMessages: 0, agentMessages: 0, newChats: 0, revenue: 0 }
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

  // Fetch Daily Revenue from WHMCS Bridge
  try {
    const { whmcsRequest } = await import('@/lib/whmcs')
    const revResult = await whmcsRequest<any>('GetDailyRevenue', { days })
    if (revResult && revResult.result === 'success' && revResult.revenue) {
      Object.entries(revResult.revenue).forEach(([dateStr, amount]) => {
        if (grouped[dateStr]) {
          grouped[dateStr].revenue = Number(amount) || 0
        }
      })
    }
  } catch (error) {
    console.error("Failed to fetch WHMCS revenue:", error)
    // Non-fatal, just continue with 0 revenue
  }

  return Object.values(grouped).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
}
