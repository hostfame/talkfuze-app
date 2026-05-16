import { ChevronDown, ExternalLink, Hash, Plus, User } from "lucide-react"
import AssignButton from "./AssignButton"

export default function ContactSidebar({ conversation, orgId }: any) {
  const contactName = conversation?.contact?.name || "Unknown"
  const rawPlatformId = conversation?.contact?.platform_id || "No number"
  const platformId = rawPlatformId.includes('@') ? rawPlatformId.split('@')[0] : rawPlatformId
  const isWhatsApp = conversation?.channels?.type === 'whatsapp'

  return (
    <div className="flex flex-col h-full w-[300px] shrink-0 bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 z-10 overflow-hidden">
      {/* Tabs */}
      <div className="flex border-b border-slate-200/80 dark:border-slate-800 px-3 pt-3 h-[72px] items-end bg-slate-50/30">
        <button className="px-4 py-3 text-[14px] font-semibold border-b-2 border-blue-600 text-slate-900 dark:text-slate-100 transition-colors">Details</button>
        <button className="px-4 py-3 text-[14px] font-medium text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 border-b-2 border-transparent transition-colors">Copilot</button>
        <div className="flex-1"></div>
        <button className="p-2 mb-2 text-slate-400 hover:text-slate-600 bg-white hover:bg-slate-50 rounded-lg border border-slate-200 transition-all active:scale-95 shadow-sm"><ExternalLink size={14} strokeWidth={2.5}/></button>
      </div>

      <div className="flex-1 overflow-y-auto bg-white">
        
        {/* Contact Header Block (AnyChat Style) */}
        <div className="p-5 border-b border-slate-100 flex items-start gap-3">
          <div className="w-10 h-10 rounded-full flex items-center justify-center font-semibold text-[14px] tracking-wide shrink-0 text-white bg-blue-600">
            {(() => {
              const name = contactName;
              if (name.startsWith('+')) return name.substring(0, 2);
              const parts = name.trim().split(" ").filter(Boolean);
              if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
              return name.substring(0, 1).toUpperCase();
            })()}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-[15px] font-semibold text-slate-900 truncate mb-0.5">{contactName}</h2>
            <p className="text-[13px] text-slate-500 truncate">{platformId.startsWith('+') ? platformId : `+${platformId}`}</p>
          </div>
          <button className="bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold px-3 py-1.5 rounded uppercase tracking-wider transition-colors shrink-0">
            Resolve
          </button>
        </div>

        {/* Core Attributes */}
        <div className="py-4 px-5 border-b border-slate-100 space-y-4">
          <AssignButton conversation={conversation} orgId={orgId} />
          <div className="flex justify-between items-center">
            <span className="text-[13px] text-slate-500">Team Inbox</span>
            <div className="flex items-center gap-2 text-[13px] text-slate-900 font-medium hover:text-blue-600 cursor-pointer transition-colors">
              <User size={14} className="text-slate-400" /> Admin Support
            </div>
          </div>
        </div>

        {/* Links Section */}
        <div className="py-4 border-b border-slate-100">
          <div className="flex justify-between items-center px-5 mb-2 cursor-pointer group">
            <h3 className="text-[13px] font-medium text-slate-900 flex items-center gap-2">
              Links
            </h3>
            <ChevronDown size={14} className="text-slate-400 group-hover:text-slate-600" />
          </div>
          <div className="px-3">
            <div className="flex justify-between items-center px-2 py-1.5 hover:bg-slate-50 rounded-md transition-colors cursor-pointer group">
              <span className="text-[13px] text-slate-700 hover:underline">Tracker ticket</span>
            </div>
            <div className="flex justify-between items-center px-2 py-1.5 hover:bg-slate-50 rounded-md transition-colors cursor-pointer group">
              <span className="text-[13px] text-slate-700 hover:underline">Side conversations</span>
            </div>
          </div>
        </div>

        {/* Conversation attributes */}
        <div className="py-4">
          <div className="flex justify-between items-center px-5 mb-2 cursor-pointer group">
            <h3 className="text-[13px] font-medium text-slate-900 flex items-center gap-2">
              Conversation attributes
            </h3>
            <ChevronDown size={14} className="text-slate-400 group-hover:text-slate-600" />
          </div>
          <div className="px-5 space-y-3 mt-4">
            <div className="flex justify-between items-center">
              <span className="text-[13px] text-slate-500">ID</span>
              <span className="text-[13px] text-slate-900 font-mono">215471062845035</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[13px] text-slate-500">Brand</span>
              <span className="text-[13px] text-slate-900 font-medium">TalkFuze</span>
            </div>
          </div>
          <div className="px-5 mt-4">
            <button className="text-[13px] font-medium text-slate-500 hover:text-slate-700 hover:underline transition-all">See all attributes</button>
          </div>
        </div>

      </div>
    </div>
  )
}

function MessageSquareIcon(props: any) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    </svg>
  )
}
