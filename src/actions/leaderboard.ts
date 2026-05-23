"use server"
import { supabaseAdmin } from "@/lib/supabase-admin"
import { unstable_noStore as noStore } from "next/cache"

export async function getLeaderboardStats(orgId: string, period: 'daily' | 'weekly' | 'monthly' = 'daily') {
  noStore();
  if (!orgId) return [];

  const now = new Date();
  
  // Bangladesh local midnight start date (UTC+6 offset)
  const bdMidnight = new Date(now.getTime() + 6 * 60 * 60 * 1000);
  bdMidnight.setUTCHours(0, 0, 0, 0);
  const localMidnight = new Date(bdMidnight.getTime() - 6 * 60 * 60 * 1000);
  
  let startDate = new Date(localMidnight);
  
  if (period === 'weekly') {
    startDate.setDate(localMidnight.getDate() - 7);
  } else if (period === 'monthly') {
    startDate.setDate(localMidnight.getDate() - 30);
  }

  // 1. Get all users
  const { data: agents } = await supabaseAdmin
    .from('users')
    .select('id, name, avatar_url, role')
    .eq('org_id', orgId);
    
  if (!agents) return [];

  // 2. Get all messages in this period to count regular vs internal and calculate response time
  const { data: allMessages } = await supabaseAdmin
    .from('messages')
    .select('id, sender_id, sender_type, conversation_id, created_at, is_internal, content')
    .eq('org_id', orgId)
    .gte('created_at', startDate.toISOString())
    .order('created_at', { ascending: true });

  // 3. Get call logs in this period
  let calls: any[] = [];
  try {
    const { data: callLogs } = await supabaseAdmin
      .from('call_logs')
      .select('agent_name, duration_seconds')
      .eq('org_id', orgId)
      .gte('created_at', startDate.toISOString());
    if (callLogs) {
      calls = callLogs;
    }
  } catch (err) {
    console.error("Error fetching call logs for leaderboard:", err);
  }

  // 4. Process stats per agent
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
      avgResponseTime: 0, // In minutes
      totalResponseTimeMs: 0,
      responseTimeCount: 0,
      // Hosting-specific performance metrics:
      firstResponseSlaPercent: 100, // Default to 100%
      totalFirstResponses: 0,
      firstResponsesUnder60s: 0,
      emergencyResponseTime: 0, // In seconds
      totalEmergencyResponseTimeMs: 0,
      emergencyResponseTimeCount: 0,
      escalatedTicketsCount: 0,
      aiDraftCount: 0,
      aiAssistedPercent: 0
    };
  });

  // Match calls by agent name - Fuzzy matching enabled (e.g. Asad matches Asad Ujjaman)
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
    
    // Group messages by conversation to calculate response times
    const convMessages: Record<string, typeof allMessages> = {};

    allMessages.forEach(msg => {
      // 1. Group for response time
      if (!convMessages[msg.conversation_id]) {
        convMessages[msg.conversation_id] = [];
      }
      convMessages[msg.conversation_id].push(msg);

      // 2. Count messages sent by agents
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
        // Track escalated tickets
        const contentStr = (msg.content || '').toLowerCase();
        if (contentStr.includes('ticket is created')) {
          statsMap[msg.sender_id].escalatedTicketsCount++;
        }
      }
    });

    // Calculate response times & hosting SLAs
    Object.values(convMessages).forEach(msgs => {
      // Check if conversation contains emergency keywords in customer messages
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
            
            // Only count reasonable response times (< 12 hours) to avoid off-hours skewing stats
            if (diffMs > 0 && diffMs < 12 * 60 * 60 * 1000) {
              statsMap[agentId].totalResponseTimeMs += diffMs;
              statsMap[agentId].responseTimeCount++;

              if (isEmergency) {
                statsMap[agentId].totalEmergencyResponseTimeMs += diffMs;
                statsMap[agentId].emergencyResponseTimeCount++;
              }

              // First response SLA check (<60 seconds)
              if (isFirstResponse) {
                statsMap[agentId].totalFirstResponses++;
                if (diffMs < 60 * 1000) {
                  statsMap[agentId].firstResponsesUnder60s++;
                }
                isFirstResponse = false;
              }
            }
            
            // Reset contact time since agent replied
            lastContactTime = null;
          }
        }
      });
    });

    // Calculate active minutes, average response times, and hosting metrics
    Object.keys(statsMap).forEach(agentId => {
      const stats = statsMap[agentId];

      if (agentChats[agentId]) {
        stats.chatsCount = agentChats[agentId].size;
      }

      if (stats.responseTimeCount > 0) {
        const avgMs = stats.totalResponseTimeMs / stats.responseTimeCount;
        stats.avgResponseTime = Math.round((avgMs / (60 * 1000)) * 10) / 10; // In minutes
      }
      
      // First Response SLA Percent
      if (stats.totalFirstResponses > 0) {
        stats.firstResponseSlaPercent = Math.round((stats.firstResponsesUnder60s / stats.totalFirstResponses) * 100);
      } else {
        stats.firstResponseSlaPercent = 100;
      }

      // Emergency Response Time (in seconds)
      if (stats.emergencyResponseTimeCount > 0) {
        const avgEmergencyMs = stats.totalEmergencyResponseTimeMs / stats.emergencyResponseTimeCount;
        stats.emergencyResponseTime = Math.round(avgEmergencyMs / 1000);
      } else {
        stats.emergencyResponseTime = 0;
      }
      
      if (agentTimestamps[agentId] && agentTimestamps[agentId].length > 0) {
        agentTimestamps[agentId].sort((a, b) => a - b);
        
        let totalActiveMs = 0;
        let sessionStart = agentTimestamps[agentId][0];
        let lastMsgTime = agentTimestamps[agentId][0];
        
        const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 mins
        
        for (let i = 1; i < agentTimestamps[agentId].length; i++) {
          const t = agentTimestamps[agentId][i];
          if (t - lastMsgTime > SESSION_TIMEOUT) {
            totalActiveMs += (lastMsgTime - sessionStart);
            sessionStart = t;
          }
          lastMsgTime = t;
        }
        
        const finalSessionDur = (lastMsgTime - sessionStart);
        totalActiveMs += finalSessionDur > 0 ? finalSessionDur : (5 * 60 * 1000); 

        stats.activeMinutes = Math.round(totalActiveMs / (60 * 1000));
      }
    });
  }

  // 5. Query AI draft usage per agent in this period
  try {
    const { data: aiDrafts } = await supabaseAdmin
      .from('ai_draft_logs')
      .select('agent_id')
      .eq('org_id', orgId)
      .gte('created_at', startDate.toISOString());

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

  // Calculate AI assisted percentage
  Object.values(statsMap).forEach((stats: any) => {
    if (stats.messagesCount > 0) {
      stats.aiAssistedPercent = Math.round((stats.aiDraftCount / stats.messagesCount) * 100);
    }
  });

  // Sort by public messagesCount descending
  return Object.values(statsMap).sort((a: any, b: any) => b.messagesCount - a.messagesCount);
}
