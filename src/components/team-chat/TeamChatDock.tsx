"use client"

import React, { useEffect, useState, useRef } from 'react'
import { MessageSquare, X, Send, User, ChevronLeft, Loader2 } from 'lucide-react'
import { useTeamChatStore, TeamChat, TeamMessage } from '@/lib/team-chat-store'
import { useInboxStore } from '@/lib/store'
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
  
  const { currentUser, teamMembers } = useInboxStore()
  const [isLoading, setIsLoading] = useState(false)
  const [msgInput, setMsgInput] = useState('')
  const [sending, setSending] = useState(false)
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

  // Realtime subscription for team messages
  useEffect(() => {
    if (!currentUser?.org_id || chats.length === 0) return

    const chatIds = chats.map(c => c.id)
    
    const channel = supabase
      .channel('team_messages_realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'team_messages',
          filter: `chat_id=in.(${chatIds.join(',')})`
        },
        async (payload) => {
          const newMsg = payload.new as TeamMessage
          
          // Don't ping if we sent it
          if (newMsg.sender_id !== currentUser.id) {
            playCutePing()
            
            // If we are not actively looking at this chat, increment unread
            if (!isOpen || activeChatId !== newMsg.chat_id) {
              incrementUnreadCount(newMsg.chat_id)
            }
          }
          
          // Get sender details
          const sender = teamMembers.find(t => t.id === newMsg.sender_id)
          const enrichedMsg = {
            ...newMsg,
            sender_name: sender?.name || 'Agent',
            sender_avatar: sender?.avatar_url || undefined
          }
          
          addMessage(newMsg.chat_id, enrichedMsg)
          
          // Auto scroll if looking at it
          if (activeChatId === newMsg.chat_id) {
            setTimeout(() => {
              messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
            }, 100)
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [chats, currentUser?.id, isOpen, activeChatId, addMessage, incrementUnreadCount, teamMembers])

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
    if (!currentUser?.org_id) return
    try {
      const chatId = await getOrCreateDirectChat(currentUser.org_id, otherUserId)
      // If it's a new chat, we need to refresh the chats list
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
    } catch (err) {
      console.error(err)
    }
  }

  return (
    <>
      {/* Floating Button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-[5.5rem] w-14 h-14 bg-slate-100 border border-slate-200 dark:bg-slate-800 dark:border-slate-700 text-slate-500 hover:text-blue-500 hover:bg-blue-50 dark:text-slate-400 dark:hover:text-blue-400 dark:hover:bg-slate-700/80 rounded-full shadow-lg hidden md:flex items-center justify-center transition-all hover:scale-105 z-40 cursor-pointer"
        >
          <MessageSquare strokeWidth={2.5} size={22} />
          {totalUnread > 0 && (
            <span className="absolute top-0 right-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white shadow-[0_0_0_2px_#fff] dark:shadow-[0_0_0_2px_#0b141a]">
              {totalUnread > 9 ? '9+' : totalUnread}
            </span>
          )}
        </button>
      )}

      {/* Dock Panel */}
      {isOpen && (
        <div className="fixed bottom-6 right-[5.5rem] w-[320px] h-[450px] max-h-[80vh] bg-white dark:bg-slate-900 rounded-[1.5rem] shadow-2xl border border-slate-200 dark:border-slate-800 z-50 overflow-hidden hidden md:flex flex-col">
          
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-blue-600 text-white shadow-sm shrink-0">
            <div className="flex items-center gap-2">
              {activeChatId ? (
                <button onClick={() => setActiveChatId(null)} className="p-1 hover:bg-white/20 rounded-full transition-colors">
                  <ChevronLeft size={18} />
                </button>
              ) : (
                <MessageSquare size={18} />
              )}
              <span className="font-semibold text-sm">
                {activeChatId ? (
                  chats.find(c => c.id === activeChatId)?.type === 'direct' ? chats.find(c => c.id === activeChatId)?.other_member_name : 'Group Chat'
                ) : 'Team Chat'}
              </span>
            </div>
            <button onClick={() => setIsOpen(false)} className="p-1 hover:bg-white/20 rounded-full transition-colors cursor-pointer">
              <X size={18} />
            </button>
          </div>

          {/* Content Area */}
          <div className="flex-1 overflow-y-auto bg-slate-50 dark:bg-[#0b141a]">
            {!activeChatId ? (
              // Chat List View
              <div className="p-2 space-y-1">
                <div className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">Agents Online</div>
                {teamMembers.filter(t => t.id !== currentUser?.id && t.sip_extension).map(member => {
                  const existingChat = chats.find(c => c.type === 'direct' && c.members?.some(m => m.user_id === member.id))
                  const unread = existingChat ? (unreadCounts[existingChat.id] || 0) : 0
                  
                  return (
                    <button
                      key={member.id}
                      onClick={() => startDirectChat(member.id)}
                      className="w-full flex items-center justify-between p-3 hover:bg-white dark:hover:bg-slate-800 rounded-xl transition-colors text-left"
                    >
                      <div className="flex items-center gap-3">
                        <div className="relative w-10 h-10 shrink-0">
                          {member.avatar_url ? (
                            <img src={member.avatar_url} className="w-full h-full rounded-full object-cover" />
                          ) : (
                            <div className="w-full h-full rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 flex items-center justify-center font-bold text-sm">
                              {member.name.charAt(0)}
                            </div>
                          )}
                          <span className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 border-2 border-white dark:border-slate-900 rounded-full"></span>
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{member.name}</p>
                        </div>
                      </div>
                      {unread > 0 && (
                        <div className="w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center text-[10px] font-bold text-white">
                          {unread}
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>
            ) : (
              // Message View
              <div className="flex flex-col h-full">
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  {isLoading ? (
                    <div className="flex items-center justify-center h-full">
                      <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
                    </div>
                  ) : (
                    messages[activeChatId]?.map(msg => {
                      const isMe = msg.sender_id === currentUser?.id
                      return (
                        <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                          {!isMe && <span className="text-[10px] text-slate-400 mb-1 ml-1">{msg.sender_name}</span>}
                          <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm shadow-sm ${
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
                <div className="p-3 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 shrink-0">
                  <form onSubmit={handleSendMessage} className="flex gap-2">
                    <input
                      type="text"
                      value={msgInput}
                      onChange={e => setMsgInput(e.target.value)}
                      placeholder="Type a message..."
                      className="flex-1 bg-slate-50 dark:bg-[#111b21] border border-slate-200 dark:border-slate-700 rounded-full px-4 py-2 text-sm focus:outline-none focus:border-blue-500 dark:text-white"
                      disabled={sending}
                    />
                    <button
                      type="submit"
                      disabled={!msgInput.trim() || sending}
                      className="w-9 h-9 rounded-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white flex items-center justify-center shrink-0 transition-colors"
                    >
                      {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} className="ml-0.5" />}
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
