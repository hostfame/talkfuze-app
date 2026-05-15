import Link from "next/link"
import { Inbox, MessageSquare, Users, BarChart3, Settings, Bell, Search, Plus, User, HelpCircle, Bot } from "lucide-react"

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex h-screen overflow-hidden bg-[#F8FAFC] dark:bg-slate-900 text-slate-800 dark:text-slate-200 text-sm font-sans">
      {/* 1. Far Left Thin Navigation Strip */}
      <aside className="w-[64px] flex flex-col items-center py-5 bg-slate-50/50 dark:bg-slate-950 border-r border-slate-200/60 dark:border-slate-800 z-10 shrink-0">
        <div className="w-10 h-10 mb-6 flex items-center justify-center active:scale-95 transition-all">
          <img src="/talkfuze-logo.png" alt="TalkFuze Logo" className="w-full h-full object-contain rounded-xl" />
        </div>
        
        <div className="flex-1 space-y-3 w-full px-2 flex flex-col items-center">
          <Link href="/inbox" className="w-11 h-11 flex items-center justify-center text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 rounded-2xl shadow-sm border border-blue-100 dark:border-blue-800/50 transition-all duration-200 active:scale-95">
            <Inbox size={22} strokeWidth={2.5} />
          </Link>
          <Link href="/contacts" className="w-11 h-11 flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-white dark:hover:bg-slate-800 rounded-2xl hover:shadow-sm hover:border hover:border-slate-200 dark:hover:border-slate-700 transition-all duration-200 active:scale-95">
            <Users size={22} strokeWidth={2} />
          </Link>
          <Link href="/analytics" className="w-11 h-11 flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-white dark:hover:bg-slate-800 rounded-2xl hover:shadow-sm hover:border hover:border-slate-200 dark:hover:border-slate-700 transition-all duration-200 active:scale-95">
            <BarChart3 size={22} strokeWidth={2} />
          </Link>
        </div>
        
        <div className="mt-auto w-full px-2 flex flex-col items-center space-y-3">
          <button className="w-11 h-11 flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-white dark:hover:bg-slate-800 rounded-2xl hover:shadow-sm hover:border hover:border-slate-200 dark:hover:border-slate-700 transition-all duration-200 active:scale-95">
            <Bell size={22} strokeWidth={2} />
          </button>
          <Link href="/settings" className="w-11 h-11 flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-white dark:hover:bg-slate-800 rounded-2xl hover:shadow-sm hover:border hover:border-slate-200 dark:hover:border-slate-700 transition-all duration-200 active:scale-95">
            <Settings size={22} strokeWidth={2} />
          </Link>
          <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-slate-200 to-slate-300 dark:from-slate-700 dark:to-slate-600 mt-2 shadow-sm border border-slate-200 dark:border-slate-600 cursor-pointer active:scale-95 transition-all"></div>
        </div>
      </aside>

      {/* 2. Secondary Sidebar (Folders / Filters) */}
      <aside className="w-[240px] flex flex-col bg-[#F9FAFB] dark:bg-slate-950 border-r border-slate-200 dark:border-slate-800 z-10 shrink-0 overflow-y-auto">
        <div className="p-5 pb-2 flex justify-between items-center">
          <h2 className="font-medium text-[15px] text-slate-900 dark:text-white">Inbox</h2>
          <div className="flex gap-1">
            <button className="p-1 text-slate-500 hover:text-slate-800 transition-colors"><Search size={15} strokeWidth={2}/></button>
            <button className="p-1 text-slate-500 hover:text-slate-800 transition-colors"><Plus size={15} strokeWidth={2}/></button>
          </div>
        </div>

        <div className="px-3 space-y-0.5 mt-2">
          <div className="flex items-center justify-between px-3 py-1.5 bg-[#E5F1FF] text-blue-700 font-medium cursor-pointer rounded-md transition-all">
            <div className="flex items-center gap-2"><User size={15} strokeWidth={2} /> Your inbox</div>
            <span className="text-[12px] font-medium">5</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 text-slate-600 hover:bg-slate-100 rounded-md cursor-pointer transition-all">
            <span className="font-medium text-lg leading-none mt-[-2px]">@</span> Mentions
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 text-slate-600 hover:bg-slate-100 rounded-md cursor-pointer transition-all">
            <MessageSquare size={15} strokeWidth={2} /> All
          </div>
        </div>

        <div className="mt-8 px-6 mb-2 flex justify-between items-center">
          <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wide">TalkFuze AI</span>
        </div>
        <div className="px-3 space-y-0.5">
          <div className="flex items-center gap-2 px-3 py-1.5 text-slate-600 hover:bg-slate-100 rounded-md cursor-pointer transition-all">
            <Bot size={15} strokeWidth={2} /> All conversations
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 text-slate-600 hover:bg-slate-100 rounded-md cursor-pointer transition-all">
            <HelpCircle size={15} strokeWidth={2} /> Handoffs
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex overflow-hidden relative bg-white dark:bg-slate-900">
        {children}
      </main>
    </div>
  )
}
