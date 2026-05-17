"use client"

import { Clock, MoreHorizontal, Send, Star, Zap, UserPlus, Check, CheckCheck, MessageSquare, Lock, Search, Paperclip, Loader2, Mic, Square, X, Bot } from "lucide-react"
import { useState, useRef, useEffect } from "react"
import { replyToConversation, getQuickReplies } from "@/actions/dashboard"
import { supabase } from "@/lib/supabase"
import { useMessageStore } from "@/lib/store"

const AVATAR_COLORS = [
  'bg-purple-500', 'bg-blue-500', 'bg-green-500', 'bg-orange-500',
  'bg-pink-500', 'bg-teal-500', 'bg-red-500', 'bg-indigo-500'
]

function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function renderTextWithLinks(text: string, isAgent: boolean) {
  if (!text) return text;
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = text.split(urlRegex);
  return parts.map((part, i) => {
    if (part.match(urlRegex)) {
      return (
        <a 
          key={i} 
          href={part} 
          target="_blank" 
          rel="noopener noreferrer" 
          className={isAgent ? "underline underline-offset-2 hover:opacity-80 transition-opacity" : "text-blue-600 dark:text-blue-400 hover:underline underline-offset-2 transition-all"}
          onClick={(e) => e.stopPropagation()}
        >
          {part}
        </a>
      );
    }
    return part;
  });
}

export default function ChatThread({ 
  conversationId, 
  messages, 
  orgId,
  teamMembers = [],
  isCustomerTyping = false,
  conversation = null,
  currentUser
}: { 
  conversationId: string | null, 
  messages: any[],
  orgId: string,
  teamMembers?: any[],
  isCustomerTyping?: boolean,
  conversation?: any,
  currentUser?: any
}) {
  const contactName: string = conversation?.contact?.name || conversation?.contact?.[0]?.name || 'Contact'
  const contactInitial = contactName.charAt(0).toUpperCase()
  const avatarColor = getAvatarColor(contactName)

  const [input, setInput] = useState("")
  
  // Load draft when conversation changes
  useEffect(() => {
    if (conversationId) {
      const timer = setTimeout(() => {
        const draft = localStorage.getItem(`draft_${conversationId}`)
        setInput(draft || "")
      }, 0)
      return () => clearTimeout(timer)
    }
  }, [conversationId])

  // Save draft when input changes
  useEffect(() => {
    if (conversationId) {
      if (input) {
        localStorage.setItem(`draft_${conversationId}`, input)
      } else {
        localStorage.removeItem(`draft_${conversationId}`)
      }
    }
  }, [input, conversationId])

  const [isSending, setIsSending] = useState(false)
  const [isInternal, setIsInternal] = useState(false)
  const [optimisticMessages, setOptimisticMessages] = useState<any[]>([])
  
  // Quick Replies State
  const [quickReplies, setQuickReplies] = useState<any[]>([])
  const [showMacroMenu, setShowMacroMenu] = useState(false)
  const [macroFilter, setMacroFilter] = useState("")
  const [selectedIndex, setSelectedIndex] = useState(0)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isUploading, setIsUploading] = useState(false)
  
  // Audio Recording States
  const [isRecording, setIsRecording] = useState(false)
  const [recordingDuration, setRecordingDuration] = useState(0)
  const [zoomedImage, setZoomedImage] = useState<string | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<BlobPart[]>([])
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  useEffect(() => {
    getQuickReplies(orgId).then(data => {
      if (data) setQuickReplies(data)
    })
  }, [orgId])

  // Clear optimistic messages when real messages arrive via WebSockets
  useEffect(() => {
    const timer = setTimeout(() => {
      setOptimisticMessages([])
    }, 0)
    return () => clearTimeout(timer)
  }, [messages])

  const allMessages = [...messages, ...optimisticMessages]

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length, optimisticMessages.length])

  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Handle Input Change for Macro Menu
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value
    setInput(val)

    if (val === '/') {
      setShowMacroMenu(true)
      setMacroFilter("")
      setSelectedIndex(0)
    } else if (val.startsWith('/')) {
      setShowMacroMenu(true)
      setMacroFilter(val.substring(1).toLowerCase())
      setSelectedIndex(0)
    } else {
      setShowMacroMenu(false)
    }

    // Broadcast agent typing status
    if (conversationId && !isInternal) {
      supabase.channel(`typing:${orgId}`).send({
        type: 'broadcast',
        event: 'typingStatus',
        payload: { conversation_id: conversationId, direction: 'agent', is_typing: true }
      });
      
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      
      typingTimeoutRef.current = setTimeout(() => {
        supabase.channel(`typing:${orgId}`).send({
          type: 'broadcast',
          event: 'typingStatus',
          payload: { conversation_id: conversationId, direction: 'agent', is_typing: false }
        });
      }, 2000);
    }
  }

  const filteredMacros = quickReplies.filter(r => 
    r.shortcut.toLowerCase().includes(macroFilter) || 
    r.message.toLowerCase().includes(macroFilter)
  )

  const applyMacro = (message: string) => {
    setInput(message)
    setShowMacroMenu(false)
  }

  const handleSend = async () => {
    if (!input.trim() || !conversationId || isSending) return

    const msg = input.trim()
    setInput("")
    localStorage.removeItem(`draft_${conversationId}`)
    setIsSending(true)
    
    // Optimistic UI update
    setOptimisticMessages(prev => [...prev, {
      id: `temp-${Date.now()}`,
      sender_type: 'agent',
      sender_id: currentUser?.id,
      content: msg,
      is_internal: isInternal,
      status: 'sending'
    }])
    
    try {
      await replyToConversation(orgId, conversationId, msg, isInternal)
    } catch (e) {
      console.error(e)
    } finally {
      setIsUploading(false)
      setIsSending(false)
    }
  }
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      mediaRecorderRef.current = new MediaRecorder(stream)
      audioChunksRef.current = []

      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }

      mediaRecorderRef.current.start()
      setIsRecording(true)
      setRecordingDuration(0)

      timerRef.current = setInterval(() => {
        setRecordingDuration((prev) => prev + 1)
      }, 1000)
    } catch (err) {
      console.error("Error accessing microphone:", err)
      alert("Microphone access is required to record audio.")
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop())
      if (timerRef.current) clearInterval(timerRef.current)
      setIsRecording(false)
      setRecordingDuration(0)
    }
  }

  const cancelRecording = () => {
    stopRecording()
    audioChunksRef.current = []
  }

  const sendRecording = () => {
    if (!mediaRecorderRef.current) return
    
    mediaRecorderRef.current.onstop = async () => {
      const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
      const file = new File([audioBlob], 'voice-message.webm', { type: 'audio/webm' })
      await uploadFile(file)
      audioChunksRef.current = []
    }
    
    stopRecording()
  }
  
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const uploadFile = async (file: File) => {
    if (!conversationId) return;

    setIsUploading(true);
    try {
      const fileExt = file.name.split('.').pop() || 'png';
      const fileName = `${conversationId}/${Date.now()}.${fileExt}`;
      
      const { error } = await supabase.storage
        .from('media')
        .upload(fileName, file);
        
      if (error) throw error;
      
      const { data: urlData } = supabase.storage
        .from('media')
        .getPublicUrl(fileName);
        
      let contentType = 'file';
      if (file.type.startsWith('image/')) contentType = 'image';
      else if (file.type.startsWith('audio/')) contentType = 'audio';
      else if (file.type.startsWith('video/')) contentType = 'video';
      
      const contentText = contentType === 'image' ? '[Image]' : 
                          contentType === 'audio' ? '[Audio Voice Message]' : 
                          contentType === 'video' ? '[Video]' : '[Attachment]';
      
      await replyToConversation(orgId, conversationId, contentText, false, contentType, {
        media_url: urlData.publicUrl,
        mimetype: file.type,
        filename: file.name
      });
      
    } catch (err) {
      console.error("Upload failed:", err);
      alert("Failed to upload file");
    } finally {
      setIsUploading(false);
    }
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await uploadFile(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
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
            <h2 className="font-medium text-[16px] text-slate-900 dark:text-slate-100">
              {conversation?.contact?.name || "Active Chat"}
            </h2>
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-medium text-purple-600 hover:text-purple-700 bg-purple-50 hover:bg-purple-100 rounded-md transition-colors border border-purple-200">
            <Bot size={14} strokeWidth={2} /> Assign to AI
          </button>
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-6 bg-white dark:bg-[#0B0F19]">
        
        {allMessages.length === 0 && !isCustomerTyping && (
          <div className="h-full flex flex-col items-center justify-center text-center opacity-70 mt-10">
            <MessageSquare size={32} className="text-slate-300 mb-3" />
            <p className="text-slate-500 font-medium text-[14px]">No messages yet</p>
            <p className="text-slate-400 text-[13px] mt-1">Send a message to start the conversation.</p>
          </div>
        )}


        {[...allMessages, ...optimisticMessages].map((msg, idx) => {
          const isAgent = msg.sender_type === 'agent' || msg.sender_type === 'ai'
          const msgTime = msg.created_at ? new Date(msg.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
          
          if (isAgent) {
            // Find agent details from teamMembers
            let agent = msg.sender_id ? teamMembers.find(t => t.id === msg.sender_id) : null;
            
            // Fallback for messages sent from phone/webhook (null sender_id)
            if (!agent) {
              agent = currentUser ? teamMembers.find(t => t.id === currentUser.id) : teamMembers[0];
            }
            
            const agentName = agent?.name || "Hostnin Support";
            const agentInitial = agentName.charAt(0).toUpperCase();

            return (
              <div key={msg.id || idx} className={`flex items-end justify-end gap-2 mb-4 ${msg.is_internal ? 'mt-2' : ''}`}>
                <div className="flex flex-col items-end gap-1 max-w-[75%]">
                  {msg.is_internal && (
                    <div className="text-[11px] font-semibold text-amber-600 uppercase tracking-wider flex items-center gap-1 mb-0.5">
                      <Lock size={10} strokeWidth={3} /> Internal Note
                    </div>
                  )}
                  {/* Agent Name Banner */}
                  <div className="text-[11px] text-slate-500 mr-1 mb-0.5">{agentName}</div>
                  
                  <div className={`${msg.is_internal ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-900 dark:text-amber-100 border border-amber-200 dark:border-amber-800/50' : 'bg-[#0070f3] text-white'} rounded-2xl px-4 py-2.5 text-[14px] w-full leading-relaxed whitespace-pre-wrap break-words font-normal`}>
                  {msg.content_type === 'image' && msg.metadata?.media_url ? (
                    <div className="relative">
                      <img 
                        src={msg.metadata.media_url} 
                        alt="Attachment" 
                        className="max-w-[240px] max-h-[240px] rounded-lg object-cover mb-1 cursor-zoom-in hover:opacity-95 transition-opacity" 
                        onClick={() => setZoomedImage(msg.metadata.media_url)}
                      />
                      {msg.content !== '[Attachment]' && msg.content !== '[Image]' && <div className="mt-1">{renderTextWithLinks(msg.content, true)}</div>}
                    </div>
                  ) : msg.content_type === 'file' && msg.metadata?.media_url ? (
                    <a href={msg.metadata.media_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 p-2 bg-black/10 dark:bg-white/10 rounded-lg hover:bg-black/20 transition mb-1">
                      <Paperclip size={16} />
                      <span className="text-[13px] underline truncate max-w-[180px]">{msg.metadata.filename || 'Download File'}</span>
                    </a>
                  ) : msg.content_type === 'audio' && msg.metadata?.media_url ? (
                    <div className="flex flex-col gap-1">
                      <audio controls src={msg.metadata.media_url} className="w-[240px] h-[40px] outline-none" />
                      {msg.content !== '[Audio Voice Message]' && <div className="mt-1">{renderTextWithLinks(msg.content, true)}</div>}
                    </div>
                  ) : msg.content_type === 'video' && msg.metadata?.media_url ? (
                    <div className="flex flex-col gap-1">
                      <video controls src={msg.metadata.media_url} className="max-w-[240px] max-h-[240px] rounded-lg object-cover" />
                      {msg.content !== '[Video]' && <div className="mt-1">{renderTextWithLinks(msg.content, true)}</div>}
                    </div>
                  ) : (
                    <div>{renderTextWithLinks(msg.content, true)}</div>
                  )}
                  {!msg.is_internal && (
                    <div className="flex justify-end items-center gap-1 mt-0.5 opacity-90 -mr-1">
                      <span className="text-[10.5px] text-slate-400 mr-1">{msgTime}</span>
                      {msg.status === 'sending' ? (
                        <Clock size={12} className="text-white/60 animate-pulse" />
                      ) : msg.status === 'read' ? (
                        <CheckCheck size={14} className="text-blue-200" />
                      ) : msg.status === 'delivered' ? (
                        <CheckCheck size={14} className="text-white/80" />
                      ) : (
                        <Check size={14} className="text-white/80" />
                      )}
                    </div>
                  )}
                  {msg.is_internal && (
                    <div className="flex justify-end mt-0.5 opacity-90 mr-1">
                      <span className="text-[10.5px] text-slate-400">{msgTime}</span>
                    </div>
                  )}
                </div>
                
                {/* Agent Avatar */}
                <div className="w-7 h-7 rounded-full shrink-0 flex items-center justify-center bg-slate-200 text-slate-700 text-[11px] font-bold overflow-hidden">
                  {agent?.avatar_url ? (
                    <img src={agent.avatar_url} alt={agentName} className="w-full h-full object-cover" />
                  ) : (
                    agentInitial
                  )}
                </div>
              </div>
            </div>
            )
          } else {
            return (
              <div key={msg.id || idx} className="flex flex-col mb-4">
                <div className="flex items-end gap-2.5">
                  {/* Customer / Participant Avatar */}
                  {msg.metadata?.participant_avatar ? (
                    <img 
                      src={msg.metadata.participant_avatar} 
                      alt={msg.metadata.participant_name || contactName}
                      className="w-8 h-8 rounded-full object-cover shrink-0 mb-1"
                    />
                  ) : ((conversation?.contact?.avatar_url || conversation?.contact?.[0]?.avatar_url) && !(conversation?.contact?.platform_id?.endsWith('@g.us') || conversation?.contact?.[0]?.platform_id?.endsWith('@g.us'))) ? (
                    <img 
                      src={conversation?.contact?.avatar_url || conversation?.contact?.[0]?.avatar_url} 
                      alt={contactName}
                      className="w-8 h-8 rounded-full object-cover shrink-0 mb-1"
                    />
                  ) : (
                    <div className={`w-8 h-8 rounded-full ${avatarColor} text-white flex items-center justify-center text-[12px] font-semibold shrink-0 mb-1`}>
                      {msg.metadata?.participant_name ? msg.metadata.participant_name.charAt(0).toUpperCase() : contactInitial}
                    </div>
                  )}
                  <div className="max-w-[70%] flex flex-col gap-1">
                    {/* Participant Name Banner for Group Chats */}
                    {msg.metadata?.participant_name && (
                      <div className="text-[11px] text-slate-500 ml-1 mb-0.5">{msg.metadata.participant_name}</div>
                    )}
                    <div className="bg-slate-100 dark:bg-slate-800 rounded-2xl px-4 py-2.5 text-[14px] text-slate-900 dark:text-slate-200 leading-relaxed whitespace-pre-wrap break-words font-normal">
                      {msg.content_type === 'image' && msg.metadata?.media_url ? (
                        <div className="relative">
                          <img 
                            src={msg.metadata.media_url} 
                            alt="Attachment" 
                            className="max-w-[240px] max-h-[240px] rounded-lg object-cover mb-1 cursor-zoom-in hover:opacity-95 transition-opacity" 
                            onClick={() => setZoomedImage(msg.metadata.media_url)}
                          />
                          {msg.content !== '[Attachment]' && msg.content !== '[Image]' && <div className="mt-1">{renderTextWithLinks(msg.content, false)}</div>}
                        </div>
                      ) : msg.content_type === 'file' && msg.metadata?.media_url ? (
                        <a href={msg.metadata.media_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 p-2 bg-black/5 dark:bg-white/5 rounded-lg hover:bg-black/10 transition mb-1">
                          <Paperclip size={16} />
                          <span className="text-[13px] underline truncate max-w-[180px]">{msg.metadata.filename || 'Download File'}</span>
                        </a>
                      ) : msg.content_type === 'audio' && msg.metadata?.media_url ? (
                        <div className="flex flex-col gap-1">
                          <audio controls src={msg.metadata.media_url} className="w-[240px] h-[40px] outline-none" />
                          {msg.content !== '[Audio Voice Message]' && <div className="mt-1">{renderTextWithLinks(msg.content, false)}</div>}
                        </div>
                      ) : msg.content_type === 'video' && msg.metadata?.media_url ? (
                        <div className="flex flex-col gap-1">
                          <video controls src={msg.metadata.media_url} className="max-w-[240px] max-h-[240px] rounded-lg object-cover" />
                          {msg.content !== '[Video]' && <div className="mt-1">{renderTextWithLinks(msg.content, false)}</div>}
                        </div>
                      ) : (
                        <div>{renderTextWithLinks(msg.content, false)}</div>
                      )}
                    </div>
                    <div className="flex items-center gap-1 mt-0.5 ml-1">
                      <span className="text-[10.5px] text-slate-400">{msgTime}</span>
                    </div>
                  </div>
                </div>
              </div>
            )
          }
        })}
        
        {isCustomerTyping && (
          <div className="flex flex-col mb-4 animate-in fade-in slide-in-from-bottom-2">
            <div className="flex items-end gap-2.5">
              <div className="w-8 h-8 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center text-[12px] font-semibold shrink-0 mb-1">
                C
              </div>
              <div className="bg-slate-100 dark:bg-slate-800 rounded-2xl px-4 py-3 max-w-[70%]">
                <div className="flex gap-1.5 items-center h-4">
                  <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }}></span>
                  <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }}></span>
                  <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }}></span>
                </div>
              </div>
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {/* Composer Area */}
      <div className="px-6 pb-6 pt-2 bg-white dark:bg-[#0B0F19] relative">
        {/* Macro Menu */}
        {showMacroMenu && quickReplies.length > 0 && (
          <div className="absolute bottom-full left-6 right-6 mb-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl overflow-hidden z-50 max-h-[300px] flex flex-col">
            <div className="px-3 py-2 bg-slate-50 dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2">
              <Zap size={14} className="text-blue-500" />
              <span className="text-[12px] font-medium text-slate-600 dark:text-slate-400">Quick Replies</span>
            </div>
            <div className="overflow-y-auto p-1">
              {filteredMacros.length === 0 ? (
                <div className="p-3 text-center text-[13px] text-slate-500">No matching replies found.</div>
              ) : (
                filteredMacros.map((macro, i) => (
                  <div 
                    key={macro.id} 
                    onClick={() => applyMacro(macro.message)}
                    className={`px-3 py-2 cursor-pointer rounded-lg flex flex-col gap-0.5 ${i === selectedIndex ? 'bg-blue-50 dark:bg-blue-900/20' : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'}`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-[12px] font-semibold text-blue-600 dark:text-blue-400 bg-blue-100/50 dark:bg-blue-900/50 px-1.5 py-0.5 rounded border border-blue-200/50 dark:border-blue-800/50">/{macro.shortcut}</span>
                    </div>
                    <span className="text-[13px] text-slate-600 dark:text-slate-300 line-clamp-1">{macro.message}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        <div className={`flex flex-col border rounded-xl overflow-hidden focus-within:ring-1 transition-all shadow-sm ${isInternal ? 'bg-amber-50 dark:bg-amber-950/20 border-amber-300 dark:border-amber-800 focus-within:border-amber-500 focus-within:ring-amber-500' : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 focus-within:border-blue-500 focus-within:ring-blue-500'}`}>
          {isRecording ? (
            <div className="flex items-center justify-between w-full p-4 min-h-[90px] bg-red-50/50 dark:bg-red-950/20">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
                <span className="text-red-600 dark:text-red-400 font-medium font-mono">
                  {formatDuration(recordingDuration)}
                </span>
                <span className="text-sm text-red-600/70 dark:text-red-400/70">Recording audio...</span>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={cancelRecording}
                  className="p-2 text-slate-500 hover:text-red-600 hover:bg-red-100 rounded-full transition-colors"
                >
                  <X size={20} />
                </button>
                <button 
                  onClick={sendRecording}
                  className="p-2 text-white bg-blue-500 hover:bg-blue-600 rounded-full shadow-sm transition-colors"
                >
                  <Check size={20} strokeWidth={2.5} />
                </button>
              </div>
            </div>
          ) : (
            <textarea 
              value={input}
              onChange={handleInputChange}
              onPaste={(e) => {
                if (e.clipboardData.files && e.clipboardData.files.length > 0) {
                  e.preventDefault();
                  const file = e.clipboardData.files[0];
                  uploadFile(file);
                }
              }}
              onKeyDown={(e) => {
                if (showMacroMenu && filteredMacros.length > 0) {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault()
                    setSelectedIndex(prev => (prev < filteredMacros.length - 1 ? prev + 1 : prev))
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault()
                    setSelectedIndex(prev => (prev > 0 ? prev - 1 : 0))
                  } else if (e.key === 'Enter') {
                    e.preventDefault()
                    applyMacro(filteredMacros[selectedIndex].message)
                  } else if (e.key === 'Escape') {
                    setShowMacroMenu(false)
                  }
                } else if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleSend()
                }
              }}
              placeholder={isInternal ? "Add an internal note (customer won't see this)..." : "Reply to customer... Type '/' for quick replies"}
              className={`w-full bg-transparent p-4 text-[14px] focus:outline-none min-h-[90px] resize-none font-normal leading-relaxed ${isInternal ? 'text-amber-900 dark:text-amber-100 placeholder:text-amber-700/50 dark:placeholder:text-amber-500/50' : 'text-slate-800 dark:text-slate-100 placeholder:text-slate-400'}`}
              disabled={isSending}
            ></textarea>
          )}
          
          <div className={`flex justify-between items-center px-3 py-2 border-t ${isInternal ? 'border-amber-200 dark:border-amber-800 bg-amber-100/50 dark:bg-amber-900/30' : 'border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50'}`}>
            <div className="flex items-center gap-1">
              <button className={`p-1.5 rounded-md transition-all ${isInternal ? 'text-amber-600 hover:bg-amber-200/50' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'}`}><Zap size={16} strokeWidth={2.5} /></button>
              
              {!isInternal && (
                <>
                  <input 
                    type="file" 
                    ref={fileInputRef}
                    className="hidden" 
                    onChange={handleFileUpload}
                  />
                  <button 
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading || isSending || isRecording}
                    className="p-1.5 rounded-md transition-all text-slate-400 hover:text-slate-600 hover:bg-slate-100 disabled:opacity-50"
                  >
                    {isUploading ? <Loader2 size={16} className="animate-spin" /> : <Paperclip size={16} strokeWidth={2} />}
                  </button>
                  <button 
                    onClick={isRecording ? stopRecording : startRecording}
                    disabled={isUploading || isSending}
                    className={`p-1.5 rounded-md transition-all disabled:opacity-50 ${isRecording ? 'text-red-500 hover:bg-red-50' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'}`}
                  >
                    {isRecording ? <Square size={16} strokeWidth={2} /> : <Mic size={16} strokeWidth={2} />}
                  </button>
                </>
              )}
            </div>
            <div className="flex items-center gap-3">
              <div className="flex bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg border border-slate-200 dark:border-slate-700">
                <button 
                  onClick={() => setIsInternal(false)}
                  className={`px-3 py-1 text-[12px] font-medium rounded-md transition-all ${!isInternal ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  Reply
                </button>
                <button 
                  onClick={() => setIsInternal(true)}
                  className={`px-3 py-1 text-[12px] font-medium rounded-md transition-all flex items-center gap-1.5 ${isInternal ? 'bg-white dark:bg-slate-700 text-amber-600 dark:text-amber-400 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  <Lock size={12} strokeWidth={2.5} /> Note
                </button>
              </div>
              <button 
                onClick={handleSend}
                disabled={!input.trim() || isSending}
                className={`px-5 py-1.5 text-[14px] font-medium text-white rounded-lg transition-colors flex items-center ${isInternal ? 'bg-amber-500 hover:bg-amber-600 disabled:bg-amber-300' : 'bg-[#0070f3] hover:bg-blue-600 disabled:bg-blue-300'}`}
              >
                {isInternal ? 'Add Note' : 'Send'}
              </button>
            </div>
          </div>
        </div>
      </div>
      {/* Image Zoom Modal */}
      {zoomedImage && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 cursor-zoom-out"
          onClick={() => setZoomedImage(null)}
        >
          <img 
            src={zoomedImage} 
            alt="Zoomed attachment" 
            className="max-w-full max-h-full object-contain rounded-md shadow-2xl" 
            onClick={(e) => e.stopPropagation()}
          />
          <button 
            className="absolute top-4 right-4 bg-white/20 hover:bg-white/30 text-white rounded-full p-2 transition-colors"
            onClick={() => setZoomedImage(null)}
          >
            <X size={24} />
          </button>
        </div>
      )}
    </div>
  )
}
