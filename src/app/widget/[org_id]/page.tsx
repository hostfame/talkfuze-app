"use client"

import { Send, Zap, X, ArrowLeft, Bot } from "lucide-react"
import { useState, useEffect, useRef } from "react"
import { useParams } from "next/navigation"
import { sendWidgetMessage, getWidgetMessages } from "@/actions/chat"
import { supabase } from "@/lib/supabase"

export default function WidgetPage() {
  const params = useParams()
  const org_id = params.org_id as string
  const [deviceId, setDeviceId] = useState("")
  const [messages, setMessages] = useState<any[]>([])
  const [input, setInput] = useState("")
  const [isSending, setIsSending] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Generate or retrieve a persistent device ID for this visitor
    let did = localStorage.getItem("talkfuze_device_id")
    if (!did) {
      did = crypto.randomUUID()
      localStorage.setItem("talkfuze_device_id", did)
    }
    setDeviceId(did)
  }, [])

  useEffect(() => {
    if (!org_id || !deviceId) return

    const fetchMsgs = async () => {
      try {
        const data = await getWidgetMessages(org_id, deviceId)
        console.log("Widget fetched messages:", data)
        if (data && data.length > 0) {
          setMessages(data)
        }
      } catch (e) {
        console.error("Fetch messages error", e)
      }
    }

    fetchMsgs()
    
    const channel = supabase
      .channel('public:messages')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => {
        fetchMsgs()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [org_id, deviceId])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = async () => {
    if (!input.trim() || isSending || !deviceId) return

    const messageText = input.trim()
    setInput("")
    // Optimistic UI update
    setMessages(prev => [...prev, { sender_type: 'contact', content: messageText }])
    setIsSending(true)

    try {
      await sendWidgetMessage(org_id, deviceId, messageText)
    } catch (e) {
      console.error(e)
    } finally {
      setIsSending(false)
    }
  }

  return (
    <div className="h-full w-full flex flex-col bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden font-sans">
      
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-500 p-5 flex flex-col shrink-0 text-white relative">
        <div className="flex justify-between items-center mb-4">
          <div className="w-8 h-8 bg-white/20 backdrop-blur-sm rounded-lg flex items-center justify-center">
            <img src="/talkfuze-logo.png" className="w-6 h-6 object-contain filter brightness-0 invert" alt="Logo" />
          </div>
          <button className="text-white/80 hover:text-white transition-colors" onClick={() => window.parent.postMessage({ type: 'TALKFUZE_CLOSE' }, '*')}>
            <X size={20} />
          </button>
        </div>
        <h1 className="text-2xl font-bold tracking-tight mb-1">Hi there 👋</h1>
        <p className="text-blue-100 text-sm font-medium">How can we help you today?</p>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto bg-slate-50 p-5 flex flex-col gap-4">
        
        {messages.length === 0 && (
          <div className="flex items-end gap-2">
            <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center shrink-0 mb-1">
              <Bot size={14} />
            </div>
            <div className="bg-white border border-slate-200 rounded-2xl rounded-bl-sm p-3.5 text-[14px] text-slate-700 shadow-sm leading-relaxed max-w-[85%] whitespace-pre-wrap">
              Welcome to TalkFuze! Ask us anything or track your recent orders.
            </div>
          </div>
        )}

        {messages.map((msg, idx) => {
          const isAiOrAgent = msg.sender_type === 'ai' || msg.sender_type === 'agent';
          return isAiOrAgent ? (
            <div key={idx} className="flex items-end gap-2">
              <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center shrink-0 mb-1">
                <Bot size={14} />
              </div>
              <div className="bg-white border border-slate-200 rounded-2xl rounded-bl-sm p-3.5 text-[14px] text-slate-700 shadow-sm leading-relaxed max-w-[85%] whitespace-pre-wrap">
                {msg.content}
              </div>
            </div>
          ) : (
            <div key={idx} className="flex items-end justify-end gap-2">
              <div className="bg-blue-600 rounded-2xl rounded-br-sm p-3.5 text-[14px] text-white shadow-sm leading-relaxed max-w-[85%] whitespace-pre-wrap">
                {msg.content}
              </div>
            </div>
          )
        })}
        
        <div ref={messagesEndRef} />

      </div>

      {/* Composer Input */}
      <div className="p-4 bg-white border-t border-slate-100">
        <div className="flex items-end gap-2">
          <textarea 
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSend()
              }
            }}
            placeholder="Type your message..."
            className="flex-1 bg-slate-50 border border-slate-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 rounded-xl p-3 text-[14px] min-h-[44px] max-h-[120px] resize-none text-slate-800 placeholder:text-slate-400 outline-none transition-all"
            rows={1}
            disabled={isSending}
          ></textarea>
          <button 
            onClick={handleSend}
            disabled={!input.trim() || isSending}
            className="w-11 h-11 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white rounded-xl flex items-center justify-center shrink-0 shadow-md shadow-blue-500/20 active:scale-95 transition-all">
            <Send size={18} className="ml-1" />
          </button>
        </div>
        <div className="flex justify-center items-center gap-1 mt-3">
          <Zap size={10} className="text-amber-500 fill-amber-500" />
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Powered by TalkFuze</span>
        </div>
      </div>
    </div>
  )
}
