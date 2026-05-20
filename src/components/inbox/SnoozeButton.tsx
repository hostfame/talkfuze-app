"use client"

import { useState } from "react"
import { snoozeConversation } from "@/actions/dashboard"
import { Clock, Check, ChevronDown, BellOff } from "lucide-react"
import type { ConversationWithDetails } from "@/lib/types"

export default function SnoozeButton({ conversation, orgId }: { conversation: ConversationWithDetails | null | undefined, orgId: string }) {
  const [isAssigning, setIsAssigning] = useState(false)
  const [isOpen, setIsOpen] = useState(false)

  if (!conversation) return null

  // @ts-ignore - snoozed_until is added to DB but might not be in ConversationWithDetails type yet
  const snoozedUntil = conversation.snoozed_until

  const isSnoozed = snoozedUntil && new Date(snoozedUntil).getTime() > Date.now()

  const handleSnooze = async (hours: number | null) => {
    setIsAssigning(true)
    setIsOpen(false)
    try {
      let targetTime = null;
      if (hours !== null) {
        if (hours === 24) {
          // Tomorrow at 9 AM
          const tomorrow = new Date();
          tomorrow.setDate(tomorrow.getDate() + 1);
          tomorrow.setHours(9, 0, 0, 0);
          targetTime = tomorrow.toISOString();
        } else {
          const target = new Date();
          target.setHours(target.getHours() + hours);
          targetTime = target.toISOString();
        }
      }
      await snoozeConversation(conversation.id, targetTime ? new Date(targetTime) : null)
    } catch (e) {
      console.error(e)
    } finally {
      setIsAssigning(false)
    }
  }

  let displayText = "Snooze";
  if (isSnoozed) {
    const date = new Date(snoozedUntil);
    const today = new Date();
    if (date.getDate() === today.getDate() && date.getMonth() === today.getMonth()) {
      displayText = `Snoozed till ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    } else {
      displayText = `Snoozed till ${date.toLocaleDateString([], { month: 'short', day: 'numeric' })}`;
    }
  }

  return (
    <div className="relative flex justify-between items-center mt-2">
      <span className="text-[13px] text-slate-500">Follow-up</span>
      <div 
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-2 text-[13px] font-medium cursor-pointer transition-colors px-2 py-1 -mr-2 rounded hover:bg-slate-50 dark:hover:bg-slate-800 ${
          isSnoozed ? "text-amber-600 dark:text-amber-400" : "text-slate-500 dark:text-slate-400 hover:text-slate-700"
        } ${isAssigning ? "opacity-50 pointer-events-none" : ""}`}
      >
        <Clock size={14} className={isSnoozed ? "text-amber-500" : "text-slate-400"} />
        {displayText}
        <ChevronDown size={14} className="text-slate-400 ml-1" />
      </div>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute right-0 top-8 w-56 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-lg z-50 overflow-hidden py-1">
            <div className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-100 dark:border-slate-800/50">
              Snooze conversation...
            </div>
            
            <button 
              onClick={() => handleSnooze(null)}
              className="w-full text-left px-3 py-2 text-[13px] text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2"
            >
              <div className="w-6 h-6 rounded-full border border-dashed border-slate-300 dark:border-slate-600 flex items-center justify-center">
                <BellOff size={12} className="text-slate-400" />
              </div>
              Clear Snooze
              {!isSnoozed && <Check size={14} className="ml-auto text-blue-600" />}
            </button>

            <button 
              onClick={() => handleSnooze(1)}
              className="w-full text-left px-3 py-2 text-[13px] text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2"
            >
              <div className="w-6 h-6 rounded bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-400 flex items-center justify-center text-xs font-semibold shrink-0">
                1h
              </div>
              <span className="truncate">Later Today (1 Hour)</span>
            </button>

            <button 
              onClick={() => handleSnooze(4)}
              className="w-full text-left px-3 py-2 text-[13px] text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2"
            >
              <div className="w-6 h-6 rounded bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-400 flex items-center justify-center text-xs font-semibold shrink-0">
                4h
              </div>
              <span className="truncate">This Evening (4 Hours)</span>
            </button>

            <button 
              onClick={() => handleSnooze(24)}
              className="w-full text-left px-3 py-2 text-[13px] text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2"
            >
              <div className="w-6 h-6 rounded bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-400 flex items-center justify-center text-xs font-semibold shrink-0">
                Tmw
              </div>
              <span className="truncate">Tomorrow Morning (9AM)</span>
            </button>
          </div>
        </>
      )}
    </div>
  )
}
