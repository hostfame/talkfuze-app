"use client"

import { useState, useEffect } from "react"
import { assignConversation } from "@/actions/dashboard"
import { getTeammates } from "@/actions/team"
import { Check, ChevronDown, User } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/lib/auth-context"
import type { ConversationWithDetails, UserProfile } from "@/lib/types"

export default function AssignButton({ conversation, orgId }: { conversation: ConversationWithDetails | null | undefined, orgId: string }) {
  const currentUser = useAuth()
  const [isAssigning, setIsAssigning] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const [teammates, setTeammates] = useState<UserProfile[]>([])

  const assignee = Array.isArray(conversation?.assignee) ? conversation?.assignee[0] : conversation?.assignee

  useEffect(() => {
    if (isOpen && teammates.length === 0) {
      getTeammates().then(setTeammates)
    }
  }, [isOpen, teammates.length])

  if (!conversation) return null

  const handleAssign = async (userId: string | null) => {
    setIsAssigning(true)
    setIsOpen(false)
    try {
      await assignConversation(orgId, conversation.id, userId)
      
      // If we assigned it to another teammate, broadcast a real-time event!
      if (userId && userId !== currentUser.id) {
        const targetTeammate = teammates.find(t => t.id === userId);
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
              // Clean up channel after sending
              setTimeout(() => {
                supabase.removeChannel(channel)
              }, 1000)
            })
          }
        })
      }
    } catch (e) {
      console.error(e)
    } finally {
      setIsAssigning(false)
    }
  }

  return (
    <div className="relative flex justify-between items-center">
      <span className="text-[13px] text-slate-500">Assignee</span>
      <div 
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-2 text-[13px] font-medium cursor-pointer transition-colors px-2 py-1 -mr-2 rounded hover:bg-slate-50 dark:hover:bg-slate-800 ${
          assignee ? "text-slate-900 dark:text-slate-200" : "text-slate-500 dark:text-slate-400 hover:text-slate-700"
        } ${isAssigning ? "opacity-50 pointer-events-none" : ""}`}
      >
        {assignee ? (
          <>
            <div className="w-5 h-5 rounded bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-400 flex items-center justify-center text-xs font-semibold">
              {assignee.name.charAt(0).toUpperCase()}
            </div>
            {assignee.name}
          </>
        ) : (
          "Unassigned"
        )}
        <ChevronDown size={14} className="text-slate-400 ml-1" />
      </div>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute right-0 top-8 w-56 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-lg z-50 overflow-hidden py-1">
            <div className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-100 dark:border-slate-800/50">
              Assign to...
            </div>
            
            <button 
              onClick={() => handleAssign(null)}
              className="w-full text-left px-3 py-2 text-[13px] text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2"
            >
              <div className="w-6 h-6 rounded-full border border-dashed border-slate-300 dark:border-slate-600 flex items-center justify-center">
                <User size={12} className="text-slate-400" />
              </div>
              Unassigned
              {!assignee && <Check size={14} className="ml-auto text-blue-600" />}
            </button>

            {teammates.map(tm => (
              <button 
                key={tm.id}
                onClick={() => handleAssign(tm.id)}
                className="w-full text-left px-3 py-2 text-[13px] text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2"
              >
                {tm.avatar_url ? (
                  <img src={tm.avatar_url} alt="" className="w-6 h-6 rounded-full object-cover shrink-0" />
                ) : (
                  <div className="w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-400 flex items-center justify-center text-[10px] font-semibold shrink-0">
                    {tm.name.charAt(0).toUpperCase()}
                  </div>
                )}
                <span className="truncate">{tm.name}</span>
                {assignee?.id === tm.id && <Check size={14} className="ml-auto text-blue-600 shrink-0" />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
