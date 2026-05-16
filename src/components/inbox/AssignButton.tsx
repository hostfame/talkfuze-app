"use client"

import { useState } from "react"
import { assignConversation } from "@/actions/dashboard"

export default function AssignButton({ conversation, orgId }: { conversation: any, orgId: string }) {
  const [isAssigning, setIsAssigning] = useState(false)

  if (!conversation) return null

  const assignee = conversation.assignee

  const handleAssign = async () => {
    setIsAssigning(true)
    try {
      // For MVP, we just unassign it since we don't have auth.users setup yet
      // In Phase 3, this will open a dropdown to select a team member
      await assignConversation(orgId, conversation.id, null)
    } catch (e) {
      console.error(e)
    } finally {
      setIsAssigning(false)
    }
  }

  return (
    <div className="flex justify-between items-center">
      <span className="text-[13px] text-slate-500">Assignee</span>
      <div 
        onClick={handleAssign}
        className={`flex items-center gap-2 text-[13px] font-medium cursor-pointer transition-colors ${
          assignee ? "text-slate-900 hover:text-red-600" : "text-slate-500 hover:text-blue-600"
        } ${isAssigning ? "opacity-50 pointer-events-none" : ""}`}
      >
        {assignee ? (
          <>
            {assignee.avatar_url ? (
              <img src={assignee.avatar_url} className="w-5 h-5 rounded" />
            ) : (
              <div className="w-5 h-5 rounded bg-blue-100 text-blue-700 flex items-center justify-center text-xs">
                {assignee.name.charAt(0)}
              </div>
            )}
            {assignee.name}
          </>
        ) : (
          "Unassigned"
        )}
      </div>
    </div>
  )
}
