import { ChevronDown, ExternalLink, User, Sparkles, MessageSquarePlus, AlignLeft, Send, Database, Loader2, Pencil, Check, X, Search, Ban, Monitor, LogIn, RefreshCw, WifiOff, Maximize2, Minimize2, Shield, Clock, Eye, Camera, PictureInPicture2, ZoomIn, ZoomOut, Wifi, Globe, Phone, PhoneCall, Mail, Copy, Server } from "lucide-react"
import { createPeerConnection } from "@/lib/webrtc"
import { supabase } from "@/lib/supabase"
import { useState, useEffect, useRef } from "react"
import { summarizeThread, draftReply } from "@/actions/copilot"
import { getCrmData, getParticipants, toggleContactBanStatus, replyToConversation } from "@/actions/dashboard"
import { fetchWhmcsClient, fetchWhmcsServices, fetchWhmcsTickets, createWhmcsTicket, fetchWhmcsUnpaidInvoices, convertChatToTicket, generateWHMCSSsoToken, generateWHMCSControlPanelSsoToken } from "@/actions/whmcs"
import { unblockIPFast } from "@/actions/server-ops"
import { updateContactName, updateContactPhone, updateContactEmail, updateContactNotes } from "@/actions/contacts"
import AssignButton from "./AssignButton"
import ForwardButton from "./ForwardButton"
import SnoozeButton from "./SnoozeButton"
import type { Contact, ConversationWithDetails, Relation } from "@/lib/types"
import { useInboxStore } from "@/lib/store"

interface WhmcsClient {
  id: number;
  firstname: string;
  lastname: string;
  email: string;
  phonenumber?: string;
  status?: string;
  credit?: string;
}

interface WhmcsProduct {
  id: number;
  name: string;
  domain?: string;
  status: string;
  username?: string;
  password?: string;
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

function ServiceItem({ product, clientId }: { product: WhmcsProduct, clientId: number }) {
  const [expanded, setExpanded] = useState(false);
  const [copiedField, setCopiedField] = useState<'username' | 'password' | null>(null);

  const handleCopy = (text: string, field: 'username' | 'password') => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  return (
    <div className="flex flex-col pb-3 border-b border-slate-100 dark:border-slate-700/50 last:border-0 last:pb-0 relative group">
      <div 
        className="flex items-start justify-between cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex flex-col pr-2">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-[13px] font-medium text-slate-800 dark:text-slate-200">{product.name}</p>
            <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700 px-1.5 py-0.5 rounded-md shadow-sm">
              {product.status}
            </span>
          </div>
          {product.domain && (
            <a 
              href={`http://${product.domain}`} 
              target="_blank" 
              rel="noopener noreferrer" 
              onClick={(e) => e.stopPropagation()} 
              className="text-[11.5px] text-blue-600 hover:text-blue-700 hover:underline dark:text-blue-400 font-medium mt-0.5 inline-block"
            >
              {product.domain}
            </a>
          )}
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <a 
            href={`https://my.hostnin.com/root/clientsservices.php?userid=${clientId}&id=${product.id}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="text-slate-400 hover:text-blue-500 bg-white dark:bg-slate-800 p-1.5 rounded border border-slate-200 dark:border-slate-700 shadow-sm inline-flex items-center justify-center"
            title="Manage Service (Admin)"
          >
            <LogIn size={12} />
          </a>
          <div className="p-1 text-slate-300 dark:text-slate-600">
            <ChevronDown size={14} className={`transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} />
          </div>
        </div>
      </div>
      
      {expanded && (
        <div className="mt-3 p-3 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-100 dark:border-slate-800/80 space-y-2.5 animate-in fade-in zoom-in-95 duration-200">
           <div className="flex items-center justify-between">
             <span className="text-[11.5px] text-slate-500 dark:text-slate-400 font-medium">Username</span>
             <div className="flex items-center gap-2">
               <span className="text-[11.5px] font-mono text-slate-800 dark:text-slate-200">{product.username || 'Not set'}</span>
               {product.username && (
                 <button onClick={() => handleCopy(product.username || '', 'username')} className="text-slate-400 hover:text-blue-500 bg-white dark:bg-slate-800 p-1 rounded border border-slate-200 dark:border-slate-700 shadow-sm" title="Copy Username">
                   {copiedField === 'username' ? <Check size={11} className="text-emerald-500" /> : <Copy size={11} />}
                 </button>
               )}
             </div>
           </div>
           <div className="flex items-center justify-between">
             <span className="text-[11.5px] text-slate-500 dark:text-slate-400 font-medium">Password</span>
             <div className="flex items-center gap-2">
               <span className="text-[11.5px] font-mono text-slate-800 dark:text-slate-200">{product.password ? '••••••••' : 'Not set'}</span>
               {product.password && (
                 <button onClick={() => handleCopy(product.password || '', 'password')} className="text-slate-400 hover:text-blue-500 bg-white dark:bg-slate-800 p-1 rounded border border-slate-200 dark:border-slate-700 shadow-sm" title="Copy Password">
                   {copiedField === 'password' ? <Check size={11} className="text-emerald-500" /> : <Copy size={11} />}
                 </button>
               )}
             </div>
           </div>
        </div>
      )}
    </div>
  )
}

export default function ContactSidebar({ conversation, orgId, messages = [] }: { conversation?: ConversationWithDetails | null, orgId: string, messages?: any[] }) {
  const { triggerDial, convertingTickets, setConvertingTicket } = useInboxStore()
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

  const isRawWidgetId = (val: string | null | undefined) => {
    if (!val) return true;
    if (val.includes('-') && val.length > 20) return true;
    if (val.includes('@lid') || val.includes('@c.us')) return true;
    return false;
  }

  const [contactPhoneOverrides, setContactPhoneOverrides] = useState<Record<string, string>>({})
  const [contactEmailOverrides, setContactEmailOverrides] = useState<Record<string, string>>({})
  const contactEmail = contact?.id ? contactEmailOverrides[contact.id] || contact?.email : contact?.email
  const contactPhone = contact?.id ? contactPhoneOverrides[contact.id] || contact?.phone : contact?.phone
  const effectivePhoneId = contactPhone || displayPlatformId
  const effectiveSearchQuery = contactEmail || contactPhone || displayPlatformId
  const isEmail = effectiveSearchQuery && typeof effectiveSearchQuery === 'string' && effectiveSearchQuery.includes('@') && !effectiveSearchQuery.endsWith('@lid')
  const cleanPhone = effectiveSearchQuery ? (isEmail ? effectiveSearchQuery : (effectiveSearchQuery.startsWith('+') ? effectiveSearchQuery : `+${effectiveSearchQuery}`)) : ""
  const displayValue = contactEmail || (!isRawWidgetId(contactPhone) ? contactPhone : "");

  const isPhone = (text: string) => {
    if (!text) return false
    if (text.includes('@')) return false
    const cleaned = text.replace(/[\s\-+()]/g, '')
    return /^\d+$/.test(cleaned) && cleaned.length >= 7
  }
  const showCallButton = isPhone(effectivePhoneId) && !isInstagram && !isMessenger

  const [activeTab, setActiveTab] = useState<'details' | 'copilot' | 'cobrowse' | 'journey'>('details')
  const [isNotesExpanded, setIsNotesExpanded] = useState(false)
  
  // Co-Browsing States
  const [coBrowseStatus, setCoBrowseStatus] = useState<'idle' | 'requested' | 'active' | 'declined' | 'connection_lost'>('idle')
  const [coBrowseStream, setCoBrowseStream] = useState<MediaStream | null>(null)
  const coBrowseConnectionRef = useRef<RTCPeerConnection | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [sessionDuration, setSessionDuration] = useState(0)
  const sessionTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [videoZoom, setVideoZoom] = useState(1)
  const [isPiP, setIsPiP] = useState(false)
  const [visitorUrl, setVisitorUrl] = useState<string | null>(null)
  const [connectionQuality, setConnectionQuality] = useState<{ resolution: string; fps: number } | null>(null)
  const statsIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [autoReconnectCountdown, setAutoReconnectCountdown] = useState(0)
  const autoReconnectTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)

  const bufferedCandidatesRef = useRef<RTCIceCandidateInit[]>([]);

  const coBrowseChannelRef = useRef<any>(null)

  // Session timer + stats polling for active co-browse
  useEffect(() => {
    if (coBrowseStatus === 'active') {
      setSessionDuration(0)
      setVideoZoom(1)
      sessionTimerRef.current = setInterval(() => setSessionDuration(d => d + 1), 1000)

      // Poll WebRTC stats for resolution + FPS
      statsIntervalRef.current = setInterval(async () => {
        const pc = coBrowseConnectionRef.current;
        if (!pc) return;
        try {
          const stats = await pc.getStats();
          stats.forEach((report: any) => {
            if (report.type === 'inbound-rtp' && report.kind === 'video') {
              const w = report.frameWidth;
              const h = report.frameHeight;
              const fps = report.framesPerSecond || 0;
              if (w && h) {
                setConnectionQuality({ resolution: `${w}x${h}`, fps: Math.round(fps) });
              }
            }
          });
        } catch (e) { /* stats unavailable */ }
      }, 2000)
    } else {
      if (sessionTimerRef.current) {
        clearInterval(sessionTimerRef.current)
        sessionTimerRef.current = null
      }
      if (statsIntervalRef.current) {
        clearInterval(statsIntervalRef.current)
        statsIntervalRef.current = null
      }
      setSessionDuration(0)
      setConnectionQuality(null)
      setVisitorUrl(null)
    }
    return () => {
      if (sessionTimerRef.current) clearInterval(sessionTimerRef.current)
      if (statsIntervalRef.current) clearInterval(statsIntervalRef.current)
    }
  }, [coBrowseStatus])

  // Auto-reconnect countdown when connection lost
  useEffect(() => {
    if (coBrowseStatus === 'connection_lost') {
      setAutoReconnectCountdown(10)
      autoReconnectTimerRef.current = setInterval(() => {
        setAutoReconnectCountdown(prev => {
          if (prev <= 1) {
            // Time's up, auto-reconnect
            clearInterval(autoReconnectTimerRef.current!);
            autoReconnectTimerRef.current = null;
            handleEndCoBrowseSession();
            setTimeout(() => handleRequestCoBrowse(), 300);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      if (autoReconnectTimerRef.current) {
        clearInterval(autoReconnectTimerRef.current)
        autoReconnectTimerRef.current = null
      }
      setAutoReconnectCountdown(0)
    }
    return () => {
      if (autoReconnectTimerRef.current) clearInterval(autoReconnectTimerRef.current)
    }
  }, [coBrowseStatus])

  useEffect(() => {
    const handleFullscreenChange = () => {
      const isCurrentlyFull = !!(
        document.fullscreenElement ||
        (document as any).webkitFullscreenElement ||
        (document as any).mozFullScreenElement ||
        (document as any).msFullscreenElement
      );
      setIsFullscreen(isCurrentlyFull);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);
    document.addEventListener('MSFullscreenChange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
      document.removeEventListener('MSFullscreenChange', handleFullscreenChange);
    };
  }, []);

  const formatDuration = (sec: number) => {
    const m = Math.floor(sec / 60)
    const s = sec % 60
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  const handleScreenshot = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || video.clientWidth;
    canvas.height = video.videoHeight || video.clientHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(async (blob) => {
      if (!blob) return;
      try {
        await navigator.clipboard.write([
          new ClipboardItem({ 'image/png': blob })
        ]);
      } catch {
        // Fallback: download the image
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `screenshot-${Date.now()}.png`;
        a.click();
        URL.revokeObjectURL(url);
      }
    }, 'image/png');
  }

  const handleTogglePiP = async () => {
    if (!videoRef.current) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
        setIsPiP(false);
      } else {
        await videoRef.current.requestPictureInPicture();
        setIsPiP(true);
        videoRef.current.addEventListener('leavepictureinpicture', () => setIsPiP(false), { once: true });
      }
    } catch (e) {
      console.error('PiP not supported:', e);
    }
  }

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
      .on('broadcast', { event: 'visitor_url_update' }, (p) => {
        if (p.payload?.url) setVisitorUrl(p.payload.url);
      })
      .on('broadcast', { event: 'ice_candidate' }, async (p) => {
        const pc = coBrowseConnectionRef.current;
        if (pc && pc.remoteDescription && p.payload.candidate) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(p.payload.candidate));
          } catch (e) {
            console.error("Error adding ice candidate:", e);
          }
        } else if (p.payload.candidate) {
          bufferedCandidatesRef.current.push(p.payload.candidate);
        }
      })
      .on('broadcast', { event: 'webrtc_offer' }, async (payload) => {
        try {
          const pc = createPeerConnection({
            onConnectionFailed: () => {
              console.warn('[Dashboard] Co-browse ICE failed, showing reconnect UI');
              setCoBrowseStatus('connection_lost');
            }
          });
          coBrowseConnectionRef.current = pc

          pc.onconnectionstatechange = () => {
            const state = pc.connectionState;
            console.log("Co-browse WebRTC Connection State:", state);
            if (state === 'failed' || state === 'closed') {
              setCoBrowseStatus('connection_lost');
            }
          };

          pc.ontrack = (event) => {
            const stream = event.streams[0];
            setCoBrowseStream(stream);

            // Bind stream to video element - retry briefly if DOM isn't ready yet
            const bindToVideo = () => {
              if (videoRef.current) {
                videoRef.current.srcObject = stream;
                videoRef.current.play().catch(e => console.error("Autoplay co-browse stream failed:", e));
              } else {
                // Video DOM not mounted yet, retry after next frame
                requestAnimationFrame(bindToVideo);
              }
            };
            bindToVideo();

            // Monitor remote track ending (visitor stopped sharing without broadcast)
            const videoTrack = stream.getVideoTracks()[0];
            if (videoTrack) {
              videoTrack.onended = () => {
                console.warn('[Dashboard] Remote screen share track ended');
                setCoBrowseStatus('connection_lost');
              };
              videoTrack.onmute = () => {
                console.warn('[Dashboard] Remote screen share track muted');
                // Give it 3s to recover before showing lost state
                setTimeout(() => {
                  if (videoTrack.muted && coBrowseConnectionRef.current) {
                    setCoBrowseStatus('connection_lost');
                  }
                }, 3000);
              };
            }
          };

          // Set onicecandidate BEFORE setLocalDescription to catch early candidates
          pc.onicecandidate = (event) => {
            if (event.candidate && coBrowseChannelRef.current) {
              coBrowseChannelRef.current.send({
                type: 'broadcast',
                event: 'ice_candidate',
                payload: { candidate: event.candidate }
              });
            }
          };

          await pc.setRemoteDescription(new RTCSessionDescription(payload.payload.offer));

          // Flush buffered candidates
          if (bufferedCandidatesRef.current.length > 0) {
            for (const candidate of bufferedCandidatesRef.current) {
              try {
                await pc.addIceCandidate(new RTCIceCandidate(candidate));
              } catch (e) {
                console.error("Error adding buffered candidate:", e);
              }
            }
            bufferedCandidatesRef.current = [];
          }

          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);

          // Set status to active AFTER WebRTC setup so video DOM mounts with stream ready
          setCoBrowseStatus('active');

          if (coBrowseChannelRef.current) {
            await coBrowseChannelRef.current.send({
              type: 'broadcast',
              event: 'webrtc_answer',
              payload: { answer }
            });
          }

        } catch (err) {
          console.error("Co-browse WebRTC establish error", err)
          setCoBrowseStatus('idle')
        }
      })
      
    cobrowseChannel.subscribe((status: string) => {
      if (status === 'SUBSCRIBED') {
        coBrowseChannelRef.current = cobrowseChannel;
      }
    })

    return () => {
      supabase.removeChannel(cobrowseChannel)
      coBrowseChannelRef.current = null
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
    if (coBrowseChannelRef.current) {
      coBrowseChannelRef.current.send({
        type: 'broadcast',
        event: 'request_screen_share'
      })
    }
  }

  const handleEndCoBrowseSession = () => {
    bufferedCandidatesRef.current = [];
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
  
  const [contactNotes, setContactNotes] = useState((contact?.metadata as any)?.notes || "")
  const [isSavingNotes, setIsSavingNotes] = useState(false)
  
  useEffect(() => {
    setContactNotes((contact?.metadata as any)?.notes || "")
  }, [contact?.metadata])

  const handleSaveNotes = async () => {
    if (!contact?.id) return
    setIsSavingNotes(true)
    await updateContactNotes(contact.id, contactNotes)
    setIsSavingNotes(false)
  }

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

  const [isEditingUniversal, setIsEditingUniversal] = useState(false)
  const [editedUniversalValue, setEditedUniversalValue] = useState("")

  const handleSaveUniversal = async () => {
    if (!contact?.id) return
    const val = editedUniversalValue.trim()
    
    // Clear both if empty
    if (!val) {
      await updateContactPhone(contact.id, "")
      await updateContactEmail(contact.id, "")
      setContactPhoneOverrides((current) => ({ ...current, [contact.id]: "" }))
      setContactEmailOverrides((current) => ({ ...current, [contact.id]: "" }))
      setIsEditingUniversal(false)
      return
    }

    const isEmailInput = val.includes('@')
    if (isEmailInput) {
      const result = await updateContactEmail(contact.id, val)
      if (result.success) {
        await updateContactPhone(contact.id, "") // clear phone so only email is linked
        setContactEmailOverrides((current) => ({ ...current, [contact.id]: val }))
        setContactPhoneOverrides((current) => ({ ...current, [contact.id]: "" }))
      }
    } else {
      const cleanNum = val.replace(/[^\d+]/g, '')
      const result = await updateContactPhone(contact.id, cleanNum)
      if (result.success) {
        await updateContactEmail(contact.id, "") // clear email so only phone is linked
        setContactPhoneOverrides((current) => ({ ...current, [contact.id]: cleanNum }))
        setContactEmailOverrides((current) => ({ ...current, [contact.id]: "" }))
      }
    }
    setIsEditingUniversal(false)
  }

  // CRM State
  const [crmData, setCrmData] = useState<Record<string, unknown> | null>(null)
  const [isCrmLoading, setIsCrmLoading] = useState(false)
  
  // WHMCS State
  const [whmcsClient, setWhmcsClient] = useState<WhmcsClient | null>(null)
  const [whmcsServices, setWhmcsServices] = useState<{ products: WhmcsProduct[], domains: WhmcsDomain[] } | null>(null)
  const [whmcsTickets, setWhmcsTickets] = useState<WhmcsTicket[]>([])
  const [whmcsInvoices, setWhmcsInvoices] = useState<WhmcsInvoice[]>([])
  const isConvertingTicket = conversation?.id ? convertingTickets[conversation.id] || false : false
  const [isSendingLink, setIsSendingLink] = useState<number | null>(null)
  const [isLoggingIn, setIsLoggingIn] = useState(false)
  const [crmSearchQuery, setCrmSearchQuery] = useState("")
  const [lastSearchedQuery, setLastSearchedQuery] = useState("")

  const [participants, setParticipants] = useState<any[]>([])
  useEffect(() => {
    let active = true
    const conversationId = conversation?.id

    if (conversationId) {
      getParticipants(conversationId).then(data => {
        if (active) setParticipants(data)
      })

      const channel = supabase
        .channel(`participants_sidebar:${conversationId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'conversation_participants',
            filter: `conversation_id=eq.${conversationId}`
          },
          () => {
            getParticipants(conversationId).then(data => {
              if (active) setParticipants(data)
            })
          }
        )
        .subscribe()

      return () => {
        active = false
        supabase.removeChannel(channel)
      }
    } else {
      setParticipants([])
      return () => {
        active = false
      }
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
  
  const [unblockIpInput, setUnblockIpInput] = useState("")
  const [isUnblocking, setIsUnblocking] = useState(false)
  const [unblockResult, setUnblockResult] = useState<{ type: 'success' | 'error', message: string } | null>(null)
  const [isUnblockExpanded, setIsUnblockExpanded] = useState(false)

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
      console.error("Failed to create ticket: " + result.error)
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
      console.error("Failed to update ban status.")
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
      const client = (await fetchWhmcsClient(query.trim())) as any;
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
          await updateContactEmail(contact.id, client.email);
          if (!contact.phone && client.phonenumber && !client.phonenumber.includes('@')) {
            const cleanPhone = client.phonenumber.replace(/\D/g, '');
            if (cleanPhone.length >= 9) {
              await updateContactPhone(contact.id, cleanPhone);
              setContactPhoneOverrides((current) => ({
                ...current,
                [contact.id]: cleanPhone,
              }));
            }
          }
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

  const handleRefreshCrm = async () => {
    if (!whmcsClient?.id) return;
    setIsCrmLoading(true);
    try {
      const [services, tickets, invoices] = await Promise.all([
        fetchWhmcsServices(whmcsClient.id),
        fetchWhmcsTickets(whmcsClient.id),
        fetchWhmcsUnpaidInvoices(whmcsClient.id)
      ]);
      setWhmcsServices(services);
      setWhmcsTickets(tickets);
      setWhmcsInvoices(invoices);
    } catch (e) {
      console.error("Failed to refresh CRM details:", e);
    } finally {
      setIsCrmLoading(false);
    }
  }

  const handleConvertToTicket = async () => {
    if (!conversation?.id || !whmcsClient?.id) return;
    setConvertingTicket(conversation.id, true);
    try {
      const result = await convertChatToTicket(conversation.id, whmcsClient.id);
      if (result.success) {
        const tickets = await fetchWhmcsTickets(whmcsClient.id);
        setWhmcsTickets(tickets);
      } else {
        console.error("Error: " + result.error);
      }
    } catch (e) {
      console.error("Failed to convert chat to ticket.");
    } finally {
      setConvertingTicket(conversation.id, false);
    }
  }

  const handleSendInvoiceLink = async (invoiceId: number) => {
    if (!conversation?.id) return;
    setIsSendingLink(invoiceId);
    try {
      const invoiceUrl = `https://my.hostnin.com/viewinvoice.php?id=${invoiceId}`;
      const message = `You have an unpaid invoice. Please pay securely here: ${invoiceUrl}`;
      await replyToConversation(orgId, conversation.id, message, false);
    } catch (e) {
      console.error("Failed to send invoice link.");
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
    
    if (conversation?.id && platformId && platformId !== "No number") {
      // Prefill search query if we have a real phone number or email (avoid raw PSIDs/LIDs)
      if (metadataPhone || contactPhone || (!isLid && !isMessenger && contact?.platform_type !== 'instagram')) {
        setCrmSearchQuery(cleanPhone)
      } else {
        setCrmSearchQuery("")
      }

      const loadAllCrmData = async () => {
        setIsCrmLoading(true)
        try {
          const isRealEmail = cleanPhone.includes('@') && !cleanPhone.endsWith('@lid')
          const digitsOnly = cleanPhone.replace(/\D/g, '')
          const isValidPhone = digitsOnly.length >= 8
          const isWhatsApp = contact?.platform_type === 'whatsapp'

          const promises: Promise<any>[] = [
            getCrmData(orgId, cleanPhone)
          ]

          const shouldFetchWhmcs = isWhatsApp || isRealEmail || isValidPhone
          if (shouldFetchWhmcs) {
            setLastSearchedQuery(cleanPhone.trim())
            promises.push(fetchWhmcsClient(cleanPhone.trim()))
          }

          const [legacyData, whmcsClientResult] = await Promise.all(promises)

          if (mounted) {
            if (legacyData) setCrmData(legacyData)
            if (contact?.status) {
              setIsBanned(contact.status === 'banned')
            }
          }

          if (shouldFetchWhmcs && whmcsClientResult) {
            if (mounted) {
              setWhmcsClient(whmcsClientResult)
            }
            
            // Auto-bind in DB if contact has no email linked yet
            if (contact?.id && !contact?.email && whmcsClientResult.email) {
              updateContactEmail(contact.id, whmcsClientResult.email);
              if (!contact?.phone && whmcsClientResult.phonenumber && !whmcsClientResult.phonenumber.includes('@')) {
                const cleanNum = whmcsClientResult.phonenumber.replace(/\D/g, '');
                if (cleanNum.length >= 9) {
                  updateContactPhone(contact.id, cleanNum);
                }
              }
            }

            const [services, tickets, invoices] = await Promise.all([
              fetchWhmcsServices(whmcsClientResult.id),
              fetchWhmcsTickets(whmcsClientResult.id),
              fetchWhmcsUnpaidInvoices(whmcsClientResult.id)
            ])
            if (mounted) {
              setWhmcsServices(services)
              setWhmcsTickets(tickets)
              setWhmcsInvoices(invoices)
            }
          } else if (mounted) {
            setWhmcsClient(null)
            setWhmcsServices(null)
            setWhmcsTickets([])
            setWhmcsInvoices([])
          }
        } catch (error) {
          console.error("Error loading CRM/WHMCS data:", error)
        } finally {
          if (mounted) {
            setIsCrmLoading(false)
          }
        }
      }
      loadAllCrmData()
    } else {
      setCrmSearchQuery("")
    }
    
    return () => { mounted = false }
  }, [conversation?.id, cleanPhone, orgId, contact?.status, contact?.platform_type])

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
    <div className="hidden md:flex flex-col h-full w-[260px] lg:w-[280px] xl:w-[340px] shrink-0 bg-white dark:bg-[#111b21] border-l border-slate-200 dark:border-[#222e35] z-10 overflow-hidden">
      <div className="grid grid-cols-4 border-b border-slate-200/80 dark:border-[#222e35] h-[52px] bg-slate-50/30 dark:bg-transparent w-full">
        <button 
          onClick={() => setActiveTab('details')}
          className={`py-3 text-[12.5px] transition-colors border-b-2 text-center ${activeTab === 'details' ? 'font-semibold border-blue-600 dark:border-[#00a884] text-slate-900 dark:text-[#e9edef]' : 'font-medium text-slate-500 hover:text-slate-700 dark:text-[#8696a0] dark:hover:text-[#e9edef] border-transparent'}`}
        >
          Details
        </button>
        <button 
          onClick={() => setActiveTab('copilot')}
          className={`py-3 text-[12.5px] transition-colors border-b-2 text-center ${activeTab === 'copilot' ? 'font-semibold border-blue-600 dark:border-[#00a884] text-slate-900 dark:text-[#e9edef]' : 'font-medium text-slate-500 hover:text-slate-700 dark:text-[#8696a0] dark:hover:text-[#e9edef] border-transparent'}`}
        >
          Portal
        </button>
        <button 
          onClick={() => setActiveTab('cobrowse')}
          className={`py-3 text-[12.5px] transition-colors border-b-2 text-center ${activeTab === 'cobrowse' ? 'font-semibold border-blue-600 dark:border-[#00a884] text-slate-900 dark:text-[#e9edef]' : 'font-medium text-slate-500 hover:text-slate-700 dark:text-[#8696a0] dark:hover:text-[#e9edef] border-transparent'}`}
        >
          Remote
        </button>
        <button 
          onClick={() => setActiveTab('journey')}
          className={`py-3 text-[12.5px] transition-colors border-b-2 text-center ${activeTab === 'journey' ? 'font-semibold border-blue-600 dark:border-[#00a884] text-slate-900 dark:text-[#e9edef]' : 'font-medium text-slate-500 hover:text-slate-700 dark:text-[#8696a0] dark:hover:text-[#e9edef] border-transparent'}`}
        >
          Journey
        </button>
      </div>

      {activeTab === 'details' && (
        <div className="flex-1 overflow-y-auto bg-white dark:bg-[#111b21]">
          <>
        {/* Contact Header Block (AnyChat Style) */}
        <div className="p-5 border-b border-slate-100 dark:border-[#222e35] flex items-start gap-3">
          <div className="w-10 h-10 rounded-full flex items-center justify-center font-semibold text-[14px] tracking-wide shrink-0 text-white bg-blue-600">
            {contact?.avatar_url && !(contact?.platform_id?.endsWith('@g.us')) ? (
              <img src={contact.avatar_url} alt={contactName} className="w-full h-full object-cover rounded-full" />
            ) : (
              <img src={`https://ui-avatars.com/api/?name=${encodeURIComponent(contactName)}&background=random&color=fff&length=1`} alt={contactName} className="w-full h-full object-cover rounded-full bg-slate-100 dark:bg-[#202c33]" />
            )}
          </div>
          <div className="flex-1 min-w-0 flex flex-col justify-center">
            {isEditingName ? (
              <div className="flex items-center gap-1.5 mb-0.5">
                <input 
                  type="text" 
                  value={editedName} 
                  onChange={(e) => setEditedName(e.target.value)}
                  className="text-[14px] font-semibold text-slate-900 dark:text-[#e9edef] border border-slate-300 dark:border-[#2a3942] bg-white dark:bg-[#202c33] rounded px-1.5 py-0.5 w-full focus:outline-none focus:border-blue-500"
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
                <h2 className="text-[15px] font-semibold text-slate-900 dark:text-[#e9edef] truncate">{contactName}</h2>
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
            
            {/* Universal CRM Link Row */}
            {isEditingUniversal ? (
              <div className="flex items-center gap-1.5 mt-1.5">
                <Database size={12} className="text-slate-400 shrink-0" />
                <input 
                  value={editedUniversalValue} 
                  onChange={(e) => setEditedUniversalValue(e.target.value)}
                  placeholder="Email or phone number..."
                  className="text-[12.5px] text-slate-700 dark:text-[#d1d7db] border border-slate-300 dark:border-[#2a3942] bg-white dark:bg-[#202c33] rounded px-1.5 py-0.5 w-full focus:outline-none focus:border-blue-500"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveUniversal()
                    if (e.key === 'Escape') {
                      setIsEditingUniversal(false)
                      setEditedUniversalValue(displayValue || "")
                    }
                  }}
                />
                <button onClick={handleSaveUniversal} className="text-emerald-600 hover:text-emerald-700 p-0.5"><Check size={14} strokeWidth={2.5} /></button>
                <button onClick={() => { setIsEditingUniversal(false); setEditedUniversalValue(displayValue || "") }} className="text-slate-400 hover:text-slate-600 p-0.5"><X size={14} strokeWidth={2.5} /></button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 mt-1 group">
                <div className="flex items-center gap-1.5 min-w-0">
                  {showCallButton && displayValue && !displayValue.includes('@') && (() => {
                    const hasCallAlert = isWhatsApp && conversation?.tags?.includes('alert') && conversation?.tags?.includes('automation');
                    
                    const handleCallClick = async () => {
                      triggerDial(effectivePhoneId);
                      if (hasCallAlert && conversation?.id) {
                        const cleanedTags = (conversation.tags || []).filter((t: string) => t !== 'alert' && t !== 'automation');
                        await supabase.from('conversations')
                          .update({ tags: cleanedTags })
                          .eq('id', conversation.id);
                      }
                    };

                    return (
                      <div className="relative group/call">
                        <button 
                          onClick={handleCallClick}
                          className={`transition-colors shrink-0 cursor-pointer w-5 h-5 flex items-center justify-center rounded-md ${
                            hasCallAlert 
                              ? 'text-emerald-500 bg-emerald-500/10 hover:bg-emerald-500/20' 
                              : 'text-slate-500 hover:text-blue-600 hover:bg-slate-100 dark:hover:bg-slate-800'
                          }`}
                          title="Call via Dialer"
                        >
                          <PhoneCall size={13} strokeWidth={2} />
                        </button>
                        {hasCallAlert && (
                          <>
                            <span className="absolute -top-0.5 -right-0.5 flex h-1.5 w-1.5 pointer-events-none">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
                            </span>
                            
                            <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-slate-950 dark:bg-slate-900 text-white text-[11px] font-medium px-2.5 py-1.5 rounded-lg shadow-xl border border-slate-800 whitespace-nowrap z-50 pointer-events-none transition-all scale-0 group-hover/call:scale-100 origin-bottom duration-150">
                              This person just called on WhatsApp. Call back now.
                              <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-950 dark:border-t-slate-900" />
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })()}
                  <Database size={12} className="text-slate-400 shrink-0" />
                  <p className="text-[12.5px] text-slate-500 dark:text-[#8696a0] truncate min-w-0">
                    {displayValue ? displayValue : <span className="italic text-slate-400 dark:text-slate-600">Link email or phone</span>}
                  </p>
                </div>
                <button 
                  onClick={() => {
                    setEditedUniversalValue(displayValue || "")
                    setIsEditingUniversal(true)
                  }} 
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-400 hover:text-blue-600 cursor-pointer"
                  title="Link Email or Phone"
                >
                  <Pencil size={10} strokeWidth={2.5} />
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
          <ForwardButton conversation={conversation} orgId={orgId} />
        </div>

        {/* Agents Joined Section */}
        <div className="py-4 border-b border-slate-100 dark:border-[#222e35]">
          <div className="flex justify-between items-center px-5 mb-3 cursor-pointer group">
            <h3 className="text-[13px] font-medium text-slate-900 dark:text-[#e9edef] flex items-center gap-2">
              Agents Joined
            </h3>
            <ChevronDown size={14} className="text-slate-400 dark:text-[#8696a0] group-hover:text-slate-600 dark:group-hover:text-[#e9edef]" />
          </div>
          <div className="px-5 space-y-2.5">
            {participants.length > 0 ? (
              participants.map((p, idx) => (
                <div key={idx} className="flex items-center gap-2.5">
                  <div className="w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center text-[10px] font-bold overflow-hidden shrink-0">
                    {p.user?.avatar_url ? (
                      <img src={p.user.avatar_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      p.user?.name?.charAt(0).toUpperCase() || 'A'
                    )}
                  </div>
                  <span className="text-[13px] text-slate-700 dark:text-[#d1d7db] truncate">{p.user?.name || 'Agent'}</span>
                </div>
              ))
            ) : (
              <p className="text-[12px] text-slate-500 dark:text-[#8696a0] italic">No agents joined.</p>
            )}
          </div>
        </div>

        {/* Server Diagnostics Section */}
        <div className="py-4 border-b border-slate-100 dark:border-[#222e35]">
          <div className="flex justify-between items-center px-5 mb-3 cursor-pointer group">
            <h3 className="text-[13px] font-medium text-slate-900 dark:text-[#e9edef] flex items-center gap-2">
              Server Diagnostics
            </h3>
            <ChevronDown size={14} className="text-slate-400 dark:text-[#8696a0] group-hover:text-slate-600 dark:group-hover:text-[#e9edef]" />
          </div>
          <div className="px-5 space-y-2.5">
            {/* Firewall IP Unblock Card (Expandable) */}
            <div className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl border border-slate-200 dark:border-slate-700">
              <button 
                onClick={() => setIsUnblockExpanded(!isUnblockExpanded)}
                className="w-full flex justify-between items-center text-[12px] font-medium text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
              >
                <span className="flex items-center gap-1.5">
                  <Shield size={13} />
                  Firewall IP Unblock
                </span>
                <ChevronDown size={13} className={`transition-transform duration-200 ${isUnblockExpanded ? 'rotate-180' : ''}`} />
              </button>
              
              {isUnblockExpanded && (
                <div className="mt-2.5 space-y-2 animate-in fade-in slide-in-from-top-1 duration-150">
                  <div className="flex gap-2">
                    <input 
                      type="text" 
                      value={unblockIpInput}
                      onChange={(e) => setUnblockIpInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          if (!unblockIpInput.trim() || isUnblocking) return;
                          setIsUnblocking(true);
                          setUnblockResult(null);
                          unblockIPFast(unblockIpInput.trim()).then((res: any) => {
                            if (res && res.result === 'success') {
                              setUnblockResult({ type: 'success', message: res.message || 'Unblocked!' });
                              setUnblockIpInput('');
                            } else {
                              setUnblockResult({ type: 'error', message: res?.message || 'Failed to unblock IP' });
                            }
                          }).catch((err) => {
                            console.error(err);
                            setUnblockResult({ type: 'error', message: 'Failed to unblock IP' });
                          }).finally(() => {
                            setIsUnblocking(false);
                            setTimeout(() => setUnblockResult(null), 8000);
                          });
                        }
                      }}
                      placeholder="Enter IP Address..." 
                      className="w-full text-[12px] border border-slate-300 dark:border-slate-600 rounded-lg px-2.5 py-1.5 bg-white dark:bg-slate-900 focus:outline-none focus:border-blue-500"
                    />
                    <button 
                      onClick={async () => {
                        if (!unblockIpInput.trim() || isUnblocking) return;
                        setIsUnblocking(true);
                        setUnblockResult(null);
                        try {
                          const res = await unblockIPFast(unblockIpInput.trim()) as any;
                          if (res && res.result === 'success') {
                            setUnblockResult({ type: 'success', message: res.message || 'Unblocked!' });
                            setUnblockIpInput('');
                          } else {
                            setUnblockResult({ type: 'error', message: res?.message || 'Failed to unblock IP' });
                          }
                        } catch (e) {
                          setUnblockResult({ type: 'error', message: 'An error occurred' });
                        } finally {
                          setIsUnblocking(false);
                          setTimeout(() => setUnblockResult(null), 8000);
                        }
                      }}
                      disabled={isUnblocking || !unblockIpInput.trim()}
                      className="bg-slate-900 dark:bg-slate-200 text-white dark:text-slate-900 text-[12px] font-medium px-3 py-1.5 rounded-lg whitespace-nowrap hover:bg-slate-800 dark:hover:bg-slate-300 transition-colors disabled:opacity-50"
                    >
                      {isUnblocking ? <Loader2 size={14} className="animate-spin" /> : 'Unblock'}
                    </button>
                  </div>
                  {unblockResult && (
                    <p className={`text-[11.5px] mt-1.5 font-medium ${unblockResult.type === 'success' ? 'text-blue-600 dark:text-blue-400' : 'text-slate-500 dark:text-slate-400'}`}>
                      {unblockResult.type === 'success' ? '✓' : '✗'} {unblockResult.message}
                    </p>
                  )}
                </div>
              )}
            </div>
            
            {/* Sticky Notes Card (Expandable) */}
            <div className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl border border-slate-200 dark:border-slate-700">
              <button 
                onClick={() => setIsNotesExpanded(!isNotesExpanded)}
                className="w-full flex justify-between items-center text-[12px] font-medium text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
              >
                <span className="flex items-center gap-1.5">
                  <AlignLeft size={13} />
                  Sticky Notes
                </span>
                <div className="flex items-center gap-1.5">
                  {isSavingNotes && <Loader2 size={11} className="animate-spin text-slate-400" />}
                  <ChevronDown size={13} className={`transition-transform duration-200 ${isNotesExpanded ? 'rotate-180' : ''}`} />
                </div>
              </button>
              
              {isNotesExpanded && (
                <div className="mt-2.5 animate-in fade-in slide-in-from-top-1 duration-150">
                  <textarea
                    value={contactNotes}
                    onChange={(e) => setContactNotes(e.target.value)}
                    onBlur={handleSaveNotes}
                    placeholder="Add context about this customer (visible to all agents)..."
                    className="w-full h-24 text-[12.5px] p-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 focus:outline-none focus:border-blue-500 rounded-lg resize-none shadow-sm transition-colors"
                  />
                </div>
              )}
            </div>
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
                  <div className="flex items-center gap-2.5">
                    <button 
                      onClick={handleRefreshCrm} 
                      disabled={isCrmLoading}
                      className="text-slate-400 hover:text-blue-500 transition-colors disabled:opacity-50" 
                      title="Refresh CRM Data"
                    >
                      <RefreshCw size={13} className={isCrmLoading ? "animate-spin text-blue-500" : ""} />
                    </button>
                    <button onClick={handleUnlink} className="text-slate-400 hover:text-red-500 transition-colors" title="Unlink Client Profile">
                      <X size={14} />
                    </button>
                    <a href={`https://my.hostnin.com/root/clientssummary.php?userid=${whmcsClient.id}`} target="_blank" rel="noreferrer" className="text-slate-400 hover:text-blue-500 transition-colors" title="View in WHMCS">
                      <ExternalLink size={14} />
                    </a>
                  </div>
                </div>
                <div className="flex justify-between items-start mb-3">
                  <div className="min-w-0 pr-3">
                    <h4 className="text-[14px] font-semibold text-slate-900 dark:text-slate-100 truncate">{whmcsClient.firstname} {whmcsClient.lastname}</h4>
                    <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">{whmcsClient.email}</p>
                  </div>
                  {whmcsClient.credit !== undefined && (
                    <div className="shrink-0 flex flex-col items-end justify-center bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 px-3 py-1.5 rounded-lg whitespace-nowrap">
                      <span className="text-[9.5px] uppercase font-bold tracking-wider text-slate-400 dark:text-slate-500 mb-0.5">Credit</span>
                      <span className="text-[12.5px] font-bold text-slate-700 dark:text-slate-300">
                        {whmcsClient.credit}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-6 px-4 border border-dashed border-slate-200 dark:border-slate-700 rounded-xl bg-white/50 dark:bg-slate-800/50">
              <p className="text-[13px] text-slate-500 dark:text-slate-400">
                {lastSearchedQuery
                  ? `No matching account found for ${lastSearchedQuery}.`
                  : `No CRM profile linked. Search to link.`}
              </p>
            </div>
          )}

          {whmcsClient && (
            <div className="mt-2">
              <div className="flex w-full justify-between border-b border-slate-200 dark:border-slate-700 mb-4">
                <button 
                  onClick={() => setPortalTab('services')}
                  className={`px-1 py-2 text-[11px] md:text-[12px] flex-1 text-center font-medium border-b-2 transition-colors ${portalTab === 'services' ? 'border-blue-500 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300'}`}
                >
                  Services {whmcsServices?.products && `(${whmcsServices.products.filter((p: WhmcsProduct) => p.status === 'Active').length})`}
                </button>
                <button 
                  onClick={() => setPortalTab('domains')}
                  className={`px-1 py-2 text-[11px] md:text-[12px] flex-1 text-center font-medium border-b-2 transition-colors ${portalTab === 'domains' ? 'border-blue-500 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300'}`}
                >
                  Domains {whmcsServices?.domains && `(${whmcsServices.domains.filter((d: WhmcsDomain) => d.status === 'Active').length})`}
                </button>
                <button 
                  onClick={() => setPortalTab('tickets')}
                  className={`px-1 py-2 text-[11px] md:text-[12px] flex-1 text-center font-medium border-b-2 transition-colors ${portalTab === 'tickets' ? 'border-blue-500 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300'}`}
                >
                  Tickets {whmcsTickets && `(${whmcsTickets.length})`}
                </button>
                <button 
                  onClick={() => setPortalTab('invoices')}
                  className={`px-1 py-2 text-[11px] md:text-[12px] flex-1 text-center font-medium border-b-2 transition-colors ${portalTab === 'invoices' ? 'border-blue-500 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300'}`}
                >
                  Invoices {whmcsInvoices && `(${whmcsInvoices.length})`}
                </button>
              </div>

              {portalTab === 'services' && (
                <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 shadow-sm animate-in fade-in slide-in-from-bottom-2 duration-200">
                  <div className="space-y-3">
                    {isCrmLoading ? (
                      <div className="space-y-4 animate-pulse">
                        <div className="pb-3 border-b border-slate-100 dark:border-slate-700/50 last:border-0 last:pb-0">
                          <div className="h-4 bg-slate-200 dark:bg-slate-750 rounded w-2/3 mb-2"></div>
                          <div className="h-3 bg-slate-100 dark:bg-slate-700/40 rounded w-1/2"></div>
                        </div>
                        <div className="pb-3">
                          <div className="h-4 bg-slate-200 dark:bg-slate-750 rounded w-1/2 mb-2"></div>
                          <div className="h-3 bg-slate-100 dark:bg-slate-700/40 rounded w-1/3"></div>
                        </div>
                      </div>
                    ) : (
                      <>
                        {whmcsServices?.products?.map((product: WhmcsProduct) => (
                          <ServiceItem key={product.id} product={product} clientId={whmcsClient.id} />
                        ))}
                        {!whmcsServices?.products?.length && (
                           <p className="text-[12px] text-slate-500 text-center py-4">No services found.</p>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )}

              {portalTab === 'domains' && (
                <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 shadow-sm animate-in fade-in slide-in-from-bottom-2 duration-200">
                  <div className="space-y-3">
                    {isCrmLoading ? (
                      <div className="space-y-4 animate-pulse">
                        <div className="pb-3 border-b border-slate-100 dark:border-slate-700/50 last:border-0 last:pb-0">
                          <div className="h-4 bg-slate-200 dark:bg-slate-750 rounded w-3/4 mb-2"></div>
                          <div className="h-3 bg-slate-100 dark:bg-slate-700/40 rounded w-1/3"></div>
                        </div>
                      </div>
                    ) : (
                      <>
                        {whmcsServices?.domains?.map((domain: WhmcsDomain) => (
                          <div key={domain.id} className="flex flex-col pb-3 border-b border-slate-100 dark:border-slate-700/50 last:border-0 last:pb-0 relative group">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-center gap-1.5">
                                <p className="text-[13px] font-medium text-slate-800 dark:text-slate-200">{domain.domainname}</p>
                                <button
                                  onClick={() => navigator.clipboard.writeText(domain.domainname)}
                                  className="text-slate-400 hover:text-blue-600 transition-colors opacity-0 group-hover:opacity-100"
                                  title="Copy Domain"
                                >
                                  <Copy size={13} />
                                </button>
                              </div>
                              <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                                <a
                                  href={`https://my.hostnin.com/root/clientsdomains.php?userid=${whmcsClient.id}&domainid=${domain.id}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-slate-400 hover:text-blue-500 bg-white dark:bg-slate-800 p-1 rounded border border-slate-200 dark:border-slate-700 shadow-sm inline-flex items-center justify-center"
                                  title="Manage Domain (Admin)"
                                >
                                  <LogIn size={12} />
                                </a>
                              </div>
                            </div>
                            <div className="flex items-center justify-between mt-1">
                              <span className="inline-block text-[10px] font-semibold text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700 px-1.5 py-0.5 rounded-md shadow-sm">{domain.status}</span>
                              <p className="text-[11px] text-slate-400">Exp: {domain.expirydate}</p>
                            </div>
                          </div>
                        ))}
                        {!whmcsServices?.domains?.length && (
                           <p className="text-[12px] text-slate-500 text-center py-4">No domains found.</p>
                        )}
                      </>
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
                  {isCrmLoading ? (
                    <div className="space-y-3 animate-pulse">
                      <div className="h-14 bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-700/50 rounded-lg"></div>
                      <div className="h-14 bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-700/50 rounded-lg"></div>
                    </div>
                  ) : whmcsTickets?.length > 0 ? (
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
                            <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700 px-1.5 py-0.5 rounded-md shadow-sm shrink-0">{ticket.status}</span>
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
                  {isCrmLoading ? (
                    <div className="space-y-3 animate-pulse">
                      <div className="h-24 bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-700/50 rounded-lg"></div>
                    </div>
                  ) : whmcsInvoices?.length > 0 ? (
                    <div className="space-y-3">
                      {whmcsInvoices.map((invoice: WhmcsInvoice) => (
                        <div key={invoice.id} className="p-2.5 bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-700/50 rounded-lg group">
                          <div className="flex justify-between items-start gap-2 mb-2">
                            <div>
                              <div className="flex items-center gap-1.5">
                                <a href={`https://my.hostnin.com/viewinvoice.php?id=${invoice.id}`} target="_blank" rel="noreferrer" className="text-[12px] font-medium text-slate-800 dark:text-slate-200 hover:text-blue-600 flex items-center gap-1.5">
                                  Invoice #{invoice.id}
                                  <ExternalLink size={10} className="opacity-0 group-hover:opacity-100" />
                                </a>
                                <button
                                  onClick={() => {
                                    navigator.clipboard.writeText(`https://my.hostnin.com/viewinvoice.php?id=${invoice.id}`);
                                  }}
                                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 p-1 rounded transition-colors"
                                  title="Copy Invoice Link"
                                >
                                  <Copy size={11} />
                                </button>
                              </div>
                              <p className="text-[11px] text-slate-500 mt-0.5">Due: {invoice.duedate}</p>
                            </div>
                            <div className="text-right">
                              <span className="text-[11px] font-bold text-red-600 dark:text-red-400 block mb-1">BDT {invoice.total}</span>
                              <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700 px-1.5 py-0.5 rounded-md shadow-sm">{invoice.status}</span>
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


      {activeTab === 'journey' && (
        <div className="flex-1 overflow-y-auto bg-slate-50/50 dark:bg-slate-900/50 p-4">
          <div className="flex items-center gap-2 mb-4">
            <h3 className="text-[13px] font-medium text-slate-900 dark:text-slate-100">User Journey</h3>
          </div>
          
          <div className="space-y-0 py-2">
            {(() => {
              const journeyEvents = messages.filter((m: any) => m.sender_type === 'system' && (m.metadata?.event === 'page_view' || m.content.startsWith('Viewed:')));
              
              if (journeyEvents.length === 0) {
                return (
                  <div className="mt-2 p-6 bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 rounded-xl flex flex-col items-center justify-center text-center space-y-3 shadow-sm">
                    <div className="w-12 h-12 bg-slate-50 dark:bg-slate-800 rounded-full flex items-center justify-center">
                      <Globe size={24} className="text-slate-300 dark:text-slate-600" strokeWidth={1.5} />
                    </div>
                    <div>
                      <p className="text-[13px] font-semibold text-slate-700 dark:text-slate-300">No journey events yet</p>
                      <p className="text-[12px] text-slate-500 mt-1 leading-relaxed">Live page navigation events will appear<br/>here once the visitor navigates your site.</p>
                    </div>
                  </div>
                );
              }

              return journeyEvents.map((msg: any, index: number) => {
                const ua = msg.metadata?.userAgent || '';
                let browser = '';
                if (ua.includes('Chrome')) browser = 'Chrome';
                else if (ua.includes('Firefox')) browser = 'Firefox';
                else if (ua.includes('Safari')) browser = 'Safari';
                else if (ua.includes('Edge')) browser = 'Edge';
                
                const isDesktop = !ua.includes('Mobile');
                
                // Calculate time spent (difference with next event)
                let timeSpentStr = '';
                if (index < journeyEvents.length - 1) {
                  const nextEvent = journeyEvents[index + 1];
                  const diff = new Date(nextEvent.created_at).getTime() - new Date(msg.created_at).getTime();
                  if (diff > 0) {
                    const secs = Math.floor(diff / 1000);
                    if (secs < 60) timeSpentStr = `${secs}s`;
                    else {
                      const mins = Math.floor(secs / 60);
                      const remSecs = secs % 60;
                      timeSpentStr = `${mins}m ${remSecs}s`;
                    }
                  } else {
                    timeSpentStr = '< 1s';
                  }
                } else {
                  timeSpentStr = 'Current page';
                }
                
                return (
                <div key={msg.id} className="relative group pl-6">
                  {/* Beautiful timeline line */}
                  {index < journeyEvents.length - 1 && (
                    <div className="absolute left-[9px] top-[28px] bottom-[-16px] w-[2px] bg-gradient-to-b from-blue-500/30 to-blue-500/10 dark:from-[#00a884]/30 dark:to-transparent rounded-full z-0"></div>
                  )}
                  {/* Node dot */}
                  <div className={`absolute left-[5px] top-3.5 w-[10px] h-[10px] rounded-full ring-4 shadow-sm z-10 ${
                    index === journeyEvents.length - 1 
                      ? 'bg-blue-500 dark:bg-[#00a884] ring-blue-50 dark:ring-slate-900 animate-pulse'
                      : 'bg-slate-300 dark:bg-slate-600 ring-slate-50 dark:ring-slate-900'
                  }`}></div>
                  
                  <div className="bg-white dark:bg-slate-800/80 border border-slate-100 dark:border-slate-700/60 p-3.5 rounded-[14px] shadow-sm mb-4 transition-all hover:border-blue-200 dark:hover:border-[#00a884]/50 hover:shadow-md">
                    <p className="text-[13px] font-semibold text-slate-800 dark:text-slate-200 leading-snug line-clamp-2" title={msg.content}>
                      {msg.content.replace('Viewed: ', '')}
                    </p>
                    
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-2 mt-2.5">
                      <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                        <Clock size={12} className="text-slate-400 dark:text-slate-500" />
                        {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                      
                      {timeSpentStr && (
                        <div className={`flex items-center gap-1.5 text-[10.5px] font-semibold px-2 py-0.5 rounded-md ${
                          index === journeyEvents.length - 1 
                            ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-800/30' 
                            : 'bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700/50'
                        }`}>
                          {timeSpentStr}
                        </div>
                      )}
                      
                      {browser && index === 0 && (
                        <div className="flex items-center gap-1.5 text-[10.5px] font-medium text-slate-500 dark:text-slate-400 px-2 py-0.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/50 rounded-md">
                          <Monitor size={12} className="text-slate-400 dark:text-slate-500" />
                          {browser} {isDesktop ? 'Desktop' : 'Mobile'}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
              });
            })()}
          </div>
        </div>
      )}

      {activeTab === 'cobrowse' && (
        <div className="flex-1 flex flex-col min-h-0 bg-gradient-to-b from-slate-50 to-white dark:from-slate-900 dark:to-slate-950 p-4 space-y-4 overflow-y-auto">

          {(isWhatsApp || isMessenger || isInstagram) ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 rounded-2xl bg-white dark:bg-slate-800/80 border border-slate-100 dark:border-slate-700/50 shadow-sm space-y-5">
              <div className="w-16 h-16 bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-700 dark:to-slate-600 text-slate-400 dark:text-slate-500 rounded-2xl flex items-center justify-center shadow-inner">
                <Monitor size={26} strokeWidth={1.8} />
              </div>
              <div className="text-center max-w-[220px]">
                <p className="text-[14px] font-semibold text-slate-800 dark:text-slate-200">Remote Unavailable</p>
                <p className="text-[12px] text-slate-400 dark:text-slate-500 mt-2 leading-relaxed">
                  Remote viewing works with website widget conversations only.
                </p>
              </div>
            </div>
          ) : (
            <>
              {coBrowseStatus === 'idle' && (
                <div className="flex-1 flex flex-col items-center justify-center p-8 rounded-2xl bg-white dark:bg-slate-800/80 border border-slate-100 dark:border-slate-700/50 shadow-sm space-y-5">
                  <div className="relative">
                    <div className="w-14 h-14 bg-slate-50 border border-slate-200 dark:bg-slate-800/50 dark:border-slate-700/50 rounded-2xl flex items-center justify-center shadow-sm">
                      <Eye size={22} strokeWidth={1.8} className="text-slate-500 dark:text-slate-400" />
                    </div>
                  </div>
                  <div className="text-center max-w-[220px]">
                    <p className="text-[14px] font-semibold text-slate-800 dark:text-slate-200">Remote View</p>
                    <p className="text-[12px] text-slate-400 dark:text-slate-500 mt-1.5 leading-relaxed">
                      View the visitor's screen in real-time to guide them visually.
                    </p>
                  </div>
                  <button 
                    onClick={handleRequestCoBrowse}
                    className="px-5 py-2.5 bg-white hover:bg-slate-50 border border-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 dark:border-slate-700 active:scale-[0.97] text-slate-700 dark:text-slate-300 font-medium text-[13px] rounded-xl shadow-sm transition-all cursor-pointer flex items-center gap-2"
                  >
                    <Monitor size={15} strokeWidth={2} className="text-slate-400" />
                    Request Screen Share
                  </button>
                  <p className="text-[10.5px] text-slate-400 dark:text-slate-500">
                    End-to-end encrypted session
                  </p>
                </div>
              )}

              {coBrowseStatus === 'requested' && (
                <div className="flex-1 flex flex-col items-center justify-center p-8 rounded-2xl bg-white dark:bg-slate-800/80 border border-slate-100 dark:border-slate-700/50 shadow-sm space-y-5">
                  {/* Animated concentric rings */}
                  <div className="relative w-20 h-20 flex items-center justify-center">
                    <div className="absolute inset-0 rounded-full border-2 border-[#0070f3]/20 animate-ping" style={{ animationDuration: '2s' }} />
                    <div className="absolute inset-2 rounded-full border-2 border-[#0070f3]/30 animate-ping" style={{ animationDuration: '2s', animationDelay: '0.3s' }} />
                    <div className="absolute inset-4 rounded-full border-2 border-[#0070f3]/40 animate-ping" style={{ animationDuration: '2s', animationDelay: '0.6s' }} />
                    <div className="w-10 h-10 bg-gradient-to-br from-[#0070f3] to-[#0050c8] rounded-full flex items-center justify-center shadow-lg shadow-blue-500/30">
                      <Monitor size={18} className="text-white" />
                    </div>
                  </div>
                  <div className="text-center">
                    <p className="text-[14px] font-semibold text-slate-800 dark:text-slate-200">Waiting for Approval</p>
                    <p className="text-[11.5px] text-slate-400 dark:text-slate-500 mt-1">A prompt is showing on the visitor's screen</p>
                  </div>
                  <button 
                    onClick={handleEndCoBrowseSession}
                    className="px-4 py-2 text-[12px] font-medium text-slate-500 hover:text-slate-700 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-700 rounded-xl transition-all cursor-pointer"
                  >
                    Cancel Request
                  </button>
                </div>
              )}

              {coBrowseStatus === 'declined' && (
                <div className="flex-1 flex flex-col items-center justify-center p-8 rounded-2xl bg-red-50/60 dark:bg-red-950/20 border border-red-100 dark:border-red-900/30 space-y-4">
                  <div className="w-12 h-12 bg-red-100 dark:bg-red-900/40 rounded-full flex items-center justify-center">
                    <X className="text-red-500" size={22} strokeWidth={2.5} />
                  </div>
                  <div className="text-center">
                    <p className="text-[14px] font-semibold text-red-700 dark:text-red-400">Request Declined</p>
                    <p className="text-[11.5px] text-red-400 dark:text-red-500/70 mt-1">The visitor declined screen sharing</p>
                  </div>
                </div>
              )}

              {coBrowseStatus === 'active' && (
                <div 
                  id="cobrowse-fullscreen-wrapper" 
                  className={`flex flex-col min-h-0 bg-slate-950 overflow-hidden relative shadow-xl ${isFullscreen ? 'fixed inset-0 z-[9999] w-screen h-screen rounded-none border-none' : 'flex-1 rounded-2xl border border-slate-800/50'}`}
                >
                  {/* Session info bar at top */}
                  <div className="flex items-center justify-between px-3 py-2 bg-slate-900/95 border-b border-slate-800/60 z-10">
                    <div className="flex items-center gap-2">
                      <div className="relative flex items-center justify-center">
                        <div className="w-2 h-2 rounded-full bg-emerald-400" />
                        <div className="absolute w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                      </div>
                      <span className="text-[11px] font-bold text-emerald-400 uppercase tracking-widest">Live</span>
                    </div>
                    <div className="flex items-center gap-3">
                      {connectionQuality && (
                        <div className="flex items-center gap-1 text-[10px] text-slate-500 font-mono" title="Stream quality">
                          <Wifi size={10} className={connectionQuality.fps >= 15 ? 'text-emerald-400' : connectionQuality.fps >= 5 ? 'text-amber-400' : 'text-red-400'} />
                          {connectionQuality.resolution} {connectionQuality.fps}fps
                        </div>
                      )}
                      <div className="flex items-center gap-1.5 text-[11px] text-slate-400 font-mono">
                        <Clock size={11} />
                        {formatDuration(sessionDuration)}
                      </div>
                    </div>
                  </div>

                  {/* Visitor URL bar */}
                  {visitorUrl && (
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-900/80 border-b border-slate-800/40">
                      <Globe size={11} className="text-slate-500 shrink-0" />
                      <span className="text-[10.5px] text-slate-400 truncate font-mono flex-1" title={visitorUrl}>
                        {visitorUrl.replace(/^https?:\/\//, '')}
                      </span>
                      <a href={visitorUrl} target="_blank" rel="noreferrer" className="text-slate-500 hover:text-blue-400 transition-colors shrink-0">
                        <ExternalLink size={11} />
                      </a>
                    </div>
                  )}

                  {/* Video stream */}
                  <div className="flex-1 min-h-0 overflow-hidden relative">
                    <video 
                      ref={videoRef}
                      autoPlay 
                      playsInline 
                      muted
                      className="w-full h-full bg-slate-950 transition-transform duration-200"
                      style={{ 
                        objectFit: videoZoom > 1 ? 'cover' : 'contain',
                        transform: `scale(${videoZoom})`,
                        transformOrigin: 'center center'
                      }}
                    />
                    {/* Zoom indicator */}
                    {videoZoom > 1 && (
                      <div className="absolute top-2 right-2 bg-black/60 backdrop-blur-sm text-white text-[10px] font-mono px-2 py-0.5 rounded-md">
                        {videoZoom.toFixed(1)}x
                      </div>
                    )}
                  </div>

                  {/* Bottom toolbar */}
                  <div className="flex items-center justify-between px-2 py-2 bg-slate-900/95 border-t border-slate-800/60 z-10">
                    <div className="flex items-center gap-0.5">
                      <button 
                        onClick={() => {
                          const wrapper = document.getElementById('cobrowse-fullscreen-wrapper');
                          if (wrapper) {
                            if (!isFullscreen) {
                              if (wrapper.requestFullscreen) {
                                wrapper.requestFullscreen();
                              } else if ((wrapper as any).webkitRequestFullscreen) {
                                (wrapper as any).webkitRequestFullscreen();
                              }
                            } else {
                              if (document.exitFullscreen) {
                                document.exitFullscreen();
                              } else if ((document as any).webkitExitFullscreen) {
                                (document as any).webkitExitFullscreen();
                              }
                            }
                          }
                        }}
                        className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg transition-all cursor-pointer" 
                        title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
                      >
                        {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                      </button>
                      <button 
                        onClick={handleScreenshot}
                        className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg transition-all cursor-pointer" title="Screenshot to clipboard"
                      >
                        <Camera size={14} />
                      </button>
                      <button 
                        onClick={handleTogglePiP}
                        className={`p-1.5 hover:bg-slate-800 rounded-lg transition-all cursor-pointer ${isPiP ? 'text-blue-400' : 'text-slate-400 hover:text-white'}`} title="Picture-in-Picture"
                      >
                        <PictureInPicture2 size={14} />
                      </button>
                      <div className="w-px h-4 bg-slate-800 mx-1" />
                      <button 
                        onClick={() => setVideoZoom(z => Math.max(1, z - 0.25))}
                        disabled={videoZoom <= 1}
                        className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg transition-all cursor-pointer disabled:opacity-30 disabled:cursor-default" title="Zoom out"
                      >
                        <ZoomOut size={14} />
                      </button>
                      <button 
                        onClick={() => setVideoZoom(z => Math.min(3, z + 0.25))}
                        disabled={videoZoom >= 3}
                        className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg transition-all cursor-pointer disabled:opacity-30 disabled:cursor-default" title="Zoom in"
                      >
                        <ZoomIn size={14} />
                      </button>
                    </div>
                    <button 
                      onClick={handleEndCoBrowseSession}
                      className="bg-red-500/90 hover:bg-red-500 active:scale-95 text-white font-semibold text-[11px] px-3.5 py-1.5 rounded-lg transition-all shadow-sm cursor-pointer"
                    >
                      End Session
                    </button>
                  </div>
                </div>
              )}

              {coBrowseStatus === 'connection_lost' && (
                <div className="flex-1 flex flex-col items-center justify-center p-8 rounded-2xl bg-amber-50/50 dark:bg-amber-950/15 border border-amber-200/60 dark:border-amber-800/30 space-y-5">
                  <div className="relative">
                    <div className="w-14 h-14 bg-amber-100 dark:bg-amber-900/40 rounded-2xl flex items-center justify-center">
                      <WifiOff size={24} className="text-amber-600 dark:text-amber-400" />
                    </div>
                    <div className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center">
                      <X size={10} className="text-white" strokeWidth={3} />
                    </div>
                  </div>
                  <div className="text-center">
                    <p className="text-[14px] font-semibold text-amber-800 dark:text-amber-300">Connection Lost</p>
                    <p className="text-[11.5px] text-amber-600/70 dark:text-amber-400/60 mt-1.5 leading-relaxed max-w-[200px]">Auto-reconnecting in {autoReconnectCountdown}s...</p>
                  </div>
                  {/* Countdown progress ring */}
                  <div className="relative w-12 h-12">
                    <svg className="w-12 h-12 -rotate-90" viewBox="0 0 48 48">
                      <circle cx="24" cy="24" r="20" fill="none" stroke="currentColor" strokeWidth="3" className="text-amber-200 dark:text-amber-900/50" />
                      <circle cx="24" cy="24" r="20" fill="none" stroke="currentColor" strokeWidth="3" className="text-[#0070f3]" strokeDasharray={`${(autoReconnectCountdown / 10) * 125.6} 125.6`} strokeLinecap="round" style={{ transition: 'stroke-dasharray 1s linear' }} />
                    </svg>
                    <span className="absolute inset-0 flex items-center justify-center text-[13px] font-bold text-amber-700 dark:text-amber-300">{autoReconnectCountdown}</span>
                  </div>
                  <div className="flex gap-2 w-full">
                    <button 
                      onClick={() => {
                        if (autoReconnectTimerRef.current) {
                          clearInterval(autoReconnectTimerRef.current);
                          autoReconnectTimerRef.current = null;
                        }
                        handleEndCoBrowseSession();
                        setTimeout(() => handleRequestCoBrowse(), 300);
                      }}
                      className="flex-1 py-2.5 bg-[#0070f3] hover:bg-blue-600 active:scale-[0.97] text-white font-semibold text-[12px] rounded-xl shadow-md shadow-blue-500/20 transition-all cursor-pointer flex items-center justify-center gap-1.5"
                    >
                      <RefreshCw size={13} />
                      Reconnect Now
                    </button>
                    <button 
                      onClick={() => {
                        if (autoReconnectTimerRef.current) {
                          clearInterval(autoReconnectTimerRef.current);
                          autoReconnectTimerRef.current = null;
                        }
                        handleEndCoBrowseSession();
                      }}
                      className="px-4 py-2.5 text-[12px] font-medium text-slate-500 hover:text-slate-700 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700 rounded-xl transition-all cursor-pointer"
                    >
                      Close
                    </button>
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
