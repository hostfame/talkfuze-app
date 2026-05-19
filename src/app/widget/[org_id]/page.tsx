"use client"

import { Send, Zap, X, Bot, Home, MessageCircle, Ticket, Info, ChevronRight, Mic, StopCircle } from "lucide-react"
import { useState, useEffect, useRef } from "react"
import { useParams } from "next/navigation"
import { sendWidgetMessage, getWidgetMessages, getWidgetSettings, uploadWidgetMedia } from "@/actions/chat"
import { supabase } from "@/lib/supabase"
import type { AppMessage } from "@/lib/types"
import EmojiPicker, { EmojiClickData } from 'emoji-picker-react'

type WidgetMessage = AppMessage & {
  agent?: {
    name: string | null;
    avatar_url: string | null;
  } | null;
}

function getStoredDeviceId() {
  if (typeof window === 'undefined') return ""

  let deviceId = localStorage.getItem("talkfuze_device_id")
  if (!deviceId) {
    deviceId = crypto.randomUUID()
    localStorage.setItem("talkfuze_device_id", deviceId)
  }
  return deviceId
}

const CustomAudioPlayer = ({ url, isDark }: { url: string, isDark: boolean }) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

  const togglePlay = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
      setProgress((audioRef.current.currentTime / audioRef.current.duration) * 100);
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
    }
  };

  const formatTime = (time: number) => {
    if (!time || isNaN(time)) return "0:00";
    const m = Math.floor(time / 60);
    const s = Math.floor(time % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className={`flex items-center gap-3 p-1.5 rounded-full min-w-[220px]`}>
      <audio 
        ref={audioRef} 
        src={url} 
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={() => { setIsPlaying(false); setProgress(0); setCurrentTime(0); }}
        className="hidden" 
      />
      
      <button 
        onClick={togglePlay} 
        className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-transform hover:scale-105 active:scale-95 ${isDark ? 'bg-white text-[#64748b] shadow-sm' : 'bg-blue-600 text-white shadow-sm'}`}
      >
        {isPlaying ? (
           <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>
        ) : (
           <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="ml-0.5"><path d="M8 5v14l11-7z"/></svg>
        )}
      </button>

      <div className="flex-1 flex flex-col justify-center gap-1 overflow-hidden pr-2">
        <div className="flex items-center gap-2 w-full">
          <div 
            className={`h-[4px] flex-1 rounded-full overflow-hidden cursor-pointer relative ${isDark ? 'bg-white/30' : 'bg-blue-600/20'}`}
            onClick={(e) => {
               if(audioRef.current && duration) {
                 const rect = e.currentTarget.getBoundingClientRect();
                 const x = e.clientX - rect.left;
                 const percentage = x / rect.width;
                 audioRef.current.currentTime = percentage * duration;
               }
            }}
          >
            <div 
              className={`h-full transition-all duration-100 ease-linear ${isDark ? 'bg-white' : 'bg-blue-600'}`} 
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
        
        <div className={`text-[10px] font-semibold tracking-wide flex justify-between ${isDark ? 'text-white/80' : 'text-slate-500'}`}>
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>
    </div>
  );
};

export default function WidgetPage() {
  const params = useParams()
  const org_id = params.org_id as string
  const [deviceId] = useState(getStoredDeviceId)
  const [messages, setMessages] = useState<WidgetMessage[]>([])
  const [input, setInput] = useState("")
  const [isSending, setIsSending] = useState(false)
  const [settings, setSettings] = useState<any>(null)
  
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  
  // Audio Recording State
  const [isRecording, setIsRecording] = useState(false)
  const [recordingDuration, setRecordingDuration] = useState(0)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  
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
          setMessages(data as WidgetMessage[])
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

  const handleEmojiClick = (emojiData: EmojiClickData) => {
    setInput((prev) => prev + emojiData.emoji)
  }

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream)
      mediaRecorderRef.current = mediaRecorder
      audioChunksRef.current = []

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data)
        }
      }

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
        const formData = new FormData()
        formData.append('file', audioBlob, 'voice-message.webm')
        
        setIsSending(true)
        try {
          const result = await uploadWidgetMedia(formData)
          if (result?.success && result.url) {
            await sendWidgetMessage(org_id, deviceId, '[Audio Voice Message]', 'audio', { url: result.url })
          }
        } catch (e) {
          console.error(e)
        } finally {
          setIsSending(false)
        }
        
        // Stop all tracks
        stream.getTracks().forEach(track => track.stop())
      }

      mediaRecorder.start()
      setIsRecording(true)
      setRecordingDuration(0)
      timerRef.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1)
      }, 1000)
    } catch (e: any) {
      console.error("Microphone access denied or error:", e)
      alert("Microphone access denied or not available. Please check browser permissions.")
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }

  const cancelRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.onstop = null // prevent upload
      mediaRecorderRef.current.stop()
      // Stop all tracks
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop())
      setIsRecording(false)
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0 || !deviceId) return;
    
    const file = e.target.files[0];
    const formData = new FormData();
    formData.append('file', file);
    
    setIsSending(true);
    try {
      const result = await uploadWidgetMedia(formData);
      if (result?.success && result.url) {
        let contentType: "image" | "video" | "audio" | "file" = "file";
        if (file.type.startsWith('image/')) contentType = "image";
        else if (file.type.startsWith('video/')) contentType = "video";
        else if (file.type.startsWith('audio/')) contentType = "audio";
        
        await sendWidgetMessage(org_id, deviceId, '[Attachment]', contentType, { 
          url: result.url,
          filename: file.name,
          mimetype: file.type
        });
      }
    } catch (err) {
      console.error("Upload failed:", err);
      alert("Failed to upload file.");
    } finally {
      setIsSending(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

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
                const isSystem = msg.sender_type === 'system';
                const isAgent = msg.sender_type === 'agent';
                const isAiOrAgent = isAgent || msg.sender_type === 'ai';

                if (isSystem) {
                  return (
                    <div key={idx} className="flex justify-center my-4">
                      <div className="flex items-center gap-2 bg-slate-50 border border-slate-100 pr-3 pl-1.5 py-1.5 rounded-full tracking-tight shadow-[0_2px_10px_rgba(0,0,0,0.03)]">
                        {msg.agent?.avatar_url ? (
                          <img src={msg.agent.avatar_url} className="w-[22px] h-[22px] rounded-full object-cover shrink-0 border border-white shadow-sm" alt="Agent Avatar" />
                        ) : (
                          <div className="w-[22px] h-[22px] rounded-full bg-blue-600 flex items-center justify-center text-white shrink-0 border border-white shadow-sm">
                            <Bot size={12}/>
                          </div>
                        )}
                        <span className="text-[12px] font-semibold text-slate-600 leading-none mr-1">{msg.content}</span>
                      </div>
                    </div>
                  );
                }

                return isAiOrAgent ? (
                  <div key={idx} className="flex flex-col gap-1 items-start mb-1">
                    <div className="flex gap-2 items-end">
                      {msg.agent?.avatar_url ? (
                        <img src={msg.agent.avatar_url} className="w-6 h-6 rounded-full shrink-0 object-cover bg-slate-100 border border-slate-200" alt="Agent Avatar" />
                      ) : (
                        <div className="w-6 h-6 rounded-full shrink-0 bg-blue-600 flex items-center justify-center text-white">
                          <Bot size={12}/>
                        </div>
                      )}
                      <div className="bg-[#f3f4f6] rounded-[18px] rounded-bl-[4px] py-3 px-4 text-[15px] text-slate-800 max-w-[85%] whitespace-pre-wrap tracking-tight">
                        {msg.content_type === 'audio' ? (
                          <CustomAudioPlayer url={(msg.metadata as any)?.url} isDark={false} />
                        ) : (
                          msg.content
                        )}
                      </div>
                    </div>
                    {idx === messages.length - 1 && (
                      <span className="text-[11px] text-slate-400 ml-[32px]">{msg.agent?.name || 'Support Team'} • Just now</span>
                    )}
                  </div>
                ) : (
                  <div key={idx} className="flex flex-col gap-1 items-end mb-1">
                    <div className="bg-[#64748b] rounded-[18px] rounded-br-[4px] py-3 px-4 text-[15px] text-white shadow-sm max-w-[85%] whitespace-pre-wrap tracking-tight">
                      {msg.content_type === 'audio' ? (
                        <CustomAudioPlayer url={(msg.metadata as any)?.url} isDark={true} />
                      ) : (
                        msg.content
                      )}
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
               <div className="bg-white rounded-[20px] shadow-[0_4px_20px_rgba(0,0,0,0.06)] border border-slate-100 overflow-visible pointer-events-auto flex flex-col relative">
                  
                  {showEmojiPicker && (
                    <div className="absolute bottom-[105%] right-0 mb-2 z-50 shadow-xl rounded-xl overflow-hidden border border-slate-100">
                      <EmojiPicker onEmojiClick={handleEmojiClick} width={280} height={300} searchDisabled skinTonesDisabled previewConfig={{showPreview: false}} />
                    </div>
                  )}

                  {isRecording ? (
                    <div className="flex items-center justify-between p-4 min-h-[52px]">
                      <div className="flex items-center gap-2 text-red-500 animate-pulse">
                        <Mic size={18} />
                        <span className="text-[14px] font-bold">{formatDuration(recordingDuration)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={cancelRecording} className="text-slate-400 hover:text-slate-600 text-[13px] font-medium px-2 py-1">Cancel</button>
                        <button onClick={stopRecording} className="bg-red-500 hover:bg-red-600 text-white rounded-full p-1.5 transition-colors">
                          <StopCircle size={20} />
                        </button>
                      </div>
                    </div>
                  ) : (
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
                  )}
                  
                  {!isRecording && (
                     <div className="flex justify-between items-center px-2 pb-2 pt-1">
                       <input 
                         type="file" 
                         ref={fileInputRef} 
                         className="hidden" 
                         onChange={handleFileUpload} 
                         accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
                       />
                       <div className="flex items-center gap-0.5 text-slate-400">
                          <button onClick={() => fileInputRef.current?.click()} className="p-2 hover:text-slate-600 transition-colors rounded-full hover:bg-slate-50">
                             <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path></svg>
                          </button>
                          <button onClick={() => setShowEmojiPicker(!showEmojiPicker)} className={`p-2 transition-colors rounded-full ${showEmojiPicker ? 'text-blue-600 bg-blue-50' : 'hover:text-slate-600 hover:bg-slate-50'}`}>
                             <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M8 14s1.5 2 4 2 4-2 4-2"></path><line x1="9" y1="9" x2="9.01" y2="9"></line><line x1="15" y1="9" x2="15.01" y2="9"></line></svg>
                          </button>
                          <button onClick={startRecording} className="p-2 hover:text-slate-600 transition-colors rounded-full hover:bg-slate-50">
                             <Mic size={18} />
                          </button>
                       </div>
                       <button 
                          onClick={handleSend}
                          disabled={!input.trim() || isSending}
                          className="w-[32px] h-[32px] bg-slate-100 text-slate-400 flex items-center justify-center rounded-full transition-all data-[active=true]:bg-[#64748b] data-[active=true]:text-white mr-1 shrink-0"
                          data-active={!!input.trim() && !isSending}
                       >
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="19" x2="12" y2="5"></line><polyline points="5 12 12 5 19 12"></polyline></svg>
                       </button>
                    </div>
                  )}
               </div>
            </div>
          </div>
        )}

        {/* TICKETS TAB */}
        {activeTab === 'tickets' && (
          <div className="pt-24 p-5 animate-in fade-in duration-300 flex flex-col h-full bg-[#f8fafc]">
             <div className="flex-1 flex flex-col bg-white rounded-[20px] shadow-sm border border-slate-100 overflow-hidden">
                <div className="p-6 pb-5 flex flex-col items-center border-b border-slate-50 text-center">
                   <div className="w-12 h-12 bg-blue-50 rounded-full flex items-center justify-center mb-3 text-blue-600 shadow-sm">
                      <Ticket size={22} />
                   </div>
                   <h3 className="font-bold text-slate-800 text-[18px] mb-1.5 tracking-tight">Support Tickets</h3>
                   <p className="text-slate-500 text-[13px] leading-relaxed">Manage your WHMCS support tickets directly from this widget. Sign in to continue.</p>
                </div>
                
                <div className="p-6 pt-5 bg-slate-50/50 flex-1">
                   <label className="block text-[12px] font-bold text-slate-700 uppercase tracking-wider mb-2">Email Address</label>
                   <input 
                     type="email" 
                     placeholder="Enter your registered email"
                     className="w-full bg-white border border-slate-200/80 shadow-sm rounded-xl p-3.5 text-[14px] text-slate-900 focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all mb-4 placeholder:text-slate-400"
                   />
                   <button className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3.5 rounded-xl text-[14px] transition-all shadow-[0_4px_12px_rgba(37,99,235,0.2)] hover:shadow-[0_6px_16px_rgba(37,99,235,0.3)] active:scale-[0.98] flex justify-center items-center gap-2">
                      Send Login OTP
                   </button>
                   
                   <div className="mt-5 text-center flex items-center justify-center gap-3">
                      <div className="h-px bg-slate-200 flex-1"></div>
                      <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">OR</span>
                      <div className="h-px bg-slate-200 flex-1"></div>
                   </div>
                   
                   <div className="mt-5 text-center">
                      <button className="text-slate-500 hover:text-slate-800 font-semibold text-[13px] transition-colors flex items-center justify-center gap-1.5 mx-auto">
                         Login with Password
                         <ChevronRight size={14} className="mt-0.5" />
                      </button>
                   </div>
                </div>
             </div>
          </div>
        )}

          <button onClick={() => setActiveTab('tickets')} className={`flex flex-col items-center gap-[3px] ${activeTab === 'tickets' ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'} transition-colors`}>
             <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill={activeTab === 'tickets' ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"></path><path d="M13 5v2"></path><path d="M13 17v2"></path><path d="M13 11v2"></path></svg>
             <span className={`text-[12px] ${activeTab === 'tickets' ? 'font-bold' : 'font-semibold'} tracking-tight`}>Tickets</span>
          </button>
        </div>
      )}
    </div>
  )
}
