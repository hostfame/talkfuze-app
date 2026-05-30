"use client"

import React, { useEffect, useState, useRef } from 'react'
import { MessageSquare, X, Send, User, ChevronLeft, Loader2 } from 'lucide-react'
import { useTeamChatStore, TeamChat, TeamMessage } from '@/lib/team-chat-store'
import { useInboxStore } from '@/lib/store'
import { useAuth } from '@/lib/auth-context'
import { supabase } from '@/lib/supabase'
import { fetchTeamChats, fetchTeamMessages, sendTeamMessage, getOrCreateDirectChat } from '@/actions/team-chat'

const playCutePing = () => {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
    if (!AudioCtx) return
    const ctx = new AudioCtx()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    
    osc.type = 'sine'
    // A cute double-ping sound
    osc.frequency.setValueAtTime(880, ctx.currentTime) // A5
    osc.frequency.setValueAtTime(1318.51, ctx.currentTime + 0.1) // E6
    
    gain.gain.setValueAtTime(0, ctx.currentTime)
    gain.gain.linearRampToValueAtTime(0.15, ctx.currentTime + 0.05)
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2)
    
    osc.connect(gain)
    gain.connect(ctx.destination)
    
    osc.start()
    osc.stop(ctx.currentTime + 0.2)
    
    setTimeout(() => {
      if (ctx.state !== 'closed') ctx.close().catch(() => {})
    }, 300)
  } catch(e) {}
}

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

  const totalUnread = Object.values(unreadCounts).reduce((a, b) => a + b, 0)

  // Fetch initial chats
  useEffect(() => {
    if (currentUser?.org_id) {
      fetchTeamChats(currentUser.org_id).then(fetchedChats => {
        // Map chats to include other member details
        const enrichedChats = fetchedChats.map((c: any) => {
          let otherName = 'Unknown'
          let otherAvatar = undefined
          if (c.type === 'direct') {
            const otherUserId = c.team_chat_members?.find((m: any) => m.user_id !== currentUser.id)?.user_id
            if (otherUserId) {
              const tm = teamMembers.find(t => t.id === otherUserId)
              if (tm) {
                otherName = tm.name
                otherAvatar = tm.avatar_url
              }
            }
          }
          return {
            id: c.id,
            org_id: c.org_id,
            type: c.type,
            name: c.name,
            members: c.team_chat_members,
            other_member_name: otherName,
            other_member_avatar: otherAvatar
          } as TeamChat
        })
        setChats(enrichedChats)
      })
    }
  }, [currentUser?.org_id, teamMembers, setChats])

  // Realtime subscription for team messages & presence
  useEffect(() => {
    if (!currentUser?.id || !currentUser?.org_id) return

    const chatIds = chats.map(c => c.id)
    
    // Message Channel
    const messageChannel = supabase
      .channel('team_messages_realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'team_messages',
          filter: chatIds.length > 0 ? `chat_id=in.(${chatIds.join(',')})` : undefined
        },
        async (payload) => {
          const newMsg = payload.new as TeamMessage
          
          if (newMsg.sender_id !== currentUser.id) {
            playCutePing()
            if (!isOpen || activeChatId !== newMsg.chat_id) {
              incrementUnreadCount(newMsg.chat_id)
            }
          }
          
          const sender = teamMembers.find(t => t.id === newMsg.sender_id)
          const enrichedMsg = {
            ...newMsg,
            sender_name: sender?.name || 'Agent',
            sender_avatar: sender?.avatar_url || undefined
          }
          
          addMessage(newMsg.chat_id, enrichedMsg)
          
          if (activeChatId === newMsg.chat_id) {
            setTimeout(() => {
              messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
            }, 100)
          }
        }
      )
      .subscribe()

    // Presence Channel
    const presenceChannel = supabase.channel('team_chat_presence', {
      config: { presence: { key: currentUser.id } }
    })

    presenceChannel.on('presence', { event: 'sync' }, () => {
      const state = presenceChannel.presenceState()
      setOnlineUsers(state)
    })

    presenceChannel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await presenceChannel.track({ online_at: new Date().toISOString() })
      }
    })

    return () => {
      supabase.removeChannel(messageChannel)
      supabase.removeChannel(presenceChannel)
    }
  }, [chats, currentUser?.id, currentUser?.org_id, isOpen, activeChatId, addMessage, incrementUnreadCount, teamMembers])

  // Fetch messages when a chat is opened
  useEffect(() => {
    if (activeChatId && !messages[activeChatId]) {
      setIsLoading(true)
      fetchTeamMessages(activeChatId).then(msgs => {
        setMessages(activeChatId, msgs)
        setUnreadCount(activeChatId, 0)
        setIsLoading(false)
        setTimeout(() => {
          messagesEndRef.current?.scrollIntoView({ behavior: 'auto' })
        }, 100)
      })
    } else if (activeChatId) {
      setUnreadCount(activeChatId, 0)
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'auto' })
      }, 100)
    }
  }, [activeChatId, messages, setMessages, setUnreadCount])

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!msgInput.trim() || !activeChatId || sending) return
    
    const text = msgInput.trim()
    setMsgInput('')
    setSending(true)
    
    try {
      await sendTeamMessage(activeChatId, text)
    } catch (e) {
      console.error(e)
    } finally {
      setSending(false)
    }
  }

  const startDirectChat = async (otherUserId: string) => {
    setErrorMsg(null)
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
          let otherAvatar = undefined
          if (c.type === 'direct') {
            const ouId = c.team_chat_members?.find((m: any) => m.user_id !== currentUser.id)?.user_id
            if (ouId) {
              const tm = teamMembers.find(t => t.id === ouId)
              if (tm) {
                otherName = tm.name
                otherAvatar = tm.avatar_url
              }
            }
          }
          return {
            ...c,
            other_member_name: otherName,
            other_member_avatar: otherAvatar,
            members: c.team_chat_members
          }
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

  return (
    <>
      {/* Floating Button (when closed) */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-[5.5rem] w-12 h-12 bg-white border border-slate-200 dark:bg-slate-800 dark:border-slate-700 text-slate-600 hover:text-blue-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:text-blue-400 dark:hover:bg-slate-700/80 rounded-full shadow-[0_4px_12px_rgba(0,0,0,0.1)] hidden md:flex items-center justify-center transition-all hover:-translate-y-0.5 z-40 cursor-pointer"
        >
          <MessageSquare strokeWidth={2.5} size={20} />
          {totalUnread > 0 && (
            <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[11px] font-bold text-white shadow-[0_0_0_2px_#fff] dark:shadow-[0_0_0_2px_#0b141a]">
              {totalUnread > 9 ? '9+' : totalUnread}
            </span>
          )}
        </button>
      )}

      {/* Dock Panel (Ultra Minimal Facebook Style) */}
      {isOpen && (
        <div className="fixed bottom-0 right-24 w-[280px] h-[400px] max-h-[70vh] bg-white dark:bg-[#111b21] rounded-t-xl shadow-[0_0_24px_rgba(0,0,0,0.15)] border border-slate-200 dark:border-slate-800/60 border-b-0 z-50 flex flex-col overflow-hidden hidden md:flex">
          
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2 bg-white dark:bg-[#202c33] border-b border-slate-200 dark:border-slate-800 shadow-sm shrink-0">
            <div className="flex items-center gap-2">
              {activeChatId && (
                <button onClick={() => setActiveChatId(null)} className="p-1 -ml-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-colors">
                  <ChevronLeft size={16} />
                </button>
              )}
              <span className="font-semibold text-sm text-slate-800 dark:text-slate-100">
                {activeChatId ? (
                  chats.find(c => c.id === activeChatId)?.type === 'direct' ? chats.find(c => c.id === activeChatId)?.other_member_name : 'Group Chat'
                ) : 'Team Chat'}
              </span>
            </div>
            <button onClick={() => setIsOpen(false)} className="p-1 -mr-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-colors cursor-pointer">
              <X size={16} />
            </button>
          </div>

          {/* Content Area */}
          <div className="flex-1 overflow-y-auto bg-white dark:bg-[#111b21] relative">
            {errorMsg && (
              <div className="absolute top-0 left-0 right-0 bg-red-100 text-red-600 text-[10px] p-2 text-center z-10 font-mono">
                Error: {errorMsg}
              </div>
            )}
            {isLoading ? (
              <div className="flex flex-col items-center justify-center h-full">
                <Loader2 className="w-6 h-6 text-slate-400 animate-spin" />
                <span className="text-xs text-slate-500 mt-2">Connecting...</span>
              </div>
            ) : !activeChatId ? (
              // Chat List View
              <div className="p-1 space-y-0.5">
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
                            <div className="w-full h-full rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 flex items-center justify-center font-bold text-xs">
                              {member.name.charAt(0)}
                            </div>
                          )}
                          {isOnline && (
                            <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-500 border-2 border-white dark:border-slate-900 rounded-full"></span>
                          )}
                        </div>
                        <p className="text-sm font-medium text-slate-800 dark:text-slate-200 group-hover:text-blue-600 dark:group-hover:text-blue-400">{member.name}</p>
                      </div>
                      {unread > 0 && (
                        <div className="w-4 h-4 bg-red-500 rounded-full flex items-center justify-center text-[9px] font-bold text-white">
                          {unread}
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>
            ) : (
              // Message View
              <div className="flex flex-col h-full bg-slate-50/50 dark:bg-[#0b141a]">
                <div className="flex-1 overflow-y-auto p-3 space-y-3">
                  {isLoading ? (
                    <div className="flex items-center justify-center h-full">
                      <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
                    </div>
                  ) : (
                    messages[activeChatId]?.map(msg => {
                      const isMe = msg.sender_id === currentUser?.id
                      return (
                        <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                          {!isMe && <span className="text-[9px] text-slate-400 mb-0.5 ml-1">{msg.sender_name}</span>}
                          <div className={`max-w-[85%] rounded-2xl px-3 py-1.5 text-[13px] shadow-sm ${
                            isMe 
                              ? 'bg-blue-600 text-white rounded-br-sm' 
                              : 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 border border-slate-100 dark:border-slate-700 rounded-bl-sm'
                          }`}>
                            {msg.content}
                          </div>
                        </div>
                      )
                    })
                  )}
                  <div ref={messagesEndRef} />
                </div>
                
                {/* Input Area */}
                <div className="p-2 bg-white dark:bg-[#111b21] border-t border-slate-100 dark:border-slate-800 shrink-0">
                  <form onSubmit={handleSendMessage} className="flex gap-1.5 items-center">
                    <input
                      type="text"
                      value={msgInput}
                      onChange={e => setMsgInput(e.target.value)}
                      placeholder="Aa"
                      className="flex-1 bg-slate-100 dark:bg-slate-800/50 rounded-full px-3 py-1.5 text-[13px] focus:outline-none focus:ring-1 focus:ring-blue-500 dark:text-white transition-shadow"
                      disabled={sending}
                    />
                    <button
                      type="submit"
                      disabled={!msgInput.trim() || sending}
                      className="w-7 h-7 rounded-full text-blue-600 dark:text-blue-500 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 flex items-center justify-center shrink-0 transition-colors cursor-pointer"
                    >
                      {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} className="ml-0.5" />}
                    </button>
                  </form>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
