"use client"

import { useState, useEffect } from "react"
import { assignConversation } from "@/actions/dashboard"
import { getTeammates } from "@/actions/team"
import { Check, ChevronDown, Forward, User } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/lib/auth-context"
import type { ConversationWithDetails, UserProfile } from "@/lib/types"

export default function ForwardButton({ conversation, orgId }: { conversation: ConversationWithDetails | null | undefined, orgId: string }) {
  const currentUser = useAuth()
  const [isForwarding, setIsForwarding] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const [teammates, setTeammates] = useState<UserProfile[]>([])

  useEffect(() => {
    if (isOpen && teammates.length === 0) {
      getTeammates().then(setTeammates)
    }
  }, [isOpen, teammates.length])

  if (!conversation) return null

  const handleForward = async (userId: string) => {
    if (userId === currentUser.id) return
    setIsForwarding(true)
    setIsOpen(false)
    try {
      // Assign the conversation to the target agent
      await assignConversation(orgId, conversation.id, userId)

      // Broadcast real-time notification to the target agent
      const targetTeammate = teammates.find(t => t.id === userId)
      const channel = supabase.channel(`typing:${orgId}`)

      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          channel.send({
            type: 'broadcast',
            event: 'conversationAssigned',
            payload: {
              conversation_id: conversation.id,
              assigned_to: userId,
              assigned_to_name: targetTeammate?.name || 'Agent',
              assigned_by_name: currentUser.name,
              assigned_by_id: currentUser.id,
              contact_name: Array.isArray(conversation.contact) ? conversation.contact[0]?.name : conversation.contact?.name || 'Customer'
            }
          }).then(() => {
            setTimeout(() => {
              supabase.removeChannel(channel)
            }, 1000)
          })
        }
      })
    } catch (e) {
      console.error(e)
    } finally {
      setIsForwarding(false)
    }
  }

  // Filter out current user from forward targets
  const forwardTargets = teammates.filter(t => t.id !== currentUser.id)

  return (
    <div className="relative flex justify-between items-center">
      <span className="text-[13px] text-slate-500">Forward</span>
      <div
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-2 text-[13px] font-medium cursor-pointer transition-colors px-2 py-1 -mr-2 rounded hover:bg-blue-50 dark:hover:bg-blue-900/20 text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 ${isForwarding ? "opacity-50 pointer-events-none" : ""}`}
      >
        <Forward size={14} className="text-slate-400" />
        Forward to...
        <ChevronDown size={14} className="text-slate-400 ml-0.5" />
      </div>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute right-0 top-8 w-56 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-lg z-50 overflow-hidden py-1">
            <div className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-100 dark:border-slate-800/50">
              Forward to agent
            </div>

            {forwardTargets.length > 0 ? (
              forwardTargets.map(tm => (
                <button
                  key={tm.id}
                  onClick={() => handleForward(tm.id)}
                  className="w-full text-left px-3 py-2 text-[13px] text-slate-700 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-blue-900/30 flex items-center gap-2 transition-colors"
                >
                  <div className="w-6 h-6 rounded bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-400 flex items-center justify-center text-xs font-semibold shrink-0">
                    {tm.name.charAt(0).toUpperCase()}
                  </div>
                  <span className="truncate">{tm.name}</span>
                </button>
              ))
            ) : (
              <div className="px-3 py-3 text-[12px] text-slate-400 italic">No other agents available</div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
