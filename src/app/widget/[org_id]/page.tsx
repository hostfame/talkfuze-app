"use client"

import { Send, Zap, X, Bot, Home, MessageCircle, Ticket, Info, ChevronRight } from "lucide-react"
import { useState, useEffect, useRef } from "react"
import { useParams } from "next/navigation"
import { sendWidgetMessage, getWidgetMessages, getWidgetSettings } from "@/actions/chat"
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
  const [settings, setSettings] = useState<any>(null)
  
  type Tab = 'home' | 'messages' | 'tickets' | 'about'
  const [activeTab, setActiveTab] = useState<Tab>('home')
  
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!org_id) return
    
    // Fetch Settings
    getWidgetSettings(org_id).then(data => {
        if (data && data.widget) {
            setSettings(data.widget)
            // Post message to parent to set launcher color
            if (data.widget.color) {
                window.parent.postMessage({ type: 'TALKFUZE_SET_COLOR', color: data.widget.color }, '*')
            }
        }
    })
  }, [org_id])

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

  const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null;

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
  
  // Dynamic values with fallbacks
  const themeColor = settings?.color || 'linear-gradient(to bottom right, #2563eb, #1d4ed8)' // tailwind blue-600 to blue-700
  const isCustomColor = !!settings?.color
  const greetingTitle = settings?.greetingTitle || 'Hey there 👋'
  const greetingSubtitle = settings?.greetingSubtitle || 'How can we help?'
  
  const headerStyle = isCustomColor ? { backgroundColor: settings.color } : {}

  return (
    <div className="h-full w-full flex flex-col bg-white rounded-2xl shadow-xl overflow-hidden font-sans relative">
      
      {/* Background Gradient for Home/Tickets/About */}
      {activeTab !== 'messages' && (
        <div 
          className={`absolute top-0 left-0 right-0 h-[40%] ${!isCustomColor ? 'bg-gradient-to-b from-blue-600 to-blue-500' : ''} z-0`}
          style={isCustomColor ? { background: `linear-gradient(to bottom, ${settings.color}, ${settings.color}ee)` } : {}}
        />
      )}

      {/* Header controls (Close, Mute) - Absolute positioned */}
      {activeTab !== 'messages' && (
        <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-start z-20">
          <div className="flex -space-x-2 opacity-0">
             {/* hidden placeholder for flex space-between balance */}
             <div className="w-8"></div>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={toggleMute} className="text-white/80 hover:text-white transition-colors p-1.5 rounded-full hover:bg-white/10" title={isMuted ? "Unmute sounds" : "Mute sounds"}>
              {isMuted ? (
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line></svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path><path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path></svg>
              )}
            </button>
            <button className="text-white/80 hover:text-white transition-colors p-1.5 rounded-full hover:bg-white/10" onClick={() => window.parent.postMessage({ type: 'TALKFUZE_CLOSE' }, '*')}>
              <X size={20} />
            </button>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className={`flex-1 overflow-y-auto relative z-10 ${activeTab === 'messages' ? 'bg-[#f9fafb]' : 'pb-[80px]'} scrollbar-hide`}>
        
        {/* HOME TAB */}
        {activeTab === 'home' && (
          <div className="px-5 pt-12 pb-6 flex flex-col gap-5 animate-in fade-in duration-300">
            
            {/* Header Text */}
            <div className="mb-2">
              <div className="flex -space-x-2 mb-4">
                 <div className="w-10 h-10 rounded-full border-[2px] border-white bg-white flex items-center justify-center z-20 shadow-sm overflow-hidden">
                    <img src="/talkfuze-logo.png" className="w-7 h-7 object-contain" alt="Logo" />
                 </div>
                 <div className="w-10 h-10 rounded-full border-[2px] border-white bg-blue-100 flex items-center justify-center z-10 shadow-sm text-blue-600 font-bold text-[14px]">
                    A
                 </div>
                 <div className="w-10 h-10 rounded-full border-[2px] border-white bg-emerald-100 flex items-center justify-center z-0 shadow-sm text-emerald-600 font-bold text-[14px]">
                    S
                 </div>
              </div>
              <h1 className="text-[32px] font-bold tracking-tight text-white leading-[1.15] mb-1">{greetingTitle}</h1>
              <p className="text-white/90 text-[17px] font-medium tracking-tight">{greetingSubtitle}</p>
            </div>

            {/* Recent Message Card */}
            <div 
              className="bg-white p-4 rounded-[16px] shadow-[0_4px_15px_rgba(0,0,0,0.06)] border border-slate-100 flex flex-col gap-3 cursor-pointer hover:shadow-[0_6px_20px_rgba(0,0,0,0.08)] transition-all" 
              onClick={() => setActiveTab('messages')}
            >
               <div className="flex justify-between items-center">
                  <span className="text-[13px] font-bold text-slate-800 tracking-tight">Recent message</span>
                  {lastMessage && <span className="text-[12px] text-slate-400">Just now</span>}
               </div>
               <div className="flex items-center gap-3">
                 <div className="w-[42px] h-[42px] rounded-lg bg-blue-600 text-white flex items-center justify-center shrink-0">
                    <Bot size={24} />
                 </div>
                 <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-[15px] font-bold text-slate-800 tracking-tight">Support Team</span>
                      <div className="w-2 h-2 rounded-full bg-red-500 shrink-0"></div>
                    </div>
                    <p className="text-[14px] text-slate-500 truncate mt-0.5 tracking-tight">
                      {lastMessage ? (lastMessage.sender_type === 'contact' ? 'You: ' + lastMessage.content : lastMessage.content) : "If you still need help with anything..."}
                    </p>
                 </div>
               </div>
            </div>

            {/* Start Chat Button */}
            <div 
              className="bg-white rounded-[16px] shadow-[0_4px_15px_rgba(0,0,0,0.06)] border border-slate-100 overflow-hidden cursor-pointer hover:shadow-[0_6px_20px_rgba(0,0,0,0.08)] transition-all"
              onClick={() => setActiveTab('messages')}
            >
               <div className="p-4 flex items-center justify-between text-left">
                  <div>
                    <h3 className="font-bold text-slate-800 text-[15px] tracking-tight mb-0.5">Chat with us</h3>
                    <p className="text-[13px] text-slate-500 tracking-tight">We typically reply in under 10 minutes</p>
                  </div>
                  <div className="w-[32px] h-[32px] bg-[#64748b] text-white rounded-full flex items-center justify-center rotate-0 shrink-0 shadow-sm">
                    <Send size={14} className="-rotate-45 ml-0.5 mt-0.5" />
                  </div>
               </div>
            </div>
            
          </div>
        )}

        {/* CHAT TAB (THREAD) */}
        {activeTab === 'messages' && (
          <div className="h-full flex flex-col relative z-30 bg-white">
            
            {/* Thread Header */}
            <div className="bg-white border-b border-slate-100 px-3 py-3 flex justify-between items-center shrink-0 shadow-sm relative z-30">
              <div className="flex items-center gap-2">
                 <button onClick={() => setActiveTab('home')} className="text-slate-400 hover:text-slate-600 transition-colors p-1.5 -ml-1">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
                 </button>
                 <div className="flex items-center gap-2.5">
                   <div className="relative">
                     <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center shadow-sm">
                        <Bot size={18} />
                     </div>
                   </div>
                   <div className="flex flex-col">
                     <span className="font-bold text-[14px] text-slate-800 leading-tight">Support Team</span>
                     <span className="text-[12px] text-slate-500 leading-tight">We typically reply in under 10 minutes</span>
                   </div>
                 </div>
              </div>
              <div className="flex items-center gap-0.5 text-slate-400">
                 <button className="p-1.5 hover:text-slate-600 transition-colors rounded-full hover:bg-slate-50">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="1"></circle><circle cx="19" cy="12" r="1"></circle><circle cx="5" cy="12" r="1"></circle></svg>
                 </button>
                 <button className="p-1.5 hover:text-slate-600 transition-colors rounded-full hover:bg-slate-50" onClick={() => window.parent.postMessage({ type: 'TALKFUZE_CLOSE' }, '*')}>
                    <X size={20} strokeWidth={2.5} />
                 </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-5 pb-[120px] flex flex-col gap-3 bg-[#f9fafb]">
              <div className="text-center mb-4 mt-2">
                 <p className="text-[13px] text-slate-500 tracking-tight">Got a question? Send us a message — we're here to help 🙂</p>
              </div>

              {messages.length === 0 && (
                <div className="flex flex-col gap-1 items-start">
                  <div className="bg-[#f3f4f6] rounded-[18px] rounded-bl-[4px] py-3 px-4 text-[15px] text-slate-800 max-w-[85%] whitespace-pre-wrap tracking-tight">
                    Hello! How can I assist you today?
                  </div>
                </div>
              )}

              {messages.map((msg, idx) => {
                const isAiOrAgent = msg.sender_type === 'ai' || msg.sender_type === 'agent';
                return isAiOrAgent ? (
                  <div key={idx} className="flex flex-col gap-1 items-start mb-1">
                    <div className="bg-[#f3f4f6] rounded-[18px] rounded-bl-[4px] py-3 px-4 text-[15px] text-slate-800 max-w-[85%] whitespace-pre-wrap tracking-tight">
                      {msg.content}
                    </div>
                    {idx === messages.length - 1 && (
                      <span className="text-[11px] text-slate-400 ml-1">Support Team • Just now</span>
                    )}
                  </div>
                ) : (
                  <div key={idx} className="flex flex-col gap-1 items-end mb-1">
                    <div className="bg-[#64748b] rounded-[18px] rounded-br-[4px] py-3 px-4 text-[15px] text-white shadow-sm max-w-[85%] whitespace-pre-wrap tracking-tight">
                      {msg.content}
                    </div>
                  </div>
                )
              })}
              
              {/* Typing Indicator */}
              <div className="flex items-start gap-1 opacity-0 transition-opacity duration-300 hidden" id="tf-typing-indicator">
                 <div className="bg-[#f3f4f6] rounded-[18px] rounded-bl-[4px] py-4 px-4 text-[15px] text-slate-800 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                    <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                    <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                 </div>
              </div>
              
              <div ref={messagesEndRef} className="h-4" />
            </div>
            
            {/* Embedded Composer (Intercom style floating box) */}
            <div className="absolute bottom-0 left-0 right-0 p-4 pt-10 bg-gradient-to-t from-[#f9fafb] via-[#f9fafb] to-transparent z-40 pointer-events-none">
               <div className="bg-white rounded-[20px] shadow-[0_4px_20px_rgba(0,0,0,0.06)] border border-slate-100 overflow-hidden pointer-events-auto flex flex-col">
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
                    className="w-full bg-transparent border-none focus:ring-0 resize-none text-[15px] text-slate-800 placeholder:text-slate-400 p-4 pb-0 min-h-[52px] max-h-[120px] outline-none"
                    rows={1}
                    disabled={isSending}
                  ></textarea>
                  <div className="flex justify-between items-center px-2 pb-2 pt-1">
                     <div className="flex items-center gap-0.5 text-slate-400">
                        <button className="p-2 hover:text-slate-600 transition-colors rounded-full hover:bg-slate-50">
                           <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path></svg>
                        </button>
                        <button className="p-2 hover:text-slate-600 transition-colors rounded-full hover:bg-slate-50">
                           <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M8 14s1.5 2 4 2 4-2 4-2"></path><line x1="9" y1="9" x2="9.01" y2="9"></line><line x1="15" y1="9" x2="15.01" y2="9"></line></svg>
                        </button>
                        <button className="p-2 hover:text-slate-600 transition-colors rounded-full hover:bg-slate-50 flex items-center justify-center">
                           <div className="text-[10px] font-bold border-2 border-current px-[3px] py-[1px] rounded-[4px] leading-none">GIF</div>
                        </button>
                        <button className="p-2 hover:text-slate-600 transition-colors rounded-full hover:bg-slate-50">
                           <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>
                        </button>
                     </div>
                     <button 
                        onClick={handleSend}
                        disabled={!input.trim() || isSending}
                        className="w-[32px] h-[32px] bg-slate-100 text-slate-400 flex items-center justify-center rounded-full transition-all data-[active=true]:bg-[#64748b] data-[active=true]:text-white mr-1"
                        data-active={!!input.trim() && !isSending}
                     >
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="19" x2="12" y2="5"></line><polyline points="5 12 12 5 19 12"></polyline></svg>
                     </button>
                  </div>
               </div>
            </div>
          </div>
        )}

        {/* TICKETS TAB */}
        {activeTab === 'tickets' && (
          <div className="pt-24 p-5 animate-in fade-in duration-300 flex flex-col items-center h-full text-center">
             <div className="w-14 h-14 bg-white shadow-sm border border-slate-100 rounded-full flex items-center justify-center mb-3 text-blue-600 mt-4">
                <Ticket size={24} />
             </div>
             <h3 className="font-bold text-slate-800 text-[18px] mb-1 tracking-tight">WHMCS Tickets</h3>
             <p className="text-slate-500 text-[14px] mb-6 px-4 tracking-tight">Login with your account email to view and reply to your support tickets directly from here.</p>
             
             <div className="w-full max-w-[280px] bg-white p-4 rounded-[16px] shadow-[0_4px_15px_rgba(0,0,0,0.06)] border border-slate-100 text-left">
                <label className="block text-[13px] font-bold text-slate-800 mb-2 tracking-tight">Email Address</label>
                <input 
                  type="email" 
                  placeholder="name@example.com"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-[14px] text-slate-900 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all mb-3"
                />
                <button className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-[11px] rounded-xl text-[14px] transition-colors shadow-sm flex justify-center items-center gap-2 tracking-tight">
                   Send OTP
                </button>
                <div className="mt-3 text-center">
                   <button className="text-slate-500 hover:text-slate-700 font-semibold text-[13px] transition-colors tracking-tight">
                      Use Password Instead
                   </button>
                </div>
             </div>
          </div>
        )}

        {/* ABOUT TAB */}
        {activeTab === 'about' && (
          <div className="pt-24 p-5 animate-in fade-in duration-300">
             <div className="bg-white p-5 rounded-[16px] shadow-[0_4px_15px_rgba(0,0,0,0.06)] border border-slate-100 mb-4">
                <h3 className="font-bold text-slate-800 text-[18px] mb-2 tracking-tight">Hostnin BD</h3>
                <p className="text-slate-500 text-[14px] leading-relaxed mb-4 tracking-tight">
                  We provide enterprise-grade WordPress and VPS hosting solutions tailored for maximum performance and reliability.
                </p>
                <div className="space-y-3">
                   <div className="flex items-center gap-3 text-[14px] font-medium text-slate-600 tracking-tight">
                      <div className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center shrink-0"><Info size={16}/></div>
                      <span>Support available 24/7</span>
                   </div>
                   <div className="flex items-center gap-3 text-[14px] font-medium text-slate-600 tracking-tight">
                      <div className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center shrink-0"><Zap size={16}/></div>
                      <span>Powered by TalkFuze Enterprise</span>
                   </div>
                </div>
             </div>
          </div>
        )}

      </div>

      {/* Bottom Navigation */}
      {activeTab !== 'messages' && (
        <div className="absolute bottom-0 left-0 right-0 bg-white border-t border-slate-100 flex justify-center gap-[40px] px-6 py-[12px] z-20">
          <button onClick={() => setActiveTab('home')} className={`flex flex-col items-center gap-[3px] ${activeTab === 'home' ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'} transition-colors`}>
             <div className="relative">
                <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill={activeTab === 'home' ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>
             </div>
             <span className={`text-[12px] ${activeTab === 'home' ? 'font-bold' : 'font-semibold'} tracking-tight`}>Home</span>
          </button>
          
          <button onClick={() => setActiveTab('messages')} className={`flex flex-col items-center gap-[3px] ${(activeTab as any) === 'messages' ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'} transition-colors`}>
             <div className="relative">
                <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill={(activeTab as any) === 'messages' ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg>
                <div className="absolute -top-1 -right-1.5 w-[18px] h-[18px] bg-red-500 rounded-full border-[2px] border-white flex items-center justify-center text-white text-[10px] font-bold">1</div>
             </div>
             <span className={`text-[12px] ${(activeTab as any) === 'messages' ? 'font-bold' : 'font-semibold'} tracking-tight`}>Messages</span>
          </button>
          
          <button onClick={() => setActiveTab('tickets')} className={`flex flex-col items-center gap-[3px] ${activeTab === 'tickets' ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'} transition-colors`}>
             <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill={activeTab === 'tickets' ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"></path><path d="M13 5v2"></path><path d="M13 17v2"></path><path d="M13 11v2"></path></svg>
             <span className={`text-[12px] ${activeTab === 'tickets' ? 'font-bold' : 'font-semibold'} tracking-tight`}>Tickets</span>
          </button>
          
          <button onClick={() => setActiveTab('about')} className={`flex flex-col items-center gap-[3px] ${activeTab === 'about' ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'} transition-colors`}>
             <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill={activeTab === 'about' ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
             <span className={`text-[12px] ${activeTab === 'about' ? 'font-bold' : 'font-semibold'} tracking-tight`}>Help</span>
          </button>
        </div>
      )}
    </div>
  )
}
