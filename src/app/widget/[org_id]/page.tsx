"use client"

import { Send, Zap, X, Bot, Home, MessageCircle, Ticket, Info, ChevronRight, ChevronLeft, Mic, StopCircle } from "lucide-react"
import { useState, useEffect, useRef } from "react"
import { useParams } from "next/navigation"
import { sendWidgetMessage, getWidgetMessages, getWidgetSettings, uploadWidgetMedia, startNewConversation, getWidgetConversations } from "@/actions/chat"
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
  
  const [conversations, setConversations] = useState<any[]>([])
  const [activeConversationId, setActiveConversationId] = useState<string | 'new' | null>(null)
  
  type Tab = 'home' | 'messages' | 'chat' | 'tickets' | 'about'
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

  const fetchConversations = async () => {
    if (!org_id || !deviceId) return
    try {
      const data = await getWidgetConversations(org_id, deviceId, Date.now())
      if (data) setConversations(data)
    } catch (e) {
      console.error("Fetch convs error", e)
    }
  }

  const fetchMsgs = async () => {
    if (!org_id || !deviceId) return
    if (activeConversationId === 'new') {
      setMessages([])
      return
    }
    try {
      const data = await getWidgetMessages(org_id, deviceId, activeConversationId, Date.now())
      if (data) {
        setMessages(data as WidgetMessage[])
      }
    } catch (e) {
      console.error("Fetch messages error", e)
    }
  }

  useEffect(() => {
    fetchConversations()
    fetchMsgs()
    
    const channel = supabase
      .channel('public:messages')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => {
        fetchConversations()
        fetchMsgs()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [org_id, deviceId, activeConversationId])

  useEffect(() => {
    if (activeTab === 'chat' || activeTab === 'messages') {
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
            if (activeConversationId === 'new') {
              await startNewConversation(org_id, deviceId)
            }
            const res = await sendWidgetMessage(org_id, deviceId, '[Audio Voice Message]', 'audio', { url: result.url })
            if (res?.success && res.conversationId && activeConversationId === 'new') {
              setActiveConversationId(res.conversationId)
            }
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
    
    const optimisticId = `temp-${Date.now()}`
    
    // Optimistic UI update
    setMessages(prev => [...prev, {
      id: optimisticId,
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
      if (activeConversationId === 'new') {
        await startNewConversation(org_id, deviceId)
      }
      const res = await sendWidgetMessage(org_id, deviceId, messageText)
      if (res?.success && res.conversationId && res.conversationId !== activeConversationId) {
        setActiveConversationId(res.conversationId)
      }
    } catch (e) {
      console.error(e)
      setMessages(prev => prev.filter(m => m.id !== optimisticId))
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
  const greetingTitle = settings?.greetingTitle || 'Hey there! 👋'
  const greetingSubtitle = settings?.greetingSubtitle || 'How can we help?'
  
  const lastAgentMessage = [...messages].reverse().find(m => m.sender_type === 'agent' && m.agent);
  const activeAgent = lastAgentMessage?.agent || null;
  const headerName = activeAgent?.name || 'Support Team';
  const headerSubtitle = activeAgent ? 'Active' : 'Active now';

  const [isHeaderMenuOpen, setIsHeaderMenuOpen] = useState(false);
  const headerMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (headerMenuRef.current && !headerMenuRef.current.contains(e.target as Node)) {
        setIsHeaderMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const [showTicketLogin, setShowTicketLogin] = useState(false);
  const [otpStep, setOtpStep] = useState<'email' | 'sending' | 'otp' | 'verifying' | 'success'>('email');
  const [otpEmail, setOtpEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpError, setOtpError] = useState('');
  const [otpName, setOtpName] = useState('');
  const [otpTicketId, setOtpTicketId] = useState('');

  const resetOtpModal = () => {
    setOtpStep('email');
    setOtpEmail('');
    setOtpCode('');
    setOtpError('');
    setOtpName('');
    setOtpTicketId('');
    setShowTicketLogin(false);
  };

  const conversationId = messages.find(m => m.conversation_id)?.conversation_id || '';

  const handleSendOTP = async () => {
    if (!otpEmail.trim() || !otpEmail.includes('@')) {
      setOtpError('Please enter a valid email address.');
      return;
    }
    setOtpError('');
    setOtpStep('sending');
    try {
      const res = await fetch('/api/widget/otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'send', email: otpEmail, conversationId, orgId: org_id }),
      });
      const data = await res.json();
      if (!data.success) {
        setOtpError(data.error || 'Failed to send OTP. Please try again.');
        setOtpStep('email');
      } else {
        setOtpName(data.name || '');
        setOtpStep('otp');
      }
    } catch {
      setOtpError('Network error. Please check your connection.');
      setOtpStep('email');
    }
  };

  const handleVerifyOTP = async () => {
    if (!otpCode.trim() || otpCode.length < 6) {
      setOtpError('Please enter the 6-digit code.');
      return;
    }
    setOtpError('');
    setOtpStep('verifying');
    try {
      const res = await fetch('/api/widget/otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'verify', email: otpEmail, otp: otpCode, conversationId, orgId: org_id }),
      });
      const data = await res.json();
      if (!data.success) {
        setOtpError(data.error || 'Incorrect code. Please try again.');
        setOtpStep('otp');
      } else {
        setOtpTicketId(data.ticketId || '');
        setOtpStep('success');
      }
    } catch {
      setOtpError('Network error. Please check your connection.');
      setOtpStep('otp');
    }
  };

  const handleDownloadTranscript = () => {
    const text = messages.map(m => `[${new Date(m.created_at).toLocaleString()}] ${m.sender_type === 'agent' ? m.agent?.name || 'Agent' : 'You'}: ${m.content}`).join('\n\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `TalkFuze_Transcript_${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    setIsHeaderMenuOpen(false);
  };

  const handleConvertToTicket = () => {
    setIsHeaderMenuOpen(false);
    setOtpStep('email');
    setOtpError('');
    setShowTicketLogin(true);
  };

  const handleExpandWindow = () => {
    setIsHeaderMenuOpen(false);
    window.parent.postMessage({ type: 'TALKFUZE_EXPAND' }, '*');
  };

  const headerStyle = isCustomColor ? { backgroundColor: settings.color } : {}

  return (
    <div className="h-full w-full flex flex-col bg-white rounded-2xl shadow-xl overflow-hidden font-sans relative">
      
      {/* Background Gradient for Home/Tickets/About */}
      {activeTab !== 'messages' && activeTab !== 'chat' && (
        <div 
          className={`absolute top-0 left-0 right-0 h-[45%] ${!isCustomColor ? 'bg-gradient-to-b from-slate-600 to-slate-400' : ''} z-0`}
          style={isCustomColor ? { background: `linear-gradient(to bottom, ${settings.color}, ${settings.color}ee)` } : {}}
        />
      )}

      {/* Header controls (Close, Mute) - Absolute positioned */}
      {activeTab !== 'messages' && activeTab !== 'chat' && (
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
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M13.25 3.95L12.05 2.75L8 6.8L3.95 2.75L2.75 3.95L6.8 8L2.75 12.05L3.95 13.25L8 9.2L12.05 13.25L13.25 12.05L9.2 8L13.25 3.95Z" /></svg>
            </button>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 relative z-10 overflow-hidden bg-transparent">
        
        {/* HOME TAB */}
        <div className={`absolute inset-0 overflow-y-auto pb-[80px] scrollbar-hide bg-transparent transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${activeTab === 'home' ? 'translate-x-0 opacity-100 z-30' : '-translate-x-[20%] opacity-0 z-10 pointer-events-none'}`}>
          <div className="px-5 pt-12 pb-6 flex flex-col gap-5">
            
            {/* Header Graphics (Ahrefs Style) */}
            <div className="flex justify-between items-center mt-4 mb-6">
              {/* Left Side: Company Logo */}
              <div className="flex items-center h-[32px]">
                <img src="/team/logo.png" className="h-[28px] w-auto object-contain" alt="Logo" />
              </div>

              {/* Right Side: Team Avatars Stack */}
              <div className="flex items-center mr-1">
                <div className="flex -space-x-2.5 relative">
                  <img src="/team/1.avif" className="w-[32px] h-[32px] rounded-full border-[2px] border-slate-500 object-cover shadow-sm relative z-40" alt="Team member" />
                  <img src="/team/2.avif" className="w-[32px] h-[32px] rounded-full border-[2px] border-slate-500 object-cover shadow-sm relative z-30" alt="Team member" />
                  <img src="/team/3.avif" className="w-[32px] h-[32px] rounded-full border-[2px] border-slate-500 object-cover shadow-sm relative z-20" alt="Team member" />
                  <div className="w-[32px] h-[32px] rounded-full border-[2px] border-slate-500 bg-slate-700/80 flex items-center justify-center text-[11px] font-bold text-white shadow-sm relative z-10">
                    +9
                  </div>
                </div>
              </div>
            </div>

            {/* Header Text */}
            <div className="mb-2">
              <h1 className="text-[32px] font-bold tracking-tight text-white leading-[1.15] mb-1">{greetingTitle}</h1>
              <p className="text-white/90 text-[17px] font-medium tracking-tight">{greetingSubtitle}</p>
            </div>

            {/* Recent Message Card */}
            <div 
              className="bg-white p-4 rounded-[16px] shadow-[0_4px_15px_rgba(0,0,0,0.06)] border border-slate-100 flex flex-col gap-3 cursor-pointer hover:shadow-[0_6px_20px_rgba(0,0,0,0.08)] transition-all" 
              onClick={() => { setActiveConversationId(conversations[0]?.id || 'new'); setActiveTab('chat'); }}
            >
               <div className="flex justify-between items-center">
                  <span className="text-[13px] font-bold text-slate-800 tracking-tight">Recent message</span>
                  {lastMessage && <span className="text-[12px] text-slate-400">Just now</span>}
               </div>
               <div className="flex items-center gap-3">
                 <div className="relative shrink-0">
                    {activeAgent?.avatar_url ? (
                      <div className="w-[42px] h-[42px] rounded-full border border-slate-100 bg-white flex items-center justify-center shadow-sm overflow-hidden">
                        <img src={activeAgent.avatar_url} className="w-full h-full object-cover" alt={headerName} />
                      </div>
                    ) : (
                      <div className="w-[42px] h-[42px] rounded-full border border-slate-100 bg-white flex items-center justify-center shadow-sm overflow-hidden">
                         <img src="/team/h.jpg" className="w-full h-full object-cover" alt="Logo" />
                      </div>
                    )}
                    <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-white rounded-full"></div>
                 </div>
                 <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-[15px] font-bold text-slate-800 tracking-tight">{headerName}</span>
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
              onClick={() => { setActiveConversationId('new'); setActiveTab('chat'); }}
            >
               <div className="p-4 flex items-center justify-between text-left">
                  <div>
                    <h3 className="font-bold text-slate-800 text-[15px] tracking-tight mb-0.5">Chat with us</h3>
                    <p className="text-[13px] text-slate-500 tracking-tight">Active now</p>
                  </div>
                  <div className="w-[32px] h-[32px] bg-[#0070f3] text-white rounded-full flex items-center justify-center rotate-0 shrink-0 shadow-sm">
                    <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M7.4 1.899a.85.85 0 0 1 1.201 0l4.5 4.5A.85.85 0 1 1 11.9 7.6L8.85 4.552V13.5a.85.85 0 0 1-1.7 0V4.552L4.101 7.601A.85.85 0 1 1 2.9 6.399z" /></svg>
                  </div>
               </div>
            </div>
            
          </div>
        </div>

        {/* CONVERSATIONS LIST TAB */}
        <div className={`absolute inset-0 overflow-y-auto pb-[120px] scrollbar-hide bg-[#f9fafb] flex flex-col transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${activeTab === 'messages' ? 'translate-x-0 opacity-100 z-30' : activeTab === 'home' ? 'translate-x-full opacity-0 z-10 pointer-events-none' : '-translate-x-[20%] opacity-0 z-10 pointer-events-none'}`}>
            <div className="bg-white px-6 py-4 flex justify-between items-center shrink-0 border-b border-slate-100 relative z-30">
               <div className="flex items-center gap-2">
                 <button onClick={() => setActiveTab('home')} className="text-slate-400 hover:text-slate-600 transition-colors p-1.5 -ml-2 rounded-md hover:bg-slate-50">
                    <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M10.85 3.99984C10.85 4.21984 10.77 4.43984 10.6 4.59984L7.20005 7.99984L10.6 11.3998C10.93 11.7298 10.93 12.2698 10.6 12.5998C10.27 12.9298 9.73005 12.9298 9.40005 12.5998L4.80005 7.99984L9.40005 3.39984C9.73005 3.06984 10.27 3.06984 10.6 3.39984C10.77 3.56984 10.85 3.77984 10.85 3.99984Z" /></svg>
                 </button>
                 <h1 className="text-[18px] font-bold text-slate-800 tracking-tight">Messages</h1>
               </div>
               <button className="p-1.5 hover:bg-slate-50 transition-colors rounded-full text-slate-400 -mr-1.5" onClick={() => window.parent.postMessage({ type: 'TALKFUZE_CLOSE' }, '*')}>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M13.25 3.95L12.05 2.75L8 6.8L3.95 2.75L2.75 3.95L6.8 8L2.75 12.05L3.95 13.25L8 9.2L12.05 13.25L13.25 12.05L9.2 8L13.25 3.95Z" /></svg>
               </button>
            </div>
            
            <div className="flex-1 overflow-y-auto px-4 py-4 pb-[120px] flex flex-col gap-0 relative z-30 bg-white">
               {conversations.length === 0 ? (
                 <div className="text-center text-slate-500 mt-10 text-[14px]">No messages yet.</div>
               ) : (
                 conversations.map(conv => (
                   <div key={conv.id} onClick={() => { setActiveConversationId(conv.id); setActiveTab('chat'); }} className="bg-white p-4 cursor-pointer hover:bg-slate-50 transition-colors flex gap-3 relative border-b border-slate-50 last:border-0">
                      <div className="relative shrink-0 mt-0.5">
                         {conv.agent?.avatar_url ? (
                           <div className="w-[36px] h-[36px] rounded-full border border-slate-100 bg-white flex items-center justify-center shadow-sm overflow-hidden">
                              <img src={conv.agent.avatar_url} className="w-full h-full object-cover" alt="Agent" />
                           </div>
                         ) : (
                           <div className="w-[36px] h-[36px] rounded-full border border-slate-100 bg-white flex items-center justify-center shadow-sm overflow-hidden">
                              <img src="/team/h.jpg" className="w-full h-full object-cover" alt="Agent" />
                           </div>
                         )}
                      </div>
                      <div className="flex-1 min-w-0">
                         <div className="flex justify-between items-start">
                            <span className="font-semibold text-[14px] text-slate-800">{conv.agent?.name || "Hostnin"}</span>
                            <span className="text-[12px] text-slate-400">
                               {new Date(conv.last_message_at || conv.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                            </span>
                         </div>
                         <div className="flex items-center justify-between mt-0.5">
                           <p className="text-[14px] text-slate-500 truncate tracking-tight pr-4">
                              {conv.latestMessage ? (conv.latestMessage.sender_type === 'contact' ? 'You: ' + conv.latestMessage.content : conv.latestMessage.content) : 'No messages yet'}
                           </p>
                           {/* Unread indicator placeholder */}
                           {/* <div className="w-2 h-2 rounded-full bg-red-500 shrink-0"></div> */}
                         </div>
                      </div>
                   </div>
                 ))
               )}
            </div>

            {/* Floating Chat with us button */}
            <div className="absolute bottom-[90px] left-0 right-0 flex justify-center z-40 pointer-events-none">
               <button onClick={() => { setActiveConversationId('new'); setActiveTab('chat'); }} className="pointer-events-auto bg-[#5a718c] hover:bg-[#4d6179] text-white px-5 py-2.5 rounded-full shadow-lg flex items-center gap-2 font-semibold text-[14px] transition-all">
                  Chat with us
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"></path></svg>
               </button>
            </div>
          </div>

        {/* CHAT TAB (THREAD) */}
        <div className={`absolute inset-0 overflow-hidden bg-white flex flex-col transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${activeTab === 'chat' ? 'translate-x-0 opacity-100 z-30' : 'translate-x-full opacity-0 z-10 pointer-events-none'}`}>
            {activeConversationId && (
              <div className="h-full flex flex-col relative z-30">
            
            {/* Thread Header */}
            <div className="bg-white border-b border-slate-100 px-3 py-3 flex justify-between items-center shrink-0 shadow-sm relative z-30">
              <div className="flex items-center gap-2">
                 <button onClick={() => setActiveTab('messages')} className="text-slate-400 hover:text-slate-600 transition-colors p-1.5 -ml-1">
                    <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M10.85 3.99984C10.85 4.21984 10.77 4.43984 10.6 4.59984L7.20005 7.99984L10.6 11.3998C10.93 11.7298 10.93 12.2698 10.6 12.5998C10.27 12.9298 9.73005 12.9298 9.40005 12.5998L4.80005 7.99984L9.40005 3.39984C9.73005 3.06984 10.27 3.06984 10.6 3.39984C10.77 3.56984 10.85 3.77984 10.85 3.99984Z" /></svg>
                 </button>
                 <div className="flex items-center gap-2.5">
                   <div className="relative">
                     {activeAgent?.avatar_url ? (
                       <div className="w-9 h-9 rounded-full border border-slate-100 bg-white flex items-center justify-center shadow-sm overflow-hidden">
                          <img src={activeAgent.avatar_url} className="w-full h-full object-cover" alt={headerName} />
                       </div>
                     ) : (
                       <div className="w-9 h-9 rounded-full border border-slate-100 bg-white flex items-center justify-center shadow-sm overflow-hidden">
                          <img src="/team/h.jpg" className="w-full h-full object-cover" alt="Logo" />
                       </div>
                     )}
                     <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 border-2 border-white rounded-full"></div>
                   </div>
                   <div className="flex flex-col">
                     <span className="font-bold text-[14px] text-slate-800 leading-tight">{headerName}</span>
                     <span className="text-[12px] text-slate-500 leading-tight">{headerSubtitle}</span>
                   </div>
                 </div>
              </div>
              <div className="flex items-center gap-0.5 text-slate-400">
                 <div className="relative" ref={headerMenuRef}>
                   <button 
                     onClick={() => setIsHeaderMenuOpen(!isHeaderMenuOpen)} 
                     className="p-1.5 hover:text-slate-600 transition-colors rounded-full hover:bg-slate-50"
                   >
                      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="1"></circle><circle cx="19" cy="12" r="1"></circle><circle cx="5" cy="12" r="1"></circle></svg>
                   </button>
                   
                   {isHeaderMenuOpen && (
                     <div className="absolute right-0 top-full mt-1 w-max bg-white border border-slate-100 rounded-xl shadow-lg z-50 py-1 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200 origin-top-right">
                       <button onClick={handleConvertToTicket} className="text-left px-4 py-2.5 text-[13px] text-slate-700 hover:bg-slate-50 hover:text-blue-600 transition-colors font-medium whitespace-nowrap">Convert to Ticket</button>
                       <button onClick={handleDownloadTranscript} className="text-left px-4 py-2.5 text-[13px] text-slate-700 hover:bg-slate-50 hover:text-blue-600 transition-colors font-medium whitespace-nowrap">Download Transcript</button>
                     </div>
                   )}
                 </div>
                 <button className="p-1.5 hover:text-slate-600 transition-colors rounded-full hover:bg-slate-50" onClick={() => window.parent.postMessage({ type: 'TALKFUZE_CLOSE' }, '*')}>
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M13.25 3.95L12.05 2.75L8 6.8L3.95 2.75L2.75 3.95L6.8 8L2.75 12.05L3.95 13.25L8 9.2L12.05 13.25L13.25 12.05L9.2 8L13.25 3.95Z" /></svg>
                 </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-5 pb-[120px] flex flex-col gap-3 bg-[#f9fafb]">
              {/* Persistent Welcome Greeting */}
              <div className="flex flex-col gap-1 items-start mb-1 mt-2">
                <div className="flex gap-2 items-end">
                  <img src="/team/h.jpg" className="w-6 h-6 rounded-full shrink-0 object-cover bg-slate-100 border border-slate-200" alt="Support Team" />
                  <div className="bg-[#f3f4f6] rounded-[18px] rounded-bl-[4px] py-3 px-4 text-[15px] text-slate-800 max-w-[85%] whitespace-pre-wrap tracking-tight">
                    Hello! How can I assist you today?
                  </div>
                </div>
                <span className="text-[11px] text-slate-400 ml-[32px]">Support Team</span>
              </div>

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
                ) : (() => {
                  const msgTime = msg.created_at ? new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
                  const isSending = msg.status === 'sending';
                  const isSeen = !isSending && messages.slice(idx + 1).some(m => m.sender_type === 'agent' || m.sender_type === 'ai');
                  return (
                    <div key={idx} className="flex flex-col gap-0.5 items-end mb-1">
                      <div className="bg-[#64748b] rounded-[18px] rounded-br-[4px] py-3 px-4 text-[15px] text-white shadow-sm max-w-[85%] whitespace-pre-wrap tracking-tight">
                        {msg.content_type === 'audio' ? (
                          <CustomAudioPlayer url={(msg.metadata as any)?.url} isDark={true} />
                        ) : (
                          msg.content
                        )}
                      </div>
                      <div className="flex items-center gap-1 mr-0.5">
                        {msgTime && <span className="text-[11px] text-slate-400">{msgTime}</span>}
                        {isSending ? (
                          <svg className="w-3 h-3 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>
                        ) : isSeen ? (
                          <svg className="w-[15px] h-[15px] text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 13l5 5L18 6"/><path d="M8 13l5 5L22 6"/></svg>
                        ) : (
                          <svg className="w-[13px] h-[13px] text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7"/></svg>
                        )}
                      </div>
                    </div>
                  );
                })()
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
                          if (e.nativeEvent.isComposing) return
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
                          className="w-[32px] h-[32px] bg-slate-100 text-slate-400 flex items-center justify-center rounded-full transition-all data-[active=true]:bg-[#0070f3] data-[active=true]:text-white mr-1 shrink-0"
                          data-active={!!input.trim() && !isSending}
                       >
                          <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M7.4 1.899a.85.85 0 0 1 1.201 0l4.5 4.5A.85.85 0 1 1 11.9 7.6L8.85 4.552V13.5a.85.85 0 0 1-1.7 0V4.552L4.101 7.601A.85.85 0 1 1 2.9 6.399z" /></svg>
                       </button>
                    </div>
                   )}
                </div>
             </div>

             {/* Convert to Ticket Modal */}
             {showTicketLogin && (
               <>
                 <div className="absolute inset-0 bg-slate-900/20 backdrop-blur-[1px] z-40 animate-in fade-in duration-200" onClick={otpStep === 'email' ? resetOtpModal : undefined} />
                 <div className="absolute bottom-0 left-0 right-0 bg-white z-50 border-t border-slate-100 shadow-[0_-10px_40px_rgba(0,0,0,0.1)] rounded-t-[24px] p-6 pb-8 animate-in slide-in-from-bottom-8 duration-300">

                   {/* STEP: email */}
                   {(otpStep === 'email' || otpStep === 'sending') && (
                     <>
                       <div className="flex justify-between items-center mb-3">
                         <h3 className="font-bold text-slate-800 text-[18px] tracking-tight">Convert to Ticket</h3>
                         <button onClick={resetOtpModal} className="text-slate-400 hover:text-slate-600 bg-slate-50 hover:bg-slate-100 rounded-full p-1.5 transition-colors"><X size={18} strokeWidth={2.5} /></button>
                       </div>
                       <p className="text-slate-500 text-[14px] mb-5 leading-relaxed">Enter your registered WHMCS email. We'll send a 6-digit code to verify your identity.</p>
                       <label className="block text-[12px] font-bold text-slate-600 uppercase tracking-wider mb-2">Email Address</label>
                       <input
                         type="email"
                         value={otpEmail}
                         onChange={e => { setOtpEmail(e.target.value); setOtpError(''); }}
                         onKeyDown={e => e.key === 'Enter' && handleSendOTP()}
                         placeholder="admin@yourdomain.com"
                         disabled={otpStep === 'sending'}
                         className="w-full bg-[#f9fafb] border border-slate-200 rounded-xl p-3.5 text-[14px] mb-1 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all placeholder:text-slate-400 disabled:opacity-60"
                       />
                       {otpError && <p className="text-red-500 text-[13px] mb-3 mt-1">{otpError}</p>}
                       {!otpError && <div className="mb-4" />}
                       <button
                         onClick={handleSendOTP}
                         disabled={otpStep === 'sending'}
                         className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold py-3.5 rounded-xl text-[14px] transition-all shadow-[0_4px_12px_rgba(37,99,235,0.2)] active:scale-[0.98] flex items-center justify-center gap-2"
                       >
                         {otpStep === 'sending' ? (
                           <><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>Sending Code...</>
                         ) : 'Send Login OTP'}
                       </button>
                     </>
                   )}

                   {/* STEP: otp entry */}
                   {(otpStep === 'otp' || otpStep === 'verifying') && (
                     <>
                       <div className="flex justify-between items-center mb-3">
                         <button onClick={() => { setOtpStep('email'); setOtpError(''); }} className="text-slate-400 hover:text-slate-600 p-1 -ml-1 transition-colors">
                           <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
                         </button>
                         <h3 className="font-bold text-slate-800 text-[18px] tracking-tight">Check your inbox</h3>
                         <button onClick={resetOtpModal} className="text-slate-400 hover:text-slate-600 bg-slate-50 hover:bg-slate-100 rounded-full p-1.5 transition-colors"><X size={18} strokeWidth={2.5} /></button>
                       </div>
                       <p className="text-slate-500 text-[14px] mb-5 leading-relaxed">
                         We sent a 6-digit code to <strong className="text-slate-700">{otpEmail}</strong>{otpName ? `. Hi ${otpName}!` : '.'} Enter it below.
                       </p>
                       <label className="block text-[12px] font-bold text-slate-600 uppercase tracking-wider mb-2">6-Digit Code</label>
                       <input
                         type="text"
                         value={otpCode}
                         onChange={e => { setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6)); setOtpError(''); }}
                         onKeyDown={e => e.key === 'Enter' && handleVerifyOTP()}
                         placeholder="000000"
                         maxLength={6}
                         disabled={otpStep === 'verifying'}
                         className="w-full bg-[#f9fafb] border border-slate-200 rounded-xl p-3.5 text-[18px] text-center font-mono tracking-[0.5em] mb-1 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all placeholder:text-slate-300 disabled:opacity-60"
                       />
                       {otpError && <p className="text-red-500 text-[13px] mb-3 mt-1">{otpError}</p>}
                       {!otpError && <div className="mb-4" />}
                       <button
                         onClick={handleVerifyOTP}
                         disabled={otpStep === 'verifying' || otpCode.length < 6}
                         className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold py-3.5 rounded-xl text-[14px] transition-all shadow-[0_4px_12px_rgba(37,99,235,0.2)] active:scale-[0.98] flex items-center justify-center gap-2"
                       >
                         {otpStep === 'verifying' ? (
                           <><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>Verifying...</>
                         ) : 'Verify & Convert'}
                       </button>
                       <button onClick={handleSendOTP} disabled={otpStep === 'verifying'} className="w-full text-center text-[13px] text-slate-400 hover:text-blue-600 mt-3 transition-colors disabled:opacity-40">
                         Resend code
                       </button>
                     </>
                   )}

                   {/* STEP: success */}
                   {otpStep === 'success' && (
                     <div className="flex flex-col items-center text-center py-4">
                       <div className="w-14 h-14 bg-green-50 rounded-full flex items-center justify-center mb-4">
                         <svg className="w-7 h-7 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                       </div>
                       <h3 className="font-bold text-slate-800 text-[18px] mb-2">Ticket Created!</h3>
                       {otpTicketId ? (
                         <p className="text-slate-500 text-[14px] leading-relaxed mb-6">Your conversation has been converted to ticket <strong className="text-slate-700">#{otpTicketId}</strong>. We'll reply to <strong className="text-slate-700">{otpEmail}</strong> shortly.</p>
                       ) : (
                         <p className="text-slate-500 text-[14px] leading-relaxed mb-6">Your request has been received. We'll get back to you at <strong className="text-slate-700">{otpEmail}</strong> shortly.</p>
                       )}
                       <button onClick={resetOtpModal} className="w-full bg-slate-800 hover:bg-slate-900 text-white font-semibold py-3.5 rounded-xl text-[14px] transition-all active:scale-[0.98]">
                         Done
                       </button>
                     </div>
                   )}

                 </div>
               </>
             )}
              </div>
            )}
        </div>

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

      </div>

      {/* Bottom Navigation */}
      {activeTab !== 'messages' && activeTab !== 'chat' && (
        <div className="absolute bottom-0 left-0 right-0 bg-white border-t border-slate-100 flex justify-center gap-[60px] px-6 py-[12px] z-20">
          <button onClick={() => setActiveTab('home')} className={`flex flex-col items-center gap-[5px] ${activeTab === 'home' ? 'text-[#7384a2]' : 'text-[#6c6f74] hover:text-[#7384a2]'} transition-colors`}>
             <div className="relative">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeWidth="1.7" d="M2.85 9.35c0-.423.218-.85.635-1.143l7.496-5.172h.001a1.84 1.84 0 0 1 2.036 0l7.495 5.17.002.002c.417.293.635.72.635 1.142V19.7c0 .73-.676 1.45-1.65 1.45h-15c-.974 0-1.65-.72-1.65-1.45z"></path><path stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" d="M17.25 15A7.86 7.86 0 0 1 12 17.002 7.86 7.86 0 0 1 6.75 15"></path></svg>
             </div>
             <span className={`text-[13px] ${activeTab === 'home' ? 'font-bold' : 'font-medium'} tracking-tight`}>Home</span>
          </button>
          
          <button onClick={() => setActiveTab('messages')} className={`flex flex-col items-center gap-[5px] ${(activeTab as any) === 'messages' ? 'text-[#7384a2]' : 'text-[#6c6f74] hover:text-[#7384a2]'} transition-colors`}>
             <div className="relative">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24" aria-hidden="true"><mask id="msg-mask" fill="#fff"><path fillRule="evenodd" d="M19 2a3 3 0 0 1 3 3v15.806c0 1.335-1.613 2.005-2.559 1.062L15.56 18H5a3 3 0 0 1-3-3V5a3 3 0 0 1 3-3z" clipRule="evenodd"></path></mask><path fill="currentColor" d="m19.441 21.868 1.2-1.204zM15.56 18v-1.7h.702l.498.496zM20.3 5A1.3 1.3 0 0 0 19 3.7V.3A4.7 4.7 0 0 1 23.7 5zm0 8.956V5h3.4v8.956zm0 2.544v-2.544h3.4V16.5zm0 4.306V16.5h3.4v4.306zm.341-.142a.23.23 0 0 0-.218-.043.23.23 0 0 0-.123.185h3.4c0 2.848-3.441 4.277-5.459 2.267zm-3.882-3.868 3.882 3.868-2.4 2.409-3.882-3.869zM5 16.3h10.559v3.4H5zM3.7 15A1.3 1.3 0 0 0 5 16.3v3.4A4.7 4.7 0 0 1 .3 15zm0-10v10H.3V5zM5 3.7A1.3 1.3 0 0 0 3.7 5H.3A4.7 4.7 0 0 1 5 .3zm14 0H5V.3h14z" mask="url(#msg-mask)"></path><path fill="currentColor" fillRule="evenodd" d="M17 7a.85.85 0 0 1 0 1.7H7A.85.85 0 1 1 7 7zm-5 4a.85.85 0 0 1 0 1.7H7A.85.85 0 0 1 7 11z" clipRule="evenodd"></path></svg>
             </div>
             <span className={`text-[13px] ${(activeTab as any) === 'messages' ? 'font-bold' : 'font-medium'} tracking-tight`}>Messages</span>
          </button>
          
          <button onClick={() => setActiveTab('tickets')} className={`flex flex-col items-center gap-[5px] ${activeTab === 'tickets' ? 'text-[#7384a2]' : 'text-[#6c6f74] hover:text-[#7384a2]'} transition-colors`}>
             <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9.65" stroke="currentColor" strokeWidth="1.7"></circle><path stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" d="M9.664 8.576a2.41 2.41 0 1 1 4.102 2.39l-1.075 1.104c-.326.322-.765.76-.765 1.544v.364"></path><circle cx="11.927" cy="16.884" r="0.884" fill="currentColor"></circle></svg>
             <span className={`text-[13px] ${activeTab === 'tickets' ? 'font-bold' : 'font-medium'} tracking-tight`}>Help</span>
          </button>
        </div>
      )}
    </div>
  )
}
