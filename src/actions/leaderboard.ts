"use server"
import { supabaseAdmin } from "@/lib/supabase-admin"

export async function getLeaderboardStats(orgId: string, period: 'daily' | 'weekly' | 'monthly' = 'daily') {
  if (!orgId) return [];

  const now = new Date();
  let startDate = new Date();
  
  if (period === 'daily') {
    startDate.setHours(0, 0, 0, 0);
  } else if (period === 'weekly') {
    startDate.setDate(now.getDate() - 7);
  } else if (period === 'monthly') {
    startDate.setDate(now.getDate() - 30);
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
    .select('id, sender_id, sender_type, conversation_id, created_at, is_internal')
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
      responseTimeCount: 0
    };
  });

  // Match calls by agent name
  if (calls.length > 0) {
    calls.forEach(call => {
      if (!call.agent_name) return;
      const matchedAgent = agents.find(a => a.name.toLowerCase() === call.agent_name.toLowerCase());
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
      }
    });

    // Calculate response times
    Object.values(convMessages).forEach(msgs => {
      let lastContactTime: number | null = null;

      msgs.forEach(msg => {
        if (msg.sender_type === 'contact') {
          // If customer sent a message, record the time (only if we're not already waiting)
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
            }
            
            // Reset contact time since agent replied
            lastContactTime = null;
          }
        }
      });
    });

    // Calculate active minutes & average response times
    Object.keys(statsMap).forEach(agentId => {
      const stats = statsMap[agentId];

      if (agentChats[agentId]) {
        stats.chatsCount = agentChats[agentId].size;
      }

      if (stats.responseTimeCount > 0) {
        const avgMs = stats.totalResponseTimeMs / stats.responseTimeCount;
        stats.avgResponseTime = Math.round((avgMs / (60 * 1000)) * 10) / 10; // 1 decimal place (mins)
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

  // Sort by public messagesCount descending
  return Object.values(statsMap).sort((a: any, b: any) => b.messagesCount - a.messagesCount);
}
