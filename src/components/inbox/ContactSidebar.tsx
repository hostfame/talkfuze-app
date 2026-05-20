import { ChevronDown, ExternalLink, User, Sparkles, MessageSquarePlus, AlignLeft, Send, Database, Loader2, Pencil, Check, X, Search, Ban, Monitor, LogIn } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { useState, useEffect, useRef } from "react"
import { summarizeThread, draftReply } from "@/actions/copilot"
import { getCrmData, getParticipants, toggleContactBanStatus, replyToConversation } from "@/actions/dashboard"
import { fetchWhmcsClient, fetchWhmcsServices, fetchWhmcsTickets, createWhmcsTicket, fetchWhmcsUnpaidInvoices, convertChatToTicket, generateWHMCSSsoToken } from "@/actions/whmcs"
import { updateContactName, updateContactPhone } from "@/actions/contacts"
import AssignButton from "./AssignButton"
import SnoozeButton from "./SnoozeButton"
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

interface WhmcsInvoice {
  id: number;
  status: string;
  total: string;
  duedate: string;
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
  const isInstagram = contact?.platform_type === 'instagram'
  const isWhatsApp = contact?.platform_type === 'whatsapp'
  const platformId = rawPlatformId.includes('@') ? rawPlatformId.split('@')[0] : rawPlatformId
  const metadataPhone = (contact?.metadata as Record<string, any>)?.real_phone
  const displayPlatformId = metadataPhone || platformId
  // Display logic per platform:
  // - WhatsApp: show formatted phone number (+880...)
  // - Instagram: show "Instagram DM" (IGSID is not meaningful to agents)
  // - Messenger: show "Messenger" (PSID is not meaningful)
  // - LID: show internal ID
  const displayId = metadataPhone 
    ? (metadataPhone.startsWith('+') ? metadataPhone : `+${metadataPhone}`)
    : isLid
    ? `ID: ${displayPlatformId}`
    : isInstagram
    ? 'Instagram DM'
    : isMessenger
    ? 'Messenger'
    : (displayPlatformId.startsWith('+') ? displayPlatformId : `+${displayPlatformId}`)

  const [contactPhoneOverrides, setContactPhoneOverrides] = useState<Record<string, string>>({})
  const contactPhone = contact?.id ? contactPhoneOverrides[contact.id] || contact?.phone : contact?.phone
  const effectivePhoneId = contactPhone || displayPlatformId

  const [activeTab, setActiveTab] = useState<'details' | 'copilot' | 'cobrowse'>('details')
  
  // Co-Browsing States
  const [coBrowseStatus, setCoBrowseStatus] = useState<'idle' | 'requested' | 'active' | 'declined'>('idle')
  const [coBrowseStream, setCoBrowseStream] = useState<MediaStream | null>(null)
  const coBrowseConnectionRef = useRef<RTCPeerConnection | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)

  useEffect(() => {
    if (!conversation?.id) return

    const cobrowseChannel = supabase.channel(`cobrowse:${conversation.id}`)
      .on('broadcast', { event: 'request_declined' }, () => {
        setCoBrowseStatus('declined')
        setTimeout(() => setCoBrowseStatus('idle'), 5000)
      })
      .on('broadcast', { event: 'screen_share_stopped' }, () => {
        handleEndCoBrowseSession()
      })
      .on('broadcast', { event: 'ice_candidate' }, async (p) => {
        const pc = coBrowseConnectionRef.current;
        if (pc && p.payload.candidate) {
          await pc.addIceCandidate(new RTCIceCandidate(p.payload.candidate));
        }
      })
      .on('broadcast', { event: 'webrtc_offer' }, async (payload) => {
        try {
          setCoBrowseStatus('active')
          const pc = new RTCPeerConnection({
            iceServers: [
              { urls: 'stun:stun.l.google.com:19302' },
              { urls: 'stun:stun1.l.google.com:19302' },
              { urls: 'stun:stun2.l.google.com:19302' },
              { urls: 'stun:stun3.l.google.com:19302' },
              { urls: 'stun:stun4.l.google.com:19302' },
              {
                urls: [
                  "turn:openrelay.metered.ca:80",
                  "turn:openrelay.metered.ca:443",
                  "turn:openrelay.metered.ca:443?transport=tcp"
                ],
                username: "openrelayproject",
                credential: "openrelayproject"
              }
            ]
          });
          coBrowseConnectionRef.current = pc

          pc.ontrack = (event) => {
            if (videoRef.current) {
              videoRef.current.srcObject = event.streams[0];
            }
            setCoBrowseStream(event.streams[0]);
          };

          await pc.setRemoteDescription(new RTCSessionDescription(payload.payload.offer));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);

          await cobrowseChannel.send({
            type: 'broadcast',
            event: 'webrtc_answer',
            payload: { answer }
          });

          pc.onicecandidate = (event) => {
            if (event.candidate) {
              cobrowseChannel.send({
                type: 'broadcast',
                event: 'ice_candidate',
                payload: { candidate: event.candidate }
              });
            }
          };

        } catch (err) {
          console.error("Co-browse WebRTC establish error", err)
          setCoBrowseStatus('idle')
        }
      })
      .subscribe()

    return () => {
      supabase.removeChannel(cobrowseChannel)
    }
  }, [conversation?.id])

  // Safely bind coBrowseStream to video element once mounted in DOM
  useEffect(() => {
    if (coBrowseStatus === 'active' && coBrowseStream && videoRef.current) {
      videoRef.current.srcObject = coBrowseStream;
      videoRef.current.play().catch(e => console.error("Autoplay co-browse stream failed:", e));
    }
  }, [coBrowseStatus, coBrowseStream]);

  const handleRequestCoBrowse = () => {
    if (!conversation?.id) return
    setCoBrowseStatus('requested')
    const cobrowseChannel = supabase.channel(`cobrowse:${conversation.id}`)
    cobrowseChannel.send({
      type: 'broadcast',
      event: 'request_screen_share'
    })
  }

  const handleEndCoBrowseSession = () => {
    if (coBrowseConnectionRef.current) {
      coBrowseConnectionRef.current.close()
      coBrowseConnectionRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
    setCoBrowseStream(null)
    setCoBrowseStatus('idle')

    if (conversation?.id) {
      const cobrowseChannel = supabase.channel(`cobrowse:${conversation.id}`)
      cobrowseChannel.send({
        type: 'broadcast',
        event: 'screen_share_ended'
      })
    }
  }

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
  const [whmcsInvoices, setWhmcsInvoices] = useState<WhmcsInvoice[]>([])
  const [isConvertingTicket, setIsConvertingTicket] = useState(false)
  const [isSendingLink, setIsSendingLink] = useState<number | null>(null)
  const [isLoggingIn, setIsLoggingIn] = useState(false)
  const [crmSearchQuery, setCrmSearchQuery] = useState("")
  const [lastSearchedQuery, setLastSearchedQuery] = useState("")

  const [participants, setParticipants] = useState<any[]>([])
  useEffect(() => {
    if (conversation?.id) {
      getParticipants(conversation.id).then(data => setParticipants(data))
    }
  }, [conversation?.id])

  const [showAllServices, setShowAllServices] = useState(false)
  const [showAllTickets, setShowAllTickets] = useState(false)
  const [showCreateTicket, setShowCreateTicket] = useState(false)
  const [newTicketSubject, setNewTicketSubject] = useState("")
  const [newTicketMessage, setNewTicketMessage] = useState("")
  const [isCreatingTicket, setIsCreatingTicket] = useState(false)
  const [isBanned, setIsBanned] = useState(false)
  const [isBanning, setIsBanning] = useState(false)
  const [portalTab, setPortalTab] = useState<'services' | 'domains' | 'tickets' | 'invoices'>('services')

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
    setCrmSearchQuery("")
    setIsCreatingTicket(false)
  }

  const handleToggleBan = async () => {
    if (!contact?.id) return
    setIsBanning(true)
    try {
      const currentStatus = isBanned ? 'banned' : 'active'
      const updatedContact = await toggleContactBanStatus(contact.id, currentStatus)
      if (updatedContact) {
        setIsBanned(updatedContact.status === 'banned')
      }
    } catch (e) {
      console.error(e)
      alert("Failed to update ban status.")
    } finally {
      setIsBanning(false)
    }
  }

  const handleUnlink = async () => {
    if (contact?.id) {
      await updateContactPhone(contact.id, '');
      setContactPhoneOverrides((current) => ({
        ...current,
        [contact.id]: '',
      }));
    }
    setWhmcsClient(null);
    setWhmcsServices(null);
    setWhmcsTickets([]);
    setWhmcsInvoices([]);
    setLastSearchedQuery('');
    setCrmSearchQuery('');
  }

  const handleManualSearch = async (query: string) => {
    if (!query) return;
    setLastSearchedQuery(query.trim());
    setIsCrmLoading(true);
    try {
      const client = await fetchWhmcsClient(query.trim());
      if (client) {
        setWhmcsClient(client);
        const [services, tickets, invoices] = await Promise.all([
          fetchWhmcsServices(client.id),
          fetchWhmcsTickets(client.id),
          fetchWhmcsUnpaidInvoices(client.id)
        ]);
        setWhmcsServices(services);
        setWhmcsTickets(tickets);
        setWhmcsInvoices(invoices);

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
        setWhmcsInvoices([]);
      }
    } catch (error) {
      console.error("Error in manual search:", error);
    } finally {
      setIsCrmLoading(false);
    }
  }

  const handleConvertToTicket = async () => {
    if (!conversation?.id || !whmcsClient?.id) return;
    setIsConvertingTicket(true);
    try {
      const result = await convertChatToTicket(conversation.id, whmcsClient.id);
      if (result.success) {
        alert(`Chat converted to ticket #${result.ticket?.tid || 'successfully'}!`);
        const tickets = await fetchWhmcsTickets(whmcsClient.id);
        setWhmcsTickets(tickets);
      } else {
        alert("Error: " + result.error);
      }
    } catch (e) {
      alert("Failed to convert chat to ticket.");
    } finally {
      setIsConvertingTicket(false);
    }
  }

  const handleSendInvoiceLink = async (invoiceId: number) => {
    if (!conversation?.id) return;
    setIsSendingLink(invoiceId);
    try {
      const invoiceUrl = `https://my.hostnin.com/viewinvoice.php?id=${invoiceId}`;
      const message = `You have an unpaid invoice. Please pay securely here: ${invoiceUrl}`;
      await replyToConversation(orgId, conversation.id, message, false);
      alert("Invoice link sent successfully!");
    } catch (e) {
      alert("Failed to send invoice link.");
    } finally {
      setIsSendingLink(null);
    }
  }

  useEffect(() => {
    let mounted = true
    
    // Reset CRM state immediately when conversation changes to prevent data leak
    setWhmcsClient(null)
    setWhmcsServices(null)
    setWhmcsTickets([])
    setWhmcsInvoices([])
    setCrmData(null)
    setLastSearchedQuery("")
    
    if (conversation?.id && platformId) {
      const isEmail = effectivePhoneId.includes('@') && !effectivePhoneId.endsWith('@lid')
      const cleanPhone = isEmail ? effectivePhoneId : (effectivePhoneId.startsWith('+') ? effectivePhoneId : `+${effectivePhoneId}`)
      
      // Prefill search query if we have a real phone number or email (avoid raw PSIDs/LIDs)
      if (metadataPhone || contactPhone || (!isLid && !isMessenger && contact?.platform_type !== 'instagram')) {
        setCrmSearchQuery(cleanPhone)
      } else {
        setCrmSearchQuery("")
      }

      const fetchLegacyCrm = async () => {
        setIsCrmLoading(true)
        try {
          // Fetch legacy CRM data (if any)
          const data = await getCrmData(orgId, cleanPhone)
          if (mounted) {
            if (data) setCrmData(data)
            if (contact?.status) {
              setIsBanned(contact.status === 'banned')
            }
          }
        } catch (error) {
          console.error("Error fetching legacy CRM data:", error)
        } finally {
          if (mounted) {
            setIsCrmLoading(false)
          }
        }
      }
      fetchLegacyCrm()
    } else {
      setCrmSearchQuery("")
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
      <div className="flex border-b border-slate-200/80 dark:border-slate-800 px-3 pt-3 h-[72px] items-end bg-slate-50/30 overflow-x-auto hide-scrollbar">
        <button 
          onClick={() => setActiveTab('details')}
          className={`px-3 py-3 text-[13.5px] transition-colors border-b-2 whitespace-nowrap ${activeTab === 'details' ? 'font-semibold border-blue-600 text-slate-900 dark:text-slate-100' : 'font-medium text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 border-transparent'}`}
        >
          Details
        </button>
        <button 
          onClick={() => setActiveTab('copilot')}
          className={`px-3 py-3 text-[13.5px] transition-colors border-b-2 whitespace-nowrap ${activeTab === 'copilot' ? 'font-semibold border-blue-600 text-slate-900 dark:text-slate-100' : 'font-medium text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 border-transparent'}`}
        >
          Portal
        </button>
        <button 
          onClick={() => setActiveTab('cobrowse')}
          className={`px-3 py-3 text-[13.5px] transition-colors border-b-2 whitespace-nowrap ${activeTab === 'cobrowse' ? 'font-semibold border-blue-600 text-slate-900 dark:text-slate-100' : 'font-medium text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 border-transparent'}`}
        >
          Remote
        </button>
        <div className="flex-1"></div>
      </div>

      {activeTab === 'details' && (
        <div className="flex-1 overflow-y-auto bg-white">
          <>
        {/* Contact Header Block (AnyChat Style) */}
        <div className="p-5 border-b border-slate-100 flex items-start gap-3">
          <div className="w-10 h-10 rounded-full flex items-center justify-center font-semibold text-[14px] tracking-wide shrink-0 text-white bg-blue-600">
            {contact?.avatar_url && !(contact?.platform_id?.endsWith('@g.us')) ? (
              <img src={contact.avatar_url} alt={contactName} className="w-full h-full object-cover rounded-full" />
            ) : (
              <img src={`https://ui-avatars.com/api/?name=${encodeURIComponent(contactName)}&background=random&color=fff&length=1`} alt={contactName} className="w-full h-full object-cover rounded-full bg-slate-100" />
            )}
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
                  {contactPhone && contactPhone.includes('@') ? displayId : (contactPhone ? `Phone: ${contactPhone}` : displayId)}
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
          <button 
            onClick={handleToggleBan}
            disabled={isBanning}
            className={`p-2 rounded-lg transition-colors ml-2 self-center shrink-0 ${isBanned ? 'text-white bg-red-500 hover:bg-red-600' : 'text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20'} ${isBanning ? 'opacity-50 cursor-not-allowed' : ''}`} 
            title={isBanned ? "Unban this User" : "Ban this User"}
          >
            {isBanning ? <Loader2 size={18} className="animate-spin" /> : <Ban size={18} />}
          </button>
        </div>

        {/* Core Attributes */}
        <div className="py-4 px-5 border-b border-slate-100 dark:border-slate-800 space-y-4">
          <AssignButton conversation={conversation} orgId={orgId} />
          <SnoozeButton conversation={conversation} orgId={orgId} />
          <div className="flex justify-between items-center">
            <span className="text-[13px] text-slate-500">Team Inbox</span>
            <div className="flex items-center gap-2 text-[13px] text-slate-900 font-medium hover:text-blue-600 cursor-pointer transition-colors">
              <User size={14} className="text-slate-400" /> Admin Support
            </div>
          </div>
        </div>

        {/* Agents Joined Section */}
        <div className="py-4 border-b border-slate-100">
          <div className="flex justify-between items-center px-5 mb-3 cursor-pointer group">
            <h3 className="text-[13px] font-medium text-slate-900 flex items-center gap-2">
              Agents Joined
            </h3>
            <ChevronDown size={14} className="text-slate-400 group-hover:text-slate-600" />
          </div>
          <div className="px-5 space-y-2.5">
            {participants.length > 0 ? (
              participants.map((p, idx) => (
                <div key={idx} className="flex items-center gap-2.5">
                  <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-[10px] font-bold overflow-hidden shrink-0">
                    {p.user?.avatar_url ? (
                      <img src={p.user.avatar_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      p.user?.name?.charAt(0).toUpperCase() || 'A'
                    )}
                  </div>
                  <span className="text-[13px] text-slate-700 truncate">{p.user?.name || 'Agent'}</span>
                </div>
              ))
            ) : (
              <p className="text-[12px] text-slate-500 italic">No agents joined.</p>
            )}
          </div>
        </div>

      </>
        </div>
      )}

      {/* CRM Tab Content */}
      {activeTab === 'copilot' && (
        <div className="flex-1 flex flex-col min-h-0 bg-slate-50/50 dark:bg-slate-900/50">
          
          {/* Minimal Search Box - Fixed at top */}
          {!whmcsClient && (
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
                placeholder="Search Client by email or phone..." 
                className="w-full text-[13px] border border-slate-200 dark:border-slate-700 rounded-lg pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800 focus:outline-none focus:border-blue-500 shadow-sm transition-all"
              />
            </div>
          </div>
          )}

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
                  <div className="flex items-center gap-2">
                    <button onClick={handleUnlink} className="text-slate-400 hover:text-red-500 transition-colors" title="Unlink Client Profile">
                      <X size={14} />
                    </button>
                    <a href={`https://my.hostnin.com/root/clientssummary.php?userid=${whmcsClient.id}`} target="_blank" rel="noreferrer" className="text-slate-400 hover:text-blue-500 transition-colors" title="View in WHMCS">
                      <ExternalLink size={14} />
                    </a>
                  </div>
                </div>
                <h4 className="text-[14px] font-semibold text-slate-900 dark:text-slate-100">{whmcsClient.firstname} {whmcsClient.lastname}</h4>
                <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-0.5 mb-3">{whmcsClient.email}</p>
                <button
                  onClick={async () => {
                    if (isLoggingIn) return;
                    setIsLoggingIn(true);
                    const res = await generateWHMCSSsoToken(whmcsClient.id);
                    setIsLoggingIn(false);
                    if (res.success && res.redirect_url) {
                      window.open(res.redirect_url, '_blank');
                    } else {
                      alert(res.error || "Failed to generate login token");
                    }
                  }}
                  disabled={isLoggingIn}
                  className="w-full flex items-center justify-center gap-2 py-2 text-[13px] font-medium text-blue-600 bg-blue-50 dark:bg-blue-900/30 hover:bg-blue-100 dark:hover:bg-blue-900/50 rounded-lg transition-colors disabled:opacity-50"
                >
                  {isLoggingIn ? <Loader2 size={14} className="animate-spin" /> : <LogIn size={14} />}
                  Login as Client
                </button>
              </div>
            </div>
          ) : (
            <div className="text-center py-6 px-4 border border-dashed border-slate-200 dark:border-slate-700 rounded-xl bg-white/50 dark:bg-slate-800/50">
              <p className="text-[13px] text-slate-500 dark:text-slate-400">
                {lastSearchedQuery
                  ? `No matching account found for ${lastSearchedQuery}.`
                  : `No CRM profile linked. Search by email or name to link.`}
              </p>
            </div>
          )}

          {whmcsClient && (
            <div className="mt-2">
              <div className="flex border-b border-slate-200 dark:border-slate-700 mb-4 overflow-x-auto hide-scrollbar">
                <button 
                  onClick={() => setPortalTab('services')}
                  className={`px-4 py-2 text-[13px] font-medium border-b-2 transition-colors whitespace-nowrap ${portalTab === 'services' ? 'border-blue-500 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300'}`}
                >
                  Services {whmcsServices?.products && `(${whmcsServices.products.filter((p: WhmcsProduct) => p.status === 'Active').length})`}
                </button>
                <button 
                  onClick={() => setPortalTab('domains')}
                  className={`px-4 py-2 text-[13px] font-medium border-b-2 transition-colors whitespace-nowrap ${portalTab === 'domains' ? 'border-blue-500 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300'}`}
                >
                  Domains {whmcsServices?.domains && `(${whmcsServices.domains.filter((d: WhmcsDomain) => d.status === 'Active').length})`}
                </button>
                <button 
                  onClick={() => setPortalTab('tickets')}
                  className={`px-4 py-2 text-[13px] font-medium border-b-2 transition-colors whitespace-nowrap ${portalTab === 'tickets' ? 'border-blue-500 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300'}`}
                >
                  Tickets {whmcsTickets && `(${whmcsTickets.length})`}
                </button>
                <button 
                  onClick={() => setPortalTab('invoices')}
                  className={`px-4 py-2 text-[13px] font-medium border-b-2 transition-colors whitespace-nowrap ${portalTab === 'invoices' ? 'border-blue-500 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300'}`}
                >
                  Invoices {whmcsInvoices && `(${whmcsInvoices.length})`}
                </button>
              </div>

              {portalTab === 'services' && (
                <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 shadow-sm animate-in fade-in slide-in-from-bottom-2 duration-200">
                  <div className="space-y-3">
                    {whmcsServices?.products?.map((product: WhmcsProduct) => (
                      <div key={product.id} className="flex flex-col pb-3 border-b border-slate-100 dark:border-slate-700/50 last:border-0 last:pb-0 relative group">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-[13px] font-medium text-slate-800 dark:text-slate-200 pr-5">{product.name}</p>
                          <a href={`https://my.hostnin.com/root/clientsservices.php?userid=${whmcsClient.id}&id=${product.id}`} target="_blank" rel="noreferrer" className="text-slate-300 hover:text-blue-500 transition-colors opacity-0 group-hover:opacity-100 absolute right-0 top-0" title="View Service">
                            <ExternalLink size={13} />
                          </a>
                        </div>
                        {product.domain && <p className="text-[11.5px] text-blue-600 dark:text-blue-400 font-medium">{product.domain}</p>}
                        <p className={`text-[11px] font-medium mt-1 ${product.status === 'Active' ? 'text-emerald-500' : 'text-slate-500'}`}>{product.status}</p>
                      </div>
                    ))}
                    {!whmcsServices?.products?.length && (
                       <p className="text-[12px] text-slate-500 text-center py-4">No services found.</p>
                    )}
                  </div>
                </div>
              )}

              {portalTab === 'domains' && (
                <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 shadow-sm animate-in fade-in slide-in-from-bottom-2 duration-200">
                  <div className="space-y-3">
                    {whmcsServices?.domains?.map((domain: WhmcsDomain) => (
                      <div key={domain.id} className="flex flex-col pb-3 border-b border-slate-100 dark:border-slate-700/50 last:border-0 last:pb-0 relative group">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-[13px] font-medium text-slate-800 dark:text-slate-200 pr-5">{domain.domainname}</p>
                          <a href={`https://my.hostnin.com/root/clientsdomains.php?userid=${whmcsClient.id}&domainid=${domain.id}`} target="_blank" rel="noreferrer" className="text-slate-300 hover:text-blue-500 transition-colors opacity-0 group-hover:opacity-100 absolute right-0 top-0" title="View Domain">
                            <ExternalLink size={13} />
                          </a>
                        </div>
                        <div className="flex items-center justify-between mt-1">
                          <p className={`text-[11px] font-medium ${domain.status === 'Active' ? 'text-emerald-500' : 'text-slate-500'}`}>{domain.status}</p>
                          <p className="text-[11px] text-slate-400">Exp: {domain.expirydate}</p>
                        </div>
                      </div>
                    ))}
                    {!whmcsServices?.domains?.length && (
                       <p className="text-[12px] text-slate-500 text-center py-4">No domains found.</p>
                    )}
                  </div>
                </div>
              )}

              {portalTab === 'tickets' && (
                <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 shadow-sm animate-in fade-in slide-in-from-bottom-2 duration-200">
                  <div className="flex justify-between items-center mb-3">
                    <h3 className="text-[13px] font-semibold text-slate-900 dark:text-slate-100">Support Tickets</h3>
                    <div className="flex gap-2">
                      <button 
                        onClick={() => setShowCreateTicket(true)}
                        className="text-[11px] font-medium text-blue-600 bg-blue-50 dark:bg-blue-900/30 hover:bg-blue-100 transition-colors px-2 py-1 rounded"
                      >
                        Create New
                      </button>
                    </div>
                  </div>
                  {whmcsTickets?.length > 0 ? (
                    <div className="space-y-3">
                      {whmcsTickets.map((ticket: WhmcsTicket) => (
                        <a 
                          key={ticket.id} 
                          href={`https://my.hostnin.com/root/supporttickets.php?action=view&id=${ticket.id}`} 
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
                    </div>
                  ) : (
                    <p className="text-[12px] text-slate-500 text-center py-4">No recent tickets found.</p>
                  )}
                </div>
              )}

              {portalTab === 'invoices' && (
                <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 shadow-sm animate-in fade-in slide-in-from-bottom-2 duration-200">
                  <div className="flex justify-between items-center mb-3">
                    <h3 className="text-[13px] font-semibold text-slate-900 dark:text-slate-100">Unpaid Invoices</h3>
                  </div>
                  {whmcsInvoices?.length > 0 ? (
                    <div className="space-y-3">
                      {whmcsInvoices.map((invoice: WhmcsInvoice) => (
                        <div key={invoice.id} className="p-2.5 bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-700/50 rounded-lg group">
                          <div className="flex justify-between items-start gap-2 mb-2">
                            <div>
                              <a href={`https://my.hostnin.com/viewinvoice.php?id=${invoice.id}`} target="_blank" rel="noreferrer" className="text-[12px] font-medium text-slate-800 dark:text-slate-200 hover:text-blue-600 flex items-center gap-1.5">
                                Invoice #{invoice.id}
                                <ExternalLink size={10} className="opacity-0 group-hover:opacity-100" />
                              </a>
                              <p className="text-[11px] text-slate-500 mt-0.5">Due: {invoice.duedate}</p>
                            </div>
                            <div className="text-right">
                              <span className="text-[11px] font-bold text-red-600 dark:text-red-400 block mb-1">BDT {invoice.total}</span>
                              <span className="text-[9px] font-bold px-1.5 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded uppercase">{invoice.status}</span>
                            </div>
                          </div>
                          <button 
                            onClick={() => handleSendInvoiceLink(invoice.id)}
                            disabled={isSendingLink === invoice.id}
                            className="w-full text-[11px] font-medium text-blue-600 bg-blue-50 dark:bg-blue-900/30 hover:bg-blue-100 transition-colors px-2 py-1.5 rounded disabled:opacity-50 flex items-center justify-center gap-1.5"
                          >
                            {isSendingLink === invoice.id ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                            Push Link to Chat
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[12px] text-slate-500 text-center py-4">No unpaid invoices found.</p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Agents Joined Section */}
          <div className="mt-6 border-t border-slate-200 dark:border-slate-700 pt-4">
            <h3 className="text-[12px] font-semibold text-slate-500 uppercase tracking-wider mb-3">Agents Joined</h3>
            {participants.length > 0 ? (
              <div className="space-y-2">
                {participants.map((p, idx) => (
                  <div key={idx} className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800/50 p-2 rounded-lg border border-slate-100 dark:border-slate-700/50">
                    <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-[10px] font-bold overflow-hidden shrink-0">
                      {p.user?.avatar_url ? (
                        <img src={p.user.avatar_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        p.user?.name?.charAt(0).toUpperCase() || 'A'
                      )}
                    </div>
                    <div className="flex flex-col min-w-0">
                       <span className="text-[13px] font-medium text-slate-800 dark:text-slate-200 truncate">{p.user?.name || 'Agent'}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[12px] text-slate-500">No agents have joined yet.</p>
            )}
          </div>

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
      )}      {activeTab === 'cobrowse' && (
        <div className="flex-1 flex flex-col min-h-0 bg-slate-50/50 dark:bg-slate-900/50 p-4 space-y-4 overflow-y-auto">

          {(isWhatsApp || isMessenger || isInstagram) ? (
            <div className="flex-1 flex flex-col items-center justify-center p-6 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 space-y-4">
              <div className="w-12 h-12 bg-slate-100 dark:bg-slate-700 text-slate-400 rounded-full flex items-center justify-center">
                <Monitor size={22} className="opacity-60" />
              </div>
              <div className="text-center max-w-xs">
                <p className="text-[13px] font-semibold text-slate-800 dark:text-slate-200">Browsing Not Available</p>
                <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">
                  Browsing is only available for live website chat widget conversations.
                </p>
              </div>
            </div>
          ) : (
            <>
              {coBrowseStatus === 'idle' && (
                <div className="flex-1 flex flex-col items-center justify-center p-6 border border-dashed border-slate-200 dark:border-slate-700 rounded-xl bg-white/50 dark:bg-slate-800/50 space-y-4">
                  <p className="text-[13px] text-slate-500 dark:text-slate-400 text-center">
                    Browsing is inactive. Send a request to initiate screen sharing.
                  </p>
                  <button 
                    onClick={handleRequestCoBrowse}
                    className="px-4 py-2.5 bg-[#0070f3] hover:bg-blue-700 active:scale-95 text-white font-semibold text-[13px] rounded-lg shadow-sm transition-all cursor-pointer"
                  >
                    Request Screen Share
                  </button>
                </div>
              )}

              {coBrowseStatus === 'requested' && (
                <div className="flex-1 flex flex-col items-center justify-center p-6 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 space-y-4">
                  <Loader2 className="animate-spin text-[#0070f3]" size={28} />
                  <div className="text-center">
                    <p className="text-[13px] font-semibold text-slate-800 dark:text-slate-200">Waiting for user approval</p>
                    <p className="text-[11.5px] text-slate-400 mt-0.5">A prompt has been sent to the visitor&apos;s screen.</p>
                  </div>
                  <button 
                    onClick={handleEndCoBrowseSession}
                    className="px-4 py-2 text-[12px] font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700 rounded-lg border border-slate-200 dark:border-slate-700 transition-all cursor-pointer"
                  >
                    Cancel Request
                  </button>
                </div>
              )}

              {coBrowseStatus === 'declined' && (
                <div className="flex-1 flex flex-col items-center justify-center p-6 border border-red-200/50 dark:border-red-900/40 rounded-xl bg-red-50/50 dark:bg-red-950/20 space-y-3">
                  <X className="text-red-500" size={24} />
                  <p className="text-[13px] font-semibold text-red-700 dark:text-red-400 text-center">Request Declined</p>
                  <p className="text-[11.5px] text-red-500/80 text-center">The visitor declined the browsing request.</p>
                </div>
              )}

              {coBrowseStatus === 'active' && (
                <div className="flex-1 flex flex-col min-h-0 border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-900 overflow-hidden relative shadow-lg">
                  <video 
                    ref={videoRef}
                    autoPlay 
                    playsInline 
                    muted
                    className="w-full h-full object-contain bg-slate-950 flex-1 min-h-0"
                  />
                  <div className="absolute bottom-20 left-3 right-3 bg-slate-900/80 backdrop-blur-md border border-slate-800/40 rounded-lg p-2.5 flex items-center justify-between z-10">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></div>
                      <span className="text-[11.5px] font-bold text-white uppercase tracking-wider">Live</span>
                    </div>
                    <div className="flex gap-2">
                      <button 
                        onClick={() => {
                          if (videoRef.current) {
                            if (videoRef.current.requestFullscreen) {
                              videoRef.current.requestFullscreen();
                            } else if ((videoRef.current as any).webkitRequestFullscreen) {
                              (videoRef.current as any).webkitRequestFullscreen();
                            }
                          }
                        }}
                        className="bg-slate-700 hover:bg-slate-600 text-white font-bold text-[10.5px] px-3 py-1.5 rounded-md transition-all shadow-sm cursor-pointer"
                      >
                        Fullscreen
                      </button>
                      <button 
                        onClick={handleEndCoBrowseSession}
                        className="bg-red-500 hover:bg-red-600 text-white font-bold text-[10.5px] px-3 py-1.5 rounded-md transition-all shadow-sm cursor-pointer"
                      >
                        End Session
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
