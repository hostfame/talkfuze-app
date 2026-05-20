"use client"

import { Clock, Zap, Check, CheckCheck, MessageSquare, Lock, Paperclip, Loader2, Mic, Square, X, Bot, MoreVertical, LogOut, LogIn, Phone, Archive, Pin, BellOff, Mail, Trash2, Pencil, Image as ImageIcon, Video, CornerUpLeft, Database } from "lucide-react"
import { useState, useRef, useEffect } from "react"
import { createPortal } from "react-dom"
import { getMessages, replyToConversation, getQuickReplies, joinConversation, getParticipants, getQuickRepliesFromTable, toggleConversationFlag, updateConversationStatus, leaveConversation, deleteConversation, uploadAgentMedia } from "@/actions/dashboard"
import { markMessagesAsRead } from "@/actions/chat"
import { updateContactName } from "@/actions/contacts"
import { convertChatToTicket, fetchWhmcsClient } from "@/actions/whmcs"
import { supabase } from "@/lib/supabase"
import { getErrorMessage } from "@/lib/utils"
import { useMessageStore, useInboxStore } from "@/lib/store"
import type { AppMessage, ConversationParticipant, ConversationWithDetails, QuickReplyItem, Relation, UserProfile } from "@/lib/types"
import { generateAiDraft } from "@/actions/ai"

interface StagedAttachment {
  file: File;
  id: string;
  url?: string;
  type: string;
  name: string;
  progress: number;
  status: 'uploading' | 'uploaded' | 'failed';
  previewUrl: string | null;
}

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

function renderTextWithLinks(text: string, isAgent: boolean, teamMembers: UserProfile[] = []) {
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
  const mentionRegex = /(@\d+)/g;
  
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
    
    // Check for mentions in non-URL parts
    const mentionParts = part.split(mentionRegex);
    if (mentionParts.length === 1) return part;
    
    return mentionParts.map((mPart, j) => {
      if (mPart.match(mentionRegex)) {
        const numberStr = mPart.substring(1); // remove @
        let displayName = mPart;
        
        // Try to find member by phone matching last 10 digits
        const cleanMention = numberStr.replace(/\D/g, '');
        if (cleanMention.length >= 10 && teamMembers && teamMembers.length > 0) {
          const mentionLast10 = cleanMention.slice(-10);
          const member = teamMembers.find(m => {
            if (!(m as any).phone) return false;
            const cleanPhone = (m as any).phone.replace(/\D/g, '');
            return cleanPhone.length >= 10 && cleanPhone.slice(-10) === mentionLast10;
          });
          if (member && member.name) {
            displayName = `@${member.name}`;
          }
        }
        
        return (
          <span 
            key={`${i}-${j}`} 
            className={`px-1.5 py-0.5 mx-0.5 rounded-md font-medium text-[0.9em] inline-block ${isAgent ? 'bg-white/20 text-white' : 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300'}`}
          >
            {displayName}
          </span>
        );
      }
      return mPart;
    });
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
  isCustomerOnline?: boolean
  conversation?: ConversationWithDetails | null
  currentUser?: UserProfile | null
}

export default function ChatThread({ 
  conversationId, 
  messages, 
  orgId,
  teamMembers = [],
  isCustomerTyping = false,
  isCustomerOnline = false,
  conversation = null,
  currentUser
}: ChatThreadProps) {
  const contact = firstRelation(conversation?.contact)
  const contactName = contact?.name || 'Contact'
  const contactInitial = contactName.charAt(0).toUpperCase()
  const avatarColor = getAvatarColor(contactName)

  // Voice Call Agent-Side States
  const [incomingCall, setIncomingCall] = useState<{ offer: any } | null>(null)
  const [callStatus, setCallStatus] = useState<'idle' | 'ringing' | 'active'>('idle')
  const [isMuted, setIsMuted] = useState(false)
  const [isRingtoneMuted, setIsRingtoneMuted] = useState(false)
  const voiceConnectionRef = useRef<RTCPeerConnection | null>(null)
  const voiceStreamRef = useRef<MediaStream | null>(null)
  const voiceAudioRef = useRef<HTMLAudioElement | null>(null)
  const [callDuration, setCallDuration] = useState(0)
  const callTimerRef = useRef<NodeJS.Timeout | null>(null)
  const ringtoneAudioRef = useRef<HTMLAudioElement | null>(null)

  const playRingtone = () => {
    if (isRingtoneMuted) return
    try {
      const audio = new Audio("https://assets.mixkit.co/active_storage/sfx/903/903-84.wav")
      audio.loop = true
      ringtoneAudioRef.current = audio
      audio.play().catch(e => console.log("Ringtone play barred by browser autoplay restrictions", e))
    } catch (err) {}
  }

  const stopRingtone = () => {
    if (ringtoneAudioRef.current) {
      ringtoneAudioRef.current.pause()
      ringtoneAudioRef.current = null
    }
  }

  const handleMuteRingtone = () => {
    stopRingtone()
    setIsRingtoneMuted(true)
  }

  useEffect(() => {
    if (!conversationId) return

    const callChannel = supabase.channel(`voicecall:${conversationId}`)
      .on('broadcast', { event: 'voice_call_incoming' }, (payload) => {
        setIncomingCall({ offer: payload.payload.offer })
        setCallStatus('ringing')
        playRingtone()
      })
      .on('broadcast', { event: 'voice_call_ended' }, () => {
        handleEndVoiceCall(false)
      })
      .on('broadcast', { event: 'ice_candidate' }, async (payload) => {
        if (payload.payload.candidate && voiceConnectionRef.current) {
          await voiceConnectionRef.current.addIceCandidate(new RTCIceCandidate(payload.payload.candidate));
        }
      })
      .subscribe()

    return () => {
      supabase.removeChannel(callChannel)
      stopRingtone()
      if (callTimerRef.current) clearInterval(callTimerRef.current)
    }
  }, [conversationId])

  const handleAnswerVoiceCall = async () => {
    if (!conversationId || !incomingCall) return
    stopRingtone()
    setIsRingtoneMuted(false)
    try {
      setCallStatus('active')
      setIncomingCall(null)

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      voiceStreamRef.current = stream

      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
      });
      voiceConnectionRef.current = pc

      stream.getTracks().forEach(track => pc.addTrack(track, stream));

      pc.ontrack = (event) => {
        const audio = document.createElement('audio');
        audio.autoplay = true;
        audio.srcObject = event.streams[0];
        voiceAudioRef.current = audio;
      };

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          const callChannel = supabase.channel(`voicecall:${conversationId}`)
          callChannel.send({
            type: 'broadcast',
            event: 'ice_candidate',
            payload: { candidate: event.candidate }
          })
        }
      };

      await pc.setRemoteDescription(new RTCSessionDescription(incomingCall.offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      const callChannel = supabase.channel(`voicecall:${conversationId}`)
      await callChannel.send({
        type: 'broadcast',
        event: 'voice_call_answered',
        payload: { answer }
      })

      setCallDuration(0)
      if (callTimerRef.current) clearInterval(callTimerRef.current)
      callTimerRef.current = setInterval(() => {
        setCallDuration(d => d + 1)
      }, 1000)

    } catch (err) {
      console.error("Agent microphone access failed", err)
      setCallStatus('idle')
      alert("Microphone permission is required to answer the voice call.")
      handleDeclineVoiceCall()
    }
  }

  const handleDeclineVoiceCall = () => {
    stopRingtone()
    setIncomingCall(null)
    setCallStatus('idle')
    if (conversationId) {
      const callChannel = supabase.channel(`voicecall:${conversationId}`)
      callChannel.send({
        type: 'broadcast',
        event: 'voice_call_declined'
      })
    }
  }

  const handleEndVoiceCall = (sendBroadcast = true) => {
    stopRingtone()
    setIsRingtoneMuted(false)
    if (voiceStreamRef.current) {
      voiceStreamRef.current.getTracks().forEach(t => t.stop())
      voiceStreamRef.current = null
    }
    if (voiceConnectionRef.current) {
      voiceConnectionRef.current.close()
      voiceConnectionRef.current = null
    }
    if (voiceAudioRef.current) {
      voiceAudioRef.current.pause()
      voiceAudioRef.current = null
    }
    if (callTimerRef.current) {
      clearInterval(callTimerRef.current)
      callTimerRef.current = null
    }

    if (sendBroadcast && conversationId) {
      const callChannel = supabase.channel(`voicecall:${conversationId}`)
      callChannel.send({
        type: 'broadcast',
        event: 'voice_call_ended'
      })
    }

    setCallStatus('idle')
    setIncomingCall(null)
    setIsMuted(false)
  }

  const toggleMuteVoiceCall = () => {
    if (voiceStreamRef.current) {
      const audioTrack = voiceStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
      }
    }
  }

  const formatCallDuration = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  const [input, setInput] = useState("")
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 300)}px`;
    }
  }, [input])

  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isConverting, setIsConverting] = useState(false)
  const [showResolveConfirm, setShowResolveConfirm] = useState(false)
  const [isResolving, setIsResolving] = useState(false)
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

  const handleResolveAndReview = () => {
    if (!conversationId || !conversation) return
    setShowResolveConfirm(true)
  }

  const executeResolveAndReview = async () => {
    if (!conversationId || !conversation) return
    setIsResolving(true)
    try {
      const message = "Did we fix your issue? If yes, please leave a quick review here: https://g.page/r/hostnin/review\n\nIf no, click here to escalate: https://hostnin.com/contact"
      
      const tempId = "temp-" + crypto.randomUUID()
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
      
      setShowResolveConfirm(false)
      setIsMenuOpen(false)
    } catch (error) {
      console.error(error)
      alert("Failed to send review prompt or archive conversation")
    } finally {
      setIsResolving(false)
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
      } else if (action === 'convert') {
        setIsConverting(true)
        try {
          const rawPlatformId = contact?.platform_id || ""
          const isLid = rawPlatformId.endsWith('@lid')
          const isMessenger = contact?.platform_type === 'messenger'
          const isInstagram = contact?.platform_type === 'instagram'
          const platformId = rawPlatformId.includes('@') ? rawPlatformId.split('@')[0] : rawPlatformId
          const metadataPhone = (contact?.metadata as Record<string, any>)?.real_phone
          const displayPlatformId = metadataPhone || platformId
          const contactPhone = contact?.phone
          const effectivePhoneId = contactPhone || displayPlatformId

          const isEmail = effectivePhoneId.includes('@') && !effectivePhoneId.endsWith('@lid')
          const cleanPhone = isEmail ? effectivePhoneId : (effectivePhoneId.startsWith('+') ? effectivePhoneId : `+${effectivePhoneId}`)

          const client = await fetchWhmcsClient(cleanPhone)
          if (!client) {
            alert(`No matching WHMCS client profile found for ${cleanPhone}. Please link a client profile in the Portal tab first.`)
            setIsConverting(false)
            return
          }

          const result = await convertChatToTicket(conversationId, client.id, 1, currentUser?.id)
          if (result.success) {
            alert(`Chat successfully converted to ticket #${result.ticket?.tid || ''}!`)
          } else {
            alert("Error: " + result.error)
          }
        } catch (e: any) {
          alert("Failed to convert chat: " + (e?.message || e))
        } finally {
          setIsConverting(false)
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
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [hasMoreMessages, setHasMoreMessages] = useState(true)
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
  
  const [stagedAttachments, setStagedAttachments] = useState<StagedAttachment[]>([])
  // Audio Recording States
  const [isRecording, setIsRecording] = useState(false)
  const [recordingDuration, setRecordingDuration] = useState(0)
  


  const [zoomedImage, setZoomedImage] = useState<string | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const [isAiDrafting, setIsAiDrafting] = useState(false)
  const [aiDraftFailed, setAiDraftFailed] = useState(false)
  const audioChunksRef = useRef<BlobPart[]>([])
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const activeUploadsRef = useRef<Record<string, Promise<{ url: string; type: string; name: string }>>>({})
  const [replyToMessage, setReplyToMessage] = useState<any | null>(null)
  useEffect(() => {
    getQuickRepliesFromTable(orgId).then(data => {
      if (data) setQuickReplies(data as QuickReplyItem[])
    })
  }, [orgId])

  // Removed forced internal mode - users can reply immediately and it will auto-join

  // Load participants and reset composer inputs when conversation changes to prevent cross-customer leakage
  useEffect(() => {
    setInput("")
    stagedAttachments.forEach(att => {
      if (att.previewUrl) URL.revokeObjectURL(att.previewUrl)
    })
    setStagedAttachments([])
    setReplyToMessage(null)
    setShowMacroMenu(false)
    setIsInternal(false)

    if (!conversationId) return
    setIsLoadingParticipants(true)
    getParticipants(conversationId).then(data => {
      setParticipants(data as unknown as ConversationParticipant[])
      setIsLoadingParticipants(false)
    })
  }, [conversationId])

  // Keep ref of staged attachments to revoke on unmount only, avoiding premature destruction
  const stagedAttachmentsRef = useRef<StagedAttachment[]>([]);
  useEffect(() => {
    stagedAttachmentsRef.current = stagedAttachments;
  }, [stagedAttachments]);

  useEffect(() => {
    return () => {
      stagedAttachmentsRef.current.forEach(att => {
        if (att.previewUrl) {
          try {
            URL.revokeObjectURL(att.previewUrl);
          } catch (e) {
            console.error(e);
          }
        }
      });
    };
  }, []);

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
    // Mark as read when messages load or change
    if (messages.length > 0) {
      markMessagesAsRead(conversationId, 'agent');
    }
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

  const loadMoreMessages = async () => {
    if (!messages.length || isLoadingMore || !hasMoreMessages || !conversationId) return;
    setIsLoadingMore(true);
    const oldestMsg = messages[0];
    try {
      const olderMessages = await getMessages(conversationId, 50, oldestMsg.created_at);
      if (olderMessages.length > 0) {
        useInboxStore.getState().setMessages(conversationId, [...olderMessages, ...messages]);
      } else {
        setHasMoreMessages(false);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoadingMore(false);
    }
  }

  const handleAiDraft = async () => {
    if (!conversationId) return
    setIsAiDrafting(true)
    
    // Format context messages
    const contextMessages = allMessages.slice(-20).map(m => {
      const isAgent = m.sender_type === 'agent' || m.sender_type === 'ai'
      const name = isAgent ? 'Agent' : contactName
      return `[${name}]: ${m.content_type === 'text' ? m.content : '[' + m.content_type + ']'}`
    }).join('\n')

    try {
      const response = await generateAiDraft(contextMessages, contactName)
      if (response.success && response.text) {
        setInput(response.text)
        setIsInternal(false)
        if (textareaRef.current) {
          textareaRef.current.focus()
        }
      } else {
        setAiDraftFailed(true)
        setTimeout(() => setAiDraftFailed(false), 3000)
      }
    } catch (e: any) {
      setAiDraftFailed(true)
      setTimeout(() => setAiDraftFailed(false), 3000)
    } finally {
      setIsAiDrafting(false)
    }
  }

  const handleSend = async () => {
    if ((!input.trim() && stagedAttachments.length === 0) || !conversationId) return

    const msgText = input.trim()
    const currentAttachments = [...stagedAttachments]
    
    // Capture and clear reply message instantly
    const repliedMessage = replyToMessage
    setReplyToMessage(null)

    const replyMeta = repliedMessage ? {
      message_id: repliedMessage.id,
      sender_name: repliedMessage.sender_type === 'agent' || repliedMessage.sender_type === 'ai'
        ? (teamMembers.find(t => t.id === repliedMessage.sender_id)?.name || "Agent")
        : (contactName || "Customer"),
      content: repliedMessage.content,
      content_type: repliedMessage.content_type || 'text'
    } : null;

    setInput("")
    setStagedAttachments([])
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
        const tempId = "temp-" + crypto.randomUUID()
        addOptimisticMessage(conversationId, {
          id: tempId,
          sender_type: 'agent',
          sender_id: currentUser?.id ?? null,
          content: msgText,
          content_type: 'text',
          metadata: replyMeta ? { reply_to: replyMeta } as any : null,
          is_internal: isInternal,
          status: 'sending',
          created_at: new Date().toISOString()
        })
        try {
          await replyToConversation(orgId, conversationId, msgText, isInternal, 'text', replyMeta ? { reply_to: replyMeta } : undefined)
          removeOptimisticMessage(conversationId, tempId)
        } catch (e: unknown) {
          console.error(e)
          markFailed(conversationId, tempId)
        }
      }

      // Process attachments
      if (currentAttachments.length > 0) {
        // Fire attachment sending pipelines completely in the background!
        currentAttachments.forEach(async (attachment) => {
          const tempId = "temp-" + crypto.randomUUID()
          const isImage = attachment.type?.startsWith('image/')
          const isAudio = attachment.type?.startsWith('audio/')
          const isVideo = attachment.type?.startsWith('video/')
          const optimisticContent = isImage ? '[Image]' : isAudio ? '[Audio Voice Message]' : isVideo ? '[Video]' : '[Attachment]'
          
          addOptimisticMessage(conversationId, {
            id: tempId,
            sender_type: 'agent',
            sender_id: currentUser?.id ?? null,
            content: optimisticContent,
            content_type: getContentType(attachment.file),
            metadata: {
              media_url: attachment.previewUrl || attachment.url || '',
              filename: attachment.name,
              mimetype: attachment.type,
              ...(replyMeta ? { reply_to: replyMeta } : {})
            } as any,
            is_internal: isInternal,
            status: 'sending',
            created_at: new Date().toISOString()
          })
          
          try {
            let meta = {
              url: attachment.url || '',
              type: attachment.type || '',
              name: attachment.name || ''
            }
            
            // If the background upload is still active, wait for it!
            if (attachment.status === 'uploading') {
              const activePromise = activeUploadsRef.current[attachment.id]
              if (activePromise) {
                const res = await activePromise
                meta = {
                  url: res.url,
                  type: res.type,
                  name: res.name
                }
              }
            }
            
            let contentType = 'file'
            if (meta.type.startsWith('image/')) contentType = 'image'
            else if (meta.type.startsWith('audio/')) contentType = 'audio'
            else if (meta.type.startsWith('video/')) contentType = 'video'
            
            await replyToConversation(orgId, conversationId, optimisticContent, isInternal, contentType, {
              media_url: meta.url,
              mimetype: meta.type,
              filename: meta.name,
              ...(replyMeta ? { reply_to: replyMeta } : {})
            })
            removeOptimisticMessage(conversationId, tempId)
          } catch (error) {
            console.error(error)
            markFailed(conversationId, tempId)
          }
        })
      }
    } finally {
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
      const tempId = "temp-" + crypto.randomUUID()
      
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
      
      try {
        const meta = await uploadToStorage(file, false);
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

  const uploadToStorage = async (file: File, showProgress = true) => {
    if (!conversationId) throw new Error("No conversation ID");
    
    if (showProgress) {
      setUploadFileName(file.name || "file")
      setUploadProgress(1) // Set starting percent to trigger progress UI instantly
    }
    
    try {
      const res = await uploadWithProgress(file, (percent) => {
        if (showProgress) {
          setUploadProgress(percent)
        }
      })
      return res
    } finally {
      if (showProgress) {
        // Add brief premium delay so the agent sees 100% completion state
        setTimeout(() => {
          setUploadProgress(0)
          setUploadFileName("")
        }, 600)
      }
    }
  }

  const uploadFileStaged = async (item: StagedAttachment) => {
    try {
      const uploadPromise = uploadWithProgress(item.file, (percent) => {
        setStagedAttachments(prev => prev.map(s => {
          if (s.id === item.id) {
            return { ...s, progress: percent };
          }
          return s;
        }));
      });
      
      activeUploadsRef.current[item.id] = uploadPromise;
      const res = await uploadPromise;
      
      setStagedAttachments(prev => prev.map(s => {
        if (s.id === item.id) {
          return { 
            ...s, 
            status: 'uploaded', 
            url: res.url, 
            type: res.type, 
            name: res.name, 
            progress: 100 
          };
        }
        return s;
      }));
    } catch (err) {
      console.error("Failed to upload staged file:", err);
      setStagedAttachments(prev => prev.map(s => {
        if (s.id === item.id) {
          return { ...s, status: 'failed', progress: 0 };
        }
        return s;
      }));
    }
  }

  const stageAttachments = (files: File[]) => {
    setStagedAttachments(prev => {
      const incoming = files.slice(0, 5 - prev.length);
      if (incoming.length === 0) return prev;

      const newStaged = incoming.map(file => {
        const id = crypto.randomUUID();
        const isImage = file.type.startsWith('image/');
        const isVideo = file.type.startsWith('video/');
        const previewUrl = (isImage || isVideo) ? URL.createObjectURL(file) : null;
        
        const item: StagedAttachment = {
          file,
          id,
          previewUrl,
          progress: 1, // start at 1% for active feedback
          status: 'uploading',
          type: file.type,
          name: file.name
        };

        // Fire background upload immediately
        uploadFileStaged(item);

        return item;
      });

      return [...prev, ...newStaged];
    });
  }

  const removeAttachment = (index: number) => {
    setStagedAttachments(prev => {
      const copy = [...prev];
      const removed = copy.splice(index, 1)[0];
      if (removed && removed.previewUrl) {
        URL.revokeObjectURL(removed.previewUrl);
      }
      return copy;
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
      <div className="flex-1 flex flex-col h-full relative bg-white border-r border-slate-200 z-10 overflow-hidden">
        {/* Skeleton Header */}
        <div className="h-[72px] border-b border-slate-100 px-6 flex items-center gap-4 bg-white shrink-0">
          <div className="w-10 h-10 rounded-full bg-slate-100/80 animate-pulse shrink-0" />
          <div className="space-y-2 flex-1">
            <div className="h-4 bg-slate-100 rounded-md w-40 animate-pulse" />
            <div className="h-2.5 bg-slate-50 rounded-md w-24 animate-pulse" />
          </div>
        </div>
        
        {/* Skeleton Messages */}
        <div className="flex-1 p-6 space-y-6 bg-[#f8fafc] overflow-y-auto">
          {/* Incoming message: Greeting */}
          <div className="flex gap-3 max-w-[70%] animate-pulse">
            <div className="w-8 h-8 rounded-full bg-slate-100 shrink-0" />
            <div className="space-y-1.5 flex-1">
              <div className="h-10 bg-slate-100 rounded-2xl rounded-tl-sm w-[60%]" />
            </div>
          </div>
          
          {/* Outgoing message: Response */}
          <div className="flex gap-3 max-w-[70%] ml-auto justify-end animate-pulse">
            <div className="space-y-1.5 flex-1 flex flex-col items-end">
              <div className="h-12 bg-blue-100/40 rounded-2xl rounded-tr-sm w-[80%]" />
            </div>
          </div>

          {/* Incoming message: Double consecutive text */}
          <div className="flex gap-3 max-w-[70%] animate-pulse">
            <div className="w-8 h-8 rounded-full bg-slate-100 shrink-0" />
            <div className="space-y-2 flex-1">
              <div className="h-8 bg-slate-100 rounded-2xl rounded-tl-sm w-[45%]" />
              <div className="h-16 bg-slate-100 rounded-2xl w-[90%]" />
            </div>
          </div>

          {/* Outgoing message: Media preview placeholder */}
          <div className="flex gap-3 max-w-[70%] ml-auto justify-end animate-pulse">
            <div className="space-y-2 flex-1 flex flex-col items-end">
              {/* Box styling mimicking an image attachment */}
              <div className="h-32 w-52 bg-blue-100/30 rounded-2xl rounded-tr-sm flex items-center justify-center border border-blue-100/50">
                <svg className="w-8 h-8 text-blue-300/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                </svg>
              </div>
            </div>
          </div>

          {/* Incoming message: Audio voice message mock */}
          <div className="flex gap-3 max-w-[70%] animate-pulse">
            <div className="w-8 h-8 rounded-full bg-slate-100 shrink-0" />
            <div className="space-y-1.5 flex-1">
              <div className="h-11 bg-slate-100 rounded-2xl rounded-tl-sm w-[75%] flex items-center px-4 gap-3">
                <div className="w-6 h-6 rounded-full bg-slate-200/80 shrink-0" />
                <div className="flex-1 flex gap-1 items-center h-2">
                  <div className="h-full bg-slate-200 w-full rounded" />
                  <div className="h-full bg-slate-200 w-3/4 rounded" />
                  <div className="h-full bg-slate-200 w-1/2 rounded" />
                  <div className="h-full bg-slate-200 w-full rounded" />
                  <div className="h-full bg-slate-200 w-2/3 rounded" />
                </div>
              </div>
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
      <div className="flex-1 flex items-center justify-center bg-white border-r border-slate-200 z-10">
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
                <h2 className="font-medium text-[16px] text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  {contactName}
                  {isCustomerOnline && (
                    <div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.4)]" title="Online now"></div>
                  )}
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
            <>
              <button 
                onClick={handleResolveAndReview}
                className="px-2.5 py-1 text-[12.5px] font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 hover:bg-slate-200/80 dark:bg-slate-800 dark:hover:bg-slate-700/80 rounded-lg flex items-center gap-1 transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] hover:scale-[1.03] active:scale-[0.97] mr-1 shadow-sm border border-slate-200/50 dark:border-slate-700/50"
                title="Resolve & Ask Review"
              >
                <CheckCheck size={14} strokeWidth={2.5} />
                Resolve
              </button>
              <button 
                onClick={() => handleThreadAction('leave')}
                className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                title="Leave thread"
              >
                <LogOut size={18} strokeWidth={2} />
              </button>
            </>
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
              <button 
                onClick={() => handleThreadAction('convert')} 
                disabled={isConverting}
                className="w-full text-left px-4 py-2 text-[13px] text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50 flex items-center gap-2 disabled:opacity-50"
              >
                {isConverting ? (
                  <Loader2 size={14} className="animate-spin shrink-0" />
                ) : (
                  <Database size={14} className="opacity-50 shrink-0" />
                )}
                Convert to Ticket
              </button>
              <button onClick={() => handleThreadAction('archive')} className="w-full text-left px-4 py-2 text-[13px] text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50 flex items-center gap-2">
                <Archive size={14} className="opacity-50" /> {conversation?.is_archived ? 'Unarchive' : 'Archive'}
              </button>
              <div className="h-px bg-slate-100 dark:bg-slate-800 my-1"></div>
              <button onClick={() => handleThreadAction('delete')} className="w-full text-left px-4 py-2 text-[13px] text-red-600 dark:red-400 hover:bg-red-50 dark:hover:bg-red-950/30 flex items-center gap-2 font-medium">
                <Trash2 size={14} className="opacity-70" /> Remove thread
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Incoming Call Agent Dialog */}
      {callStatus === 'ringing' && incomingCall && (
        <div className="absolute top-[80px] left-1/2 -translate-x-1/2 z-50 w-full max-w-sm px-4 animate-in slide-in-from-top-6 duration-300">
          <div className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl border border-slate-200/50 dark:border-slate-800 rounded-3xl shadow-2xl p-5 flex flex-col items-center text-center">
            <div className="w-12 h-12 bg-blue-50 dark:bg-blue-950/50 text-[#0070f3] rounded-full flex items-center justify-center mb-3 animate-bounce">
              <Phone size={22} strokeWidth={2.5} />
            </div>
            <h3 className="text-[15px] font-bold text-slate-800 dark:text-white">Incoming Voice Call</h3>
            <p className="text-[12px] text-slate-500 mt-1 leading-normal mb-5">
              Visitor <span className="font-semibold text-[#0070f3]">{contactName}</span> is calling...
            </p>
            <div className="flex gap-3 w-full">
              <button 
                onClick={handleMuteRingtone}
                disabled={isRingtoneMuted}
                className={`flex-1 py-2.5 text-[12.5px] font-semibold rounded-xl transition-all ${
                  isRingtoneMuted 
                    ? 'text-slate-400 bg-slate-100 cursor-not-allowed dark:bg-slate-800/40 dark:text-slate-500'
                    : 'text-amber-600 bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/20 dark:text-amber-400 cursor-pointer active:scale-95'
                }`}
              >
                {isRingtoneMuted ? 'Muted' : 'Mute'}
              </button>
              <button 
                onClick={handleAnswerVoiceCall}
                className="flex-1 py-2.5 text-[12.5px] font-semibold text-white bg-emerald-500 hover:bg-emerald-600 rounded-xl shadow-sm transition-all active:scale-95 cursor-pointer"
              >
                Receive
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Active Call Panel Overlay for Agent */}
      {callStatus === 'active' && (
        <div className="bg-slate-900 border-b border-slate-850 px-4 py-3 flex items-center justify-between text-white shrink-0 z-30 animate-in slide-in-from-top duration-200">
          <div className="flex items-center gap-2.5">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></div>
            <div className="flex flex-col">
              <span className="text-[12.5px] font-bold text-white tracking-tight">Active Voice Call with {contactName}</span>
              <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">{formatCallDuration(callDuration)}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={toggleMuteVoiceCall}
              className={`p-2 rounded-xl transition-all ${isMuted ? 'bg-red-500 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
              title={isMuted ? "Unmute" : "Mute"}
            >
              {isMuted ? (
                <svg width="14" height="14" fill="currentColor" viewBox="0 0 24 24"><path d="M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-.98.9-2.09.9-3.28zm-4.02.17c0-.06.02-.11.02-.17V5c0-1.66-1.34-3-3-3S9 3.34 9 5v.18l6.02 5.99zM4.27 3L3 4.27l6.01 6.01V11c0 1.66 1.34 3 3 3 .74 0 1.43-.16 2.05-.43l2.67 2.67c-1.18.9-2.67 1.43-4.32 1.43-3.66 0-6.62-2.96-6.62-6.62H4c0 4.08 3.05 7.47 7 7.93V22h2v-3.07c1.7-.2 3.28-.85 4.6-1.85L19.73 21 21 19.73 4.27 3z"/></svg>
              ) : (
                <svg width="14" height="14" fill="currentColor" viewBox="0 0 24 24"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.91-3h-1.8c0 2.27-1.84 4.1-4.11 4.1S7.89 13.27 7.89 11H6.09c0 2.93 2.3 5.37 5.21 5.8v2.9c0 .17.14.3.31.3h.8c.17 0 .31-.13.31-.3v-2.9c2.91-.43 5.21-2.87 5.21-5.8z"/></svg>
              )}
            </button>
            <button 
              onClick={() => handleEndVoiceCall(true)}
              className="bg-red-500 hover:bg-red-600 active:scale-95 text-white font-bold text-[11px] px-3.5 py-2 rounded-xl transition-all uppercase tracking-wide shadow-sm"
            >
              Hang Up
            </button>
          </div>
        </div>
      )}

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-6 bg-white dark:bg-[#0B0F19]">
        
        {messages.length >= 50 && hasMoreMessages && (
          <div className="flex justify-center mb-6">
            <button 
              onClick={loadMoreMessages}
              disabled={isLoadingMore}
              className="px-4 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-full text-[12px] font-medium transition-colors disabled:opacity-50"
            >
              {isLoadingMore ? "Loading..." : "Load previous messages"}
            </button>
          </div>
        )}
        
        {allMessages.length === 0 && !isCustomerTyping && (
          <div className="h-full flex flex-col items-center justify-center text-center opacity-70 mt-10">
            <MessageSquare size={32} className="text-slate-300 mb-3" />
            <p className="text-slate-500 font-medium text-[14px]">No messages yet</p>
            <p className="text-slate-400 text-[13px] mt-1">Send a message to start the conversation.</p>
          </div>
        )}

        {allMessages.map((msg, idx) => {
          const safeMeta = typeof msg.metadata === 'string' 
            ? (() => { try { return JSON.parse(msg.metadata) } catch(e) { return {} } })() 
            : (msg.metadata || {});
          
          const mediaUrl = (safeMeta.media_url || safeMeta.url) as string;
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

            if (msg.content === "Your ticket is created" || msg.content.includes("ticket is created")) {
              return (
                <div key={msg.id || idx} className="flex justify-center my-5">
                  <div className="flex items-center gap-2.5 bg-purple-50 dark:bg-purple-900/20 border border-purple-100 dark:border-purple-800/30 px-3 py-1.5 rounded-full shadow-sm">
                    <div className="w-5 h-5 rounded-full bg-purple-100 dark:bg-purple-800 shrink-0 overflow-hidden flex items-center justify-center">
                      {agent?.avatar_url ? (
                        <img src={agent.avatar_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-[10px] font-bold text-purple-600 dark:text-purple-300">T</span>
                      )}
                    </div>
                    <span className="text-[12px] text-purple-700 dark:text-purple-300 font-semibold">
                      Your ticket is created
                    </span>
                    <span className="text-[10.5px] text-purple-400 dark:text-purple-500/70 ml-1">{msgTime}</span>
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
              <div id={`msg-${msg.id}`} key={msg.id || idx} className={`flex flex-col items-end mb-4 ${msg.is_internal ? 'mt-2' : ''}`}>
                {/* Agent Name Banner */}
                <div className="text-[11px] text-slate-500 mr-1 mb-0.5">{agentName}</div>
                
                <div className="flex items-end justify-end gap-2 max-w-[75%] relative group">
                  {/* Reply Button on Hover */}
                  <button 
                    onClick={() => setReplyToMessage(msg)}
                    className="opacity-0 group-hover:opacity-100 transition-all duration-150 p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 shrink-0 mb-1"
                    title="Reply"
                  >
                    <CornerUpLeft size={15} strokeWidth={2.5} />
                  </button>

                  <div className={`${msg.is_internal ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-900 dark:text-amber-100 border border-amber-200 dark:border-amber-800/50' : 'bg-[#0070f3] text-white'} rounded-2xl rounded-br-sm px-4 py-2.5 text-[14px] leading-relaxed whitespace-pre-wrap break-words font-normal`}>
                    {/* Render Reply Preview if present */}
                    {(() => {
                      const replyTo = safeMeta.reply_to;
                      if (!replyTo) return null;
                      return (
                        <div 
                          onClick={() => {
                            const element = document.getElementById(`msg-${replyTo.message_id}`);
                            if (element) {
                              element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                              element.classList.add('bg-blue-50/50', 'dark:bg-blue-950/20', 'ring-2', 'ring-blue-400/50', 'transition-all', 'duration-500');
                              setTimeout(() => {
                                element.classList.remove('bg-blue-50/50', 'dark:bg-blue-950/20', 'ring-2', 'ring-blue-400/50');
                              }, 2000);
                            }
                          }}
                          className="mb-2 p-2 bg-black/10 dark:bg-white/10 border-l-[3px] border-white rounded-r-md text-left cursor-pointer hover:bg-black/20 dark:hover:bg-white/20 transition-colors max-w-full select-none"
                        >
                          <div className="text-[11px] font-bold text-white/90 truncate">
                            {replyTo.sender_name}
                          </div>
                          <div className="text-[12.5px] text-white/80 truncate leading-relaxed">
                            {replyTo.content_type === 'image' ? 'Image' : replyTo.content_type === 'video' ? 'Video' : replyTo.content_type === 'audio' ? 'Voice message' : replyTo.content}
                          </div>
                        </div>
                      );
                    })()}
                  {msg.content_type === 'image' && (mediaUrl) ? (
                    <div className="mb-2">
                      <div className="relative inline-block max-w-[240px] rounded-lg overflow-hidden border border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800">
                        <img 
                          src={(mediaUrl) as string} 
                          alt="Attachment" 
                          className="w-full h-auto cursor-pointer hover:opacity-90 transition-opacity"
                          onClick={() => setZoomedImage((mediaUrl) as string)}
                        />
                      </div>
                      {msg.content !== '[Attachment]' && msg.content !== '[Image]' && <div className="mt-1">{renderTextWithLinks(msg.content, true, teamMembers)}</div>}
                    </div>
                  ) : msg.content_type === 'file' && (mediaUrl) ? (
                    <a href={(mediaUrl) as string} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 p-2 bg-black/10 dark:bg-white/10 rounded-lg hover:bg-black/20 transition mb-1">
                      <Paperclip size={16} />
                      <span className="text-[13px] underline truncate max-w-[180px]">{safeMeta.filename || 'Download File'}</span>
                    </a>
                  ) : msg.content_type === 'audio' && (mediaUrl) ? (
                    <div className="flex flex-col gap-1">
                      <CustomAudioPlayer url={(mediaUrl || mediaUrl) as string} isDark={!msg.is_internal} />
                      {msg.content !== '[Audio Voice Message]' && <div className="mt-1">{renderTextWithLinks(msg.content, true, teamMembers)}</div>}
                    </div>
                  ) : msg.content_type === 'video' && (mediaUrl) ? (
                    <div className="mb-2">
                      <video controls className="max-w-[240px] rounded-lg border border-slate-100 dark:border-slate-700 bg-black">
                        <source src={(mediaUrl) as string} type={safeMeta.mimetype || 'video/mp4'} />
                        Your browser does not support the video tag.
                      </video>
                      {msg.content !== '[Video]' && <div className="mt-1">{renderTextWithLinks(msg.content, true, teamMembers)}</div>}
                    </div>
                  ) : (
                    <div>{renderTextWithLinks(msg.content, true, teamMembers)}</div>
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
              <div id={`msg-${msg.id}`} key={msg.id || idx} className="flex flex-col mb-4 transition-all duration-300 rounded-xl">
                <div className="flex items-end gap-2.5 relative group">
                  {/* Customer / Participant Avatar */}
                  {msg.metadata?.participant_avatar ? (
                    <img 
                      src={msg.metadata.participant_avatar} 
                      alt={safeMeta.participant_name || contactName}
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
                      {safeMeta.participant_name ? safeMeta.participant_name.charAt(0).toUpperCase() : contactInitial}
                    </div>
                  )}
                  <div className="max-w-[75%] flex flex-col items-start gap-1">
                    {/* Participant Name Banner for Group Chats */}
                    {safeMeta.participant_name && (
                      <div className="text-[11px] text-slate-500 mb-0.5">{safeMeta.participant_name}</div>
                    )}
                    <div className="bg-slate-100 dark:bg-slate-800 rounded-2xl rounded-bl-sm px-4 py-2.5 text-[14px] text-slate-900 dark:text-slate-200 leading-relaxed whitespace-pre-wrap break-words font-normal">
                      {/* Render Reply Preview if present */}
                      {(() => {
                        const replyTo = safeMeta.reply_to;
                        if (!replyTo) return null;
                        return (
                          <div 
                            onClick={() => {
                              const element = document.getElementById(`msg-${replyTo.message_id}`);
                              if (element) {
                                element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                element.classList.add('bg-blue-50/50', 'dark:bg-blue-950/20', 'ring-2', 'ring-blue-400/50', 'transition-all', 'duration-500');
                                setTimeout(() => {
                                  element.classList.remove('bg-blue-50/50', 'dark:bg-blue-950/20', 'ring-2', 'ring-blue-400/50');
                                }, 2000);
                              }
                            }}
                            className="mb-2 p-2 bg-black/5 dark:bg-white/5 border-l-[3px] border-[#0070f3] dark:border-blue-400 rounded-r-md text-left cursor-pointer hover:bg-black/10 dark:hover:bg-white/10 transition-colors max-w-full select-none"
                          >
                            <div className="text-[11px] font-bold text-[#0070f3] dark:text-blue-400 truncate">
                              {replyTo.sender_name}
                            </div>
                            <div className="text-[12.5px] text-slate-650 dark:text-slate-300 truncate leading-relaxed">
                              {replyTo.content_type === 'image' ? 'Image' : replyTo.content_type === 'video' ? 'Video' : replyTo.content_type === 'audio' ? 'Voice message' : replyTo.content}
                            </div>
                          </div>
                        );
                      })()}
                      {msg.content_type === 'image' && (mediaUrl) ? (
                        <div className="mb-2">
                          <div className="relative inline-block max-w-[240px] rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800">
                            <img 
                              src={(mediaUrl) as string} 
                              alt="Attachment" 
                              className="w-full h-auto cursor-pointer hover:opacity-90 transition-opacity"
                              onClick={() => setZoomedImage((mediaUrl) as string)}
                            />
                          </div>
                          {msg.content !== '[Attachment]' && msg.content !== '[Image]' && <div className="mt-1">{renderTextWithLinks(msg.content, false, teamMembers)}</div>}
                        </div>
                      ) : msg.content_type === 'file' && (mediaUrl) ? (
                        <a href={(mediaUrl) as string} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 p-2 bg-black/5 dark:bg-white/5 rounded-lg hover:bg-black/10 transition mb-1">
                          <Paperclip size={16} />
                          <span className="text-[13px] underline truncate max-w-[180px]">{safeMeta.filename || 'Download File'}</span>
                        </a>
                      ) : msg.content_type === 'audio' && (mediaUrl) ? (
                        <div className="flex flex-col gap-1">
                          <CustomAudioPlayer url={(mediaUrl || mediaUrl) as string} isDark={false} />
                          {msg.content !== '[Audio Voice Message]' && <div className="mt-1">{renderTextWithLinks(msg.content, false, teamMembers)}</div>}
                        </div>
                      ) : msg.content_type === 'video' && (mediaUrl) ? (
                        <div className="mb-2">
                          <video controls className="max-w-[240px] rounded-lg border border-slate-200 dark:border-slate-700 bg-black">
                            <source src={(mediaUrl) as string} type={safeMeta.mimetype || 'video/mp4'} />
                            Your browser does not support the video tag.
                          </video>
                          {msg.content !== '[Video]' && <div className="mt-1">{renderTextWithLinks(msg.content, false, teamMembers)}</div>}
                        </div>
                      ) : (
                        <div>{renderTextWithLinks(msg.content, false, teamMembers)}</div>
                      )}
                    </div>
                  </div>

                  {/* Reply Button on Hover */}
                  <button 
                    onClick={() => setReplyToMessage(msg)}
                    className="opacity-0 group-hover:opacity-100 transition-all duration-150 p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 shrink-0 mb-1 align-bottom self-end"
                    title="Reply"
                  >
                    <CornerUpLeft size={15} strokeWidth={2.5} />
                  </button>
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
              {stagedAttachments.length > 0 && (
                <div className="px-4 pt-3 pb-1 flex gap-2 flex-wrap">
                  {stagedAttachments.map((item, idx) => (
                    <div 
                      key={item.id} 
                      className={`relative inline-block border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden group bg-slate-50 dark:bg-slate-800 shrink-0 ${item.previewUrl && !item.type.startsWith('video/') ? 'cursor-zoom-in' : ''}`}
                      onClick={() => {
                        if (item.previewUrl && !item.type.startsWith('video/')) {
                          setZoomedImage(item.previewUrl)
                        }
                      }}
                    >
                      {item.previewUrl ? (
                        item.type.startsWith('video/') ? (
                          <div className="relative h-16 w-16 bg-slate-950 flex items-center justify-center select-none">
                            <video src={item.previewUrl} className="h-16 w-16 object-cover opacity-80" muted playsInline />
                            <div className="absolute inset-0 flex items-center justify-center bg-black/10">
                              <div className="p-1 rounded-full bg-white/25 backdrop-blur-sm border border-white/10">
                                <svg className="w-2.5 h-2.5 text-white fill-current" viewBox="0 0 24 24">
                                  <path d="M8 5v14l11-7z" />
                                </svg>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <img src={item.previewUrl} alt="Preview" className="h-16 w-16 object-cover" />
                        )
                      ) : (
                        <div className="h-16 w-16 flex flex-col items-center justify-center gap-1 px-1 select-none">
                          <Paperclip size={18} className="text-slate-400" />
                          <span className="text-[9px] text-slate-400 truncate w-full text-center leading-tight font-medium">{item.name.split('.').pop()?.toUpperCase()}</span>
                        </div>
                      )}
                      
                      {/* Premium progressive clear-out reveal overlay loader */}
                      {item.status === 'uploading' && (
                        <>
                          <div 
                            className="absolute inset-0 bg-slate-900/60 backdrop-blur-[0.5px] transition-all duration-300 ease-out z-10 pointer-events-none"
                            style={{ clipPath: `inset(0px 0px ${item.progress}% 0px)` }}
                          />
                          <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
                            <div className="p-1 rounded-full bg-slate-950/40 backdrop-blur-sm border border-white/10">
                              <Loader2 size={12} className="animate-spin text-white" />
                            </div>
                          </div>
                        </>
                      )}

                      {/* Red cross failure overlay */}
                      {item.status === 'failed' && (
                        <div className="absolute inset-0 bg-red-950/70 flex flex-col items-center justify-center backdrop-blur-[1px] text-white select-none z-10 transition-all">
                          <X size={16} className="text-red-300 font-bold" />
                          <span className="text-[9px] font-semibold text-red-200 mt-0.5">Failed</span>
                        </div>
                      )}

                      {/* Delete button */}
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          removeAttachment(idx);
                        }}
                        className={`absolute top-0.5 right-0.5 p-1 bg-black/60 rounded-full text-white transition-opacity ${item.status === 'uploading' ? 'hidden' : 'opacity-0 group-hover:opacity-100'}`}
                        disabled={item.status === 'uploading'}
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {replyToMessage && (
                <div className="mx-4 mt-3 mb-1 px-3 py-2 bg-slate-50 dark:bg-slate-800/80 border-l-4 border-[#0070f3] dark:border-blue-500 rounded-r-lg flex items-center justify-between text-left select-none relative animate-in slide-in-from-bottom-2 duration-150">
                  <div className="flex flex-col gap-0.5 max-w-[90%]">
                    <span className="text-[12px] font-semibold text-blue-600 dark:text-blue-400">
                      Replying to {replyToMessage.sender_type === 'agent' || replyToMessage.sender_type === 'ai' ? 'You' : contactName}
                    </span>
                    <span className="text-[13px] text-slate-600 dark:text-slate-350 truncate font-normal leading-relaxed">
                      {replyToMessage.content_type === 'image' ? 'Image' : replyToMessage.content_type === 'video' ? 'Video' : replyToMessage.content_type === 'audio' ? 'Voice message' : replyToMessage.content}
                    </span>
                  </div>
                  <button 
                    onClick={() => setReplyToMessage(null)}
                    className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors p-1 hover:bg-slate-200/50 dark:hover:bg-slate-700 rounded-full"
                  >
                    <X size={16} />
                  </button>
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
                className={`w-full bg-transparent p-4 text-[14px] focus:outline-none min-h-[90px] resize-none font-normal leading-relaxed ${isInternal ? 'text-amber-900 dark:text-amber-100 placeholder:text-amber-700/50 dark:placeholder:text-amber-500/50' : 'text-slate-800 dark:text-slate-100 placeholder:text-slate-400'} ${stagedAttachments.length > 0 ? 'pt-2 min-h-[60px]' : ''}`}
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
                disabled={isSending || isRecording}
                className={`p-1.5 rounded-md transition-all disabled:opacity-50 ${isInternal ? 'text-amber-600 hover:bg-amber-200/50' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'}`}
              >
                <Paperclip size={16} strokeWidth={2} />
              </button>
              <button 
                onClick={isRecording ? stopRecording : startRecording}
                disabled={isSending}
                className={`p-1.5 rounded-md transition-all disabled:opacity-50 ${isRecording ? 'text-red-500 hover:bg-red-50' : isInternal ? 'text-amber-600 hover:bg-amber-200/50' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'}`}
              >
                {isRecording ? <Square size={16} strokeWidth={2} /> : <Mic size={16} strokeWidth={2} />}
              </button>
              <button 
                onClick={handleAiDraft}
                disabled={isSending || isAiDrafting || allMessages.length === 0}
                title="AI Auto-Reply Draft"
                className={`p-1.5 rounded-md transition-all flex items-center gap-1 disabled:opacity-50 ${aiDraftFailed ? 'text-red-500 hover:bg-red-50' : isInternal ? 'text-amber-600 hover:bg-amber-200/50' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'}`}
              >
                {isAiDrafting ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : aiDraftFailed ? (
                  <X size={16} strokeWidth={2} />
                ) : (
                  <Bot size={16} strokeWidth={2} />
                )}
                <span className="text-[12px] font-medium hidden sm:inline-block pr-1">
                  {aiDraftFailed ? 'Failed' : 'AI Draft'}
                </span>
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
                disabled={(!input.trim() && stagedAttachments.length === 0) || isSending}
                className={`px-5 py-1.5 text-[14px] font-medium text-white rounded-lg transition-colors flex items-center gap-1.5 ${isInternal ? 'bg-amber-500 hover:bg-amber-600 disabled:bg-amber-300' : 'bg-[#0070f3] hover:bg-blue-600 disabled:bg-blue-300'}`}
              >
                {isSending ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    <span>Sending...</span>
                  </>
                ) : (
                  isInternal ? 'Add Note' : 'Send'
                )}
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
      {/* Custom Resolve Confirmation Modal */}
      {showResolveConfirm && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-slate-900/60 backdrop-blur-[2px] p-4">
          <div className="bg-white dark:bg-[#111827] border border-slate-100 dark:border-slate-800/80 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.15)] max-w-sm w-full p-6 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex flex-col items-center text-center">
              <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300 mb-4 border border-slate-200/60 dark:border-slate-700 shadow-sm">
                <CheckCheck size={22} strokeWidth={2.5} />
              </div>
              <h3 className="text-[16px] font-bold text-slate-900 dark:text-slate-100">
                Resolve & Ask Review
              </h3>
              <p className="text-[13px] text-slate-500 dark:text-slate-400 mt-2.5 leading-relaxed">
                Are you sure you want to resolve this conversation and send the Google review request message?
              </p>
            </div>
            <div className="flex gap-2.5 mt-6">
              <button 
                onClick={() => setShowResolveConfirm(false)}
                disabled={isResolving}
                className="flex-1 px-4 py-2.5 text-[13px] font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl transition-all duration-300 shadow-sm active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button 
                onClick={executeResolveAndReview}
                disabled={isResolving}
                className="flex-1 px-4 py-2.5 text-[13px] font-semibold text-white bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-950 dark:hover:bg-slate-200 rounded-xl transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] hover:scale-[1.02] active:scale-[0.97] shadow-sm hover:shadow-md active:shadow-sm flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isResolving ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  "Resolve"
                )}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
