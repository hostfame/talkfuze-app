import { Search, Plus, User, MessageSquare, Bot, HelpCircle } from "lucide-react"

export default function InboxLayout({ children }: { children: React.ReactNode }) {
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
      {children}
    </>
  )
}
