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
      .channel('public:conversations')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations' }, () => {
        fetchConvos()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [selectedId])

  useEffect(() => {
    if (!selectedId) return

    const fetchData = async () => {
      const data = await getMessages(selectedId)
      setMessages(data || [])
    }

    fetchData()
    
    const channel = supabase
      .channel('public:messages_and_convs')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, () => {
        fetchData()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations' }, () => {
        fetchData()
      })
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
      />
      <ContactSidebar 
        conversation={activeConversation}
        orgId={ORG_ID}
      />
    </div>
  )
}
