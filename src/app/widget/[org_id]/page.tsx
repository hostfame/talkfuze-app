"use client"

import { Send, Zap, X, Bot, Home, MessageCircle, Ticket, Info, ChevronRight } from "lucide-react"
import { useState, useEffect, useRef } from "react"
import { useParams } from "next/navigation"
import { sendWidgetMessage, getWidgetMessages } from "@/actions/chat"
import { supabase } from "@/lib/supabase"
import type { AppMessage } from "@/lib/types"

function getStoredDeviceId() {
  if (typeof window === 'undefined') return ""

  let deviceId = localStorage.getItem("talkfuze_device_id")
  if (!deviceId) {
    deviceId = crypto.randomUUID()
    localStorage.setItem("talkfuze_device_id", deviceId)
  }
  return deviceId
}

export default function WidgetPage() {
  const params = useParams()
  const org_id = params.org_id as string
  const [deviceId] = useState(getStoredDeviceId)
  const [messages, setMessages] = useState<AppMessage[]>([])
  const [input, setInput] = useState("")
  const [isSending, setIsSending] = useState(false)
  
  type Tab = 'home' | 'messages' | 'tickets' | 'about'
  const [activeTab, setActiveTab] = useState<Tab>('home')
  
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!org_id || !deviceId) return

    const fetchMsgs = async () => {
      try {
        const data = await getWidgetMessages(org_id, deviceId)
        if (data && data.length > 0) {
          setMessages(data as AppMessage[])
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
    if (activeTab === 'messages') {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, activeTab])

  const handleSend = async () => {
    if (!input.trim() || isSending || !deviceId) return

    const messageText = input.trim()
    setInput("")
    // Optimistic UI update
    setMessages(prev => [...prev, {
      id: `temp-${Date.now()}`,
      conversation_id: "",
      org_id,
      sender_type: 'contact',
      sender_id: null,
      content: messageText,
      content_type: 'text',
      metadata: null,
      platform_message_id: null,
      is_internal: false,
      status: 'sending',
      created_at: new Date().toISOString()
    }])
    setIsSending(true)

    try {
      await sendWidgetMessage(org_id, deviceId, messageText)
    } catch (e) {
      console.error(e)
    } finally {
      setIsSending(false)
    }
  }

  const [isMuted, setIsMuted] = useState(false)

  useEffect(() => {
    // Read mute preference
    const muted = localStorage.getItem('tf_widget_muted') === 'true'
    setIsMuted(muted)
  }, [])

  const toggleMute = () => {
    const newMuted = !isMuted
    setIsMuted(newMuted)
    localStorage.setItem('tf_widget_muted', String(newMuted))
    window.parent.postMessage({ type: 'TALKFUZE_MUTE_TOGGLE', muted: newMuted }, '*')
  }

  // ... (rest of the code)
  
  return (
    <div className="h-full w-full flex flex-col bg-[#f9fafb] rounded-2xl shadow-xl overflow-hidden font-sans">
      
      {/* Dynamic Header */}
      <div className="bg-gradient-to-br from-blue-600 to-blue-700 p-6 flex flex-col shrink-0 text-white relative shadow-sm">
        <div className="flex justify-between items-center mb-6">
          <div className="flex -space-x-2">
             <div className="w-8 h-8 rounded-full border-2 border-blue-600 bg-white flex items-center justify-center z-20 shadow-sm overflow-hidden">
                <img src="/talkfuze-logo.png" className="w-5 h-5 object-contain" alt="Logo" />
             </div>
             <div className="w-8 h-8 rounded-full border-2 border-blue-600 bg-blue-100 flex items-center justify-center z-10 shadow-sm text-blue-600 font-bold text-xs">
                A
             </div>
             <div className="w-8 h-8 rounded-full border-2 border-blue-600 bg-emerald-100 flex items-center justify-center z-0 shadow-sm text-emerald-600 font-bold text-xs">
                S
             </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={toggleMute} className="text-white/70 hover:text-white transition-colors bg-white/10 hover:bg-white/20 p-1.5 rounded-full backdrop-blur-sm" title={isMuted ? "Unmute sounds" : "Mute sounds"}>
              {isMuted ? (
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line></svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path><path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path></svg>
              )}
            </button>
            <button className="text-white/70 hover:text-white transition-colors bg-white/10 hover:bg-white/20 p-1.5 rounded-full backdrop-blur-sm" onClick={() => window.parent.postMessage({ type: 'TALKFUZE_CLOSE' }, '*')}>
              <X size={18} />
            </button>
          </div>
        </div>
        
        {activeTab === 'home' && (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
            <h1 className="text-[28px] font-bold tracking-tight mb-2 leading-tight">Hey there 👋<br/>How can we help?</h1>
          </div>
        )}
        {activeTab === 'messages' && (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 flex items-center gap-3">
             <button onClick={() => setActiveTab('home')} className="bg-white/10 hover:bg-white/20 p-1.5 rounded-full transition-colors">
                <ChevronRight size={18} className="rotate-180" />
             </button>
             <div>
               <h1 className="text-lg font-bold">Messages</h1>
               <p className="text-white/80 text-xs">We typically reply in under 10 minutes</p>
             </div>
          </div>
        )}
        {activeTab === 'tickets' && (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
            <h1 className="text-[24px] font-bold tracking-tight mb-1">Your Tickets</h1>
            <p className="text-white/80 text-sm">Manage your WHMCS tickets securely</p>
          </div>
        )}
        {activeTab === 'about' && (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
            <h1 className="text-[24px] font-bold tracking-tight mb-1">About Us</h1>
            <p className="text-white/80 text-sm">Learn more about our company</p>
          </div>
        )}
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto bg-[#f9fafb] relative">
        
        {/* HOME TAB */}
        {activeTab === 'home' && (
          <div className="p-5 flex flex-col gap-4 animate-in fade-in duration-300">
            
            {/* Recent Message Card */}
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex flex-col gap-3 hover:shadow-md transition-shadow cursor-pointer" onClick={() => setActiveTab('messages')}>
               <div className="flex justify-between items-center">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Recent message</span>
                  {lastMessage && <span className="text-xs text-slate-400">Just now</span>}
               </div>
               <div className="flex items-center gap-3">
                 <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                    <Bot size={20} />
                 </div>
                 <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">
                      {lastMessage ? (lastMessage.sender_type === 'contact' ? 'You: ' + lastMessage.content : lastMessage.content) : "Hello! How can I assist you today?"}
                    </p>
                 </div>
               </div>
            </div>

            {/* Start Chat Button */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
               <button onClick={() => setActiveTab('messages')} className="w-full p-4 flex items-center justify-between hover:bg-slate-50 transition-colors text-left">
                  <div>
                    <h3 className="font-semibold text-slate-800 text-[15px]">Chat with us</h3>
                    <p className="text-sm text-slate-500">We typically reply in under 10 minutes</p>
                  </div>
                  <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center shrink-0">
                    <Send size={14} className="ml-0.5" />
                  </div>
               </button>
            </div>

          </div>
        )}

        {/* MESSAGES TAB */}
        {activeTab === 'messages' && (
          <div className="h-full flex flex-col bg-white">
            <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">
              {messages.length === 0 && (
                <div className="flex items-end gap-2">
                  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200 text-blue-600 flex items-center justify-center shrink-0 mb-1 shadow-sm">
                    <Bot size={14} />
                  </div>
                  <div className="bg-[#f3f4f6] rounded-[20px] rounded-bl-sm p-3.5 text-[15px] text-slate-800 leading-relaxed max-w-[85%] whitespace-pre-wrap">
                    Hello! How can I assist you today?
                  </div>
                </div>
              )}

              {messages.map((msg, idx) => {
                const isAiOrAgent = msg.sender_type === 'ai' || msg.sender_type === 'agent';
                return isAiOrAgent ? (
                  <div key={idx} className="flex items-end gap-2">
                    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200 text-blue-600 flex items-center justify-center shrink-0 mb-1 shadow-sm">
                      <Bot size={14} />
                    </div>
                    <div className="bg-[#f3f4f6] rounded-[20px] rounded-bl-sm p-3.5 text-[15px] text-slate-800 leading-relaxed max-w-[85%] whitespace-pre-wrap">
                      {msg.content}
                    </div>
                  </div>
                ) : (
                  <div key={idx} className="flex items-end justify-end gap-2">
                    <div className="bg-blue-600 rounded-[20px] rounded-br-sm p-3.5 text-[15px] text-white shadow-sm leading-relaxed max-w-[85%] whitespace-pre-wrap">
                      {msg.content}
                    </div>
                  </div>
                )
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Composer */}
            <div className="p-4 bg-white border-t border-slate-100 shrink-0">
              <div className="flex items-end gap-2 bg-slate-50 border border-slate-200 rounded-2xl p-1.5 focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100/50 transition-all">
                <textarea 
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      handleSend()
                    }
                  }}
                  placeholder="Message..."
                  className="flex-1 bg-transparent border-none focus:ring-0 resize-none text-[15px] text-slate-800 placeholder:text-slate-400 p-2.5 min-h-[44px] max-h-[120px]"
                  rows={1}
                  disabled={isSending}
                ></textarea>
                <button 
                  onClick={handleSend}
                  disabled={!input.trim() || isSending}
                  className="w-10 h-10 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 disabled:opacity-50 text-white rounded-xl flex items-center justify-center shrink-0 shadow-sm transition-all mb-0.5 mr-0.5">
                  <Send size={16} className="ml-0.5" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TICKETS TAB */}
        {activeTab === 'tickets' && (
          <div className="p-5 animate-in fade-in duration-300 flex flex-col items-center justify-center h-full text-center">
             <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mb-4 text-blue-600">
                <Ticket size={28} />
             </div>
             <h3 className="font-bold text-slate-800 text-lg mb-2">WHMCS Support Tickets</h3>
             <p className="text-slate-500 text-sm mb-6 max-w-[250px]">Login with your account email to view and reply to your support tickets directly from here.</p>
             <button className="bg-slate-800 hover:bg-slate-900 text-white font-medium py-2.5 px-6 rounded-xl w-full max-w-[250px] transition-colors shadow-sm">
                Login via OTP
             </button>
             <button className="text-blue-600 hover:text-blue-700 font-medium py-2.5 px-6 rounded-xl mt-2 text-sm transition-colors">
                Use Password Instead
             </button>
          </div>
        )}

        {/* ABOUT TAB */}
        {activeTab === 'about' && (
          <div className="p-5 animate-in fade-in duration-300">
             <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 mb-4">
                <h3 className="font-bold text-slate-800 text-lg mb-2">Hostnin BD</h3>
                <p className="text-slate-500 text-sm leading-relaxed mb-4">
                  We provide enterprise-grade WordPress and VPS hosting solutions tailored for maximum performance and reliability.
                </p>
                <div className="space-y-3">
                   <div className="flex items-center gap-3 text-sm text-slate-600">
                      <div className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center shrink-0"><Info size={16}/></div>
                      <span>Support available 24/7</span>
                   </div>
                   <div className="flex items-center gap-3 text-sm text-slate-600">
                      <div className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center shrink-0"><Zap size={16}/></div>
                      <span>Powered by TalkFuze CRM</span>
                   </div>
                </div>
             </div>
          </div>
        )}

      </div>

      {/* Bottom Navigation */}
      {activeTab !== 'messages' && (
        <div className="bg-white border-t border-slate-200 shrink-0 flex justify-between px-6 py-3">
          <button onClick={() => setActiveTab('home')} className={`flex flex-col items-center gap-1 min-w-[64px] ${activeTab === 'home' ? 'text-blue-600' : 'text-slate-500 hover:text-slate-800'} transition-colors`}>
             <Home size={22} className={activeTab === 'home' ? 'fill-blue-50' : ''} />
             <span className="text-[11px] font-semibold">Home</span>
          </button>
          <button onClick={() => setActiveTab('messages')} className="flex flex-col items-center gap-1 min-w-[64px] text-slate-500 hover:text-slate-800 transition-colors">
             <MessageCircle size={22} />
             <span className="text-[11px] font-semibold">Messages</span>
          </button>
          <button onClick={() => setActiveTab('tickets')} className={`flex flex-col items-center gap-1 min-w-[64px] ${activeTab === 'tickets' ? 'text-blue-600' : 'text-slate-500 hover:text-slate-800'} transition-colors`}>
             <Ticket size={22} className={activeTab === 'tickets' ? 'fill-blue-50' : ''} />
             <span className="text-[11px] font-semibold">Tickets</span>
          </button>
          <button onClick={() => setActiveTab('about')} className={`flex flex-col items-center gap-1 min-w-[64px] ${activeTab === 'about' ? 'text-blue-600' : 'text-slate-500 hover:text-slate-800'} transition-colors`}>
             <Info size={22} className={activeTab === 'about' ? 'fill-blue-50' : ''} />
             <span className="text-[11px] font-semibold">About</span>
          </button>
        </div>
      )}
    </div>
  )
}
