"use client"

import { Clock, MoreHorizontal, Send, Star, Zap, UserPlus, Check, MessageSquare } from "lucide-react"
import { useState, useRef, useEffect } from "react"
import { replyToConversation } from "@/actions/dashboard"

export default function ChatThread({ 
  conversationId, 
  messages, 
  orgId 
}: { 
  conversationId: string | null, 
  messages: any[],
  orgId: string
}) {
  const [input, setInput] = useState("")
  const [isSending, setIsSending] = useState(false)
  const [optimisticMessages, setOptimisticMessages] = useState<any[]>([])
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Clear optimistic messages when real messages arrive via WebSockets
  useEffect(() => {
    setOptimisticMessages([])
  }, [messages])

  const allMessages = [...messages, ...optimisticMessages]

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [allMessages])

  const handleSend = async () => {
    if (!input.trim() || !conversationId || isSending) return

    const msg = input.trim()
    setInput("")
    setIsSending(true)
    
    // Optimistic UI update
    setOptimisticMessages(prev => [...prev, {
      id: `temp-${Date.now()}`,
      sender_type: 'agent',
      content: msg
    }])
    
    try {
      await replyToConversation(orgId, conversationId, msg)
    } catch (e) {
      console.error(e)
    } finally {
      setIsSending(false)
    }
  }

  if (!conversationId) {
    return (
      <div className="flex-1 flex items-center justify-center bg-white rounded-3xl border border-slate-200">
        <p className="text-slate-500 font-medium">Select a conversation to start chatting</p>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col h-full relative bg-[#F9FAFB] dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 z-10 overflow-hidden">
      {/* Header */}
      <div className="h-[72px] border-b border-slate-200/80 dark:border-slate-800 flex justify-between items-center px-6 bg-white/95 backdrop-blur-md dark:bg-slate-900/95 shrink-0 z-20 sticky top-0 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <h2 className="font-medium text-[16px] text-slate-900 dark:text-slate-100">Active Chat</h2>
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button className="flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors">
            <UserPlus size={14} strokeWidth={2} /> Assign
          </button>
          <button className="flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors">
            <Clock size={14} strokeWidth={2} /> Snooze
          </button>
          <div className="w-[1px] h-4 bg-slate-200 mx-1"></div>
          <button className="flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors">
            <Check size={14} strokeWidth={2.5} /> Close
          </button>
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-6 bg-white dark:bg-[#0B0F19]">
        
        {allMessages.map((msg, idx) => {
          const isAgent = msg.sender_type === 'agent' || msg.sender_type === 'ai'
          
          if (isAgent) {
            return (
              <div key={msg.id || idx} className="flex flex-col items-end gap-1 mb-4">
                <div className="bg-[#0070f3] rounded-2xl px-4 py-2.5 text-[14px] text-white max-w-[70%] leading-relaxed whitespace-pre-wrap font-normal">
                  {msg.content}
                </div>
              </div>
            )
          } else {
            return (
              <div key={msg.id || idx} className="flex flex-col mb-4">
                <div className="flex items-end gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center text-[12px] font-semibold shrink-0 mb-1">
                    C
                  </div>
                  <div className="max-w-[70%] flex flex-col gap-1">
                    <div className="bg-slate-100 dark:bg-slate-800 rounded-2xl px-4 py-2.5 text-[14px] text-slate-900 dark:text-slate-200 leading-relaxed whitespace-pre-wrap font-normal">
                      {msg.content}
                    </div>
                  </div>
                </div>
              </div>
            )
          }
        })}
        
        <div ref={messagesEndRef} />
      </div>

      {/* Composer Area */}
      <div className="px-6 pb-6 pt-2 bg-white dark:bg-[#0B0F19]">
        <div className="flex flex-col bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl overflow-hidden focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500 transition-all shadow-sm">
          <textarea 
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSend()
              }
            }}
            placeholder="Reply to customer..."
            className="w-full bg-transparent p-4 text-[14px] focus:outline-none min-h-[90px] resize-none text-slate-800 dark:text-slate-100 placeholder:text-slate-400 font-normal leading-relaxed"
            disabled={isSending}
          ></textarea>
          
          <div className="flex justify-between items-center px-3 py-2 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50">
            <div className="flex items-center gap-1">
              <button className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-md transition-all"><Zap size={16} strokeWidth={2.5} /></button>
            </div>
            <div className="flex items-center gap-3">
              <button 
                onClick={handleSend}
                disabled={!input.trim() || isSending}
                className="px-5 py-1.5 text-[14px] font-medium text-white bg-[#0070f3] hover:bg-blue-600 disabled:bg-blue-300 rounded-lg transition-colors flex items-center"
              >
                Send
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
