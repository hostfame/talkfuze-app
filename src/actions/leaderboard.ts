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

  // 2. Get messages sent by agents in this period
  const { data: messages } = await supabaseAdmin
    .from('messages')
    .select('id, sender_id, conversation_id, created_at')
    .eq('org_id', orgId)
    .eq('sender_type', 'agent')
    .gte('created_at', startDate.toISOString());

  // 3. Process stats per agent
  const statsMap: Record<string, any> = {};
  
  agents.forEach(agent => {
    statsMap[agent.id] = {
      id: agent.id,
      name: agent.name,
      avatar_url: agent.avatar_url,
      role: agent.role,
      messagesCount: 0,
      chatsCount: 0,
      activeMinutes: 0
    };
  });

  if (messages && messages.length > 0) {
    const agentChats: Record<string, Set<string>> = {};
    const agentTimestamps: Record<string, number[]> = {};

    messages.forEach(msg => {
      const agentId = msg.sender_id;
      if (!agentId || !statsMap[agentId]) return;

      statsMap[agentId].messagesCount++;
      
      if (!agentChats[agentId]) agentChats[agentId] = new Set();
      agentChats[agentId].add(msg.conversation_id);

      if (!agentTimestamps[agentId]) agentTimestamps[agentId] = [];
      agentTimestamps[agentId].push(new Date(msg.created_at).getTime());
    });

    // Calculate chats and proxy active time
    Object.keys(statsMap).forEach(agentId => {
      if (agentChats[agentId]) {
        statsMap[agentId].chatsCount = agentChats[agentId].size;
      }
      
      if (agentTimestamps[agentId] && agentTimestamps[agentId].length > 0) {
        // Sort timestamps
        agentTimestamps[agentId].sort((a, b) => a - b);
        
        // Calculate active time: we consider an agent active if messages are sent within 30 mins of each other
        let totalActiveMs = 0;
        let sessionStart = agentTimestamps[agentId][0];
        let lastMsgTime = agentTimestamps[agentId][0];
        
        const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 mins
        
        for (let i = 1; i < agentTimestamps[agentId].length; i++) {
          const t = agentTimestamps[agentId][i];
          if (t - lastMsgTime > SESSION_TIMEOUT) {
            // End of a session
            totalActiveMs += (lastMsgTime - sessionStart);
            sessionStart = t; // New session
          }
          lastMsgTime = t;
        }
        
        // Add final session (give it at least 5 mins minimum if only one message)
        const finalSessionDur = (lastMsgTime - sessionStart);
        totalActiveMs += finalSessionDur > 0 ? finalSessionDur : (5 * 60 * 1000); 

        statsMap[agentId].activeMinutes = Math.round(totalActiveMs / (60 * 1000));
      }
    });
  }

  // Sort by messagesCount descending
  return Object.values(statsMap).sort((a: any, b: any) => b.messagesCount - a.messagesCount);
}
