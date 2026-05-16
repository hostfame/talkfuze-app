import { ChevronDown, ExternalLink, Hash, Plus, User, Sparkles, MessageSquarePlus, AlignLeft, Send, Database, Loader2 } from "lucide-react"
import { useState, useEffect } from "react"
import { summarizeThread, draftReply } from "@/actions/copilot"
import { getCrmData } from "@/actions/dashboard"
import AssignButton from "./AssignButton"

export default function ContactSidebar({ conversation, orgId }: any) {
  const contactName = conversation?.contact?.name || "Unknown"
  const rawPlatformId = conversation?.contact?.platform_id || "No number"
  const platformId = rawPlatformId.includes('@') ? rawPlatformId.split('@')[0] : rawPlatformId
  const isWhatsApp = conversation?.channels?.type === 'whatsapp'

  const [activeTab, setActiveTab] = useState<'details' | 'copilot'>('details')
  const [summary, setSummary] = useState<string | null>(null)
  const [draft, setDraft] = useState<string | null>(null)
  const [isSummarizing, setIsSummarizing] = useState(false)
  const [isDrafting, setIsDrafting] = useState(false)
  const [customPrompt, setCustomPrompt] = useState("")

  // CRM State
  const [crmData, setCrmData] = useState<any>(null)
  const [isCrmLoading, setIsCrmLoading] = useState(false)

  useEffect(() => {
    if (conversation?.id && platformId) {
      setIsCrmLoading(true)
      // Format number for webhook
      const cleanPhone = platformId.startsWith('+') ? platformId : `+${platformId}`
      getCrmData(orgId, cleanPhone).then(data => {
        if (data) setCrmData(data)
        setIsCrmLoading(false)
      })
    }
  }, [conversation?.id, platformId, orgId])

  const handleSummarize = async () => {
    if (!conversation?.id) return
    setIsSummarizing(true)
    const result = await summarizeThread(conversation.id)
    setSummary(result)
    setIsSummarizing(false)
  }

  const handleDraft = async () => {
    if (!conversation?.id) return
    setIsDrafting(true)
    const result = await draftReply(conversation.id, customPrompt)
    setDraft(result)
    setIsDrafting(false)
  }

  return (
    <div className="flex flex-col h-full w-[300px] shrink-0 bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 z-10 overflow-hidden">
      {/* Tabs */}
      <div className="flex border-b border-slate-200/80 dark:border-slate-800 px-3 pt-3 h-[72px] items-end bg-slate-50/30">
        <button 
          onClick={() => setActiveTab('details')}
          className={`px-4 py-3 text-[14px] transition-colors border-b-2 ${activeTab === 'details' ? 'font-semibold border-blue-600 text-slate-900 dark:text-slate-100' : 'font-medium text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 border-transparent'}`}
        >
          Details
        </button>
        <button 
          onClick={() => setActiveTab('copilot')}
          className={`px-4 py-3 text-[14px] transition-colors border-b-2 flex items-center gap-1.5 ${activeTab === 'copilot' ? 'font-semibold border-blue-600 text-slate-900 dark:text-slate-100' : 'font-medium text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 border-transparent'}`}
        >
          <Sparkles size={14} className={activeTab === 'copilot' ? 'text-blue-500' : ''} /> Copilot
        </button>
        <div className="flex-1"></div>
        <button className="p-2 mb-2 text-slate-400 hover:text-slate-600 bg-white hover:bg-slate-50 rounded-lg border border-slate-200 transition-all active:scale-95 shadow-sm"><ExternalLink size={14} strokeWidth={2.5}/></button>
      </div>

      <div className="flex-1 overflow-y-auto bg-white">
        {activeTab === 'details' && (
          <>
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

        {/* CRM Data Section */}
        {isCrmLoading ? (
          <div className="py-6 flex flex-col items-center justify-center border-b border-slate-100">
            <Loader2 className="animate-spin text-slate-300 mb-2" size={20} />
            <span className="text-[12px] text-slate-500">Syncing with CRM...</span>
          </div>
        ) : crmData ? (
          <div className="py-4 border-b border-slate-100">
            <div className="flex justify-between items-center px-5 mb-2 cursor-pointer group">
              <h3 className="text-[13px] font-medium text-slate-900 flex items-center gap-2">
                <Database size={14} className="text-blue-500" /> CRM Data
              </h3>
              <ChevronDown size={14} className="text-slate-400 group-hover:text-slate-600" />
            </div>
            <div className="px-5 space-y-3 mt-4">
              {Object.entries(crmData).map(([key, value]) => (
                <div key={key} className="flex justify-between items-start gap-4">
                  <span className="text-[13px] text-slate-500 capitalize">{key.replace(/_/g, ' ')}</span>
                  <span className="text-[13px] text-slate-900 font-medium text-right break-words">{String(value)}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}

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

      </>
      )}
      </div>

      {/* Copilot Tab Content */}
      {activeTab === 'copilot' && (
        <div className="flex-1 overflow-y-auto bg-slate-50/50 dark:bg-slate-900/50 p-5 space-y-6">
          
          {/* Summary Section */}
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 shadow-sm">
            <h3 className="text-[14px] font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2 mb-3">
              <AlignLeft size={16} className="text-blue-500" /> AI Summary
            </h3>
            {summary ? (
              <div className="text-[13px] text-slate-700 dark:text-slate-300 leading-relaxed bg-slate-50 dark:bg-slate-900/50 p-3 rounded-lg border border-slate-100 dark:border-slate-700/50">
                {summary}
              </div>
            ) : (
              <button 
                onClick={handleSummarize}
                disabled={isSummarizing || !conversation?.id}
                className="w-full py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 text-[13px] font-medium rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isSummarizing ? <span className="animate-pulse">Analyzing thread...</span> : "Summarize Thread"}
              </button>
            )}
          </div>

          {/* Draft Reply Section */}
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 shadow-sm">
            <h3 className="text-[14px] font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2 mb-3">
              <MessageSquarePlus size={16} className="text-emerald-500" /> Draft Reply
            </h3>
            
            <input 
              type="text" 
              placeholder="Any specific instructions? (optional)"
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              className="w-full text-[13px] border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 mb-3 bg-slate-50 dark:bg-slate-900 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />

            {draft ? (
              <div className="space-y-3">
                <div className="text-[13px] text-slate-700 dark:text-slate-300 leading-relaxed bg-emerald-50/50 dark:bg-emerald-900/20 p-3 rounded-lg border border-emerald-100 dark:border-emerald-800/30 whitespace-pre-wrap">
                  {draft}
                </div>
                <div className="flex gap-2">
                  <button 
                    onClick={handleDraft}
                    disabled={isDrafting}
                    className="flex-1 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 text-[12px] font-medium rounded-lg transition-colors"
                  >
                    Regenerate
                  </button>
                  <button 
                    className="flex-1 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[12px] font-medium rounded-lg transition-colors flex items-center justify-center gap-1.5"
                    onClick={() => {
                      navigator.clipboard.writeText(draft);
                      alert("Copied to clipboard! You can paste it in the composer.");
                    }}
                  >
                    <Send size={12} /> Use Draft
                  </button>
                </div>
              </div>
            ) : (
              <button 
                onClick={handleDraft}
                disabled={isDrafting || !conversation?.id}
                className="w-full py-2 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-900/30 dark:hover:bg-emerald-800/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 text-[13px] font-medium rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isDrafting ? <span className="animate-pulse">Drafting...</span> : "Draft Reply"}
              </button>
            )}
          </div>

        </div>
      )}
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
