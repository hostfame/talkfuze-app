import { ChevronDown, ExternalLink, User, Sparkles, MessageSquarePlus, AlignLeft, Send, Database, Loader2, Pencil, Check, X } from "lucide-react"
import { useState, useEffect } from "react"
import { summarizeThread, draftReply } from "@/actions/copilot"
import { getCrmData } from "@/actions/dashboard"
import { fetchWhmcsClient, fetchWhmcsServices, fetchWhmcsTickets } from "@/actions/whmcs"
import { updateContactName, updateContactPhone } from "@/actions/contacts"
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

  const [contactPhoneOverrides, setContactPhoneOverrides] = useState<Record<string, string>>({})
  const contactPhone = contact?.id ? contactPhoneOverrides[contact.id] || contact?.phone : contact?.phone
  const effectivePhoneId = contactPhone || platformId

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

  const [isEditingPhone, setIsEditingPhone] = useState(false)
  const [editedPhone, setEditedPhone] = useState("")

  const handleSavePhone = async () => {
    if (!contact?.id) return
    const newPhone = editedPhone.trim()
    if (newPhone === contactPhone) {
      setIsEditingPhone(false)
      return
    }
    const result = await updateContactPhone(contact.id, newPhone)
    if (result.success) {
      setContactPhoneOverrides((current) => ({
        ...current,
        [contact.id]: newPhone,
      }))
    } else {
      setEditedPhone(contactPhone || "") // revert on error
    }
    setIsEditingPhone(false)
  }

  // CRM State
  const [crmData, setCrmData] = useState<Record<string, unknown> | null>(null)
  const [isCrmLoading, setIsCrmLoading] = useState(false)
  
  // WHMCS State
  const [whmcsClient, setWhmcsClient] = useState<any>(null)
  const [whmcsServices, setWhmcsServices] = useState<any>(null)
  const [whmcsTickets, setWhmcsTickets] = useState<any>([])

  useEffect(() => {
    let mounted = true
    if (conversation?.id && platformId) {
      const fetchCrm = async () => {
        setIsCrmLoading(true)
        const cleanPhone = effectivePhoneId.startsWith('+') ? effectivePhoneId : `+${effectivePhoneId}`
        
        // Fetch WHMCS data if viewing CRM tab
        if (activeTab === 'copilot') {
          // Only fetch if we have a real phone number (avoid sending raw PSIDs/LIDs to WHMCS)
          if (contactPhone || (!isLid && !isMessenger)) {
            const client = await fetchWhmcsClient(cleanPhone)
            if (mounted && client) {
              setWhmcsClient(client)
              const [services, tickets] = await Promise.all([
                fetchWhmcsServices(client.id),
                fetchWhmcsTickets(client.id)
              ])
              if (mounted) {
                setWhmcsServices(services)
                setWhmcsTickets(tickets)
              }
            }
          }
        }
        
        // Fetch legacy CRM data (if any)
        const data = await getCrmData(orgId, cleanPhone)
        if (mounted) {
          if (data) setCrmData(data)
          setIsCrmLoading(false)
        }
      }
      fetchCrm()
    }
    return () => { mounted = false }
  }, [conversation?.id, platformId, orgId, activeTab])

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
            
            {isEditingPhone ? (
              <div className="flex items-center gap-1 mt-1">
                <input 
                  value={editedPhone} 
                  onChange={(e) => setEditedPhone(e.target.value)}
                  placeholder="+8801..."
                  className="text-[13px] text-slate-700 border border-slate-300 rounded px-1.5 py-0.5 w-full focus:outline-none focus:border-blue-500"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSavePhone()
                    if (e.key === 'Escape') {
                      setIsEditingPhone(false)
                      setEditedPhone(contactPhone || "")
                    }
                  }}
                />
                <button onClick={handleSavePhone} className="text-emerald-600 hover:text-emerald-700 p-0.5"><Check size={14} strokeWidth={2.5} /></button>
                <button onClick={() => { setIsEditingPhone(false); setEditedPhone(contactPhone || "") }} className="text-slate-400 hover:text-slate-600 p-0.5"><X size={14} strokeWidth={2.5} /></button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 mt-0.5 group">
                <p className="text-[13px] text-slate-500 truncate">
                  {contactPhone ? `Phone: ${contactPhone}` : displayId}
                </p>
                <button 
                  onClick={() => {
                    setEditedPhone(contactPhone || "")
                    setIsEditingPhone(true)
                  }} 
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-400 hover:text-blue-600"
                >
                  <Pencil size={11} strokeWidth={2.5} />
                </button>
              </div>
            )}
          </div>
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
            {isCrmLoading ? (
              <div className="py-4 flex flex-col items-center justify-center">
                <Loader2 className="animate-spin text-slate-300 mb-2" size={20} />
                <span className="text-[12px] text-slate-500">Syncing with WHMCS...</span>
              </div>
            ) : whmcsClient ? (
              <div className="space-y-4">
                <div className="p-3 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800/50 rounded-lg">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-[13px] font-semibold text-emerald-800 dark:text-emerald-400">Account Linked</span>
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-200/50 text-emerald-700 uppercase tracking-wider">{whmcsClient.status}</span>
                  </div>
                  <p className="text-[12px] text-emerald-600/80 dark:text-emerald-500/80 font-medium">#{whmcsClient.id} - {whmcsClient.firstname} {whmcsClient.lastname}</p>
                  <p className="text-[11px] text-emerald-600/60 dark:text-emerald-500/60 font-mono mt-0.5">{whmcsClient.email}</p>
                </div>
              </div>
            ) : (
              <>
                <p className="text-[13px] text-slate-600 dark:text-slate-400 leading-relaxed mb-4">
                  {contactPhone || (!isLid && !isMessenger)
                    ? `No matching account found for ${effectivePhoneId}. Ensure their phone number matches in WHMCS.`
                    : `No phone number is associated with this account (ID: ${platformId}). Click the pencil icon under their name above to add their phone number.`}
                </p>
                <div className="flex gap-2 opacity-50 pointer-events-none">
                  <input type="email" placeholder="Search by email..." className="flex-1 text-[13px] border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 bg-slate-50 dark:bg-slate-900 focus:outline-none focus:border-blue-500" />
                  <button className="bg-blue-600 hover:bg-blue-700 text-white text-[13px] font-medium px-4 rounded-lg transition-colors flex items-center justify-center">
                    Link
                  </button>
                </div>
              </>
            )}
          </div>

          {whmcsClient && (
            <div className="space-y-6">
              {whmcsServices && (whmcsServices.products?.length > 0 || whmcsServices.domains?.length > 0) && (
                <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 shadow-sm">
                  <h3 className="text-[13px] font-semibold text-slate-900 dark:text-slate-100 mb-3">Active Services & Domains</h3>
                  <div className="space-y-3">
                    {whmcsServices.products?.map((product: any) => (
                      <div key={product.id} className="flex justify-between items-start pb-3 border-b border-slate-100 dark:border-slate-700/50 last:border-0 last:pb-0">
                        <div>
                          <p className="text-[13px] font-medium text-slate-800 dark:text-slate-200">{product.name}</p>
                          {product.domain && <p className="text-[11.5px] text-blue-600 dark:text-blue-400 font-medium">{product.domain}</p>}
                        </div>
                        <div className="text-right">
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${product.status === 'Active' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>{product.status}</span>
                        </div>
                      </div>
                    ))}
                    {whmcsServices.domains?.map((domain: any) => (
                      <div key={domain.id} className="flex justify-between items-start pb-3 border-b border-slate-100 dark:border-slate-700/50 last:border-0 last:pb-0">
                        <div>
                          <p className="text-[13px] font-medium text-slate-800 dark:text-slate-200">{domain.domainname}</p>
                          <p className="text-[11px] text-slate-500">Exp: {domain.expirydate}</p>
                        </div>
                        <div className="text-right">
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${domain.status === 'Active' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{domain.status}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 shadow-sm">
                <div className="flex justify-between items-center mb-3">
                  <h3 className="text-[13px] font-semibold text-slate-900 dark:text-slate-100">Recent Tickets</h3>
                  <button className="text-[11px] font-medium text-blue-600 bg-blue-50 dark:bg-blue-900/30 hover:bg-blue-100 transition-colors px-2 py-1 rounded">Create New</button>
                </div>
                {whmcsTickets?.length > 0 ? (
                  <div className="space-y-3">
                    {whmcsTickets.map((ticket: any) => (
                      <div key={ticket.id} className="p-2.5 bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-700/50 rounded-lg group cursor-pointer hover:border-blue-300 transition-colors">
                        <div className="flex justify-between items-start gap-2 mb-1">
                          <p className="text-[12px] font-medium text-slate-800 dark:text-slate-200 line-clamp-1 group-hover:text-blue-600">{ticket.subject}</p>
                          <span className="text-[10px] font-bold shrink-0 px-1.5 py-0.5 bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded">{ticket.status}</span>
                        </div>
                        <p className="text-[11px] text-slate-500">Dept: {ticket.deptname} • {ticket.lastreply}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[12px] text-slate-500 text-center py-4">No recent tickets found.</p>
                )}
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  )
}
