"use server"
import { supabaseAdmin } from "@/lib/supabase-admin"
import { unstable_noStore as noStore } from "next/cache"

export async function getLeaderboardStats(orgId: string, period: 'daily' | 'weekly' | 'monthly' | 'custom' = 'daily', customStartDate?: string, customEndDate?: string) {
  noStore();
  if (!orgId) return [];

  const now = new Date();
  
  // Bangladesh local midnight start date (UTC+6 offset)
  const bdMidnight = new Date(now.getTime() + 6 * 60 * 60 * 1000);
  bdMidnight.setUTCHours(0, 0, 0, 0);
  const localMidnight = new Date(bdMidnight.getTime() - 6 * 60 * 60 * 1000);
  
  let startDate = new Date(localMidnight);
  let endDate = new Date();
  
  if (period === 'weekly') {
    startDate.setDate(localMidnight.getDate() - 7);
  } else if (period === 'monthly') {
    startDate.setDate(localMidnight.getDate() - 30);
  } else if (period === 'custom' && customStartDate) {
    startDate = new Date(customStartDate);
    // Ensure it's treated as BD midnight for that date
    startDate.setUTCHours(0,0,0,0);
    startDate = new Date(startDate.getTime() - 6 * 60 * 60 * 1000);
    
    if (customEndDate) {
      endDate = new Date(customEndDate);
      endDate.setUTCHours(23,59,59,999);
      endDate = new Date(endDate.getTime() - 6 * 60 * 60 * 1000);
    }
  }

  // BD today/yesterday boundaries
  const bdToday = new Date(now.getTime() + 6 * 60 * 60 * 1000);
  bdToday.setUTCHours(0, 0, 0, 0);
  const todayStart = new Date(bdToday.getTime() - 6 * 60 * 60 * 1000);

  const bdYesterday = new Date(bdToday.getTime() - 24 * 60 * 60 * 1000);
  const yesterdayStart = new Date(bdYesterday.getTime() - 6 * 60 * 60 * 1000);
  const yesterdayEnd = new Date(todayStart.getTime() - 1);

  // 1. Get all users with created_at for tenure
  const { data: agents } = await supabaseAdmin
    .from('users')
    .select('id, name, avatar_url, role, created_at')
    .eq('org_id', orgId);
    
  if (!agents) return [];

  // 2. Get all messages in this period
  let messagesQuery = supabaseAdmin
    .from('messages')
    .select('id, sender_id, sender_type, conversation_id, created_at, is_internal, content')
    .eq('org_id', orgId)
    .gte('created_at', startDate.toISOString());
    
  if (period === 'custom') {
    messagesQuery = messagesQuery.lte('created_at', endDate.toISOString());
  }
  
  const { data: allMessages } = await messagesQuery.order('created_at', { ascending: true });

  // 3. Fetch last 14 days messages for hourly heatmap (always, regardless of selected period)
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
  const { data: recentMessages } = await supabaseAdmin
    .from('messages')
    .select('sender_id, created_at, sender_type, is_internal')
    .eq('org_id', orgId)
    .eq('sender_type', 'agent')
    .eq('is_internal', false)
    .gte('created_at', fourteenDaysAgo.toISOString())
    .order('created_at', { ascending: true });

  // 4. Get call logs in this period
  let calls: any[] = [];
  try {
    let callLogsQuery = supabaseAdmin
      .from('call_logs')
      .select('agent_name, duration_seconds')
      .eq('org_id', orgId)
      .gte('created_at', startDate.toISOString());
      
    if (period === 'custom') {
      callLogsQuery = callLogsQuery.lte('created_at', endDate.toISOString());
    }
    
    const { data: callLogs } = await callLogsQuery;
    if (callLogs) {
      calls = callLogs;
    }
  } catch (err) {
    console.error("Error fetching call logs for leaderboard:", err);
  }

  // 5. Get heartbeats for active time
  let heartbeats: any[] = [];
  try {
    let heartbeatsQuery = supabaseAdmin
      .from('agent_activity_heartbeats')
      .select('agent_id')
      .eq('org_id', orgId)
      .gte('created_at', startDate.toISOString());
      
    if (period === 'custom') {
      heartbeatsQuery = heartbeatsQuery.lte('created_at', endDate.toISOString());
    }
    
    const { data: heartbeatLogs } = await heartbeatsQuery;
    if (heartbeatLogs) {
      heartbeats = heartbeatLogs;
    }
  } catch (err) {
    console.error("Error fetching heartbeats for active time:", err);
  }

  // 6. Get resolved conversations to compute resolvedCount per agent
  // We need conversations that are resolved AND the agent sent at least 1 message in them
  let resolvedConvIds = new Set<string>();
  try {
    const { data: resolvedConvs } = await supabaseAdmin
      .from('conversations')
      .select('id')
      .eq('org_id', orgId)
      .eq('status', 'resolved');
    if (resolvedConvs) {
      resolvedConvs.forEach((c: any) => resolvedConvIds.add(c.id));
    }
  } catch (err) {
    console.error("Error fetching resolved conversations:", err);
  }

  // 7. Process stats per agent
  const statsMap: Record<string, any> = {};
  
  agents.forEach(agent => {
    statsMap[agent.id] = {
      id: agent.id,
      name: agent.name,
      avatar_url: agent.avatar_url,
      role: agent.role,
      joinedAt: agent.created_at || null,
      messagesCount: 0,
      whispersCount: 0,
      chatsCount: 0,
      callsCount: 0,
      totalCallDuration: 0,
      activeMinutes: 0,
      actionsPerHour: 0,
      avgResponseTime: 0,
      totalResponseTimeMs: 0,
      responseTimeCount: 0,
      firstResponseSlaPercent: 100,
      totalFirstResponses: 0,
      firstResponsesUnder60s: 0,
      emergencyResponseTime: 0,
      totalEmergencyResponseTimeMs: 0,
      emergencyResponseTimeCount: 0,
      escalatedTicketsCount: 0,
      aiDraftCount: 0,
      aiAssistedPercent: 0,
      resolvedCount: 0,
      msgsToday: 0,
      msgsYesterday: 0,
      // hourlyActivity[h] = message count in hour h (BDT, 0-23) over last 14 days
      hourlyActivity: new Array(24).fill(0),
      // dailyTrend: last 7 days
      dailyTrend: [] as { day: string; count: number }[],
    };
  });

  // Count heartbeats
  if (heartbeats.length > 0) {
    heartbeats.forEach(hb => {
      if (statsMap[hb.agent_id]) {
        statsMap[hb.agent_id].activeMinutes++;
      }
    });
  }

  // Match calls by agent name
  if (calls.length > 0) {
    calls.forEach(call => {
      if (!call.agent_name) return;
      const matchedAgent = agents.find(a => {
        const agentName = a.name.toLowerCase();
        const callName = call.agent_name.toLowerCase();
        return agentName === callName || agentName.startsWith(callName) || callName.startsWith(agentName);
      });
      if (matchedAgent) {
        const stats = statsMap[matchedAgent.id];
        stats.callsCount++;
        stats.totalCallDuration += call.duration_seconds || 0;
      }
    });
  }

  if (allMessages && allMessages.length > 0) {
    const agentChats: Record<string, Set<string>> = {};
    const agentTimestamps: Record<string, number[]> = {};
    const agentConvSet: Record<string, Set<string>> = {}; // all convs agent touched in period
    
    const convMessages: Record<string, typeof allMessages> = {};

    allMessages.forEach(msg => {
      // Group by conversation for response time
      if (!convMessages[msg.conversation_id]) {
        convMessages[msg.conversation_id] = [];
      }
      convMessages[msg.conversation_id].push(msg);

      if (msg.sender_type === 'agent') {
        const agentId = msg.sender_id;
        if (!agentId || !statsMap[agentId]) return;

        if (msg.is_internal) {
          statsMap[agentId].whispersCount++;
        } else {
          statsMap[agentId].messagesCount++;
        }
        
        if (!agentChats[agentId]) agentChats[agentId] = new Set();
        agentChats[agentId].add(msg.conversation_id);

        if (!agentConvSet[agentId]) agentConvSet[agentId] = new Set();
        agentConvSet[agentId].add(msg.conversation_id);

        if (!agentTimestamps[agentId]) agentTimestamps[agentId] = [];
        agentTimestamps[agentId].push(new Date(msg.created_at).getTime());
      } else if (msg.sender_type === 'system' && msg.sender_id && statsMap[msg.sender_id]) {
        const contentStr = (msg.content || '').toLowerCase();
        if (contentStr.includes('ticket is created')) {
          statsMap[msg.sender_id].escalatedTicketsCount++;
        }
      }
    });

    // Compute resolvedCount: conversations the agent touched that are resolved
    Object.keys(agentConvSet).forEach(agentId => {
      if (!statsMap[agentId]) return;
      let resolved = 0;
      agentConvSet[agentId].forEach(convId => {
        if (resolvedConvIds.has(convId)) resolved++;
      });
      statsMap[agentId].resolvedCount = resolved;
    });

    // Calculate response times & hosting SLAs
    Object.values(convMessages).forEach(msgs => {
      let isEmergency = false;
      msgs.forEach(msg => {
        if (msg.sender_type === 'contact') {
          const contentLower = (msg.content || '').toLowerCase();
          if (
            contentLower.includes('down') ||
            contentLower.includes('500') ||
            contentLower.includes('502') ||
            contentLower.includes('database') ||
            contentLower.includes('nameserver') ||
            contentLower.includes('critical') ||
            contentLower.includes('error establishing')
          ) {
            isEmergency = true;
          }
        }
      });

      let lastContactTime: number | null = null;
      let isFirstResponse = true;

      msgs.forEach(msg => {
        if (msg.sender_type === 'contact') {
          if (lastContactTime === null) {
            lastContactTime = new Date(msg.created_at).getTime();
          }
        } else if (msg.sender_type === 'agent' && !msg.is_internal) {
          const agentId = msg.sender_id;
          if (agentId && lastContactTime !== null && statsMap[agentId]) {
            const replyTime = new Date(msg.created_at).getTime();
            const diffMs = replyTime - lastContactTime;
            
            if (diffMs > 0 && diffMs < 12 * 60 * 60 * 1000) {
              statsMap[agentId].totalResponseTimeMs += diffMs;
              statsMap[agentId].responseTimeCount++;

              if (isEmergency) {
                statsMap[agentId].totalEmergencyResponseTimeMs += diffMs;
                statsMap[agentId].emergencyResponseTimeCount++;
              }

              if (isFirstResponse) {
                statsMap[agentId].totalFirstResponses++;
                if (diffMs < 60 * 1000) {
                  statsMap[agentId].firstResponsesUnder60s++;
                }
                isFirstResponse = false;
              }
            }
            
            lastContactTime = null;
          }
        }
      });
    });

    // Finalise chat counts
    Object.keys(statsMap).forEach(agentId => {
      const stats = statsMap[agentId];
      if (agentChats[agentId]) {
        stats.chatsCount = agentChats[agentId].size;
      }
      if (stats.responseTimeCount > 0) {
        const avgMs = stats.totalResponseTimeMs / stats.responseTimeCount;
        stats.avgResponseTime = Math.round((avgMs / (60 * 1000)) * 10) / 10;
      }
      if (stats.totalFirstResponses > 0) {
        stats.firstResponseSlaPercent = Math.round((stats.firstResponsesUnder60s / stats.totalFirstResponses) * 100);
      } else {
        stats.firstResponseSlaPercent = 100;
      }
      if (stats.emergencyResponseTimeCount > 0) {
        const avgEmergencyMs = stats.totalEmergencyResponseTimeMs / stats.emergencyResponseTimeCount;
        stats.emergencyResponseTime = Math.round(avgEmergencyMs / 1000);
      } else {
        stats.emergencyResponseTime = 0;
      }
    });
  }

  // 8. Compute hourlyActivity (last 14 days, BDT hour 0-23) and msgsToday/msgsYesterday from recentMessages
  if (recentMessages && recentMessages.length > 0) {
    recentMessages.forEach(msg => {
      const agentId = msg.sender_id;
      if (!agentId || !statsMap[agentId]) return;

      const msgTime = new Date(msg.created_at);
      // Convert to BDT: UTC+6
      const bdtTime = new Date(msgTime.getTime() + 6 * 60 * 60 * 1000);
      const hour = bdtTime.getUTCHours(); // 0-23 in BDT

      statsMap[agentId].hourlyActivity[hour]++;

      // Today vs yesterday
      const msgMs = msgTime.getTime();
      if (msgMs >= todayStart.getTime()) {
        statsMap[agentId].msgsToday++;
      } else if (msgMs >= yesterdayStart.getTime() && msgMs <= yesterdayEnd.getTime()) {
        statsMap[agentId].msgsYesterday++;
      }
    });
  }

  // 9. Compute dailyTrend (last 7 days per agent) using recentMessages
  if (recentMessages && recentMessages.length > 0) {
    // Build 7-day labels (BDT dates, oldest first)
    const sevenDaysLabels: string[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getTime() + 6 * 60 * 60 * 1000 - i * 24 * 60 * 60 * 1000);
      const label = d.toISOString().split('T')[0]; // YYYY-MM-DD in BDT
      sevenDaysLabels.push(label);
    }

    // Initialize per-agent trend buckets
    Object.keys(statsMap).forEach(agentId => {
      const buckets: Record<string, number> = {};
      sevenDaysLabels.forEach(day => { buckets[day] = 0; });
      statsMap[agentId]._trendBuckets = buckets;
    });

    const sevenDaysAgo = new Date(now.getTime() + 6 * 60 * 60 * 1000 - 7 * 24 * 60 * 60 * 1000);

    recentMessages.forEach(msg => {
      const agentId = msg.sender_id;
      if (!agentId || !statsMap[agentId]) return;
      const msgTime = new Date(msg.created_at);
      if (msgTime.getTime() < sevenDaysAgo.getTime()) return;
      const bdtTime = new Date(msgTime.getTime() + 6 * 60 * 60 * 1000);
      const dayLabel = bdtTime.toISOString().split('T')[0];
      if (statsMap[agentId]._trendBuckets[dayLabel] !== undefined) {
        statsMap[agentId]._trendBuckets[dayLabel]++;
      }
    });

    // Convert buckets to sorted array
    Object.keys(statsMap).forEach(agentId => {
      const buckets = statsMap[agentId]._trendBuckets;
      statsMap[agentId].dailyTrend = sevenDaysLabels.map(day => ({ day, count: buckets[day] || 0 }));
      delete statsMap[agentId]._trendBuckets;
    });
  } else {
    // Fill empty trend
    Object.keys(statsMap).forEach(agentId => {
      statsMap[agentId].dailyTrend = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(now.getTime() + 6 * 60 * 60 * 1000 - (6 - i) * 24 * 60 * 60 * 1000);
        return { day: d.toISOString().split('T')[0], count: 0 };
      });
    });
  }

  // 10. Query AI draft usage
  try {
    let aiDraftsQuery = supabaseAdmin
      .from('ai_draft_logs')
      .select('agent_id')
      .eq('org_id', orgId)
      .gte('created_at', startDate.toISOString());
      
    if (period === 'custom') {
      aiDraftsQuery = aiDraftsQuery.lte('created_at', endDate.toISOString());
    }
      
    const { data: aiDrafts } = await aiDraftsQuery;

    if (aiDrafts) {
      aiDrafts.forEach(draft => {
        if (draft.agent_id && statsMap[draft.agent_id]) {
          statsMap[draft.agent_id].aiDraftCount++;
        }
      });
    }
  } catch (err) {
    console.error("Error fetching AI draft stats:", err);
  }

  // 11. Calculate AI assisted % and Actions Per Hour
  Object.values(statsMap).forEach((stats: any) => {
    if (stats.messagesCount > 0) {
      stats.aiAssistedPercent = Math.round((stats.aiDraftCount / stats.messagesCount) * 100);
    }
    const totalActions = stats.messagesCount + stats.whispersCount + stats.callsCount;
    const activeHours = stats.activeMinutes / 60;
    if (activeHours > 0) {
      stats.actionsPerHour = Math.round((totalActions / activeHours) * 10) / 10;
    } else {
      stats.actionsPerHour = 0;
    }
  });

  return Object.values(statsMap).sort((a: any, b: any) => b.messagesCount - a.messagesCount);
}

export async function getMissedChatsStats(orgId: string, period: 'daily' | 'weekly' | 'monthly' | 'custom' = 'daily', customStartDate?: string, customEndDate?: string) {
  noStore();
  if (!orgId) return [];

  const now = new Date();
  
  // Bangladesh local midnight start date (UTC+6 offset)
  const bdMidnight = new Date(now.getTime() + 6 * 60 * 60 * 1000);
  bdMidnight.setUTCHours(0, 0, 0, 0);
  const localMidnight = new Date(bdMidnight.getTime() - 6 * 60 * 60 * 1000);
  
  let startDate = new Date(localMidnight);
  let endDate = new Date();
  
  if (period === 'weekly') {
    startDate.setDate(localMidnight.getDate() - 7);
  } else if (period === 'monthly') {
    startDate.setDate(localMidnight.getDate() - 30);
  } else if (period === 'custom' && customStartDate) {
    startDate = new Date(customStartDate);
    startDate.setUTCHours(0,0,0,0);
    startDate = new Date(startDate.getTime() - 6 * 60 * 60 * 1000);
    
    if (customEndDate) {
      endDate = new Date(customEndDate);
      endDate.setUTCHours(23,59,59,999);
      endDate = new Date(endDate.getTime() - 6 * 60 * 60 * 1000);
    }
  }

  // Get all conversations
  let query = supabaseAdmin
    .from('conversations')
    .select(`
      id,
      created_at,
      status,
      messages (
        id,
        content,
        sender_type,
        created_at
      ),
      contacts (
        id,
        name,
        phone
      )
    `)
    .eq('org_id', orgId)
    .gte('last_message_at', startDate.toISOString());
    
  if (period === 'custom') {
    query = query.lte('last_message_at', endDate.toISOString());
  }

  const { data: conversations, error } = await query;
  if (error || !conversations) {
    console.error("Error fetching conversations for missed chats:", error);
    return [];
  }

  const missedChats: any[] = [];

  conversations.forEach(conv => {
    if (!conv.messages || conv.messages.length === 0) return;
    
    const msgs = [...conv.messages].sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    
    const lastMsg = msgs[msgs.length - 1];
    if (lastMsg.sender_type === 'contact') {
      const msgTime = new Date(lastMsg.created_at).getTime();
      const timeDiffMins = (now.getTime() - msgTime) / (1000 * 60);
      
      if (timeDiffMins >= 30) {
        const contact = Array.isArray(conv.contacts) ? conv.contacts[0] : conv.contacts;
        missedChats.push({
          id: conv.id,
          contactName: contact?.name || contact?.phone || 'Unknown',
          contactPhone: contact?.phone || '',
          lastMessageTime: lastMsg.created_at,
          lastMessageContent: lastMsg.content,
          status: conv.status,
          timeSinceLastMessage: Math.floor(timeDiffMins)
        });
      }
    }
  });

  return missedChats.sort((a, b) => new Date(b.lastMessageTime).getTime() - new Date(a.lastMessageTime).getTime());
}
