"use client"

import { Clock, Zap, Check, CheckCheck, MessageSquare, Lock, Paperclip, Loader2, Mic, Square, X, Bot, MoreVertical, LogOut, LogIn, Phone, Archive, Pin, BellOff, Mail, Trash2, Pencil, Image as ImageIcon, Video } from "lucide-react"
import { useState, useRef, useEffect } from "react"
import { createPortal } from "react-dom"
import { replyToConversation, getQuickReplies, joinConversation, getParticipants, getQuickRepliesFromTable, toggleConversationFlag, updateConversationStatus, leaveConversation, deleteConversation, uploadAgentMedia } from "@/actions/dashboard"
import { updateContactName } from "@/actions/contacts"
import { supabase } from "@/lib/supabase"
import { getErrorMessage } from "@/lib/utils"
import { useMessageStore, useInboxStore } from "@/lib/store"
import type { AppMessage, ConversationParticipant, ConversationWithDetails, QuickReplyItem, Relation, UserProfile } from "@/lib/types"

const AVATAR_COLORS = [
  'bg-purple-500', 'bg-blue-500', 'bg-green-500', 'bg-orange-500',
  'bg-pink-500', 'bg-teal-500', 'bg-red-500', 'bg-indigo-500'
]

function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
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
    <div className={`flex items-center gap-3 p-1.5 rounded-full min-w-[220px] ${isDark ? '' : ''}`}>
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

function renderTextWithLinks(text: string, isAgent: boolean) {
  if (!text) return text;
  
  if (text === '[Audio Voice Message]') {
    return <span className="flex items-center gap-1"><Mic size={14} className="text-blue-500 shrink-0" /> Voice message</span>;
  }
  if (text === '[Image]') {
    return <span className="flex items-center gap-1"><ImageIcon size={14} className="text-blue-500 shrink-0" /> Photo</span>;
  }
  if (text === '[Video]') {
    return <span className="flex items-center gap-1"><Video size={14} className="text-blue-500 shrink-0" /> Video</span>;
  }
  if (text === '[Attachment]') {
    return <span className="flex items-center gap-1"><Paperclip size={14} className="text-blue-500 shrink-0" /> Attachment</span>;
  }

  const urlRegex = /((?:https?:\/\/|www\.)[^\s]+)/gi;
  const parts = text.split(urlRegex);
  return parts.map((part, i) => {
    if (part.match(urlRegex)) {
      const href = part.toLowerCase().startsWith('http') ? part : `https://${part}`;
      return (
        <a 
          key={i} 
          href={href} 
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

function firstRelation<T>(relation: Relation<T> | undefined) {
  return Array.isArray(relation) ? relation[0] : relation
}

function getContentType(file: File | null) {
  if (!file) return 'text'
  if (file.type.startsWith('image/')) return 'image'
  if (file.type.startsWith('audio/')) return 'audio'
  if (file.type.startsWith('video/')) return 'video'
  return 'file'
}

type ChatThreadProps = {
  conversationId: string | null
  messages: AppMessage[]
  orgId: string
  teamMembers?: UserProfile[]
  isCustomerTyping?: boolean
  conversation?: ConversationWithDetails | null
  currentUser?: UserProfile | null
}

export default function ChatThread({ 
  conversationId, 
  messages, 
  orgId,
  teamMembers = [],
  isCustomerTyping = false,
  conversation = null,
  currentUser
}: ChatThreadProps) {
  const contact = firstRelation(conversation?.contact)
  const contactName = contact?.name || 'Contact'
  const contactInitial = contactName.charAt(0).toUpperCase()
  const avatarColor = getAvatarColor(contactName)

  const [input, setInput] = useState("")
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 300)}px`;
    }
  }, [input])

  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const { updateConversation, removeConversation, isLoaded } = useInboxStore()

  const [isEditingName, setIsEditingName] = useState(false)
  const [editedName, setEditedName] = useState("")

  useEffect(() => {
    if (contactName) setEditedName(contactName)
  }, [contactName, conversationId])

  const handleSaveName = async () => {
    if (!editedName.trim() || editedName === contactName || !contact?.id) {
      setIsEditingName(false)
      return
    }
    const result = await updateContactName(contact.id, editedName.trim())
    if (result.success) {
      setIsEditingName(false)
      if (conversationId) {
        updateConversation(conversationId, { contact: { ...contact, name: editedName.trim() } })
      }
    } else {
      setEditedName(contactName)
      setIsEditingName(false)
    }
  }

  // Close menu on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const handleResolveAndReview = async () => {
    if (!conversationId || !conversation) return
    setIsMenuOpen(false)
    try {
      const message = "Did we fix your issue? If yes, please leave a quick review here: https://g.page/r/hostnin/review\n\nIf no, click here to escalate: https://hostnin.com/contact"
      
      const tempId = crypto.randomUUID()
      addOptimisticMessage(conversationId, {
        id: tempId,
        sender_type: 'agent',
        sender_id: currentUser?.id ?? null,
        content: message,
        content_type: 'text',
        metadata: null,
        is_internal: false,
        status: 'sending',
        created_at: new Date().toISOString()
      })
      
      await replyToConversation(orgId, conversationId, message, false)
      removeOptimisticMessage(conversationId, tempId)
      
      // Auto-archive after sending CSAT
      await toggleConversationFlag(conversationId, 'is_archived', true)
      
    } catch (error) {
      console.error(error)
      alert("Failed to send review prompt or archive conversation")
    }
  }

  const handleThreadAction = async (action: string) => {
    if (!conversationId || !conversation) return
    setIsMenuOpen(false)
    try {
      if (action === 'leave' && currentUser) {
        // Optimistically insert the system message
        addOptimisticMessage(conversationId, {
          id: `temp-${Date.now()}`,
          conversation_id: conversationId,
          org_id: orgId,
          sender_id: currentUser.id,
          sender_type: 'system',
          content: `${currentUser.name} left the conversation`,
          content_type: 'system',
          metadata: null,
          is_internal: false,
          status: 'sending',
          created_at: new Date().toISOString()
        })
        const prevParticipants = [...participants]
        setParticipants(participants.filter(p => p.user_id !== currentUser?.id))
        updateConversation(conversationId, { assigned_to: null, assigned_type: 'unassigned' })
        try {
          await leaveConversation(conversationId)
        } catch (e) {
          setParticipants(prevParticipants)
          throw e
        }
      } else if (action === 'pin') {
        const newVal = !conversation.is_pinned
        updateConversation(conversationId, { is_pinned: newVal })
        try {
          await toggleConversationFlag(conversationId, 'is_pinned', newVal)
        } catch (e) {
          updateConversation(conversationId, { is_pinned: !newVal })
          throw e
        }
      } else if (action === 'unread') {
        const newVal = !conversation.is_unread
        updateConversation(conversationId, { is_unread: newVal })
        try {
          await toggleConversationFlag(conversationId, 'is_unread', newVal)
        } catch (e) {
          updateConversation(conversationId, { is_unread: !newVal })
          throw e
        }
      } else if (action === 'mute') {
        const newVal = !conversation.is_muted
        updateConversation(conversationId, { is_muted: newVal })
        try {
          await toggleConversationFlag(conversationId, 'is_muted', newVal)
        } catch (e) {
          updateConversation(conversationId, { is_muted: !newVal })
          throw e
        }
      } else if (action === 'archive') {
        const newVal = !conversation.is_archived
        updateConversation(conversationId, { is_archived: newVal })
        try {
          await toggleConversationFlag(conversationId, 'is_archived', newVal)
        } catch (e) {
          updateConversation(conversationId, { is_archived: !newVal })
          throw e
        }
      } else if (action === 'delete') {
        if (confirm('Are you sure you want to permanently delete this thread?')) {
          const tempConv = conversation
          removeConversation(conversationId)
          try {
            await deleteConversation(conversationId)
          } catch (e) {
            updateConversation(conversationId, tempConv) // crude revert
            throw e
          }
        }
      }
    } catch (e) {
      console.error('Failed to perform action:', e)
    }
  }
  
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
  const { 
    optimisticMessages: optimisticByConv,
    addOptimisticMessage,
    removeOptimisticMessage,
    markFailed,
    confirmOptimisticMessage
  } = useMessageStore()
  const optimisticMessages = conversationId ? (optimisticByConv[conversationId] || []) : []
  
  // Quick Replies State
  const [quickReplies, setQuickReplies] = useState<QuickReplyItem[]>([])
  const [showMacroMenu, setShowMacroMenu] = useState(false)
  const [macroFilter, setMacroFilter] = useState("")
  const [selectedIndex, setSelectedIndex] = useState(0)

  // Join Thread State
  const [participants, setParticipants] = useState<ConversationParticipant[]>([])
  const [isJoining, setIsJoining] = useState(false)
  const [isLoadingParticipants, setIsLoadingParticipants] = useState(false)
  const [showWhisperComposer, setShowWhisperComposer] = useState(false)
  const isJoined = !conversationId ? true : participants.some(p => p.user_id === currentUser?.id)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadFileName, setUploadFileName] = useState("")
  
  const [pendingAttachments, setPendingAttachments] = useState<File[]>([])
  const [attachmentPreviews, setAttachmentPreviews] = useState<(string | null)[]>([])
  // Audio Recording States
  const [isRecording, setIsRecording] = useState(false)
  const [recordingDuration, setRecordingDuration] = useState(0)
  const [zoomedImage, setZoomedImage] = useState<string | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<BlobPart[]>([])
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  useEffect(() => {
    getQuickRepliesFromTable(orgId).then(data => {
      if (data) setQuickReplies(data as QuickReplyItem[])
    })
  }, [orgId])

  // Removed forced internal mode - users can reply immediately and it will auto-join

  // Load participants and reset composer inputs when conversation changes to prevent cross-customer leakage
  useEffect(() => {
    setInput("")
    setPendingAttachments([])
    attachmentPreviews.forEach(preview => {
      if (preview) URL.revokeObjectURL(preview)
    })
    setAttachmentPreviews([])
    setShowMacroMenu(false)
    setIsInternal(false)

    if (!conversationId) return
    setIsLoadingParticipants(true)
    getParticipants(conversationId).then(data => {
      setParticipants(data as unknown as ConversationParticipant[])
      setIsLoadingParticipants(false)
    })
  }, [conversationId])

  // Revoke object URLs on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      attachmentPreviews.forEach(preview => {
        if (preview) URL.revokeObjectURL(preview)
      })
    }
  }, [attachmentPreviews])

  async function handleJoinThread() {
    if (!conversationId || !currentUser) return
    
    // Optimistic UI update to make it feel instant
    const prevParticipants = [...participants]
    setParticipants([...participants, { user_id: currentUser.id, role: 'agent' } as unknown as ConversationParticipant])
    setIsInternal(false) // Auto-switch to reply mode
    setIsJoining(true)
    
    try {
      const updated = await joinConversation(conversationId)
      setParticipants(updated as unknown as ConversationParticipant[])
    } catch (e) {
      console.error('Failed to join:', e)
      setParticipants(prevParticipants)
      setIsInternal(true)
    } finally {
      setIsJoining(false)
    }
  }

  // Smart confirm: when real agent messages arrive, remove matching optimistic ones by content
  useEffect(() => {
    if (!conversationId) return;
    messages.forEach(msg => {
      if (msg.sender_type === 'agent' || msg.sender_type === 'system') {
        confirmOptimisticMessage(conversationId, msg.content ?? '');
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length, conversationId])

  // Merge: real messages + any still-pending/failed optimistic ones
  const allMessages = [...messages, ...(optimisticMessages as unknown as AppMessage[])]

  const prevMsgLength = useRef(messages.length)

  useEffect(() => {
    // Use instant scroll for bulk loads (e.g. initial chat load) and smooth scroll for single new messages
    const isBulkLoad = Math.abs(messages.length - prevMsgLength.current) > 1
    const isConversationSwitch = prevMsgLength.current > 0 && messages.length === 0
    
    messagesEndRef.current?.scrollIntoView({ 
      behavior: (isBulkLoad || isConversationSwitch) ? 'auto' : 'smooth' 
    })
    
    prevMsgLength.current = messages.length
  }, [messages.length, optimisticMessages.length, conversationId])

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
    r.content.toLowerCase().includes(macroFilter)
  )

  const applyMacro = (message: string) => {
    setInput(message)
    setShowMacroMenu(false)
  }

  const handleSend = async () => {
    if ((!input.trim() && pendingAttachments.length === 0) || !conversationId) return

    const msgText = input.trim()
    const currentAttachments = [...pendingAttachments]
    
    setInput("")
    setPendingAttachments([])
    setAttachmentPreviews([])
    localStorage.removeItem(`draft_${conversationId}`)
    setIsSending(true)

    // Auto-join if not joined and sending a public reply
    if (!isJoined && !isInternal) {
      const prevParticipants = [...participants]
      setParticipants([...participants, { user_id: currentUser?.id, role: 'agent' } as unknown as ConversationParticipant])
      joinConversation(conversationId).then(updated => {
        setParticipants(updated as unknown as ConversationParticipant[])
      }).catch(e => {
        console.error('Failed to auto-join:', e)
        setParticipants(prevParticipants)
      })
    }
    
    try {
      // Send text message first if exists
      if (msgText || currentAttachments.length === 0) {
        const tempId = crypto.randomUUID()
        addOptimisticMessage(conversationId, {
          id: tempId,
          sender_type: 'agent',
          sender_id: currentUser?.id ?? null,
          content: msgText,
          content_type: 'text',
          metadata: null,
          is_internal: isInternal,
          status: 'sending',
          created_at: new Date().toISOString()
        })
        try {
          await replyToConversation(orgId, conversationId, msgText, isInternal)
          removeOptimisticMessage(conversationId, tempId)
        } catch (e: unknown) {
          console.error(e)
          markFailed(conversationId, tempId)
        }
      }

      // Process attachments
      if (currentAttachments.length > 0) {
        setIsUploading(true)
        
        const uploadPromises = currentAttachments.map(async (attachment) => {
          const tempId = crypto.randomUUID()
          const isImage = attachment.type.startsWith('image/')
          const isAudio = attachment.type.startsWith('audio/')
          const isVideo = attachment.type.startsWith('video/')
          const optimisticContent = isImage ? '[Image]' : isAudio ? '[Audio Voice Message]' : isVideo ? '[Video]' : '[Attachment]'
          
          addOptimisticMessage(conversationId, {
            id: tempId,
            sender_type: 'agent',
            sender_id: currentUser?.id ?? null,
            content: optimisticContent,
            content_type: getContentType(attachment),
            metadata: null,
            is_internal: isInternal,
            status: 'sending',
            created_at: new Date().toISOString()
          })
          
          try {
            const meta = await uploadToStorage(attachment)
            let contentType = 'file'
            if (meta.type.startsWith('image/')) contentType = 'image'
            else if (meta.type.startsWith('audio/')) contentType = 'audio'
            else if (meta.type.startsWith('video/')) contentType = 'video'
            
            await replyToConversation(orgId, conversationId, optimisticContent, isInternal, contentType, {
              media_url: meta.url,
              mimetype: meta.type,
              filename: meta.name
            })
            removeOptimisticMessage(conversationId, tempId)
          } catch (error) {
            console.error(error)
            markFailed(conversationId, tempId)
          }
        })
        
        await Promise.all(uploadPromises)
      }
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
    if (!mediaRecorderRef.current || !conversationId) return
    
    const actualMimeType = mediaRecorderRef.current.mimeType || 'audio/webm'
    const extension = actualMimeType.includes('mp4') ? 'mp4' : 
                      actualMimeType.includes('ogg') ? 'ogg' :
                      actualMimeType.includes('wav') ? 'wav' : 'webm'
    
    mediaRecorderRef.current.onstop = async () => {
      const audioBlob = new Blob(audioChunksRef.current, { type: actualMimeType })
      const file = new File([audioBlob], `voice-message.${extension}`, { type: actualMimeType })
      
      const localUrl = URL.createObjectURL(audioBlob)
      const tempId = crypto.randomUUID()
      
      addOptimisticMessage(conversationId, {
        id: tempId,
        sender_type: 'agent',
        sender_id: currentUser?.id ?? null,
        content: '[Audio Voice Message]',
        content_type: 'audio',
        metadata: { media_url: localUrl },
        is_internal: false,
        status: 'sending',
        created_at: new Date().toISOString()
      })
      
      setIsUploading(true);
      try {
        const meta = await uploadToStorage(file);
        await replyToConversation(orgId, conversationId, '[Audio Voice Message]', false, 'audio', {
          media_url: meta.url,
          mimetype: meta.type,
          filename: meta.name
        });
        removeOptimisticMessage(conversationId, tempId)
      } catch (err: unknown) {
        console.error("Upload failed:", err);
        markFailed(conversationId, tempId)
        alert(`Failed to send voice message: ${getErrorMessage(err)}`);
      } finally {
        setIsUploading(false);
      }
      audioChunksRef.current = []
    }
    
    stopRecording()
  }
  
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const uploadWithProgress = (file: File, onProgress: (percent: number) => void): Promise<{ url: string; type: string; name: string }> => {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      const formData = new FormData()
      formData.append('file', file)

      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const percent = Math.round((e.loaded / e.total) * 100)
          onProgress(percent)
        }
      })

      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const res = JSON.parse(xhr.responseText)
            if (res.success) {
              resolve({ url: res.url, type: file.type, name: file.name })
            } else {
              reject(new Error(res.error || 'Upload failed'))
            }
          } catch (err) {
            reject(new Error('Invalid response from server'))
          }
        } else {
          reject(new Error(`Server returned status ${xhr.status}`))
        }
      })

      xhr.addEventListener('error', () => {
        reject(new Error('Network error during upload'))
      })

      xhr.open('POST', '/api/upload')
      xhr.send(formData)
    })
  }

  const uploadToStorage = async (file: File) => {
    if (!conversationId) throw new Error("No conversation ID");
    setUploadFileName(file.name || "voice-message.webm")
    setUploadProgress(1) // Set starting percent to trigger progress UI instantly
    
    try {
      const res = await uploadWithProgress(file, (percent) => {
        setUploadProgress(percent)
      })
      return res
    } finally {
      // Add brief premium delay so the agent sees 100% completion state
      setTimeout(() => {
        setUploadProgress(0)
        setUploadFileName("")
      }, 600)
    }
  }

  const stageAttachments = (files: File[]) => {
    setPendingAttachments(prev => {
      const newFiles = [...prev, ...files].slice(0, 5); // Max 5 files
      
      const newPreviews = newFiles.map(file => {
        if (file.type.startsWith('image/')) {
          return URL.createObjectURL(file);
        } else {
          return null;
        }
      });
      
      // Revoke old previews to prevent memory leaks
      attachmentPreviews.forEach(p => { if (p) URL.revokeObjectURL(p) });
      setAttachmentPreviews(newPreviews);
      
      return newFiles;
    });
  }

  const removeAttachment = (index: number) => {
    setPendingAttachments(prev => {
      const newFiles = [...prev];
      newFiles.splice(index, 1);
      return newFiles;
    });
    setAttachmentPreviews(prev => {
      const newPreviews = [...prev];
      const removed = newPreviews.splice(index, 1)[0];
      if (removed) URL.revokeObjectURL(removed);
      return newPreviews;
    });
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    const files = Array.from(e.target.files);
    stageAttachments(files);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }


  if (!isLoaded) {
    return (
      <div className="flex-1 flex flex-col bg-white border border-slate-200 rounded-3xl overflow-hidden">
        {/* Skeleton Header */}
        <div className="h-[72px] border-b border-slate-100 px-6 flex items-center gap-4 bg-white shrink-0">
          <div className="w-10 h-10 rounded-full bg-slate-100 animate-pulse shrink-0" />
          <div className="space-y-2 flex-1">
            <div className="h-4 bg-slate-100 rounded w-48 animate-pulse" />
            <div className="h-3 bg-slate-50 rounded w-32 animate-pulse" />
          </div>
        </div>
        
        {/* Skeleton Messages */}
        <div className="flex-1 p-6 space-y-8 bg-[#f9fafb]">
          {/* Incoming message */}
          <div className="flex gap-3 max-w-2xl">
            <div className="w-8 h-8 rounded-full bg-slate-100 animate-pulse shrink-0" />
            <div className="space-y-2 flex-1">
              <div className="h-16 bg-slate-100 rounded-2xl rounded-tl-sm w-3/4 animate-pulse shadow-sm" />
            </div>
          </div>
          
          {/* Outgoing message */}
          <div className="flex gap-3 max-w-2xl ml-auto justify-end">
            <div className="space-y-2 flex-1 flex flex-col items-end">
              <div className="h-12 bg-blue-100/50 rounded-2xl rounded-tr-sm w-2/3 animate-pulse shadow-sm" />
            </div>
          </div>

          {/* Incoming message */}
          <div className="flex gap-3 max-w-2xl mt-4">
            <div className="w-8 h-8 rounded-full bg-slate-100 animate-pulse shrink-0" />
            <div className="space-y-2 flex-1">
              <div className="h-10 bg-slate-100 rounded-2xl rounded-tl-sm w-1/2 animate-pulse shadow-sm" />
              <div className="h-14 bg-slate-100 rounded-2xl rounded-tl-sm w-4/5 animate-pulse shadow-sm" />
            </div>
          </div>
        </div>
        
        {/* Skeleton Input */}
        <div className="p-4 bg-white border-t border-slate-100 shrink-0">
          <div className="h-12 bg-slate-50 rounded-xl w-full border border-slate-100 animate-pulse" />
        </div>
      </div>
    )
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
          <div className="flex items-center gap-2 group">
            {isEditingName ? (
              <div className="flex items-center gap-1.5">
                <input 
                  type="text" 
                  value={editedName} 
                  onChange={(e) => setEditedName(e.target.value)}
                  className="text-[16px] font-medium text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded px-1.5 py-0.5 bg-white dark:bg-slate-800 focus:outline-none focus:border-blue-500 w-[150px] md:w-[250px]"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveName()
                    if (e.key === 'Escape') {
                      setIsEditingName(false)
                      setEditedName(contactName)
                    }
                  }}
                />
                <button onClick={handleSaveName} className="text-emerald-600 hover:text-emerald-700 p-1"><Check size={16} strokeWidth={2.5} /></button>
                <button onClick={() => { setIsEditingName(false); setEditedName(contactName) }} className="text-slate-400 hover:text-slate-600 p-1"><X size={16} strokeWidth={2.5} /></button>
              </div>
            ) : (
              <>
                <h2 className="font-medium text-[16px] text-slate-900 dark:text-slate-100">
                  {contactName}
                </h2>
                <button 
                  onClick={() => setIsEditingName(true)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-400 hover:text-blue-600"
                  title="Edit Contact Name"
                >
                  <Pencil size={14} strokeWidth={2.5} />
                </button>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 relative" ref={menuRef}>
          {isJoined ? (
            <button 
              onClick={() => handleThreadAction('leave')}
              className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
              title="Leave thread"
            >
              <LogOut size={18} strokeWidth={2} />
            </button>
          ) : null}

          <button 
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-md transition-colors"
          >
            <MoreVertical size={18} strokeWidth={2} />
          </button>


          
          {isMenuOpen && (
            <div className="absolute right-0 top-full mt-1 w-48 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-lg py-1 z-50">
              <button onClick={() => handleThreadAction('pin')} className="w-full text-left px-4 py-2 text-[13px] text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50 flex items-center gap-2">
                <Pin size={14} className="opacity-50" /> {conversation?.is_pinned ? 'Unpin thread' : 'Pin thread'}
              </button>
              <button onClick={() => handleThreadAction('unread')} className="w-full text-left px-4 py-2 text-[13px] text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50 flex items-center gap-2">
                <Mail size={14} className="opacity-50" /> {conversation?.is_unread ? 'Mark as read' : 'Mark as unread'}
              </button>
              <button onClick={() => handleThreadAction('mute')} className="w-full text-left px-4 py-2 text-[13px] text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50 flex items-center gap-2">
                <BellOff size={14} className="opacity-50" /> {conversation?.is_muted ? 'Unmute' : 'Mute'}
              </button>
              <div className="h-px bg-slate-100 dark:bg-slate-800 my-1"></div>
              <button onClick={handleResolveAndReview} className="w-full text-left px-4 py-2 text-[13px] text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/30 flex items-center gap-2 font-medium">
                <CheckCheck size={14} className="opacity-70" /> Resolve & Ask Review
              </button>
              <button onClick={() => handleThreadAction('archive')} className="w-full text-left px-4 py-2 text-[13px] text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50 flex items-center gap-2">
                <Archive size={14} className="opacity-50" /> {conversation?.is_archived ? 'Unarchive' : 'Archive'}
              </button>
              <div className="h-px bg-slate-100 dark:bg-slate-800 my-1"></div>
              <button onClick={() => handleThreadAction('delete')} className="w-full text-left px-4 py-2 text-[13px] text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 flex items-center gap-2 font-medium">
                <Trash2 size={14} className="opacity-70" /> Remove thread
              </button>
            </div>
          )}
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

        {allMessages.map((msg, idx) => {
          // System messages: render as centered event label
          if (msg.sender_type === 'system' || msg.content_type === 'system') {
            const msgTime = msg.created_at ? new Date(msg.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
            const agent = msg.sender_id ? teamMembers.find(t => t.id === msg.sender_id) : null;
            
            if (agent && msg.content.includes('joined')) {
              return (
                <div key={msg.id || idx} className="flex justify-center my-5">
                  <div className="flex items-center gap-2.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/80 px-3 py-1.5 rounded-full shadow-sm">
                    <div className="w-5 h-5 rounded-full bg-slate-200 shrink-0 overflow-hidden flex items-center justify-center">
                      {agent.avatar_url ? (
                        <img src={agent.avatar_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-[10px] font-bold text-slate-600">{agent.name.charAt(0).toUpperCase()}</span>
                      )}
                    </div>
                    <span className="text-[12px] text-slate-700 dark:text-slate-300 font-medium">
                      {msg.content.replace('the conversation', 'the chat')}
                    </span>
                    <span className="text-[10.5px] text-slate-400 ml-1">{msgTime}</span>
                  </div>
                </div>
              )
            }

            if (agent && msg.content.includes('left')) {
              return (
                <div key={msg.id || idx} className="flex justify-center my-5">
                  <div className="flex items-center gap-2.5 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800/30 px-3 py-1.5 rounded-full shadow-sm">
                    <div className="w-5 h-5 rounded-full bg-red-100 dark:bg-red-800 shrink-0 overflow-hidden flex items-center justify-center">
                      {agent.avatar_url ? (
                        <img src={agent.avatar_url} alt="" className="w-full h-full object-cover opacity-80" />
                      ) : (
                        <span className="text-[10px] font-bold text-red-600 dark:text-red-300">{agent.name.charAt(0).toUpperCase()}</span>
                      )}
                    </div>
                    <span className="text-[12px] text-red-600 dark:text-red-400 font-medium">
                      {msg.content.replace('the conversation', 'the chat')}
                    </span>
                    <span className="text-[10.5px] text-red-400 dark:text-red-500/70 ml-1">{msgTime}</span>
                  </div>
                </div>
              )
            }

            return (
              <div key={msg.id || idx} className="flex items-center gap-3 my-3">
                <div className="flex-1 h-px bg-slate-100 dark:bg-slate-800" />
                <span className="text-[11px] text-slate-400 dark:text-slate-500 font-medium px-2 shrink-0">
                  {msg.content}
                </span>
                <div className="flex-1 h-px bg-slate-100 dark:bg-slate-800" />
              </div>
            )
          }

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
              <div key={msg.id || idx} className={`flex flex-col items-end mb-4 ${msg.is_internal ? 'mt-2' : ''}`}>
                {/* Agent Name Banner */}
                <div className="text-[11px] text-slate-500 mr-1 mb-0.5">{agentName}</div>
                
                <div className="flex items-end justify-end gap-2 max-w-[75%]">
                  <div className={`${msg.is_internal ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-900 dark:text-amber-100 border border-amber-200 dark:border-amber-800/50' : 'bg-[#0070f3] text-white'} rounded-2xl rounded-br-sm px-4 py-2.5 text-[14px] leading-relaxed whitespace-pre-wrap break-words font-normal`}>
                  {msg.content_type === 'image' && msg.metadata?.media_url ? (
                    <div className="relative">
                      <img 
                        src={msg.metadata.media_url} 
                        alt="Attachment" 
                        className="max-w-[240px] max-h-[240px] rounded-lg object-cover mb-1 cursor-zoom-in hover:opacity-95 transition-opacity" 
                        onClick={() => setZoomedImage(msg.metadata?.media_url ?? null)}
                      />
                      {msg.content !== '[Attachment]' && msg.content !== '[Image]' && <div className="mt-1">{renderTextWithLinks(msg.content, true)}</div>}
                    </div>
                  ) : msg.content_type === 'file' && msg.metadata?.media_url ? (
                    <a href={msg.metadata.media_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 p-2 bg-black/10 dark:bg-white/10 rounded-lg hover:bg-black/20 transition mb-1">
                      <Paperclip size={16} />
                      <span className="text-[13px] underline truncate max-w-[180px]">{msg.metadata.filename || 'Download File'}</span>
                    </a>
                  ) : msg.content_type === 'audio' && (msg.metadata?.media_url || msg.metadata?.url) ? (
                    <div className="flex flex-col gap-1">
                      <CustomAudioPlayer url={(msg.metadata.media_url || msg.metadata.url) as string} isDark={!msg.is_internal} />
                      {msg.content !== '[Audio Voice Message]' && <div className="mt-1">{renderTextWithLinks(msg.content, true)}</div>}
                    </div>
                  ) : msg.content_type === 'video' && msg.metadata?.media_url ? (
                    <div className="flex flex-col gap-1">
                      <video controls preload="metadata" className="max-w-[240px] max-h-[240px] rounded-lg bg-black/10 dark:bg-white/5">
                        <source src={msg.metadata.media_url} type={msg.metadata?.mimetype || 'video/mp4'} />
                        Your browser does not support the video tag.
                      </video>
                      {msg.content !== '[Video]' && <div className="mt-1">{renderTextWithLinks(msg.content, true)}</div>}
                    </div>
                  ) : (
                    <div>{renderTextWithLinks(msg.content, true)}</div>
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
                
                {/* Time and Status (OUTSIDE the bubble and avatar stack) */}
                <div className="flex justify-end items-center gap-1 mt-1 mr-9">
                  <span className="text-[11px] text-slate-400">{msgTime}</span>
                  {!msg.is_internal && (
                    <>
                      {msg.status === 'sending' ? (
                        <Clock size={12} className="text-slate-400 animate-pulse" />
                      ) : msg.status === 'failed' ? (
                        <span 
                          className="text-[10px] text-red-500 cursor-pointer hover:text-red-600 underline ml-1"
                          onClick={() => {
                            if (conversationId) removeOptimisticMessage(conversationId, msg.id)
                          }}
                          title="Failed - click to dismiss"
                        >
                          Failed
                        </span>
                      ) : msg.status === 'read' ? (
                        <CheckCheck size={14} className="text-blue-500" />
                      ) : msg.status === 'delivered' ? (
                        <CheckCheck size={14} className="text-slate-400" />
                      ) : (
                        <Check size={14} className="text-slate-400" />
                      )}
                    </>
                  )}
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
                  ) : ((contact?.avatar_url) && !(contact?.platform_id?.endsWith('@g.us'))) ? (
                    <img 
                      src={contact.avatar_url} 
                      alt={contactName}
                      className="w-8 h-8 rounded-full object-cover shrink-0 mb-1"
                      onError={(e) => { e.currentTarget.style.display = 'none'; }}
                    />
                  ) : (
                    <div className={`w-8 h-8 rounded-full ${avatarColor} text-white flex items-center justify-center text-[12px] font-semibold shrink-0 mb-1`}>
                      {msg.metadata?.participant_name ? msg.metadata.participant_name.charAt(0).toUpperCase() : contactInitial}
                    </div>
                  )}
                  <div className="max-w-[75%] flex flex-col items-start gap-1">
                    {/* Participant Name Banner for Group Chats */}
                    {msg.metadata?.participant_name && (
                      <div className="text-[11px] text-slate-500 mb-0.5">{msg.metadata.participant_name}</div>
                    )}
                    <div className="bg-slate-100 dark:bg-slate-800 rounded-2xl rounded-bl-sm px-4 py-2.5 text-[14px] text-slate-900 dark:text-slate-200 leading-relaxed whitespace-pre-wrap break-words font-normal">
                      {msg.content_type === 'image' && msg.metadata?.media_url ? (
                        <div className="relative">
                          <img 
                            src={msg.metadata.media_url} 
                            alt="Attachment" 
                            className="max-w-[240px] max-h-[240px] rounded-lg object-cover mb-1 cursor-zoom-in hover:opacity-95 transition-opacity" 
                            onClick={() => setZoomedImage(msg.metadata?.media_url ?? null)}
                          />
                          {msg.content !== '[Attachment]' && msg.content !== '[Image]' && <div className="mt-1">{renderTextWithLinks(msg.content, false)}</div>}
                        </div>
                      ) : msg.content_type === 'file' && msg.metadata?.media_url ? (
                        <a href={msg.metadata.media_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 p-2 bg-black/5 dark:bg-white/5 rounded-lg hover:bg-black/10 transition mb-1">
                          <Paperclip size={16} />
                          <span className="text-[13px] underline truncate max-w-[180px]">{msg.metadata.filename || 'Download File'}</span>
                        </a>
                      ) : msg.content_type === 'audio' && (msg.metadata?.media_url || msg.metadata?.url) ? (
                        <div className="flex flex-col gap-1">
                          <CustomAudioPlayer url={(msg.metadata.media_url || msg.metadata.url) as string} isDark={false} />
                          {msg.content !== '[Audio Voice Message]' && <div className="mt-1">{renderTextWithLinks(msg.content, false)}</div>}
                        </div>
                      ) : msg.content_type === 'video' && msg.metadata?.media_url ? (
                        <div className="flex flex-col gap-1">
                          <video controls preload="metadata" className="max-w-[240px] max-h-[240px] rounded-lg bg-black/5 dark:bg-white/5">
                            <source src={msg.metadata.media_url} type={msg.metadata?.mimetype || 'video/mp4'} />
                            Your browser does not support the video tag.
                          </video>
                          {msg.content !== '[Video]' && <div className="mt-1">{renderTextWithLinks(msg.content, false)}</div>}
                        </div>
                      ) : (
                        <div>{renderTextWithLinks(msg.content, false)}</div>
                      )}
                    </div>
                  </div>
                </div>
                
                {/* Time (OUTSIDE the bubble and avatar stack) */}
                <div className="flex items-center gap-1 mt-1 ml-11">
                  <span className="text-[11px] text-slate-400">{msgTime}</span>
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

      <div className="px-6 pb-6 pt-2 bg-white dark:bg-[#0B0F19] relative">
        {/* Actual composer - always shown, locked to whisper if not joined */}
        <div className={!isJoined ? "mt-4" : ""}>
        {/* Macro Menu */}
        {showMacroMenu && quickReplies.length > 0 && (
          <div className="absolute bottom-full left-6 right-6 mb-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl overflow-hidden z-50 max-h-[300px] flex flex-col">
            <div className="overflow-y-auto p-1">
              {filteredMacros.length === 0 ? (
                <div className="p-3 text-center text-[13px] text-slate-500">No matching replies found.</div>
              ) : (
                filteredMacros.map((macro, i) => (
                  <div 
                    key={macro.id} 
                    onClick={() => applyMacro(macro.content)}
                    className={`px-3 py-2 cursor-pointer rounded-lg flex flex-col gap-0.5 ${i === selectedIndex ? 'bg-blue-50 dark:bg-blue-900/20' : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'}`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-semibold text-blue-600 dark:text-blue-400">{macro.shortcut}</span>
                    </div>
                    <span className="text-[13px] text-slate-600 dark:text-slate-300 line-clamp-1">{macro.content}</span>
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
            <div className="flex flex-col w-full">
              {uploadProgress > 0 && (
                <div className="px-4 py-3 bg-blue-50/75 dark:bg-blue-950/25 border-b border-slate-100 dark:border-slate-800/80 flex items-center justify-between gap-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-[12px] font-semibold text-[#0070f3] dark:text-blue-400 truncate flex items-center gap-1.5">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Uploading: {uploadFileName || "file"}
                      </span>
                      <span className="text-[12px] font-bold text-[#0070f3] dark:text-blue-400">{uploadProgress}%</span>
                    </div>
                    <div className="w-full bg-slate-200 dark:bg-slate-800/80 h-2 rounded-full overflow-hidden">
                      <div 
                        className="bg-[#0070f3] h-full rounded-full transition-all duration-150 ease-out" 
                        style={{ width: `${uploadProgress}%` }}
                      />
                    </div>
                  </div>
                </div>
              )}
              {pendingAttachments.length > 0 && (
                <div className="px-4 pt-3 pb-1 flex gap-2 flex-wrap">
                  {pendingAttachments.map((file, idx) => (
                    <div key={idx} className="relative inline-block border rounded-md overflow-hidden group bg-slate-50 dark:bg-slate-800 shrink-0">
                      {attachmentPreviews[idx] ? (
                        <img src={attachmentPreviews[idx] as string} alt="Preview" className="h-16 w-16 object-cover" />
                      ) : (
                        <div className="h-16 w-16 flex items-center justify-center">
                          <Paperclip size={24} className="text-slate-400" />
                        </div>
                      )}
                      <button 
                        onClick={() => removeAttachment(idx)}
                        className="absolute top-0.5 right-0.5 p-1 bg-black/60 rounded-full text-white opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <textarea 
                ref={textareaRef}
                value={input}
                onChange={handleInputChange}
                onPaste={(e) => {
                  if (e.clipboardData.files && e.clipboardData.files.length > 0) {
                    e.preventDefault();
                    const files = Array.from(e.clipboardData.files);
                    stageAttachments(files);
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
                    applyMacro(filteredMacros[selectedIndex].content)
                  } else if (e.key === 'Escape') {
                    setShowMacroMenu(false)
                  }
                } else if (e.key === 'Enter' && !e.shiftKey) {
                  if (e.nativeEvent.isComposing) return
                  e.preventDefault()
                  handleSend()
                }
              }}
                placeholder={isInternal ? "Add an internal note (customer won't see this)..." : "Reply to customer... Type '/' for quick replies"}
                className={`w-full bg-transparent p-4 text-[14px] focus:outline-none min-h-[90px] resize-none font-normal leading-relaxed ${isInternal ? 'text-amber-900 dark:text-amber-100 placeholder:text-amber-700/50 dark:placeholder:text-amber-500/50' : 'text-slate-800 dark:text-slate-100 placeholder:text-slate-400'} ${pendingAttachments.length > 0 ? 'pt-2 min-h-[60px]' : ''}`}
              ></textarea>
            </div>
          )}
          
          <div className={`flex justify-between items-center px-3 py-2 border-t ${isInternal ? 'border-amber-200 dark:border-amber-800 bg-amber-100/50 dark:bg-amber-900/30' : 'border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50'}`}>
            <div className="flex items-center gap-1">
              <input 
                type="file" 
                multiple
                accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
                ref={fileInputRef}
                className="hidden" 
                onChange={handleFileUpload}
              />
              <button 
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading || isSending || isRecording}
                className={`p-1.5 rounded-md transition-all disabled:opacity-50 ${isInternal ? 'text-amber-600 hover:bg-amber-200/50' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'}`}
              >
                {isUploading ? <Loader2 size={16} className="animate-spin" /> : <Paperclip size={16} strokeWidth={2} />}
              </button>
              <button 
                onClick={isRecording ? stopRecording : startRecording}
                disabled={isUploading || isSending}
                className={`p-1.5 rounded-md transition-all disabled:opacity-50 ${isRecording ? 'text-red-500 hover:bg-red-50' : isInternal ? 'text-amber-600 hover:bg-amber-200/50' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'}`}
              >
                {isRecording ? <Square size={16} strokeWidth={2} /> : <Mic size={16} strokeWidth={2} />}
              </button>
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
      </div>
      {/* Image Zoom Modal */}
      {zoomedImage && typeof document !== 'undefined' && createPortal(
        <div 
          className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 cursor-zoom-out"
          onClick={() => setZoomedImage(null)}
        >
          <img 
            src={zoomedImage} 
            alt="Zoomed attachment" 
            className="max-w-[90vw] max-h-[90vh] object-contain rounded-md shadow-2xl" 
            onClick={(e) => e.stopPropagation()}
          />
          <button 
            className="absolute top-4 right-4 bg-white/20 hover:bg-white/30 text-white rounded-full p-2 transition-colors z-[100000]"
            onClick={() => setZoomedImage(null)}
          >
            <X size={24} />
          </button>
        </div>,
        document.body
      )}
    </div>
  )
}
