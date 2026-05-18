import { ChevronDown, ExternalLink, User, Sparkles, MessageSquarePlus, AlignLeft, Send, Database, Loader2, Pencil, Check, X } from "lucide-react"
import { useState, useEffect } from "react"
import { summarizeThread, draftReply } from "@/actions/copilot"
import { getCrmData } from "@/actions/dashboard"
import { updateContactName } from "@/actions/contacts"
import AssignButton from "./AssignButton"
import type { Contact, ConversationWithDetails, Relation } from "@/lib/types"

function firstRelation<T>(relation: Relation<T> | undefined) {
  return Array.isArray(relation) ? relation[0] : relation
}

export default function ContactSidebar({ conversation, orgId }: { conversation?: ConversationWithDetails | null, orgId: string }) {
  const contact = firstRelation<Contact>(conversation?.contact)
  const [contactNameOverrides, setContactNameOverrides] = useState<Record<string, string>>({})
  const contactName = contact?.id ? contactNameOverrides[contact.id] || contact.name : contact?.name || "Unknown"
  const rawPlatformId = contact?.platform_id || "No number"
  const isLid = rawPlatformId.endsWith('@lid')
  const isMessenger = contact?.platform_type === 'messenger'
  const platformId = rawPlatformId.includes('@') ? rawPlatformId.split('@')[0] : rawPlatformId
  const displayId = isLid ? `ID: ${platformId}` : isMessenger ? `Messenger ID: ${platformId}` : (platformId.startsWith('+') ? platformId : `+${platformId}`)

  const [activeTab, setActiveTab] = useState<'details' | 'copilot'>('details')
  const [summary, setSummary] = useState<string | null>(null)
  const [draft, setDraft] = useState<string | null>(null)
  const [isSummarizing, setIsSummarizing] = useState(false)
  const [isDrafting, setIsDrafting] = useState(false)
  const [customPrompt, setCustomPrompt] = useState("")
  
  const [isEditingName, setIsEditingName] = useState(false)
  const [editedName, setEditedName] = useState("")

  const handleSaveName = async () => {
    if (!editedName.trim() || editedName === contactName || !contact?.id) {
      setIsEditingName(false)
      return
    }
    const result = await updateContactName(contact.id, editedName.trim())
    if (result.success) {
      setContactNameOverrides((current) => ({
        ...current,
        [contact.id]: editedName.trim(),
      }))
    } else {
      setEditedName(contactName) // revert on error
    }
    setIsEditingName(false)
  }

  // CRM State
  const [crmData, setCrmData] = useState<Record<string, unknown> | null>(null)
  const [isCrmLoading, setIsCrmLoading] = useState(false)

  useEffect(() => {
    let mounted = true
    if (conversation?.id && platformId) {
      const fetchCrm = async () => {
        setIsCrmLoading(true)
        // Format number for webhook
        const cleanPhone = platformId.startsWith('+') ? platformId : `+${platformId}`
        const data = await getCrmData(orgId, cleanPhone)
        if (mounted) {
          if (data) setCrmData(data)
          setIsCrmLoading(false)
        }
      }
      fetchCrm()
    }
    return () => { mounted = false }
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
          <Database size={14} className={activeTab === 'copilot' ? 'text-blue-500' : ''} /> CRM
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
          <div className="flex-1 min-w-0 flex flex-col justify-center">
            {isEditingName ? (
              <div className="flex items-center gap-1.5 mb-0.5">
                <input 
                  type="text" 
                  value={editedName} 
                  onChange={(e) => setEditedName(e.target.value)}
                  className="text-[14px] font-semibold text-slate-900 border border-slate-300 rounded px-1.5 py-0.5 w-full focus:outline-none focus:border-blue-500"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveName()
                    if (e.key === 'Escape') {
                      setIsEditingName(false)
                      setEditedName(contactName)
                    }
                  }}
                />
                <button onClick={handleSaveName} className="text-emerald-600 hover:text-emerald-700 p-0.5"><Check size={16} strokeWidth={2.5} /></button>
                <button onClick={() => { setIsEditingName(false); setEditedName(contactName) }} className="text-slate-400 hover:text-slate-600 p-0.5"><X size={16} strokeWidth={2.5} /></button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 mb-0.5 group">
                <h2 className="text-[15px] font-semibold text-slate-900 truncate">{contactName}</h2>
                <button 
                  onClick={() => {
                    setEditedName(contactName)
                    setIsEditingName(true)
                  }} 
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-400 hover:text-blue-600"
                >
                  <Pencil size={12} strokeWidth={2.5} />
                </button>
              </div>
            )}
            <p className="text-[13px] text-slate-500 truncate">{displayId}</p>
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

      {/* CRM Tab Content */}
      {activeTab === 'copilot' && (
        <div className="flex-1 overflow-y-auto bg-slate-50/50 dark:bg-slate-900/50 p-5 space-y-6">
          
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 shadow-sm">
            <h3 className="text-[14px] font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2 mb-3">
              <Database size={16} className="text-blue-600" /> WHMCS Integration
            </h3>
            <p className="text-[13px] text-slate-600 dark:text-slate-400 leading-relaxed mb-4">
              Connect WHMCS to automatically map WhatsApp numbers to clients, view their active services, domains, and open tickets directly on their behalf.
            </p>
            <button className="w-full bg-blue-600 hover:bg-blue-700 text-white text-[13px] font-medium py-2 rounded-lg transition-colors flex items-center justify-center gap-2">
              <Database size={16} /> Configure WHMCS
            </button>
          </div>

          <div className="opacity-50 pointer-events-none">
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 shadow-sm mb-6">
              <div className="flex justify-between items-center mb-3">
                <h3 className="text-[13px] font-semibold text-slate-900 dark:text-slate-100">Client Overview</h3>
              </div>
              <div className="space-y-2">
                <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-3/4"></div>
                <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-1/2"></div>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 shadow-sm">
              <div className="flex justify-between items-center mb-3">
                <h3 className="text-[13px] font-semibold text-slate-900 dark:text-slate-100">Recent Tickets</h3>
                <span className="text-[11px] font-medium text-blue-600 bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 rounded-full">Create New</span>
              </div>
              <div className="space-y-2">
                <div className="h-10 bg-slate-100 dark:bg-slate-700/50 rounded"></div>
                <div className="h-10 bg-slate-100 dark:bg-slate-700/50 rounded"></div>
              </div>
            </div>
          </div>

        </div>
      )}
    </div>
  )
}
