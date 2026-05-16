"use client"

import ConversationList from "@/components/inbox/ConversationList"
import ChatThread from "@/components/inbox/ChatThread"
import ContactSidebar from "@/components/inbox/ContactSidebar"
import { useEffect, useState, useRef } from "react"
import { getConversations, getMessages } from "@/actions/dashboard"
import { supabase } from "@/lib/supabase"

// The demo organization we created
const ORG_ID = "ec2f8436-05dc-4621-8a7f-57202f865b8e"

export default function InboxPage() {
  const [conversations, setConversations] = useState<any[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [messages, setMessages] = useState<any[]>([])

  useEffect(() => {
    const fetchConvos = async () => {
      const data = await getConversations(ORG_ID)
      setConversations(data || [])
      
      if (data && data.length > 0 && !selectedId) {
        setSelectedId(data[0].id)
      }
    }

    fetchConvos()
    
    const channel = supabase
      .channel('inbox:conversations:list')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations' }, () => {
        fetchConvos()
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => {
        // Refresh conversation list so last message preview updates
        fetchConvos()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!selectedId) return

    // Initial fetch
    const fetchData = async () => {
      const data = await getMessages(selectedId)
      setMessages(data || [])
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
            return [...prev, payload.new]
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
          setMessages(prev => prev.map(m => m.id === payload.new.id ? { ...m, ...payload.new } : m))
        }
      )
      .subscribe()

    return () => {
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
  }, []);

  const activeConversation = conversations.find(c => c.id === selectedId)

  return (
    <div className="flex-1 flex w-full h-full overflow-hidden bg-white dark:bg-slate-900">
      <ConversationList 
        conversations={conversations} 
        selectedId={selectedId} 
        onSelect={setSelectedId}
        typingState={typingState}
        orgId={ORG_ID}
      />
      <ChatThread 
        conversationId={selectedId} 
        messages={messages} 
        orgId={ORG_ID}
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
