"use client"

import ConversationList from "@/components/inbox/ConversationList"
import ChatThread from "@/components/inbox/ChatThread"
import ContactSidebar from "@/components/inbox/ContactSidebar"
import { useEffect, useState, useRef } from "react"
import { getConversations, getMessages } from "@/actions/dashboard"
import { getTeammates } from "@/actions/team"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/lib/auth-context"
import type { AppMessage, ConversationWithDetails, UserProfile } from "@/lib/types"

export default function InboxPage() {
  const currentUser = useAuth()
  const ORG_ID = currentUser.org_id

  const [conversations, setConversations] = useState<ConversationWithDetails[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [messages, setMessages] = useState<AppMessage[]>([])
  const [teamMembers, setTeamMembers] = useState<UserProfile[]>([])

  useEffect(() => {
    const fetchConvosAndTeam = async () => {
      const [convosData, teamData] = await Promise.all([
        getConversations(ORG_ID),
        getTeammates()
      ])
      
      setConversations((convosData || []) as ConversationWithDetails[])
      setTeamMembers(teamData || [])
      
      if (convosData && convosData.length > 0) {
        setSelectedId((current) => current ?? convosData[0].id)
      }
    }

    fetchConvosAndTeam()
    
    const channel = supabase
      .channel('inbox:conversations:list')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations' }, () => {
        getConversations(ORG_ID).then(data => setConversations((data || []) as ConversationWithDetails[]))
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => {
        // Refresh conversation list so last message preview updates
        getConversations(ORG_ID).then(data => setConversations((data || []) as ConversationWithDetails[]))
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
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
        .order('created_at', { ascending: true })

      if (!isActive) return

      if (data && data.length > 0) {
        setMessages(data as AppMessage[])
      } else {
        // Fallback to Server Action if client fails or returns empty
        const fallbackData = await getMessages(selectedId)
        if (!isActive) return
        setMessages((fallbackData || []) as AppMessage[])
      }
    }
    fetchData()
    
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
          // Append directly - no full refetch needed
          setMessages(prev => {
            // Deduplicate: skip if already in list (e.g. optimistic message)
            if (prev.some(m => m.id === payload.new.id)) return prev
            return [...prev, payload.new as AppMessage]
          })
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
          setMessages(prev => prev.map(m => m.id === payload.new.id ? { ...m, ...(payload.new as Partial<AppMessage>) } : m))
        }
      )
      .subscribe()

    return () => {
      isActive = false
      supabase.removeChannel(channel)
    }
  }, [selectedId])

  const [typingState, setTypingState] = useState<Record<string, boolean>>({})
  const typingTimeoutRefs = useRef<Record<string, NodeJS.Timeout>>({})

  useEffect(() => {
    const channel = supabase.channel(`typing:${ORG_ID}`)
      .on('broadcast', { event: 'typingStatus' }, (payload) => {
        const { conversation_id, direction, is_typing } = payload.payload;
        // Only track when the customer is typing to display in UI
        if (direction === 'contact') {
          setTypingState(prev => ({
            ...prev,
            [conversation_id]: is_typing
          }));
          
          // Clear any existing timeout
          if (typingTimeoutRefs.current[conversation_id]) {
            clearTimeout(typingTimeoutRefs.current[conversation_id]);
          }
          
          // Auto-clear typing indicator after 3 seconds of no new events
          if (is_typing) {
            typingTimeoutRefs.current[conversation_id] = setTimeout(() => {
              setTypingState(prev => ({
                ...prev,
                [conversation_id]: false
              }));
            }, 3000);
          }
        }
      })
      .subscribe();
      
    return () => {
      supabase.removeChannel(channel);
    }
  }, [ORG_ID]);

  const handleSelectConversation = (id: string) => {
    setMessages([])
    setSelectedId(id)
  }

  const activeConversation = conversations.find(c => c.id === selectedId)

  return (
    <div className="flex-1 flex w-full h-full overflow-hidden bg-white dark:bg-slate-900">
      <ConversationList 
        conversations={conversations} 
        selectedId={selectedId} 
        onSelect={handleSelectConversation}
        typingState={typingState}
        orgId={ORG_ID}
      />
      <ChatThread 
        conversationId={selectedId} 
        messages={messages} 
        orgId={ORG_ID}
        teamMembers={teamMembers}
        isCustomerTyping={selectedId ? typingState[selectedId] : false}
        conversation={activeConversation}
      />
      <ContactSidebar 
        conversation={activeConversation}
        orgId={ORG_ID}
      />
    </div>
  )
}
