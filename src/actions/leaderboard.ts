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

  // 7. Process stats per agent
  const statsMap: Record<string, any> = {};
  
  agents.forEach(agent => {
    statsMap[agent.id] = {
      id: agent.id,
      name: agent.name,
      avatar_url: agent.avatar_url,
      role: agent.role,
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
      ticketsCreated: 0,
      aiDraftCount: 0,
      aiAssistedPercent: 0,
      msgsToday: 0,
      msgsYesterday: 0,
      // hourlyActivity[h] = message count in hour h (BST, 0-23) over last 14 days
      hourlyActivity: new Array(24).fill(0),
      // dailyTrend: last 7 days
      dailyTrend: [] as { day: string; count: number }[],
      activeDaysCount: 0,
      peakHour: -1,
      activeShiftText: '',
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



        if (!agentTimestamps[agentId]) agentTimestamps[agentId] = [];
        agentTimestamps[agentId].push(new Date(msg.created_at).getTime());
      } else if (msg.sender_type === 'system' && msg.sender_id && statsMap[msg.sender_id]) {
        const contentStr = (msg.content || '').toLowerCase();
        if (contentStr.includes('ticket is created')) {
          statsMap[msg.sender_id].ticketsCreated++;
        }
      }
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

  // 8. Compute hourlyActivity (last 14 days, BST hour 0-23) and msgsToday/msgsYesterday from recentMessages
  if (recentMessages && recentMessages.length > 0) {
    recentMessages.forEach(msg => {
      const agentId = msg.sender_id;
      if (!agentId || !statsMap[agentId]) return;

      const msgTime = new Date(msg.created_at);
      // Convert to BST: UTC+6
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

  // 8b. Compute peakHour and activeShiftText from hourlyActivity
  Object.keys(statsMap).forEach(agentId => {
    const hourly = statsMap[agentId].hourlyActivity;
    const maxVal = Math.max(...hourly);
    if (maxVal > 0) {
      statsMap[agentId].peakHour = hourly.indexOf(maxVal);
      const threshold = maxVal * 0.1;
      const activeHours = hourly.map((v: number, i: number) => v > threshold ? i : -1).filter((i: number) => i >= 0);
      if (activeHours.length > 0) {
        const formatHr = (h: number) => {
          if (h === 0) return '12AM';
          if (h === 12) return '12PM';
          return h < 12 ? `${h}AM` : `${h - 12}PM`;
        };
        statsMap[agentId].activeShiftText = `${formatHr(activeHours[0])} - ${formatHr((activeHours[activeHours.length - 1] + 1) % 24)}`;
      }
    }
  });

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

    // Convert buckets to sorted array and compute activeDaysCount
    Object.keys(statsMap).forEach(agentId => {
      const buckets = statsMap[agentId]._trendBuckets;
      statsMap[agentId].dailyTrend = sevenDaysLabels.map(day => ({ day, count: buckets[day] || 0 }));
      statsMap[agentId].activeDaysCount = statsMap[agentId].dailyTrend.filter((d: any) => d.count > 0).length;
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

  // Fetch agents for this org
  const { data: agents } = await supabaseAdmin
    .from('users')
    .select('id, name')
    .eq('org_id', orgId);

  // Compute hourly activity per agent (last 14 days) for shift assignment
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
  const { data: recentAgentMsgs } = await supabaseAdmin
    .from('messages')
    .select('sender_id, created_at')
    .eq('org_id', orgId)
    .eq('sender_type', 'agent')
    .eq('is_internal', false)
    .gte('created_at', fourteenDaysAgo.toISOString());

  // Build hourly activity map per agent
  const agentHourlyActivity: Record<string, number[]> = {};
  const agentNames: Record<string, string> = {};
  if (agents) {
    agents.forEach((a: any) => {
      agentHourlyActivity[a.id] = new Array(24).fill(0);
      agentNames[a.id] = a.name;
    });
  }
  if (recentAgentMsgs) {
    recentAgentMsgs.forEach((msg: any) => {
      if (!agentHourlyActivity[msg.sender_id]) return;
      const bdtTime = new Date(new Date(msg.created_at).getTime() + 6 * 60 * 60 * 1000);
      const hour = bdtTime.getUTCHours();
      agentHourlyActivity[msg.sender_id][hour]++;
    });
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
        // Determine which agent should have handled this based on shift activity
        const bdtMsgTime = new Date(msgTime + 6 * 60 * 60 * 1000);
        const missedHour = bdtMsgTime.getUTCHours();
        
        let missedByAgent = 'Unassigned';
        let missedByAgentId = '';
        let maxActivity = 0;
        
        Object.keys(agentHourlyActivity).forEach(agentId => {
          const activity = agentHourlyActivity[agentId][missedHour];
          if (activity > 0 && activity > maxActivity) {
            maxActivity = activity;
            missedByAgent = agentNames[agentId] || 'Unknown';
            missedByAgentId = agentId;
          }
        });

        const contact = Array.isArray(conv.contacts) ? conv.contacts[0] : conv.contacts;
        missedChats.push({
          id: conv.id,
          contactName: contact?.name || contact?.phone || 'Unknown',
          contactPhone: contact?.phone || '',
          lastMessageTime: lastMsg.created_at,
          lastMessageContent: lastMsg.content,
          status: conv.status,
          timeSinceLastMessage: Math.floor(timeDiffMins),
          missedByAgent,
          missedByAgentId
        });
      }
    }
  });

  return missedChats.sort((a, b) => new Date(b.lastMessageTime).getTime() - new Date(a.lastMessageTime).getTime());
}

export async function getAnalyticsStats(orgId: string) {
  noStore();
  if (!orgId) return null;

  const now = new Date();
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

  // 1. Get ALL messages (both contact and agent) from last 14 days
  const { data: allMsgs } = await supabaseAdmin
    .from('messages')
    .select('sender_type, sender_id, created_at, is_internal, content, conversation_id')
    .eq('org_id', orgId)
    .gte('created_at', fourteenDaysAgo.toISOString())
    .order('created_at', { ascending: true });

  if (!allMsgs) return null;

  // 2. Get all agents
  const { data: agents } = await supabaseAdmin
    .from('users')
    .select('id, name')
    .eq('org_id', orgId);

  // 3. Compute CUSTOMER demand by hour (BST)
  const customerDemand = new Array(24).fill(0);
  // 4. Compute AGENT supply by hour (BST) - per agent
  const agentSupply: Record<string, number[]> = {};
  agents?.forEach((a: any) => { agentSupply[a.name] = new Array(24).fill(0); });
  // 5. Combined agent supply
  const totalAgentSupply = new Array(24).fill(0);

  allMsgs.forEach((msg: any) => {
    const msgDate = new Date(msg.created_at);
    const bstHour = (msgDate.getUTCHours() + 6) % 24;

    if (msg.sender_type === 'contact') {
      customerDemand[bstHour]++;
    } else if (msg.sender_type === 'agent' && !msg.is_internal) {
      totalAgentSupply[bstHour]++;
      const agent = agents?.find((a: any) => a.id.toString() === msg.sender_id?.toString());
      if (agent && agentSupply[agent.name]) {
        agentSupply[agent.name][bstHour]++;
      }
    }
  });

  // 6. Coverage gaps: hours where demand > 0 but supply = 0, or understaffed
  const coverageGaps: { hour: number; demand: number; supply: number; agents: string[] }[] = [];
  for (let h = 0; h < 24; h++) {
    const activeAgents = agents?.filter((a: any) => agentSupply[a.name][h] > 0).map((a: any) => a.name) || [];
    if (customerDemand[h] > 0 && totalAgentSupply[h] === 0) {
      coverageGaps.push({ hour: h, demand: customerDemand[h], supply: 0, agents: [] });
    } else if (customerDemand[h] > totalAgentSupply[h] * 1.5 && customerDemand[h] > 10) {
      coverageGaps.push({ hour: h, demand: customerDemand[h], supply: totalAgentSupply[h], agents: activeAgents });
    }
  }

  // 7. Day-of-week grid per agent (0=Sun ... 6=Sat)
  const dayOfWeekGrid: Record<string, number[]> = {};
  agents?.forEach((a: any) => { dayOfWeekGrid[a.name] = new Array(7).fill(0); });

  allMsgs.forEach((msg: any) => {
    if (msg.sender_type === 'agent' && !msg.is_internal) {
      const msgDate = new Date(msg.created_at);
      const bstDate = new Date(msgDate.getTime() + 6 * 60 * 60 * 1000);
      const dow = bstDate.getUTCDay();
      const agent = agents?.find((a: any) => a.id.toString() === msg.sender_id?.toString());
      if (agent && dayOfWeekGrid[agent.name]) {
        dayOfWeekGrid[agent.name][dow]++;
      }
    }
  });

  // 8. Response time distribution per agent
  const convMessages: Record<string, typeof allMsgs> = {};
  allMsgs.forEach((msg: any) => {
    if (!convMessages[msg.conversation_id]) convMessages[msg.conversation_id] = [];
    convMessages[msg.conversation_id].push(msg);
  });

  const responseTimeBuckets: Record<string, { under1m: number; m1to5: number; m5to15: number; m15to60: number; over1h: number; total: number }> = {};
  agents?.forEach((a: any) => {
    responseTimeBuckets[a.name] = { under1m: 0, m1to5: 0, m5to15: 0, m15to60: 0, over1h: 0, total: 0 };
  });

  Object.values(convMessages).forEach((msgs: any) => {
    let lastContactTime: number | null = null;
    msgs.forEach((msg: any) => {
      if (msg.sender_type === 'contact') {
        if (lastContactTime === null) lastContactTime = new Date(msg.created_at).getTime();
      } else if (msg.sender_type === 'agent' && !msg.is_internal && lastContactTime !== null) {
        const replyTime = new Date(msg.created_at).getTime();
        const diffMs = replyTime - lastContactTime;
        if (diffMs > 0 && diffMs < 12 * 60 * 60 * 1000) {
          const diffMin = diffMs / (60 * 1000);
          const agent = agents?.find((a: any) => a.id.toString() === msg.sender_id?.toString());
          if (agent && responseTimeBuckets[agent.name]) {
            const bucket = responseTimeBuckets[agent.name];
            if (diffMin < 1) bucket.under1m++;
            else if (diffMin < 5) bucket.m1to5++;
            else if (diffMin < 15) bucket.m5to15++;
            else if (diffMin < 60) bucket.m15to60++;
            else bucket.over1h++;
            bucket.total++;
          }
        }
        lastContactTime = null;
      }
    });
  });

  // 9. Quality metrics per agent
  const qualityMetrics: Record<string, { avgMsgLength: number; totalLength: number; msgCount: number; ticketsCreated: number }> = {};
  agents?.forEach((a: any) => {
    qualityMetrics[a.name] = { avgMsgLength: 0, totalLength: 0, msgCount: 0, ticketsCreated: 0 };
  });

  allMsgs.forEach((msg: any) => {
    if (msg.sender_type === 'agent' && !msg.is_internal && msg.content) {
      const agent = agents?.find((a: any) => a.id.toString() === msg.sender_id?.toString());
      if (agent && qualityMetrics[agent.name]) {
        qualityMetrics[agent.name].totalLength += msg.content.length;
        qualityMetrics[agent.name].msgCount++;
      }
    }
    // Count ticket creation system messages
    if (msg.sender_type === 'system' && msg.sender_id && msg.content) {
      const contentStr = (msg.content || '').toLowerCase();
      if (contentStr.includes('ticket is created')) {
        const agent = agents?.find((a: any) => a.id.toString() === msg.sender_id?.toString());
        if (agent && qualityMetrics[agent.name]) {
          qualityMetrics[agent.name].ticketsCreated++;
        }
      }
    }
  });
  Object.values(qualityMetrics).forEach((q: any) => {
    if (q.msgCount > 0) q.avgMsgLength = Math.round(q.totalLength / q.msgCount);
  });

  // 10. Customer satisfaction proxy - sentiment from keywords
  const sentimentByAgent: Record<string, { positive: number; negative: number; total: number }> = {};
  agents?.forEach((a: any) => { sentimentByAgent[a.name] = { positive: 0, negative: 0, total: 0 }; });

  const positiveWords = ['thank', 'thanks', 'solved', 'fixed', 'great', 'awesome', 'perfect', 'excellent', 'good job', 'appreciate', 'happy', 'wonderful', 'love'];
  const negativeWords = ['not working', 'still down', 'hello?', 'anyone there', 'no response', 'worst', 'terrible', 'disappointed', 'angry', 'fraud', 'scam', 'waiting', 'not solved'];

  Object.values(convMessages).forEach((msgs: any) => {
    const agentCounts: Record<string, number> = {};
    msgs.forEach((msg: any) => {
      if (msg.sender_type === 'agent' && !msg.is_internal) {
        const agent = agents?.find((a: any) => a.id.toString() === msg.sender_id?.toString());
        if (agent) agentCounts[agent.name] = (agentCounts[agent.name] || 0) + 1;
      }
    });
    const primaryAgent = Object.entries(agentCounts).sort((a, b) => b[1] - a[1])[0]?.[0];
    if (!primaryAgent || !sentimentByAgent[primaryAgent]) return;

    msgs.forEach((msg: any) => {
      if (msg.sender_type === 'contact' && msg.content) {
        const lower = msg.content.toLowerCase();
        const hasPositive = positiveWords.some(w => lower.includes(w));
        const hasNegative = negativeWords.some(w => lower.includes(w));
        if (hasPositive) sentimentByAgent[primaryAgent].positive++;
        if (hasNegative) sentimentByAgent[primaryAgent].negative++;
        sentimentByAgent[primaryAgent].total++;
      }
    });
  });

  // 11. Peak demand hours (top 3)
  const peakDemandHours = customerDemand
    .map((count: number, hour: number) => ({ hour, count }))
    .sort((a: any, b: any) => b.count - a.count)
    .slice(0, 3);

  // 12. Dead zones (hours with demand but no supply)
  const deadZones: number[] = [];
  for (let h = 0; h < 24; h++) {
    if (customerDemand[h] > 5 && totalAgentSupply[h] === 0) {
      deadZones.push(h);
    }
  }

  return {
    customerDemand,
    totalAgentSupply,
    agentSupply,
    coverageGaps,
    deadZones,
    peakDemandHours,
    dayOfWeekGrid,
    responseTimeBuckets,
    qualityMetrics,
    sentimentByAgent,
    agentNames: agents?.map((a: any) => a.name) || []
  };
}
