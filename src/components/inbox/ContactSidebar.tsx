import { ChevronDown, ExternalLink, User, Sparkles, MessageSquarePlus, AlignLeft, Send, Database, Loader2, Pencil, Check, X, Search } from "lucide-react"
import { useState, useEffect } from "react"
import { summarizeThread, draftReply } from "@/actions/copilot"
import { getCrmData } from "@/actions/dashboard"
import { fetchWhmcsClient, fetchWhmcsServices, fetchWhmcsTickets, createWhmcsTicket } from "@/actions/whmcs"
import { updateContactName, updateContactPhone } from "@/actions/contacts"
import AssignButton from "./AssignButton"
import type { Contact, ConversationWithDetails, Relation } from "@/lib/types"

interface WhmcsClient {
  id: number;
  firstname: string;
  lastname: string;
  email: string;
  status?: string;
}

interface WhmcsProduct {
  id: number;
  name: string;
  domain?: string;
  status: string;
}

interface WhmcsDomain {
  id: number;
  domainname: string;
  expirydate: string;
  status: string;
}

interface WhmcsTicket {
  id: number;
  subject: string;
  status: string;
  deptname: string;
  lastreply: string;
}

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
  const [whmcsClient, setWhmcsClient] = useState<WhmcsClient | null>(null)
  const [whmcsServices, setWhmcsServices] = useState<{ products: WhmcsProduct[], domains: WhmcsDomain[] } | null>(null)
  const [whmcsTickets, setWhmcsTickets] = useState<WhmcsTicket[]>([])
  const [crmSearchQuery, setCrmSearchQuery] = useState("")
  const [lastSearchedQuery, setLastSearchedQuery] = useState("")

  const [showAllServices, setShowAllServices] = useState(false)
  const [showAllTickets, setShowAllTickets] = useState(false)
  const [showCreateTicket, setShowCreateTicket] = useState(false)
  const [newTicketSubject, setNewTicketSubject] = useState("")
  const [newTicketMessage, setNewTicketMessage] = useState("")
  const [isCreatingTicket, setIsCreatingTicket] = useState(false)

  const handleCreateTicket = async () => {
    if (!whmcsClient || !newTicketSubject.trim() || !newTicketMessage.trim()) return
    setIsCreatingTicket(true)
    const result = await createWhmcsTicket(whmcsClient.id, 1, newTicketSubject, newTicketMessage) // 1 = Support Dept
    if (result.success) {
      setNewTicketSubject("")
      setNewTicketMessage("")
      setShowCreateTicket(false)
      // refresh tickets
      const tickets = await fetchWhmcsTickets(whmcsClient.id)
      setWhmcsTickets(tickets)
    } else {
      alert("Failed to create ticket: " + result.error)
    }
    setIsCreatingTicket(false)
  }

  const handleManualSearch = async (query: string) => {
    if (!query) return;
    setLastSearchedQuery(query.trim());
    setIsCrmLoading(true);
    const client = await fetchWhmcsClient(query.trim());
    if (client) {
      setWhmcsClient(client);
      const [services, tickets] = await Promise.all([
        fetchWhmcsServices(client.id),
        fetchWhmcsTickets(client.id)
      ]);
      setWhmcsServices(services);
      setWhmcsTickets(tickets);

      // Bind to user so we don't need to search again next time
      if (contact?.id) {
        const bindValue = client.email || query.trim();
        await updateContactPhone(contact.id, bindValue);
        setContactPhoneOverrides((current) => ({
          ...current,
          [contact.id]: bindValue,
        }));
      }
    } else {
      setWhmcsClient(null);
      setWhmcsServices(null);
      setWhmcsTickets([]);
    }
    setIsCrmLoading(false);
  }

  useEffect(() => {
    let mounted = true
    
    // Reset CRM state immediately when conversation changes to prevent data leak
    setWhmcsClient(null)
    setWhmcsServices(null)
    setWhmcsTickets([])
    setCrmData(null)
    setCrmSearchQuery("")
    
    if (conversation?.id && platformId) {
      const fetchCrm = async () => {
        setIsCrmLoading(true)
        const isEmail = effectivePhoneId.includes('@') && !effectivePhoneId.endsWith('@lid')
        const cleanPhone = isEmail ? effectivePhoneId : (effectivePhoneId.startsWith('+') ? effectivePhoneId : `+${effectivePhoneId}`)
        // Fetch WHMCS data if viewing CRM tab
        if (activeTab === 'copilot') {
          // Only fetch if we have a real phone number (avoid sending raw PSIDs/LIDs to WHMCS)
          if (contactPhone || (!isLid && !isMessenger)) {
            setLastSearchedQuery(cleanPhone)
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

      {activeTab === 'details' && (
        <div className="flex-1 overflow-y-auto bg-white">
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
        </div>
      )}

      {/* CRM Tab Content */}
      {activeTab === 'copilot' && (
        <div className="flex-1 flex flex-col min-h-0 bg-slate-50/50 dark:bg-slate-900/50">
          
          {/* Minimal Search Box - Fixed at top */}
          <div className="p-4 pb-2 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 sticky top-0 z-10">
            <div className="relative">
              {isCrmLoading && whmcsClient ? (
                <Loader2 className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-500 animate-spin" size={14} />
              ) : (
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
              )}
              <input 
                type="text" 
                value={crmSearchQuery}
                onChange={(e) => setCrmSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleManualSearch(crmSearchQuery || effectivePhoneId)
                }}
                placeholder="Search CRM by email or phone..." 
                className="w-full text-[13px] border border-slate-200 dark:border-slate-700 rounded-lg pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800 focus:outline-none focus:border-blue-500 shadow-sm transition-all"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4 relative">
            {isCrmLoading && whmcsClient && (
              <div className="absolute top-0 left-0 w-full h-[2px] overflow-hidden bg-transparent z-50">
                <div className="h-full bg-blue-500 animate-pulse w-full"></div>
              </div>
            )}

            {isCrmLoading && !whmcsClient ? (
              <div className="space-y-4 animate-pulse pt-2">
                <div className="p-4 bg-slate-100 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700/50 h-[80px]"></div>
                <div className="space-y-3">
                  <div className="h-4 bg-slate-200 dark:bg-slate-700/50 rounded w-1/3 mb-4"></div>
                  <div className="h-[90px] bg-slate-100 dark:bg-slate-800/30 rounded-xl"></div>
                  <div className="h-[90px] bg-slate-100 dark:bg-slate-800/30 rounded-xl"></div>
                </div>
              </div>
            ) : whmcsClient ? (
            <div className="space-y-4">
              <div className="p-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-[12px] font-mono text-slate-400">#{whmcsClient.id}</span>
                  <a href={`https://my.hostnin.com/admin/clientssummary.php?userid=${whmcsClient.id}`} target="_blank" rel="noreferrer" className="text-slate-400 hover:text-blue-500 transition-colors" title="View in WHMCS">
                    <ExternalLink size={14} />
                  </a>
                </div>
                <h4 className="text-[14px] font-semibold text-slate-900 dark:text-slate-100">{whmcsClient.firstname} {whmcsClient.lastname}</h4>
                <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-0.5">{whmcsClient.email}</p>
              </div>
            </div>
          ) : (
            <div className="text-center py-6 px-4 border border-dashed border-slate-200 dark:border-slate-700 rounded-xl bg-white/50 dark:bg-slate-800/50">
              <p className="text-[13px] text-slate-500 dark:text-slate-400">
                {lastSearchedQuery
                  ? `No matching account found for ${lastSearchedQuery}.`
                  : `No phone number is associated with this account (ID: ${platformId}).`}
              </p>
            </div>
          )}

          {whmcsClient && (
            <div className="space-y-6">
              {whmcsServices && (whmcsServices.products?.length > 0 || whmcsServices.domains?.length > 0) && (() => {
                const activeProducts = whmcsServices.products.filter(p => p.status === 'Active')
                const activeDomains = whmcsServices.domains.filter(d => d.status === 'Active')
                const displayProducts = showAllServices ? whmcsServices.products : activeProducts
                const displayDomains = showAllServices ? whmcsServices.domains : activeDomains
                const hasHidden = (whmcsServices.products.length > activeProducts.length) || (whmcsServices.domains.length > activeDomains.length)

                return (
                  <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 shadow-sm">
                    <h3 className="text-[13px] font-semibold text-slate-900 dark:text-slate-100 mb-3">Active Services & Domains</h3>
                    <div className="space-y-3">
                      {displayProducts?.map((product: WhmcsProduct) => (
                        <div key={product.id} className="flex flex-col pb-3 border-b border-slate-100 dark:border-slate-700/50 last:border-0 last:pb-0 relative group">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-[13px] font-medium text-slate-800 dark:text-slate-200 pr-5">{product.name}</p>
                            <a href={`https://my.hostnin.com/admin/clientsservices.php?userid=${whmcsClient.id}&id=${product.id}`} target="_blank" rel="noreferrer" className="text-slate-300 hover:text-blue-500 transition-colors opacity-0 group-hover:opacity-100 absolute right-0 top-0" title="View Service">
                              <ExternalLink size={13} />
                            </a>
                          </div>
                          {product.domain && <p className="text-[11.5px] text-blue-600 dark:text-blue-400 font-medium">{product.domain}</p>}
                        </div>
                      ))}
                      {displayDomains?.map((domain: WhmcsDomain) => (
                        <div key={domain.id} className="flex flex-col pb-3 border-b border-slate-100 dark:border-slate-700/50 last:border-0 last:pb-0 relative group">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-[13px] font-medium text-slate-800 dark:text-slate-200 pr-5">{domain.domainname}</p>
                            <a href={`https://my.hostnin.com/admin/clientsdomains.php?userid=${whmcsClient.id}&domainid=${domain.id}`} target="_blank" rel="noreferrer" className="text-slate-300 hover:text-blue-500 transition-colors opacity-0 group-hover:opacity-100 absolute right-0 top-0" title="View Domain">
                              <ExternalLink size={13} />
                            </a>
                          </div>
                          <p className="text-[11px] text-slate-500">Exp: {domain.expirydate}</p>
                        </div>
                      ))}
                      {!displayProducts.length && !displayDomains.length && (
                         <p className="text-[12px] text-slate-500">No active services.</p>
                      )}
                    </div>
                    {hasHidden && (
                      <button 
                        onClick={() => setShowAllServices(!showAllServices)}
                        className="mt-3 text-[11px] font-medium text-slate-500 hover:text-slate-700 transition-colors w-full text-center py-1.5 bg-slate-50 dark:bg-slate-900/50 rounded"
                      >
                        {showAllServices ? "Show less" : "Show all services"}
                      </button>
                    )}
                  </div>
                )
              })()}

              <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 shadow-sm">
                <div className="flex justify-between items-center mb-3">
                  <h3 className="text-[13px] font-semibold text-slate-900 dark:text-slate-100">Tickets</h3>
                  <button 
                    onClick={() => setShowCreateTicket(true)}
                    className="text-[11px] font-medium text-blue-600 bg-blue-50 dark:bg-blue-900/30 hover:bg-blue-100 transition-colors px-2 py-1 rounded"
                  >
                    Create New
                  </button>
                </div>
                {whmcsTickets?.length > 0 ? (
                  <div className="space-y-3">
                    {whmcsTickets.slice(0, showAllTickets ? undefined : 3).map((ticket: WhmcsTicket) => (
                      <a 
                        key={ticket.id} 
                        href={`https://my.hostnin.com/admin/supporttickets.php?action=view&id=${ticket.id}`} 
                        target="_blank" 
                        rel="noreferrer"
                        className="block p-2.5 bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-700/50 rounded-lg group cursor-pointer hover:border-blue-300 transition-colors"
                      >
                        <div className="flex justify-between items-start gap-2 mb-1">
                          <p className="text-[12px] font-medium text-slate-800 dark:text-slate-200 line-clamp-1 group-hover:text-blue-600 flex items-center gap-1.5">
                            {ticket.subject}
                            <ExternalLink size={10} className="opacity-0 group-hover:opacity-100" />
                          </p>
                          <span className="text-[10px] font-bold shrink-0 px-1.5 py-0.5 bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded">{ticket.status}</span>
                        </div>
                        <p className="text-[11px] text-slate-500">Dept: {ticket.deptname} • {ticket.lastreply}</p>
                      </a>
                    ))}
                    {whmcsTickets.length > 3 && (
                      <button 
                        onClick={() => setShowAllTickets(!showAllTickets)}
                        className="mt-2 text-[11px] font-medium text-slate-500 hover:text-slate-700 transition-colors w-full text-center py-1.5 bg-slate-50 dark:bg-slate-900/50 rounded"
                      >
                        {showAllTickets ? "Show less" : `View all ${whmcsTickets.length} tickets`}
                      </button>
                    )}
                  </div>
                ) : (
                  <p className="text-[12px] text-slate-500 text-center py-4">No recent tickets found.</p>
                )}
              </div>
            </div>
          )}

          {/* Create Ticket Popup */}
          {showCreateTicket && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
              <div className="bg-white dark:bg-slate-900 w-[90%] max-w-md rounded-xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col">
                <div className="px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-900/50">
                  <h3 className="text-[14px] font-semibold text-slate-900 dark:text-white">Create Ticket</h3>
                  <button onClick={() => setShowCreateTicket(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 p-1 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                    <X size={16} />
                  </button>
                </div>
                <div className="p-5 flex-1 overflow-y-auto space-y-4">
                  <div>
                    <label className="block text-[12px] font-medium text-slate-700 dark:text-slate-300 mb-1.5">Subject</label>
                    <input 
                      type="text" 
                      value={newTicketSubject}
                      onChange={(e) => setNewTicketSubject(e.target.value)}
                      className="w-full text-[13px] border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 bg-white dark:bg-slate-900 focus:outline-none focus:border-blue-500 shadow-sm"
                      placeholder="Issue summary"
                    />
                  </div>
                  <div>
                    <label className="block text-[12px] font-medium text-slate-700 dark:text-slate-300 mb-1.5">Message</label>
                    <textarea 
                      value={newTicketMessage}
                      onChange={(e) => setNewTicketMessage(e.target.value)}
                      className="w-full text-[13px] border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 bg-white dark:bg-slate-900 focus:outline-none focus:border-blue-500 shadow-sm min-h-[100px] resize-none"
                      placeholder="Describe the issue in detail..."
                    />
                  </div>
                </div>
                <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 flex justify-end gap-2">
                  <button 
                    onClick={() => setShowCreateTicket(false)}
                    className="px-4 py-2 rounded-lg text-[13px] font-medium text-slate-600 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={handleCreateTicket}
                    disabled={isCreatingTicket || !newTicketSubject.trim() || !newTicketMessage.trim()}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-[13px] font-medium transition-colors flex items-center gap-2 shadow-sm"
                  >
                    {isCreatingTicket && <Loader2 className="animate-spin" size={14} />}
                    Create Ticket
                  </button>
                </div>
              </div>
            </div>
          )}

          </div>
        </div>
      )}
    </div>
  )
}
