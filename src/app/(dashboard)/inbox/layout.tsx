"use client"

import { Search, Plus, User, MessageSquare, Bot, HelpCircle, Users } from "lucide-react"
import { useInboxStore } from "@/lib/store"

function firstRelation(relation: any) {
  return Array.isArray(relation) ? relation[0] : relation
}

export default function InboxLayout({ children }: { children: React.ReactNode }) {
  const { conversations, activeFilter, setActiveFilter, currentUser } = useInboxStore()

  // Calculate badges
  const myChats = conversations.filter(c => {
    const assignee = firstRelation(c.assignee)
    return assignee?.id === currentUser?.id
  }).length

  const unassignedChats = conversations.filter(c => {
    const assignee = firstRelation(c.assignee)
    return !assignee
  }).length

  const allChats = conversations.length

  return (
    <>
      {/* Secondary Sidebar (Folders / Filters) */}
      <aside className="w-[190px] flex flex-col bg-[#F9FAFB] dark:bg-slate-950 border-r border-slate-200 dark:border-slate-800 z-10 shrink-0 overflow-y-auto">
        <div className="p-5 pb-2 flex justify-between items-center">
          <h2 className="font-medium text-[15px] text-slate-900 dark:text-white">Inbox</h2>
          <div className="flex gap-1">
            <button className="p-1 text-slate-500 hover:text-slate-800 transition-colors"><Search size={15} strokeWidth={2}/></button>
            <button className="p-1 text-slate-500 hover:text-slate-800 transition-colors"><Plus size={15} strokeWidth={2}/></button>
          </div>
        </div>

        <div className="px-3 space-y-0.5 mt-2">
          <div 
            onClick={() => setActiveFilter('mine')}
            className={`flex items-center justify-between px-3 py-1.5 font-medium cursor-pointer rounded-md transition-all ${
              activeFilter === 'mine' ? 'bg-[#E5F1FF] text-blue-700 dark:bg-blue-900/40 dark:text-blue-400' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
            }`}
          >
            <div className="flex items-center gap-2"><User size={15} strokeWidth={2} /> Your inbox</div>
            <span className="text-[12px] font-medium">{myChats}</span>
          </div>
          
          <div 
            onClick={() => setActiveFilter('mentions')}
            className={`flex items-center justify-between px-3 py-1.5 font-medium cursor-pointer rounded-md transition-all ${
              activeFilter === 'mentions' ? 'bg-[#E5F1FF] text-blue-700 dark:bg-blue-900/40 dark:text-blue-400' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
            }`}
          >
            <div className="flex items-center gap-2"><span className="font-medium text-lg leading-none mt-[-2px]">@</span> Mentions</div>
            <span className="text-[12px] font-medium opacity-50">0</span>
          </div>

          <div 
            onClick={() => setActiveFilter('unassigned')}
            className={`flex items-center justify-between px-3 py-1.5 font-medium cursor-pointer rounded-md transition-all ${
              activeFilter === 'unassigned' ? 'bg-[#E5F1FF] text-blue-700 dark:bg-blue-900/40 dark:text-blue-400' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
            }`}
          >
            <div className="flex items-center gap-2"><Users size={15} strokeWidth={2} /> Unassigned</div>
            <span className="text-[12px] font-medium">{unassignedChats}</span>
          </div>

          <div 
            onClick={() => setActiveFilter('all')}
            className={`flex items-center justify-between px-3 py-1.5 font-medium cursor-pointer rounded-md transition-all ${
              activeFilter === 'all' ? 'bg-[#E5F1FF] text-blue-700 dark:bg-blue-900/40 dark:text-blue-400' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
            }`}
          >
            <div className="flex items-center gap-2"><MessageSquare size={15} strokeWidth={2} /> All</div>
            <span className="text-[12px] font-medium">{allChats}</span>
          </div>
        </div>

        <div className="mt-8 px-6 mb-2 flex justify-between items-center">
          <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wide">TalkFuze AI</span>
        </div>
        <div className="px-3 space-y-0.5">
          <div className="flex items-center justify-between px-3 py-1.5 text-slate-600 hover:bg-slate-100 rounded-md cursor-pointer transition-all">
            <div className="flex items-center gap-2"><Bot size={15} strokeWidth={2} /> AI Inbox</div>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      {children}
    </>
  )
}
