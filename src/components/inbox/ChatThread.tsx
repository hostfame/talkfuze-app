"use client"

import { Clock, Zap, Check, CheckCheck, MessageSquare, Lock, Paperclip, Loader2, Mic, Square, X, Bot, MoreVertical, LogOut, LogIn, Phone, Archive, Pin, BellOff, Mail, Trash2, Pencil } from "lucide-react"
import { useState, useRef, useEffect } from "react"
import { createPortal } from "react-dom"
import { replyToConversation, getQuickReplies, joinConversation, getParticipants, getQuickRepliesFromTable, toggleConversationFlag, updateConversationStatus, leaveConversation, deleteConversation } from "@/actions/dashboard"
import { updateContactName } from "@/actions/contacts"
import { supabase } from "@/lib/supabase"
import { getErrorMessage } from "@/lib/utils"
import { useMessageStore, useInboxStore } from "@/lib/store"
import type { AppMessage, ConversationParticipant, ConversationWithDetails, QuickReply, Relation, UserProfile } from "@/lib/types"

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
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const { updateConversation, removeConversation } = useInboxStore()

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
        const updated = await leaveConversation(conversationId)
        setParticipants(updated as unknown as ConversationParticipant[])
        updateConversation(conversationId, { assigned_to: null, assigned_type: 'unassigned' })
      } else if (action === 'pin') {
        const newVal = !conversation.is_pinned
        await toggleConversationFlag(conversationId, 'is_pinned', newVal)
        updateConversation(conversationId, { is_pinned: newVal })
      } else if (action === 'unread') {
        const newVal = !conversation.is_unread
        await toggleConversationFlag(conversationId, 'is_unread', newVal)
        updateConversation(conversationId, { is_unread: newVal })
      } else if (action === 'mute') {
        const newVal = !conversation.is_muted
        await toggleConversationFlag(conversationId, 'is_muted', newVal)
        updateConversation(conversationId, { is_muted: newVal })
      } else if (action === 'delete') {
        if (confirm('Are you sure you want to permanently delete this thread?')) {
          await deleteConversation(conversationId)
          removeConversation(conversationId)
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
  const [quickReplies, setQuickReplies] = useState<QuickReply[]>([])
  const [showMacroMenu, setShowMacroMenu] = useState(false)
  const [macroFilter, setMacroFilter] = useState("")
  const [selectedIndex, setSelectedIndex] = useState(0)

  // Join Thread State
  const [participants, setParticipants] = useState<ConversationParticipant[]>([])
  const [isJoining, setIsJoining] = useState(false)
  const [showWhisperComposer, setShowWhisperComposer] = useState(false)
  const isJoined = !conversationId ? true : participants.some(p => p.user_id === currentUser?.id)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isUploading, setIsUploading] = useState(false)
  
  const [pendingAttachment, setPendingAttachment] = useState<File | null>(null)
  const [attachmentPreview, setAttachmentPreview] = useState<string | null>(null)
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

  // Force internal mode if not joined
  useEffect(() => {
    if (!isJoined) {
      setIsInternal(true)
    }
  }, [isJoined])

  // Load participants when conversation changes
  useEffect(() => {
    if (!conversationId) return
    setParticipants([])
    getParticipants(conversationId).then(data => {
      setParticipants(data as unknown as ConversationParticipant[])
    })
  }, [conversationId])

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
    r.message.toLowerCase().includes(macroFilter)
  )

  const applyMacro = (message: string) => {
    setInput(message)
    setShowMacroMenu(false)
  }

  const handleSend = async () => {
    if ((!input.trim() && !pendingAttachment) || !conversationId) return

    const msgText = input.trim()
    const currentAttachment = pendingAttachment
    const tempId = crypto.randomUUID()
    
    setInput("")
    setPendingAttachment(null)
    setAttachmentPreview(null)
    localStorage.removeItem(`draft_${conversationId}`)
    setIsSending(true)
    
    // Optimistic UI - add to Zustand (survives conversation switching)
    const optimisticContent = msgText || (currentAttachment ? 
      (currentAttachment.type.startsWith('image/') ? '[Image]' : 
       currentAttachment.type.startsWith('audio/') ? '[Audio Voice Message]' : 
       currentAttachment.type.startsWith('video/') ? '[Video]' : '[Attachment]') : '')
    
    addOptimisticMessage(conversationId, {
      id: tempId,
      sender_type: 'agent',
      sender_id: currentUser?.id ?? null,
      content: optimisticContent,
      content_type: getContentType(currentAttachment),
      metadata: null,
      is_internal: isInternal,
      status: 'sending',
      created_at: new Date().toISOString()
    })
    
    try {
      if (currentAttachment) {
        setIsUploading(true);
        const meta = await uploadToStorage(currentAttachment);
        let contentType = 'file';
        if (meta.type.startsWith('image/')) contentType = 'image';
        else if (meta.type.startsWith('audio/')) contentType = 'audio';
        else if (meta.type.startsWith('video/')) contentType = 'video';
        
        const contentText = msgText || (contentType === 'image' ? '[Image]' : 
                            contentType === 'audio' ? '[Audio Voice Message]' : 
                            contentType === 'video' ? '[Video]' : '[Attachment]');
        
        await replyToConversation(orgId, conversationId, contentText, isInternal, contentType, {
          media_url: meta.url,
          mimetype: meta.type,
          filename: meta.name
        });
      } else {
        await replyToConversation(orgId, conversationId, msgText, isInternal)
      }
      // Success: remove optimistic immediately, real one arrives via Realtime
      removeOptimisticMessage(conversationId, tempId)
    } catch (e: unknown) {
      console.error(e)
      // Don't alert - mark as failed so user sees it in chat
      markFailed(conversationId, tempId)
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
    
    mediaRecorderRef.current.onstop = async () => {
      const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
      const file = new File([audioBlob], 'voice-message.webm', { type: 'audio/webm' })
      setIsUploading(true);
      try {
        const meta = await uploadToStorage(file);
        await replyToConversation(orgId, conversationId, '[Audio Voice Message]', false, 'audio', {
          media_url: meta.url,
          mimetype: meta.type,
          filename: meta.name
        });
      } catch (err: unknown) {
        console.error("Upload failed:", err);
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

  const uploadToStorage = async (file: File) => {
    if (!conversationId) throw new Error("No conversation ID");
    
    let fileExt = 'png';
    if (file.name && file.name.includes('.')) {
      fileExt = file.name.split('.').pop() || 'png';
    } else if (file.type && file.type.includes('/')) {
      fileExt = file.type.split('/')[1];
    }
    const fileName = `${conversationId}/${crypto.randomUUID()}.${fileExt}`;
    
    const { error } = await supabase.storage.from('media').upload(fileName, file);
    if (error) throw error;
    
    const { data: urlData } = supabase.storage.from('media').getPublicUrl(fileName);
    return { url: urlData.publicUrl, type: file.type, name: file.name || fileName };
  }

  const stageAttachment = (file: File) => {
    setPendingAttachment(file);
    if (file.type.startsWith('image/')) {
      setAttachmentPreview(URL.createObjectURL(file));
    } else {
      setAttachmentPreview(null);
    }
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    stageAttachment(file);
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
          ) : (
            <button 
              onClick={handleJoinThread}
              disabled={isJoining}
              className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
              title="Join thread"
            >
              <LogIn size={18} strokeWidth={2} />
            </button>
          )}

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
              <div key={msg.id || idx} className={`flex items-end justify-end gap-2 mb-4 ${msg.is_internal ? 'mt-2' : ''}`}>
                <div className="flex flex-col items-end gap-1 max-w-[75%]">
                  {/* Agent Name Banner */}
                  <div className="text-[11px] text-slate-500 mr-1 mb-0.5">{agentName}</div>
                  
                  <div className={`${msg.is_internal ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-900 dark:text-amber-100 border border-amber-200 dark:border-amber-800/50' : 'bg-[#0070f3] text-white'} rounded-2xl px-4 py-2.5 text-[14px] w-full leading-relaxed whitespace-pre-wrap break-words font-normal`}>
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
                  ) : msg.content_type === 'audio' && msg.metadata?.media_url ? (
                    <div className="flex flex-col gap-1">
                      <audio controls src={msg.metadata.media_url} className="w-[240px] h-[40px] outline-none" />
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
                  {!msg.is_internal && (
                    <div className="flex justify-end items-center gap-1 mt-0.5 opacity-90 -mr-1">
                      <span className="text-[10.5px] text-slate-400 mr-1">{msgTime}</span>
                      {msg.status === 'sending' ? (
                        <Clock size={12} className="text-white/60 animate-pulse" />
                      ) : msg.status === 'failed' ? (
                        <span 
                          className="text-[10px] text-red-300 cursor-pointer hover:text-red-200 underline ml-1"
                          onClick={() => {
                            if (conversationId) removeOptimisticMessage(conversationId, msg.id)
                          }}
                          title="Failed - click to dismiss"
                        >
                          Failed
                        </span>
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
                            onClick={() => setZoomedImage(msg.metadata?.media_url ?? null)}
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

      <div className="px-6 pb-6 pt-2 bg-white dark:bg-[#0B0F19] relative">
        {/* Actual composer - always shown, locked to whisper if not joined */}
        <div className={!isJoined ? "mt-4" : ""}>
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
            <div className="flex flex-col w-full">
              {pendingAttachment && (
                <div className="px-4 pt-3 pb-1">
                  <div className="relative inline-block border rounded-md overflow-hidden group bg-slate-50 dark:bg-slate-800">
                    {attachmentPreview ? (
                      <img src={attachmentPreview} alt="Preview" className="h-16 w-16 object-cover" />
                    ) : (
                      <div className="h-16 w-16 flex items-center justify-center">
                        <Paperclip size={24} className="text-slate-400" />
                      </div>
                    )}
                    <button 
                      onClick={() => {
                        setPendingAttachment(null);
                        if (attachmentPreview) URL.revokeObjectURL(attachmentPreview);
                        setAttachmentPreview(null);
                      }}
                      className="absolute top-0.5 right-0.5 p-1 bg-black/60 rounded-full text-white opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X size={12} />
                    </button>
                  </div>
                </div>
              )}
              <textarea 
                value={input}
                onChange={handleInputChange}
                onPaste={(e) => {
                  if (e.clipboardData.files && e.clipboardData.files.length > 0) {
                    e.preventDefault();
                    const file = e.clipboardData.files[0];
                    stageAttachment(file);
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
                className={`w-full bg-transparent p-4 text-[14px] focus:outline-none min-h-[90px] resize-none font-normal leading-relaxed ${isInternal ? 'text-amber-900 dark:text-amber-100 placeholder:text-amber-700/50 dark:placeholder:text-amber-500/50' : 'text-slate-800 dark:text-slate-100 placeholder:text-slate-400'} ${pendingAttachment ? 'pt-2 min-h-[60px]' : ''}`}
              ></textarea>
            </div>
          )}
          
          <div className={`flex justify-between items-center px-3 py-2 border-t ${isInternal ? 'border-amber-200 dark:border-amber-800 bg-amber-100/50 dark:bg-amber-900/30' : 'border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50'}`}>
            <div className="flex items-center gap-1">
              <button className={`p-1.5 rounded-md transition-all ${isInternal ? 'text-amber-600 hover:bg-amber-200/50' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'}`}><Zap size={16} strokeWidth={2.5} /></button>
              
              <input 
                type="file" 
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
              {isJoined && (
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
              )}
              
              {!isJoined && (
                <button
                  onClick={handleJoinThread}
                  disabled={isJoining}
                  className="flex items-center justify-center gap-2 bg-[#0070f3] hover:bg-blue-600 disabled:opacity-60 text-white font-medium px-4 py-1.5 rounded-lg text-[14px] shadow-sm transition-all active:scale-95 whitespace-nowrap"
                >
                  {isJoining ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Check size={16} />
                  )}
                  {isJoining ? 'Joining...' : 'Join'}
                </button>
              )}
              
              <button 
                onClick={handleSend}
                disabled={!input.trim()}
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
