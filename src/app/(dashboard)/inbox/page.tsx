"use client"

import ConversationList from "@/components/inbox/ConversationList"
import ChatThread from "@/components/inbox/ChatThread"
import ContactSidebar from "@/components/inbox/ContactSidebar"
import CallsPage from "@/components/inbox/CallsPage"
import { useEffect, useState, useRef } from "react"
import { useInboxStore } from "@/lib/store"
import { Bell } from "lucide-react"
import { getConversations, getMessages } from "@/actions/dashboard"
import { getTeammates } from "@/actions/team"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/lib/auth-context"
import { playUISound, sendDesktopNotification, updateTabBadge, startTabTitleFlash, playIncomingRingtoneLoop, stopIncomingRingtoneLoop } from "@/lib/sounds"
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
    isLoaded, setCurrentUser,
    mobileView, setMobileView,
    isFetchingMessages, setIsFetchingMessages
  } = useInboxStore()

  const [typingState, setTypingState] = useState<Record<string, boolean>>({})
  const [recordingState, setRecordingState] = useState<Record<string, boolean>>({})
  const [agentActivity, setAgentActivity] = useState<Record<string, Record<string, { name: string, avatar_url?: string, activity: 'viewing' | 'typing', timestamp: number }>>>({})
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set())
  const typingTimeoutRefs = useRef<Record<string, NodeJS.Timeout>>({})

  const [assignedNotification, setAssignedNotification] = useState<{
    conversationId: string
    senderName: string
    contactName: string
  } | null>(null)

  useEffect(() => {
    if (assignedNotification) {
      const timer = setTimeout(() => {
        setAssignedNotification(null);
      }, 10000);
      return () => clearTimeout(timer);
    }
  }, [assignedNotification]);

  const handleOpenAssigned = (conversationId: string) => {
    setSelectedId(conversationId);
    useInboxStore.getState().setActiveFilter('all');
    setMobileView('chat');
    setAssignedNotification(null);
  }

  useEffect(() => {
    if (currentUser) setCurrentUser(currentUser as UserProfile)
  }, [currentUser, setCurrentUser])

  // Refetch conversations when activeFilter changes to an archived state
  useEffect(() => {
    let mounted = true;
    if (currentUser && ORG_ID) {
      if (activeFilter === 'ticketed' || activeFilter === 'archived') {
        getConversations(ORG_ID, activeFilter, currentUser.id).then(data => {
          if (mounted) {
            useInboxStore.getState().setArchivedConversations((data || []) as ConversationWithDetails[]);
          }
        });
      }
    }
    return () => { mounted = false };
  }, [activeFilter, ORG_ID, currentUser?.id]);

  const activeConversation = (activeFilter === 'ticketed' || activeFilter === 'archived' ? useInboxStore.getState().archivedConversations : conversations).find(c => c.id === selectedId)
  const messages = selectedId ? (messagesMap[selectedId] || []) : []

  useEffect(() => {
    const fetchConvosAndTeam = async () => {
      // Always fetch 'all' for the main conversations store so counts remain intact
      const [convosData, teamData] = await Promise.all([
        getConversations(ORG_ID, 'all', currentUser?.id),
        getTeammates()
      ])
      
      setConversations((convosData || []) as ConversationWithDetails[])
      setTeamMembers(teamData || [])
      
      if (convosData && convosData.length > 0 && !useInboxStore.getState().selectedId) {
        setSelectedId(convosData[0].id)
      }

      // Pre-fetch messages for top 10 conversations (WhatsApp-style instant switching)
      if (convosData && convosData.length > 0) {
        const store = useInboxStore.getState()
        const toPreload = convosData.slice(0, 10).filter(c => !store.messagesMap[c.id])
        toPreload.forEach(conv => {
          Promise.resolve(
            supabase.rpc('get_conversation_messages', { conv_id: conv.id, msg_limit: 50 })
          ).then(({ data }) => {
            if (data && data.length > 0) {
              useInboxStore.getState().setMessages(conv.id, (data as AppMessage[]).reverse())
            }
          }).catch(() => {})
        })
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
        getConversations(ORG_ID, currentFilter, currentUser?.id).then(data => setConversations((data || []) as ConversationWithDetails[]))
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        const newMsg = payload.new as any;
        
        // Global message insertion: ensures we never miss a message even if the local conversation channel is reconnecting
        if (newMsg && newMsg.conversation_id) {
           useInboxStore.getState().addMessage(newMsg.conversation_id, newMsg as AppMessage);
        }

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
              getConversations(ORG_ID, currentFilter, currentUser?.id).then(data => setConversations((data || []) as ConversationWithDetails[]));
           }
        }
        
        // Play sound if the message is from a contact
        if (newMsg && newMsg.sender_type === 'contact') {
           playUISound('receive')
           // Desktop notification
           const conv = conversations.find(c => c.id === newMsg.conversation_id);
           const contact = conv?.contact;
           const convName = (Array.isArray(contact) ? contact[0]?.name : contact?.name) || 'Customer';
           sendDesktopNotification(`New message from ${convName}`, newMsg.content_type === 'text' ? newMsg.content : 'Sent an attachment');
           // Tab badge - count unread conversations
           const unreadCount = conversations.filter(c => c.is_unread).length + 1;
           updateTabBadge(unreadCount);
           // Immediately clear typing state to prevent UI flicker
           setTypingState(prev => ({ ...prev, [newMsg.conversation_id]: false }));
           if (typingTimeoutRefs.current[newMsg.conversation_id]) {
             clearTimeout(typingTimeoutRefs.current[newMsg.conversation_id]);
           }
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, (payload) => {
        const newMsg = payload.new as any;
        if (newMsg && newMsg.conversation_id) {
          const currentMsgs = useInboxStore.getState().messagesMap[newMsg.conversation_id] || [];
          if (currentMsgs.length > 0) {
             useInboxStore.getState().setMessages(newMsg.conversation_id, currentMsgs.map(m => m.id === newMsg.id ? { ...m, ...newMsg } : m));
          }
        }
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages' }, (payload) => {
        const oldMsg = payload.old as any;
        // In default Postgres, DELETE only returns the primary key (id).
        // We will scan all conversations in the store and remove the message if found.
        if (oldMsg && oldMsg.id) {
           const store = useInboxStore.getState();
           const msgsMap = store.messagesMap;
           for (const convId in msgsMap) {
              const currentMsgs = msgsMap[convId];
              if (currentMsgs.some(m => m.id === oldMsg.id)) {
                 store.setMessages(convId, currentMsgs.filter(m => m.id !== oldMsg.id));
                 break;
              }
           }
        }
      })
      .subscribe()
      
    // Global voice call listener
    const globalCallChannel = supabase.channel(`voicecall_global:${ORG_ID}`)
      .on('broadcast', { event: 'voice_call_alert' }, (payload) => {
        if (payload.payload.conversationId) {
          // Store pending incoming call info before selecting ID to bypass WebRTC subscription race
          useInboxStore.getState().setPendingIncomingCall({
            conversationId: payload.payload.conversationId,
            offer: payload.payload.offer,
            callerName: payload.payload.callerName
          });
          useInboxStore.getState().setSelectedId(payload.payload.conversationId);
          // Send desktop notification for incoming voice call
          const caller = payload.payload.callerName || 'Customer';
          sendDesktopNotification('Incoming Voice Call 📞', `${caller} is calling you...`);
          // Flash browser tab title to grab attention immediately
          startTabTitleFlash('INCOMING CALL 📞', 1);
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
    const hasCached = !!messagesMap[selectedId]

    const fetchData = async () => {
      // Only show loading spinner if we have NO cached messages
      if (!hasCached) {
        setIsFetchingMessages(selectedId, true)
      }

      // Use security definer function - bypasses RLS, ~50ms direct
      const { data, error } = await supabase
        .rpc('get_conversation_messages', {
          conv_id: selectedId,
          msg_limit: 50
        })

      if (!isActive) return

      if (data && data.length > 0) {
        setMessages(selectedId, (data as AppMessage[]).reverse())
      } else if (!hasCached) {
        // Server action fallback only on first load if rpc returns empty
        const fallbackData = await getMessages(selectedId)
        if (!isActive) return
        setMessages(selectedId, (fallbackData || []) as AppMessage[])
      }
      setIsFetchingMessages(selectedId, false)
    }

    fetchData()
    return () => {
      isActive = false
    }
  }, [selectedId])



  useEffect(() => {
    const channel = supabase.channel(`typing:${ORG_ID}`)
      .on('broadcast', { event: 'typingStatus' }, (payload) => {
        const { conversation_id, direction, is_typing, is_recording, agent_name, agent_id, agent_avatar } = payload.payload;
        // Track customer typing
        if (direction === 'contact') {
          setTypingState(prev => ({
            ...prev,
            [conversation_id]: is_typing
          }));
          
          if (is_recording !== undefined) {
            setRecordingState(prev => ({
              ...prev,
              [conversation_id]: is_recording
            }));
          }
          
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
          // Track other agents typing - completely remove them when typing stops
          setAgentActivity(prev => {
            const next = { ...prev };
            if (!next[conversation_id]) next[conversation_id] = {};
            
            if (is_typing) {
              next[conversation_id] = {
                ...next[conversation_id],
                [agent_id]: {
                  name: agent_name || 'Agent',
                  avatar_url: agent_avatar,
                  activity: 'typing',
                  timestamp: Date.now()
                }
              };
            } else {
              const agents = { ...next[conversation_id] };
              delete agents[agent_id];
              if (Object.keys(agents).length === 0) {
                delete next[conversation_id];
              } else {
                next[conversation_id] = agents;
              }
            }
            return next;
          });
        }
      })
      .on('broadcast', { event: 'conversationAssigned' }, (payload) => {
        const { conversation_id, assigned_to, assigned_by_name, contact_name } = payload.payload;
        if (assigned_to === currentUser?.id) {
          playUISound('receive');
          sendDesktopNotification('Conversation Assigned', `${assigned_by_name} assigned ${contact_name}'s conversation to you`);
          setAssignedNotification({
            conversationId: conversation_id,
            senderName: assigned_by_name,
            contactName: contact_name
          });
        }
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

  // Global check for COMPLETELY UNPICKED conversations (rings continuously)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    // If we are currently in a voice call, don't play chat ringtones
    const hasUnpicked = conversations.some(c => {
      if (c.status !== 'open' || !c.is_unread) return false;
      let msgs: any[] = [];
      if (messagesMap[c.id] && messagesMap[c.id].length > 0) msgs = messagesMap[c.id];
      else if ((c as any).latestMessage) msgs = (c as any).latestMessage;
      else if (c.messages) msgs = c.messages;
      
      const hasAgentReply = msgs.some((m: any) => m.sender_type === 'agent' || m.sender_type === 'system');
      const hasAgentParticipant = c.participants && c.participants.length > 0;
      return !hasAgentReply && !hasAgentParticipant;
    });

    if (hasUnpicked) {
      playIncomingRingtoneLoop();
    } else {
      stopIncomingRingtoneLoop();
    }
  }, [conversations, messagesMap]);

  // Repeat alerts for unread chats to prevent agents from missing messages
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const getRepeatSettings = () => {
      const isRepeatEnabled = localStorage.getItem('talkfuze_repeat_alerts') !== 'false'; // defaults to true
      const intervalSec = parseFloat(localStorage.getItem('talkfuze_repeat_interval') || '30');
      return { isRepeatEnabled, intervalMs: intervalSec * 1000 };
    };

    const runAlertCheck = () => {
      const { isRepeatEnabled } = getRepeatSettings();
      if (!isRepeatEnabled) return;

      // Check DND
      const dndEnabled = localStorage.getItem('talkfuze_dnd') === 'true';
      if (dndEnabled) {
        const start = localStorage.getItem('talkfuze_dnd_start') || '22:00';
        const end = localStorage.getItem('talkfuze_dnd_end') || '07:00';
        const now = new Date();
        const nowMin = now.getHours() * 60 + now.getMinutes();
        const [sh, sm] = start.split(':').map(Number);
        const [eh, em] = end.split(':').map(Number);
        const startMin = sh * 60 + sm;
        const endMin = eh * 60 + em;
        let isQuiet = false;
        if (startMin <= endMin) {
          isQuiet = nowMin >= startMin && nowMin < endMin;
        } else {
          isQuiet = nowMin >= startMin || nowMin < endMin;
        }
        if (isQuiet) return;
      }

      // Check if there are any unread conversations
      const hasUnread = conversations.some(c => c.is_unread);
      if (hasUnread) {
        playUISound('receive');
      }
    };

    const { intervalMs } = getRepeatSettings();
    const intervalId = setInterval(runAlertCheck, intervalMs);

    return () => clearInterval(intervalId);
  }, [conversations]);





  const handleSelectConversation = (id: string) => {
    setSelectedId(id)
    setMobileView('chat')
  }

  const handleBackToList = () => {
    setMobileView('list')
  }

  // activeConversation is defined above now

  if (activeFilter === 'calls') {
    return (
      <div className="flex-1 flex w-full h-full overflow-hidden bg-white dark:bg-slate-900">
        <CallsPage />
      </div>
    )
  }

  return (
    <div className="flex-1 flex w-full h-full overflow-hidden bg-white dark:bg-slate-900 relative">
      {/* Beautiful Floating Assignment Notification Banner */}
      {assignedNotification && (
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-50 animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="flex items-center gap-3 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-blue-500/35 dark:border-blue-500/25 px-4 py-3 rounded-2xl shadow-xl shadow-blue-500/10 max-w-sm sm:max-w-md">
            <div className="w-9 h-9 rounded-xl bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold animate-pulse">
              <Bell size={18} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold text-slate-900 dark:text-white truncate">
                Forwarded to you!
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                <strong className="text-slate-800 dark:text-slate-200">{assignedNotification.senderName}</strong> assigned chat of <strong className="text-slate-800 dark:text-slate-200">{assignedNotification.contactName}</strong>
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button 
                onClick={() => handleOpenAssigned(assignedNotification.conversationId)}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs rounded-lg transition-all active:scale-95 shadow-sm shadow-blue-600/20"
              >
                Open
              </button>
              <button 
                onClick={() => setAssignedNotification(null)}
                className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded-md transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            </div>
          </div>
        </div>
      )}
      <div className={`${mobileView === 'chat' ? 'hidden' : 'flex'} md:flex w-full md:w-[280px] xl:w-[320px] shrink-0`}>
        <ConversationList 
          conversations={conversations} 
          selectedId={selectedId} 
          onSelect={handleSelectConversation}
          typingState={typingState}
          onlineUsers={onlineUsers}
          orgId={ORG_ID}
        />
      </div>
      {/* ChatThread + ContactSidebar: visible on desktop always, on mobile only when mobileView is 'chat' */}
      <div className={`${mobileView === 'list' ? 'hidden' : 'flex'} md:flex flex-1 min-w-0`}>
        <ChatThread 
          conversationId={selectedId} 
          messages={messages} 
          orgId={ORG_ID}
          teamMembers={teamMembers}
          isCustomerTyping={selectedId ? typingState[selectedId] : false}
          isCustomerRecording={selectedId ? recordingState[selectedId] : false}
          activeAgents={selectedId ? Object.values(agentActivity[selectedId] || {}) : []}
          isCustomerOnline={(() => {
            if (!activeConversation) return false;
            // In Inbox page we don't have firstRelation imported, let's just check if it's an array or object
            const contact = Array.isArray(activeConversation.contact) ? activeConversation.contact[0] : activeConversation.contact;
            return contact ? onlineUsers.has(contact.id) : false;
          })()}
          conversation={activeConversation}
          currentUser={currentUser as UserProfile}
          isFetching={selectedId ? isFetchingMessages[selectedId] : false}
          onBackToList={handleBackToList}
        />
        <ContactSidebar 
          conversation={activeConversation}
          orgId={ORG_ID}
          messages={messages}
        />
      </div>
    </div>
  )
}
