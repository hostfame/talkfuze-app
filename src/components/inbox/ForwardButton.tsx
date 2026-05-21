"use client"

import { useState, useEffect } from "react"
import { assignConversation } from "@/actions/dashboard"
import { ChevronDown, Check } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/lib/auth-context"
import { useInboxStore } from "@/lib/store"
import type { ConversationWithDetails, UserProfile } from "@/lib/types"

export default function ForwardButton({ conversation, orgId }: { conversation: ConversationWithDetails | null | undefined, orgId: string }) {
  const currentUser = useAuth()
  const { teamMembers: teammates } = useInboxStore()
  const [isForwarding, setIsForwarding] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const [forwardedTo, setForwardedTo] = useState<string | null>(null)

  // Auto-clear confirmation after 3s
  useEffect(() => {
    if (forwardedTo) {
      const t = setTimeout(() => setForwardedTo(null), 3000)
      return () => clearTimeout(t)
    }
  }, [forwardedTo])

  if (!conversation) return null

  const handleForward = async (userId: string) => {
    if (userId === currentUser.id) return
    const targetTeammate = teammates.find(t => t.id === userId)
    setIsForwarding(true)
    setIsOpen(false)
    try {
      await assignConversation(orgId, conversation.id, userId)

      // Show confirmation
      setForwardedTo(targetTeammate?.name || 'Agent')

      // Broadcast notification to target agent
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
            setTimeout(() => supabase.removeChannel(channel), 1000)
          })
        }
      })
    } catch (e) {
      console.error(e)
    } finally {
      setIsForwarding(false)
    }
  }

  const forwardTargets = teammates.filter(t => t.id !== currentUser.id)

  return (
    <div className="relative flex justify-between items-center">
      <span className="text-[13px] text-slate-500">Forward</span>

      {/* Confirmation flash */}
      {forwardedTo ? (
        <div className="flex items-center gap-1.5 text-[13px] font-medium text-emerald-600 px-2 py-1 -mr-2 rounded bg-emerald-50 dark:bg-emerald-900/20 animate-in fade-in duration-200">
          <Check size={13} strokeWidth={2.5} />
          Sent to {forwardedTo}
        </div>
      ) : (
        <div
          onClick={() => setIsOpen(!isOpen)}
          className={`flex items-center gap-1.5 text-[13px] font-medium cursor-pointer transition-colors px-2 py-1 -mr-2 rounded hover:bg-blue-50 dark:hover:bg-blue-900/20 text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 ${isForwarding ? "opacity-50 pointer-events-none" : ""}`}
        >
          <span className="font-medium">Forward to...</span>
          <ChevronDown size={13} className="text-slate-400" />
        </div>
      )}

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute right-0 top-8 w-52 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-lg z-50 overflow-hidden py-0.5">
            <div className="px-3 py-1.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-100 dark:border-slate-800/50">
              Forward to
            </div>

            {forwardTargets.length > 0 ? (
              forwardTargets.map(tm => (
                <button
                  key={tm.id}
                  onClick={() => handleForward(tm.id)}
                  className="w-full text-left px-3 py-1.5 text-[13px] text-slate-700 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-blue-900/30 flex items-center gap-2 transition-colors"
                >
                  {tm.avatar_url ? (
                    <img src={tm.avatar_url} alt="" className="w-6 h-6 rounded-full object-cover shrink-0" />
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-400 flex items-center justify-center text-[10px] font-semibold shrink-0">
                      {tm.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <span className="truncate">{tm.name}</span>
                </button>
              ))
            ) : (
              <div className="px-3 py-2 text-[12px] text-slate-400 italic">No other agents</div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
