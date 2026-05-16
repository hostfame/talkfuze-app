"use client"

import ConversationList from "@/components/inbox/ConversationList"
import ChatThread from "@/components/inbox/ChatThread"
import ContactSidebar from "@/components/inbox/ContactSidebar"
import { useEffect, useState } from "react"
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

  const activeConversation = conversations.find(c => c.id === selectedId)

  return (
    <div className="flex-1 flex w-full h-full overflow-hidden bg-white dark:bg-slate-900">
      <ConversationList 
        conversations={conversations} 
        selectedId={selectedId} 
        onSelect={setSelectedId} 
      />
      <ChatThread 
        conversationId={selectedId} 
        messages={messages} 
        orgId={ORG_ID}
      />
      <ContactSidebar 
        conversation={activeConversation}
        orgId={ORG_ID}
      />
    </div>
  )
}
