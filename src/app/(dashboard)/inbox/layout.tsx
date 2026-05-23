"use client"

import { Search, Plus, User, MessageSquare, Bot, HelpCircle, Users, ChevronDown, ChevronRight, MessageCircle, Smartphone, Pin, Phone, Bell, Send } from "lucide-react"
import { useState } from "react"
import Link from "next/link"
import { useInboxStore } from "@/lib/store"

import { usePathname, useRouter } from "next/navigation"

function firstRelation(relation: any) {
  return Array.isArray(relation) ? relation[0] : relation
}

export default function InboxLayout({ children }: { children: React.ReactNode }) {
  const { conversations, activeFilter, setActiveFilter, setSelectedId, currentUser } = useInboxStore()
  const router = useRouter()
  const pathname = usePathname()

  const [isConnectionsExpanded, setIsConnectionsExpanded] = useState(true)

  const handleFilterClick = (filter: 'mine' | 'all' | 'unassigned' | 'assigned' | 'mentions' | 'messenger' | 'whatsapp' | 'instagram' | 'widget' | 'pinned' | 'calls' | 'archived' | 'alerts' | 'ticketed') => {
    setActiveFilter(filter)
    setSelectedId(null)
    if (pathname !== '/inbox') {
      router.push('/inbox')
    }
  }

  // Calculate badges
  const alertChats = conversations.filter(c => c.tags?.includes('alert') && !c.is_archived).length

  const pinnedChats = conversations.filter(c => c.is_pinned && !c.tags?.includes('alert')).length
  const assignedChats = conversations.filter(c => firstRelation(c.assignee)?.id === currentUser?.id && !c.is_archived && !c.tags?.includes('alert')).length

  const allChats = conversations.filter(c => !c.tags?.includes('alert') && !c.is_archived).length

  const messengerChats = conversations.filter(c => firstRelation(c.channels)?.type === 'messenger' && !c.tags?.includes('alert')).length
  const whatsappChats = conversations.filter(c => firstRelation(c.channels)?.type === 'whatsapp' && !c.tags?.includes('alert')).length
  const instagramChats = conversations.filter(c => firstRelation(c.channels)?.type === 'instagram' && !c.tags?.includes('alert')).length
  const widgetChats = conversations.filter(c => firstRelation(c.channels)?.type === 'widget' && !c.tags?.includes('alert')).length

  return (
    <>
      {/* Secondary Sidebar (Folders / Filters) - hidden on mobile, compact on tablet/small desktop */}
      <aside className="hidden md:flex w-[68px] xl:w-[150px] flex-col bg-[#F9FAFB] dark:bg-slate-950 border-r border-slate-200 dark:border-slate-800 z-10 shrink-0 overflow-y-auto transition-all duration-300">
        <div className="p-3 xl:p-5 pb-2 flex flex-col xl:flex-row justify-center xl:justify-between items-center gap-3 xl:gap-0">
          <h2 className="hidden xl:block font-medium text-[15px] text-slate-900 dark:text-white">Inbox</h2>
        </div>

        <div className="px-2 xl:px-3 space-y-1 xl:space-y-0.5 mt-2">
          <div 
            onClick={() => handleFilterClick('all')}
            title="All"
            className={`flex items-center justify-center xl:justify-between px-2 xl:px-3 py-2.5 xl:py-1.5 font-medium cursor-pointer rounded-md transition-all ${
              activeFilter === 'all' && pathname === '/inbox' ? 'bg-[#E5F1FF] text-blue-700 dark:bg-blue-900/40 dark:text-blue-400' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
            }`}
          >
            <div className="flex items-center gap-2"><MessageSquare className="w-[18px] h-[18px] xl:w-[15px] xl:h-[15px]" strokeWidth={2} /><span className="hidden xl:block">All</span></div>
            <span className="hidden xl:block text-[12px] font-medium">{allChats}</span>
          </div>
          
          <div 
            onClick={() => handleFilterClick('assigned')}
            title="Assigned"
            className={`flex items-center justify-center xl:justify-between px-2 xl:px-3 py-2.5 xl:py-1.5 font-medium cursor-pointer rounded-md transition-all ${
              activeFilter === 'assigned' && pathname === '/inbox' ? 'bg-[#E5F1FF] text-blue-700 dark:bg-blue-900/40 dark:text-blue-400' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
            }`}
          >
            <div className="flex items-center gap-2"><User className="w-[18px] h-[18px] xl:w-[15px] xl:h-[15px]" strokeWidth={2} /><span className="hidden xl:block">Assigned</span></div>
            <span className="hidden xl:block text-[12px] font-medium">{assignedChats}</span>
          </div>
          
          <div 
            onClick={() => handleFilterClick('pinned')}
            title="Pinned"
            className={`flex items-center justify-center xl:justify-between px-2 xl:px-3 py-2.5 xl:py-1.5 font-medium cursor-pointer rounded-md transition-all ${
              activeFilter === 'pinned' && pathname === '/inbox' ? 'bg-[#E5F1FF] text-blue-700 dark:bg-blue-900/40 dark:text-blue-400' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
            }`}
          >
            <div className="flex items-center gap-2"><Pin className="w-[18px] h-[18px] xl:w-[15px] xl:h-[15px]" strokeWidth={2} /><span className="hidden xl:block">Pinned</span></div>
            <span className="hidden xl:block text-[12px] font-medium">{pinnedChats}</span>
          </div>

          <div 
            onClick={() => handleFilterClick('calls')}
            title="Calls"
            className={`flex items-center justify-center xl:justify-between px-2 xl:px-3 py-2.5 xl:py-1.5 font-medium cursor-pointer rounded-md transition-all ${
              activeFilter === 'calls' && pathname === '/inbox' ? 'bg-[#E5F1FF] text-blue-700 dark:bg-blue-900/40 dark:text-blue-400' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
            }`}
          >
            <div className="flex items-center gap-2"><Phone className="w-[18px] h-[18px] xl:w-[15px] xl:h-[15px]" strokeWidth={2} /><span className="hidden xl:block">Calls</span></div>
          </div>

          <div 
            onClick={() => handleFilterClick('alerts')}
            title="Outbound"
            className={`flex items-center justify-center xl:justify-between px-2 xl:px-3 py-2.5 xl:py-1.5 font-medium cursor-pointer rounded-md transition-all ${
              activeFilter === 'alerts' && pathname === '/inbox' ? 'bg-[#E5F1FF] text-blue-700 dark:bg-blue-900/40 dark:text-blue-400' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
            }`}
          >
            <div className="flex items-center gap-2"><Send className="w-[18px] h-[18px] xl:w-[14px] xl:h-[14px] -rotate-45 transform" strokeWidth={2.5} /><span className="hidden xl:block">Outbound</span></div>
            <span className="hidden xl:block text-[12px] font-medium">{alertChats}</span>
          </div>

          <div 
            onClick={() => handleFilterClick('archived')}
            title="Archived"
            className={`flex items-center justify-center xl:justify-between px-2 xl:px-3 py-2.5 xl:py-1.5 font-medium cursor-pointer rounded-md transition-all ${
              activeFilter === 'archived' && pathname === '/inbox' ? 'bg-[#E5F1FF] text-blue-700 dark:bg-blue-900/40 dark:text-blue-400' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
            }`}
          >
            <div className="flex items-center gap-2"><svg xmlns="http://www.w3.org/2000/svg" className="w-[18px] h-[18px] xl:w-[15px] xl:h-[15px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="5" x="2" y="3" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/></svg><span className="hidden xl:block">Archived</span></div>
          </div>

        </div>

        <div 
          className="mt-6 px-0 xl:px-6 mb-2 flex justify-center xl:justify-between items-center cursor-pointer group"
          onClick={() => setIsConnectionsExpanded(!isConnectionsExpanded)}
          title="Connections"
        >
          <span className="hidden xl:block text-[11px] font-medium text-slate-400 uppercase tracking-wide group-hover:text-slate-600 transition-colors">Connections</span>
          {isConnectionsExpanded ? <ChevronDown className="w-[14px] h-[14px] xl:w-[12px] xl:h-[12px] text-slate-400" /> : <ChevronRight className="w-[14px] h-[14px] xl:w-[12px] xl:h-[12px] text-slate-400" />}
        </div>
        
        {isConnectionsExpanded && (
          <div className="px-2 xl:px-3 space-y-1 xl:space-y-0.5">
            <div 
              onClick={() => handleFilterClick('messenger')}
              title="Messenger"
              className={`flex items-center justify-center xl:justify-between px-2 xl:px-3 py-2.5 xl:py-1.5 font-medium cursor-pointer rounded-md transition-all ${
                activeFilter === 'messenger' && pathname === '/inbox' ? 'bg-[#E5F1FF] text-blue-700 dark:bg-blue-900/40 dark:text-blue-400' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
              }`}
            >
              <div className="flex items-center gap-2"><MessageSquare className="w-[18px] h-[18px] xl:w-[15px] xl:h-[15px]" strokeWidth={2} /><span className="hidden xl:block">Messenger</span></div>
              <span className="hidden xl:block text-[12px] font-medium">{messengerChats}</span>
            </div>
            
            <div 
              onClick={() => handleFilterClick('whatsapp')}
              title="WhatsApp"
              className={`flex items-center justify-center xl:justify-between px-2 xl:px-3 py-2.5 xl:py-1.5 font-medium cursor-pointer rounded-md transition-all ${
                activeFilter === 'whatsapp' && pathname === '/inbox' ? 'bg-[#E5F1FF] text-blue-700 dark:bg-blue-900/40 dark:text-blue-400' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
              }`}
            >
              <div className="flex items-center gap-2"><MessageCircle className="w-[18px] h-[18px] xl:w-[15px] xl:h-[15px]" strokeWidth={2} /><span className="hidden xl:block">WhatsApp</span></div>
              <span className="hidden xl:block text-[12px] font-medium">{whatsappChats}</span>
            </div>

            <div 
              onClick={() => handleFilterClick('instagram')}
              title="Instagram"
              className={`flex items-center justify-center xl:justify-between px-2 xl:px-3 py-2.5 xl:py-1.5 font-medium cursor-pointer rounded-md transition-all ${
                activeFilter === 'instagram' && pathname === '/inbox' ? 'bg-[#E5F1FF] text-blue-700 dark:bg-blue-900/40 dark:text-blue-400' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
              }`}
            >
              <div className="flex items-center gap-2"><Smartphone className="w-[18px] h-[18px] xl:w-[15px] xl:h-[15px]" strokeWidth={2} /><span className="hidden xl:block">Instagram</span></div>
              <span className="hidden xl:block text-[12px] font-medium">{instagramChats}</span>
            </div>

            <div 
              onClick={() => handleFilterClick('widget')}
              title="Website"
              className={`flex items-center justify-center xl:justify-between px-2 xl:px-3 py-2.5 xl:py-1.5 font-medium cursor-pointer rounded-md transition-all ${
                activeFilter === 'widget' && pathname === '/inbox' ? 'bg-[#E5F1FF] text-blue-700 dark:bg-blue-900/40 dark:text-blue-400' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
              }`}
            >
              <div className="flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-[18px] h-[18px] xl:w-[15px] xl:h-[15px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/></svg>
                <span className="hidden xl:block">Website</span>
              </div>
              <span className="hidden xl:block text-[12px] font-medium">{widgetChats}</span>
            </div>
          </div>
        )}

        <div className="mt-8 px-0 xl:px-6 mb-2 flex justify-center xl:justify-between items-center" title="TalkFuze AI">
          <span className="hidden xl:block text-[11px] font-medium text-slate-400 uppercase tracking-wide">TalkFuze AI</span>
          <span className="block xl:hidden text-[11px] font-medium text-slate-400 uppercase tracking-wide">AI</span>
        </div>
        <div className="px-2 xl:px-3 space-y-1 xl:space-y-0.5">
          <div title="AI Inbox" className="flex items-center justify-center xl:justify-between px-2 xl:px-3 py-2.5 xl:py-1.5 text-slate-600 hover:bg-slate-100 rounded-md cursor-pointer transition-all">
            <div className="flex items-center gap-2"><Bot className="w-[18px] h-[18px] xl:w-[15px] xl:h-[15px]" strokeWidth={2} /><span className="hidden xl:block">AI Inbox</span></div>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      {children}
    </>
  )
}
