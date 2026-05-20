"use client"

import ConversationList from "@/components/inbox/ConversationList"
import ChatThread from "@/components/inbox/ChatThread"
import ContactSidebar from "@/components/inbox/ContactSidebar"
import CallsPage from "@/components/inbox/CallsPage"
import { useEffect, useState, useRef } from "react"
import { useInboxStore } from "@/lib/store"
import { getConversations, getMessages } from "@/actions/dashboard"
import { getTeammates } from "@/actions/team"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/lib/auth-context"
import { playUISound } from "@/lib/sounds"
import type { AppMessage, ConversationWithDetails, UserProfile } from "@/lib/types"

export default function InboxPage() {
  const currentUser = useAuth()
  const ORG_ID = currentUser.org_id

  const { 
    activeFilter,
    conversations, setConversations, 
    selectedId, setSelectedId,
    messagesMap, setMessages, addMessage,
    teamMembers, setTeamMembers,
    isLoaded, setCurrentUser
  } = useInboxStore()

  const [typingState, setTypingState] = useState<Record<string, boolean>>({})
  const [agentActivity, setAgentActivity] = useState<Record<string, Record<string, { name: string, activity: 'viewing' | 'typing', timestamp: number }>>>({})
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set())
  const typingTimeoutRefs = useRef<Record<string, NodeJS.Timeout>>({})

  useEffect(() => {
    if (currentUser) setCurrentUser(currentUser as UserProfile)
  }, [currentUser, setCurrentUser])

  const messages = selectedId ? (messagesMap[selectedId] || []) : []

  useEffect(() => {
    const fetchConvosAndTeam = async () => {
      const [convosData, teamData] = await Promise.all([
        getConversations(ORG_ID),
        getTeammates()
      ])
      
      setConversations((convosData || []) as ConversationWithDetails[])
      setTeamMembers(teamData || [])
      
      if (convosData && convosData.length > 0 && !useInboxStore.getState().selectedId) {
        setSelectedId(convosData[0].id)
      }
    }

    // Only fetch if not already loaded (to make remounts instant)
    if (!isLoaded) {
      fetchConvosAndTeam()
    } else {
      // Fetch in background anyway to keep fresh
      fetchConvosAndTeam()
    }
    
    const channel = supabase
      .channel('inbox:conversations:list')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations' }, () => {
        const currentFilter = useInboxStore.getState().activeFilter as any
        getConversations(ORG_ID, currentFilter).then(data => setConversations((data || []) as ConversationWithDetails[]))
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        const newMsg = payload.new as any;
        
        // Update conversation list locally instead of re-fetching everything
        if (newMsg && newMsg.conversation_id) {
           const prev = useInboxStore.getState().conversations;
           const next = [...(prev || [])];
           const convIndex = next.findIndex(c => c.id === newMsg.conversation_id);
           if (convIndex !== -1) {
              const conv = { ...next[convIndex] } as any;
              conv.last_message_at = newMsg.created_at;
              // Add latestMessage array mock if it doesn't exist
              conv.latestMessage = [newMsg];
              // Move to top
              next.splice(convIndex, 1);
              next.unshift(conv);
              setConversations(next);
           } else {
              // It's a brand new conversation, fetch it quietly
              const currentFilter = useInboxStore.getState().activeFilter as any;
              getConversations(ORG_ID, currentFilter).then(data => setConversations((data || []) as ConversationWithDetails[]));
           }
        }
        
        // Play sound if the message is from a contact
        if (newMsg && newMsg.sender_type === 'contact') {
           playUISound('receive')
           // Immediately clear typing state to prevent UI flicker
           setTypingState(prev => ({ ...prev, [newMsg.conversation_id]: false }));
           if (typingTimeoutRefs.current[newMsg.conversation_id]) {
             clearTimeout(typingTimeoutRefs.current[newMsg.conversation_id]);
           }
        }
      })
      .subscribe()
      
    // Global voice call listener
    const globalCallChannel = supabase.channel(`voicecall_global:${ORG_ID}`)
      .on('broadcast', { event: 'voice_call_alert' }, (payload) => {
        if (payload.payload.conversationId) {
          useInboxStore.getState().setSelectedId(payload.payload.conversationId);
          // Play a small alert sound immediately (ChatThread will play ringtone later)
          playUISound('receive');
        }
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
      supabase.removeChannel(globalCallChannel)
    }
  }, [ORG_ID])

  useEffect(() => {
    if (!selectedId) return

    let isActive = true

    // Initial fetch
    const fetchData = async () => {
      // Direct client-side fetch for instant loading (~50ms)
      const { data } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', selectedId)
        .order('created_at', { ascending: false })
        .limit(50)

      if (!isActive) return

      if (data && data.length > 0) {
        setMessages(selectedId, data.reverse() as AppMessage[])
      } else {
        // Fallback to Server Action if client fails or returns empty
        const fallbackData = await getMessages(selectedId)
        if (!isActive) return
        setMessages(selectedId, (fallbackData || []) as AppMessage[])
      }
    }
    
    // If we don't have messages for this convo, fetch them immediately
    if (!messagesMap[selectedId]) {
      fetchData()
    } else {
      // Fetch in background to update
      fetchData()
    }
    
    // Use conversation-specific channel name to avoid conflicts across tab switches
    const channelName = `messages:${selectedId}`
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${selectedId}`
        },
        (payload) => {
          addMessage(selectedId, payload.new as AppMessage)
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${selectedId}`
        },
        (payload) => {
          // Update status (read receipts) in place
          const currentMsgs = useInboxStore.getState().messagesMap[selectedId] || []
          setMessages(selectedId, currentMsgs.map(m => m.id === payload.new.id ? { ...m, ...(payload.new as Partial<AppMessage>) } : m))
        }
      )
      .subscribe()

    return () => {
      isActive = false
      supabase.removeChannel(channel)
    }
  }, [selectedId])



  useEffect(() => {
    const channel = supabase.channel(`typing:${ORG_ID}`)
      .on('broadcast', { event: 'typingStatus' }, (payload) => {
        const { conversation_id, direction, is_typing, agent_name, agent_id } = payload.payload;
        // Track customer typing
        if (direction === 'contact') {
          setTypingState(prev => ({
            ...prev,
            [conversation_id]: is_typing
          }));
          
          if (typingTimeoutRefs.current[conversation_id]) {
            clearTimeout(typingTimeoutRefs.current[conversation_id]);
          }
          
          if (is_typing) {
            typingTimeoutRefs.current[conversation_id] = setTimeout(() => {
              setTypingState(prev => ({
                ...prev,
                [conversation_id]: false
              }));
            }, 3000);
          }
        } else if (direction === 'agent' && agent_id && agent_id !== currentUser?.id) {
          // Track other agents typing
          setAgentActivity(prev => {
            const next = { ...prev };
            if (!next[conversation_id]) next[conversation_id] = {};
            next[conversation_id] = {
              ...next[conversation_id],
              [agent_id]: {
                name: agent_name || 'Agent',
                activity: is_typing ? 'typing' : 'viewing', // Revert to viewing when stop typing
                timestamp: Date.now()
              }
            };
            return next;
          });
        }
      })
      .on('broadcast', { event: 'agentActivity' }, (payload) => {
        const { conversation_id, agent_name, agent_id, activity } = payload.payload;
        if (!agent_id || agent_id === currentUser?.id) return;
        
        setAgentActivity(prev => {
          const next = { ...prev };
          if (!next[conversation_id]) next[conversation_id] = {};
          next[conversation_id] = {
            ...next[conversation_id],
            [agent_id]: {
              name: agent_name || 'Agent',
              activity,
              timestamp: Date.now()
            }
          };
          return next;
        });
      })
      .subscribe();
      
    const presenceChannel = supabase.channel(`presence:${ORG_ID}`)
    presenceChannel.on('presence', { event: 'sync' }, () => {
      const state = presenceChannel.presenceState()
      const currentOnline = new Set<string>()
      for (const id in state) {
        state[id].forEach((presence: any) => {
           if (presence.user) currentOnline.add(presence.user)
        })
      }
      setOnlineUsers(currentOnline)
    }).subscribe()
      
    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(presenceChannel);
    }
  }, [ORG_ID, currentUser?.id]);

  useEffect(() => {
    // Periodically clean up stale agent activity (older than 10s)
    const interval = setInterval(() => {
      setAgentActivity(prev => {
        const now = Date.now();
        let changed = false;
        const next = { ...prev };
        for (const convId in next) {
          const agents = { ...next[convId] };
          for (const agentId in agents) {
            if (now - agents[agentId].timestamp > 10000) {
              changed = true;
              delete agents[agentId];
            }
          }
          if (Object.keys(agents).length === 0) {
            delete next[convId];
            changed = true;
          } else if (changed) {
            next[convId] = agents;
          }
        }
        return changed ? next : prev;
      });
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  // Broadcast viewing status
  useEffect(() => {
    if (selectedId && currentUser?.id) {
      const channel = supabase.channel(`typing:${ORG_ID}`);
      // Send immediately and then every 8s
      const broadcast = () => {
        channel.send({
          type: 'broadcast',
          event: 'agentActivity',
          payload: { conversation_id: selectedId, agent_id: currentUser.id, agent_name: currentUser.name, activity: 'viewing' }
        });
      };
      
      const sub = channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          broadcast();
        }
      });
      
      const interval = setInterval(broadcast, 8000);
      return () => {
        clearInterval(interval);
        supabase.removeChannel(channel);
      };
    }
  }, [selectedId, currentUser, ORG_ID]);

  const handleSelectConversation = (id: string) => {
    setSelectedId(id)
  }

  const activeConversation = conversations.find(c => c.id === selectedId)

  if (activeFilter === 'calls') {
    return (
      <div className="flex-1 flex w-full h-full overflow-hidden bg-white dark:bg-slate-900">
        <CallsPage />
      </div>
    )
  }

  return (
    <div className="flex-1 flex w-full h-full overflow-hidden bg-white dark:bg-slate-900">
      <ConversationList 
        conversations={conversations} 
        selectedId={selectedId} 
        onSelect={handleSelectConversation}
        typingState={typingState}
        onlineUsers={onlineUsers}
        orgId={ORG_ID}
      />
      <ChatThread 
        conversationId={selectedId} 
        messages={messages} 
        orgId={ORG_ID}
        teamMembers={teamMembers}
        isCustomerTyping={selectedId ? typingState[selectedId] : false}
        activeAgents={selectedId ? Object.values(agentActivity[selectedId] || {}) : []}
        isCustomerOnline={(() => {
          if (!activeConversation) return false;
          // In Inbox page we don't have firstRelation imported, let's just check if it's an array or object
          const contact = Array.isArray(activeConversation.contact) ? activeConversation.contact[0] : activeConversation.contact;
          return contact ? onlineUsers.has(contact.id) : false;
        })()}
        conversation={activeConversation}
        currentUser={currentUser as UserProfile}
      />
      <ContactSidebar 
        conversation={activeConversation}
        orgId={ORG_ID}
      />
    </div>
  )
}
