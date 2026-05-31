"use client"

import React, { useEffect, useState, useRef, useCallback } from 'react'
import { MessageSquare, X, Send, ChevronLeft, Loader2, Users, Paperclip, Mic, Square } from 'lucide-react'
import { useTeamChatStore, TeamChat, TeamMessage } from '@/lib/team-chat-store'
import { useInboxStore } from '@/lib/store'
import { useAuth } from '@/lib/auth-context'
import { supabase } from '@/lib/supabase'
import { fetchTeamChats, fetchTeamMessages, sendTeamMessage, getOrCreateDirectChat } from '@/actions/team-chat'
import { cn } from '@/lib/utils'

// ------- Audio -------
const playCutePing = () => {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
    if (!AudioCtx) return
    const ctx = new AudioCtx()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(880, ctx.currentTime)
    osc.frequency.setValueAtTime(1318.51, ctx.currentTime + 0.1)
    gain.gain.setValueAtTime(0, ctx.currentTime)
    gain.gain.linearRampToValueAtTime(0.15, ctx.currentTime + 0.05)
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + 0.2)
    setTimeout(() => { if (ctx.state !== 'closed') ctx.close().catch(() => {}) }, 300)
  } catch(e) {}
}

// ------- Broadcast channel name (shared across all team chat users) -------
const BROADCAST_CHANNEL = 'team_chat_broadcast'

export default function TeamChatDock() {
  const { 
    isOpen, setIsOpen, 
    activeChatId, setActiveChatId,
    chats, setChats,
    messages, setMessages, addMessage,
    unreadCounts, incrementUnreadCount, setUnreadCount
  } = useTeamChatStore()
  
  const authUser = useAuth()
  const { teamMembers } = useInboxStore()
  const currentUser = authUser || useInboxStore.getState().currentUser
  const [isLoading, setIsLoading] = useState(false)
  const [msgInput, setMsgInput] = useState('')
  const [sending, setSending] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [onlineUsers, setOnlineUsers] = useState<Record<string, any>>({})
  const messagesEndRef = useRef<HTMLDivElement>(null)
  
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [recording, setRecording] = useState(false)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const [zoomedImage, setZoomedImage] = useState<string | null>(null)

  // Stable refs to avoid re-subscribing channels on every state change
  const isOpenRef = useRef(isOpen)
  const activeChatIdRef = useRef(activeChatId)
  const chatIdsRef = useRef<string[]>([])
  const broadcastChannelRef = useRef<any>(null)
  isOpenRef.current = isOpen
  activeChatIdRef.current = activeChatId
  chatIdsRef.current = chats.map(c => c.id)

  const totalUnread = Object.values(unreadCounts).reduce((a, b) => a + b, 0)

  const scrollToBottom = useCallback(() => {
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 30)
  }, [])

  // ------- 1. Fetch initial chats -------
  useEffect(() => {
    if (currentUser?.org_id) {
      fetchTeamChats(currentUser.org_id).then(fetchedChats => {
        const enrichedChats = fetchedChats.map((c: any) => {
          let otherName = 'Unknown'
          let otherAvatar: string | null = null
          if (c.type === 'direct') {
            const otherUserId = c.team_chat_members?.find((m: any) => m.user_id !== currentUser.id)?.user_id
            if (otherUserId) {
              const tm = teamMembers.find(t => t.id === otherUserId)
              if (tm) {
                otherName = tm.name
                otherAvatar = tm.avatar_url || null
              }
            }
          }
          return {
            id: c.id, org_id: c.org_id, type: c.type, name: c.name,
            members: c.team_chat_members,
            other_member_name: otherName, other_member_avatar: otherAvatar
          } as TeamChat
        })
        setChats(enrichedChats)
      })
    }
  }, [currentUser?.org_id, teamMembers, setChats])

  // ------- 2. Broadcast Channel + Presence (subscribe ONCE) -------
  useEffect(() => {
    if (!currentUser?.id || !currentUser?.org_id) return

    // Shared handler for incoming messages (used by both broadcast and postgres_changes)
    const handleIncomingMessage = (msg: TeamMessage, source: string) => {
      // Skip our own messages (already shown via optimistic UI)
      if (msg.sender_id === currentUser.id) return
      
      // Only process messages for chats we're part of
      if (!chatIdsRef.current.includes(msg.chat_id)) return

      // The store's addMessage has smart content+sender dedup,
      // so if broadcast AND postgres_changes both deliver, only one copy shows
      const alreadyHave = useTeamChatStore.getState().messages[msg.chat_id]?.some(
        m => m.content === msg.content 
          && m.sender_id === msg.sender_id 
          && Math.abs(new Date(m.created_at).getTime() - new Date(msg.created_at).getTime()) < 10000
      )

      if (!alreadyHave) {
        playCutePing()
        if (!isOpenRef.current || activeChatIdRef.current !== msg.chat_id) {
          incrementUnreadCount(msg.chat_id)
        }
        if (!isOpenRef.current) {
          setIsOpen(true)
        }
      }

      addMessage(msg.chat_id, msg)
      
      if (activeChatIdRef.current === msg.chat_id) {
        scrollToBottom()
      }
    }

    // LAYER 1: BROADCAST - instant delivery via WebSocket (~20ms)
    const channel = supabase.channel(BROADCAST_CHANNEL)
    broadcastChannelRef.current = channel

    channel.on('broadcast', { event: 'new_message' }, (payload: any) => {
      handleIncomingMessage(payload.payload as TeamMessage, 'broadcast')
    })

    channel.subscribe()

    // LAYER 2: POSTGRES_CHANGES - reliable backup (~200-500ms)
    // Catches messages that broadcast missed (network hiccup, tab inactive, etc.)
    const dbChannel = supabase
      .channel('team_messages_db_backup')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'team_messages' },
        (payload) => {
          const raw = payload.new as any
          const sender = teamMembers.find(t => t.id === raw.sender_id)
          const msg: TeamMessage = {
            id: raw.id,
            chat_id: raw.chat_id,
            sender_id: raw.sender_id,
            content: raw.content,
            created_at: raw.created_at,
            sender_name: sender?.name || 'Agent',
            sender_avatar: sender?.avatar_url || null
          }
          handleIncomingMessage(msg, 'postgres_changes')
        }
      )
      .subscribe()

    // PRESENCE CHANNEL: online status
    const presenceChannel = supabase.channel('team_chat_presence', {
      config: { presence: { key: currentUser.id } }
    })
    presenceChannel.on('presence', { event: 'sync' }, () => {
      setOnlineUsers(presenceChannel.presenceState())
    })
    presenceChannel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await presenceChannel.track({ online_at: new Date().toISOString() })
      }
    })

    return () => {
      supabase.removeChannel(channel)
      supabase.removeChannel(dbChannel)
      supabase.removeChannel(presenceChannel)
      broadcastChannelRef.current = null
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id, currentUser?.org_id])

  // ------- 3. Fetch messages when chat opened -------
  useEffect(() => {
    let alive = true
    if (activeChatId && !messages[activeChatId]) {
      setIsLoading(true)
      fetchTeamMessages(activeChatId)
        .then(msgs => {
          if (!alive) return
          setMessages(activeChatId, msgs)
          setUnreadCount(activeChatId, 0)
          setIsLoading(false)
          scrollToBottom()
        })
        .catch(() => { if (alive) setIsLoading(false) })
    } else if (activeChatId) {
      setUnreadCount(activeChatId, 0)
      scrollToBottom()
    }
    return () => { alive = false }
  }, [activeChatId, messages, setMessages, setUnreadCount, scrollToBottom])

  // ------- 4. SEND: Optimistic + Broadcast + Direct DB Insert -------
  const doSendMessage = async (rawText: string) => {
    if (!activeChatId) return;
    setSending(true)

    const sender = teamMembers.find(t => t.id === currentUser?.id)
    const optimisticId = `optimistic-${Date.now()}`

    let content = rawText;
    let attachment_type: any = undefined;
    let attachment_url: any = undefined;
    
    if (content.startsWith('[IMAGE]')) {
      attachment_type = 'image';
      attachment_url = content.substring(7);
      content = 'Sent an image';
    } else if (content.startsWith('[AUDIO]')) {
      attachment_type = 'audio';
      attachment_url = content.substring(7);
      content = 'Sent a voice message';
    }

    const msgPayload: TeamMessage = {
      id: optimisticId,
      chat_id: activeChatId,
      sender_id: currentUser?.id || '',
      content,
      created_at: new Date().toISOString(),
      sender_name: sender?.name || currentUser?.name || 'You',
      sender_avatar: sender?.avatar_url || null,
      attachment_url,
      attachment_type
    }

    // STEP 1: Show in OUR UI instantly (0ms)
    addMessage(activeChatId, msgPayload)
    scrollToBottom()

    // STEP 2: Broadcast to OTHER clients via WebSocket (~20ms)
    // Send rawText so they parse it
    if (broadcastChannelRef.current) {
      broadcastChannelRef.current.send({
        type: 'broadcast',
        event: 'new_message',
        payload: { ...msgPayload, content: rawText, attachment_url: undefined, attachment_type: undefined }
      })
    }

    // STEP 3: Persist via server action
    sendTeamMessage(activeChatId, rawText).catch(err => {
      console.error('Failed to persist message:', err)
    })

    setSending(false)
  }

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!msgInput.trim() || !activeChatId || sending) return
    const text = msgInput.trim()
    setMsgInput('')
    await doSendMessage(text)
  }

  const handlePaste = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const file = items[i].getAsFile()
        if (file && activeChatId) {
          setUploading(true)
          try {
            const formData = new FormData()
            formData.append('file', file)
            const res = await fetch('/api/upload', { method: 'POST', body: formData })
            const data = await res.json()
            if (data.url) {
              await doSendMessage(`[IMAGE]${data.url}`)
            }
          } catch (err) {
            console.error('Paste upload failed:', err)
          } finally {
            setUploading(false)
          }
        }
        break // only handle first image
      }
    }
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !activeChatId) return
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch('/api/upload', { method: 'POST', body: formData })
      const data = await res.json()
      if (data.url) {
        const text = file.type.startsWith('audio/') ? `[AUDIO]${data.url}` : `[IMAGE]${data.url}`
        await doSendMessage(text)
      }
    } catch (err) {
      console.error('Upload failed:', err)
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream)
      mediaRecorderRef.current = mediaRecorder
      audioChunksRef.current = []

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data)
      }

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/mp3' })
        const file = new File([audioBlob], `voice-${Date.now()}.mp3`, { type: 'audio/mp3' })
        setUploading(true)
        try {
          const formData = new FormData()
          formData.append('file', file)
          const res = await fetch('/api/upload', { method: 'POST', body: formData })
          const data = await res.json()
          if (data.url) {
            await doSendMessage(`[AUDIO]${data.url}`)
          }
        } catch (err) {
          console.error('Voice upload failed:', err)
        } finally {
          setUploading(false)
        }
        stream.getTracks().forEach(track => track.stop())
      }

      mediaRecorder.start()
      setRecording(true)
    } catch (err) {
      console.error('Failed to start recording:', err)
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && recording) {
      mediaRecorderRef.current.stop()
      setRecording(false)
    }
  }

  // ------- 5. Start Direct Chat -------
  const startDirectChat = async (otherUserId: string) => {
    setErrorMsg(null)
    
    // Check local cache first (instant)
    const existingChat = chats.find(c => c.type === 'direct' && c.members?.some(m => m.user_id === otherUserId))
    if (existingChat) {
      setActiveChatId(existingChat.id)
      return
    }

    setIsLoading(true)
    if (!currentUser?.org_id) {
      setErrorMsg("Missing user org_id")
      setIsLoading(false)
      return
    }
    try {
      const response = await getOrCreateDirectChat(currentUser.org_id, otherUserId)
      if (response.error) {
        setErrorMsg(response.error)
        setIsLoading(false)
        return
      }
      const chatId = response.data!
      if (!chats.find(c => c.id === chatId)) {
        const fetchedChats = await fetchTeamChats(currentUser.org_id)
        const enrichedChats = fetchedChats.map((c: any) => {
          let otherName = 'Unknown'
          let otherAvatar: string | null = null
          if (c.type === 'direct') {
            const ouId = c.team_chat_members?.find((m: any) => m.user_id !== currentUser.id)?.user_id
            if (ouId) {
              const tm = teamMembers.find(t => t.id === ouId)
              if (tm) { otherName = tm.name; otherAvatar = tm.avatar_url || null }
            }
          }
          return { ...c, other_member_name: otherName, other_member_avatar: otherAvatar, members: c.team_chat_members }
        })
        setChats(enrichedChats)
      }
      setActiveChatId(chatId)
    } catch (err: any) {
      console.error(err)
      setErrorMsg(err?.message || "Action failed")
    } finally {
      setIsLoading(false)
    }
  }

  // ------- RENDER -------
  return (
    <>
      {/* Zoom Modal */}
      {zoomedImage && (
        <div 
          className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4"
          onClick={() => setZoomedImage(null)}
        >
          <img src={zoomedImage} alt="Zoomed" className="max-w-full max-h-full object-contain select-none animate-in zoom-in duration-200" />
          <button className="absolute top-4 right-4 text-white/70 hover:text-white p-2" onClick={() => setZoomedImage(null)}>
            <X size={24} />
          </button>
        </div>
      )}

      {/* Floating Button - Right Edge Tab */}
      <div 
        className={cn(
          "fixed right-0 top-[40%] -translate-y-1/2 z-50 transition-all duration-300 ease-[cubic-bezier(0.23,1,0.32,1)]",
          isOpen ? "opacity-0 pointer-events-none translate-x-8" : "opacity-100 translate-x-0"
        )}
      >
        <button
          onClick={() => setIsOpen(true)}
          className="w-8 h-14 bg-white dark:bg-[#111b21] rounded-l-xl shadow-[-4px_0_12px_rgba(0,0,0,0.1)] border border-r-0 border-slate-200 dark:border-slate-800 flex flex-col items-center justify-center text-slate-500 hover:text-blue-600 hover:bg-slate-50 dark:text-slate-400 cursor-pointer"
        >
          <Users strokeWidth={2.5} size={16} />
          {totalUnread > 0 && (
            <span className="absolute -top-1.5 -left-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white shadow-[0_0_0_2px_#fff] dark:shadow-[0_0_0_2px_#0b141a]">
              {totalUnread > 9 ? '9+' : totalUnread}
            </span>
          )}
        </button>
      </div>

      {/* Floating Chat Window */}
      <div 
        className={cn(
          "fixed right-4 top-[40%] w-[240px] bg-white/95 backdrop-blur-2xl dark:bg-[#111b21]/95 rounded-2xl shadow-[0_12px_48px_rgba(0,0,0,0.15)] border border-slate-200/80 dark:border-slate-800/80 z-50 flex flex-col overflow-hidden hidden md:flex transition-all duration-400 ease-[cubic-bezier(0.16,1,0.3,1)] origin-right",
          isOpen ? "h-[450px] max-h-[80vh] opacity-100 scale-100 -translate-y-1/2" : "h-[400px] opacity-0 scale-95 -translate-y-1/2 translate-x-8 pointer-events-none"
        )}
      >
        {/* Header */}
        <div className="h-12 shrink-0 border-b border-slate-100 dark:border-slate-800/60 flex items-center justify-between px-3 bg-white/50 dark:bg-black/20">
          <div className="flex items-center gap-2">
            {activeChatId && (
              <button 
                onClick={(e) => { e.stopPropagation(); setActiveChatId(null) }}
                className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-slate-500"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
            )}
            <span className="font-semibold text-[13px] text-slate-800 dark:text-slate-200 truncate max-w-[160px]">
              {activeChatId ? (chats.find(c => c.id === activeChatId)?.type === 'direct' ? chats.find(c => c.id === activeChatId)?.other_member_name : 'Group Chat') : 'Team Chat'}
            </span>
          </div>
          <button 
            onClick={(e) => { e.stopPropagation(); setIsOpen(false) }}
            className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-slate-500"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {errorMsg && (
            <div className="bg-red-100 text-red-600 text-[10px] p-2 text-center font-mono shrink-0">
              Error: {errorMsg}
            </div>
          )}
          {isLoading ? (
            <div className="flex flex-col items-center justify-center h-full">
              <Loader2 className="w-6 h-6 text-slate-400 animate-spin" />
              <span className="text-xs text-slate-500 mt-2">Loading...</span>
            </div>
          ) : !activeChatId ? (
            /* ---- Chat List ---- */
            <div className="flex-1 overflow-y-auto p-1 space-y-0.5">
              {teamMembers.filter(t => t.id !== currentUser?.id && t.sip_extension).map(member => {
                const existingChat = chats.find(c => c.type === 'direct' && c.members?.some(m => m.user_id === member.id))
                const unread = existingChat ? (unreadCounts[existingChat.id] || 0) : 0
                const isOnline = !!onlineUsers[member.id]
                
                return (
                  <button
                    key={member.id}
                    onClick={() => startDirectChat(member.id)}
                    className="w-full flex items-center justify-between px-2 py-2 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors text-left group"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="relative w-8 h-8 shrink-0">
                        {member.avatar_url ? (
                          <img src={member.avatar_url} className="w-full h-full rounded-full object-cover" />
                        ) : (
                          <div className="w-full h-full rounded-full bg-gradient-to-br from-blue-100 to-blue-50 dark:from-blue-900/40 dark:to-blue-900/20 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold text-xs">
                            {member.name.charAt(0)}
                          </div>
                        )}
                        {isOnline && (
                          <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-500 border-2 border-white dark:border-slate-900 rounded-full"></span>
                        )}
                      </div>
                      <p className="text-[13px] font-medium text-slate-700 dark:text-slate-300 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors truncate">{member.name}</p>
                    </div>
                    {unread > 0 && (
                      <div className="w-4 h-4 shrink-0 bg-red-500 rounded-full flex items-center justify-center text-[9px] font-bold text-white">
                        {unread}
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          ) : (
            /* ---- Message View ---- */
            <div className="flex flex-col h-full bg-slate-50/30 dark:bg-black/10">
              <div className="flex-1 overflow-y-auto p-3 space-y-3">
                {messages[activeChatId]?.map(msg => {
                  const isMe = msg.sender_id === currentUser?.id
                  const sender = teamMembers.find(t => t.id === msg.sender_id)
                  const senderName = isMe ? 'You' : (sender?.name || msg.sender_name || 'Agent')
                  const senderAvatar = isMe ? (currentUser?.avatar_url) : (sender?.avatar_url || msg.sender_avatar)

                  return (
                    <div key={msg.id} className={`flex gap-2 w-full ${isMe ? 'justify-end' : 'justify-start'} items-end mb-1`}>
                      {!isMe && (
                        <div className="w-6 h-6 rounded-full shrink-0 overflow-hidden bg-slate-200 dark:bg-slate-700">
                          {senderAvatar ? (
                            <img src={senderAvatar} alt={senderName} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 font-bold text-[10px]">
                              {senderName.charAt(0)}
                            </div>
                          )}
                        </div>
                      )}
                      
                      <div className={`flex flex-col max-w-[75%] ${isMe ? 'items-end' : 'items-start'}`}>
                        {!isMe && <span className="text-[9px] text-slate-400 mb-1 ml-1">{senderName}</span>}
                        <div className={`rounded-[18px] px-3.5 py-2 text-[13px] shadow-sm leading-relaxed ${
                          isMe 
                            ? 'bg-gradient-to-br from-blue-500 to-blue-600 text-white rounded-br-sm' 
                            : 'bg-white dark:bg-slate-800/80 text-slate-700 dark:text-slate-200 border border-slate-100 dark:border-slate-700/50 rounded-bl-sm'
                        }`}>
                          {msg.attachment_type === 'image' && msg.attachment_url && (
                            <img src={msg.attachment_url} alt="Attachment" className="max-w-full w-auto h-auto rounded-lg mb-1 object-contain cursor-zoom-in hover:opacity-90 transition-opacity" onClick={() => setZoomedImage(msg.attachment_url!)} />
                          )}
                          {msg.attachment_type === 'audio' && msg.attachment_url && (
                            <audio controls src={msg.attachment_url} className="w-[180px] h-8 mb-1 [&::-webkit-media-controls-panel]:bg-white/20 [&::-webkit-media-controls-play-button]:text-current" />
                          )}
                          {msg.content !== 'Sent an image' && msg.content !== 'Sent a voice message' && msg.content}
                        </div>
                      </div>

                      {isMe && (
                        <div className="w-6 h-6 rounded-full shrink-0 overflow-hidden bg-slate-200 dark:bg-slate-700">
                          {senderAvatar ? (
                            <img src={senderAvatar} alt="You" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center bg-blue-500 text-white font-bold text-[10px]">
                              {currentUser?.name ? currentUser.name.charAt(0) : 'Y'}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
                <div ref={messagesEndRef} className="h-1" />
              </div>
              
              {/* Input */}
              <div className="p-2.5 bg-white/80 dark:bg-[#111b21]/80 backdrop-blur-md border-t border-slate-100 dark:border-slate-800/50 shrink-0">
                <form onSubmit={handleSendMessage} className="flex gap-2 items-center relative">
                  <input type="file" ref={fileInputRef} className="hidden" accept="image/*,audio/*" onChange={handleFileUpload} />
                  
                  <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading || recording} className="w-8 h-8 rounded-full text-slate-400 hover:text-blue-500 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center shrink-0 transition-colors cursor-pointer disabled:opacity-50">
                    <Paperclip size={16} />
                  </button>
                  
                  <input
                    type="text"
                    value={msgInput}
                    onChange={e => setMsgInput(e.target.value)}
                    onPaste={handlePaste}
                    placeholder={recording ? "Recording..." : uploading ? "Uploading..." : "Message..."}
                    className="flex-1 bg-slate-100/80 dark:bg-slate-800/60 rounded-full px-4 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white dark:focus:bg-slate-800 text-slate-800 dark:text-white transition-all"
                    disabled={sending || uploading || recording}
                  />
                  
                  {recording ? (
                    <button type="button" onClick={stopRecording} className="w-8 h-8 rounded-full bg-red-100 text-red-600 hover:bg-red-200 flex items-center justify-center shrink-0 transition-colors animate-pulse">
                      <Square size={14} className="fill-current" />
                    </button>
                  ) : msgInput.trim() === '' ? (
                    <button type="button" onClick={startRecording} disabled={uploading} className="w-8 h-8 rounded-full text-slate-400 hover:text-blue-500 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center shrink-0 transition-colors cursor-pointer disabled:opacity-50">
                      <Mic size={16} />
                    </button>
                  ) : (
                    <button
                      type="submit"
                      disabled={!msgInput.trim() || sending || uploading}
                      className="w-8 h-8 rounded-full bg-blue-600 text-white disabled:bg-slate-200 dark:disabled:bg-slate-700 disabled:text-slate-400 flex items-center justify-center shrink-0 transition-all cursor-pointer shadow-sm hover:shadow"
                    >
                      {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} className="-ml-0.5" />}
                    </button>
                  )}
                </form>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
