"use client"

import { Search, Plus, User, MessageSquare, Bot, HelpCircle, Users, ChevronDown, ChevronRight, MessageCircle, Smartphone, Pin, Phone } from "lucide-react"
import { useState } from "react"
import Link from "next/link"
import { useInboxStore } from "@/lib/store"

import { usePathname, useRouter } from "next/navigation"

function firstRelation(relation: any) {
  return Array.isArray(relation) ? relation[0] : relation
}

export default function InboxLayout({ children }: { children: React.ReactNode }) {
  const { conversations, activeFilter, setActiveFilter, currentUser } = useInboxStore()
  const router = useRouter()
  const pathname = usePathname()

  const [isConnectionsExpanded, setIsConnectionsExpanded] = useState(true)

  const handleFilterClick = (filter: 'mine' | 'all' | 'unassigned' | 'mentions' | 'messenger' | 'whatsapp' | 'instagram' | 'pinned' | 'calls') => {
    setActiveFilter(filter)
    if (pathname !== '/inbox') {
      router.push('/inbox')
    }
  }

  // Calculate badges

  const pinnedChats = conversations.filter(c => c.is_pinned).length

  const allChats = conversations.length

  const messengerChats = conversations.filter(c => firstRelation(c.channels)?.type === 'messenger').length
  const whatsappChats = conversations.filter(c => firstRelation(c.channels)?.type === 'whatsapp').length
  const instagramChats = conversations.filter(c => firstRelation(c.channels)?.type === 'instagram').length

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
            onClick={() => handleFilterClick('all')}
            className={`flex items-center justify-between px-3 py-1.5 font-medium cursor-pointer rounded-md transition-all ${
              activeFilter === 'all' && pathname === '/inbox' ? 'bg-[#E5F1FF] text-blue-700 dark:bg-blue-900/40 dark:text-blue-400' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
            }`}
          >
            <div className="flex items-center gap-2"><MessageSquare size={15} strokeWidth={2} /> All</div>
            <span className="text-[12px] font-medium">{allChats}</span>
          </div>
          
          <div 
            onClick={() => handleFilterClick('pinned')}
            className={`flex items-center justify-between px-3 py-1.5 font-medium cursor-pointer rounded-md transition-all ${
              activeFilter === 'pinned' && pathname === '/inbox' ? 'bg-[#E5F1FF] text-blue-700 dark:bg-blue-900/40 dark:text-blue-400' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
            }`}
          >
            <div className="flex items-center gap-2"><Pin size={15} strokeWidth={2} /> Pinned</div>
            <span className="text-[12px] font-medium">{pinnedChats}</span>
          </div>

          <div 
            onClick={() => handleFilterClick('mentions')}
            className={`flex items-center justify-between px-3 py-1.5 font-medium cursor-pointer rounded-md transition-all ${
              activeFilter === 'mentions' && pathname === '/inbox' ? 'bg-[#E5F1FF] text-blue-700 dark:bg-blue-900/40 dark:text-blue-400' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
            }`}
          >
            <div className="flex items-center gap-2"><span className="font-medium text-lg leading-none mt-[-2px]">@</span> Mentions</div>
            <span className="text-[12px] font-medium opacity-50">0</span>
          </div>

          <div 
            onClick={() => handleFilterClick('calls')}
            className={`flex items-center justify-between px-3 py-1.5 font-medium cursor-pointer rounded-md transition-all ${
              activeFilter === 'calls' && pathname === '/inbox' ? 'bg-[#E5F1FF] text-blue-700 dark:bg-blue-900/40 dark:text-blue-400' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
            }`}
          >
            <div className="flex items-center gap-2"><Phone size={15} strokeWidth={2} /> Calls</div>
          </div>
        </div>

        <div 
          className="mt-6 px-6 mb-2 flex justify-between items-center cursor-pointer group"
          onClick={() => setIsConnectionsExpanded(!isConnectionsExpanded)}
        >
          <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wide group-hover:text-slate-600 transition-colors">Connections</span>
          {isConnectionsExpanded ? <ChevronDown size={12} className="text-slate-400" /> : <ChevronRight size={12} className="text-slate-400" />}
        </div>
        
        {isConnectionsExpanded && (
          <div className="px-3 space-y-0.5">
            <div 
              onClick={() => handleFilterClick('messenger')}
              className={`flex items-center justify-between px-3 py-1.5 font-medium cursor-pointer rounded-md transition-all ${
                activeFilter === 'messenger' && pathname === '/inbox' ? 'bg-[#E5F1FF] text-blue-700 dark:bg-blue-900/40 dark:text-blue-400' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
              }`}
            >
              <div className="flex items-center gap-2"><MessageSquare size={15} strokeWidth={2} /> Messenger</div>
              <span className="text-[12px] font-medium">{messengerChats}</span>
            </div>
            
            <div 
              onClick={() => handleFilterClick('whatsapp')}
              className={`flex items-center justify-between px-3 py-1.5 font-medium cursor-pointer rounded-md transition-all ${
                activeFilter === 'whatsapp' && pathname === '/inbox' ? 'bg-[#E5F1FF] text-blue-700 dark:bg-blue-900/40 dark:text-blue-400' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
              }`}
            >
              <div className="flex items-center gap-2"><MessageCircle size={15} strokeWidth={2} /> WhatsApp</div>
              <span className="text-[12px] font-medium">{whatsappChats}</span>
            </div>

            <div 
              onClick={() => handleFilterClick('instagram')}
              className={`flex items-center justify-between px-3 py-1.5 font-medium cursor-pointer rounded-md transition-all ${
                activeFilter === 'instagram' && pathname === '/inbox' ? 'bg-[#E5F1FF] text-blue-700 dark:bg-blue-900/40 dark:text-blue-400' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
              }`}
            >
              <div className="flex items-center gap-2"><Smartphone size={15} strokeWidth={2} /> Instagram</div>
              <span className="text-[12px] font-medium">{instagramChats}</span>
            </div>
          </div>
        )}

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
