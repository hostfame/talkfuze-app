"use client"

import React, { useState, useEffect, useRef } from 'react'
import { Phone, PhoneOff, X, PhoneCall, Delete, VolumeX, Volume2, AlertTriangle, User, Loader2, Pause, Play, PhoneForwarded, Grid3X3, Mic, MicOff, ChevronDown, ExternalLink, Smartphone, MessageSquare } from 'lucide-react'
import { Web, SessionState, UserAgent } from 'sip.js'
import { useInboxStore } from '@/lib/store'
import { useAuth } from '@/lib/auth-context'
import { supabase } from '@/lib/supabase'
import { fetchWhmcsClient, fetchWhmcsServices, fetchWhmcsUnpaidInvoices } from '@/actions/whmcs'
import { getLastCallForNumber, findConversationByPhone, saveCallNote, logSipCallDirect } from '@/actions/calls'
import { ICE_SERVERS } from '@/lib/webrtc'

const isPhoneNumber = (str: string) => {
  if (!str) return false
  const clean = str.replace(/[\s\-\+]/g, '')
  return /^\d+$/.test(clean) && clean.length > 5
}

export default function SipDialer() {
  const authUser = useAuth()
  const { currentUser, pendingDialNumber, clearPendingDial, setSelectedId } = useInboxStore()
  // Use authUser (always available from layout AuthProvider) for SIP creds,
  // fall back to store's currentUser for display name
  const sipUser = authUser || currentUser
  const [isOpen, setIsOpen] = useState(false)
  const [number, setNumber] = useState('')
  const [status, setStatus] = useState('Disconnected')
  const [isRegistered, setIsRegistered] = useState(false)
  const [callDuration, setCallDuration] = useState(0)
  const [incomingCallerName, setIncomingCallerName] = useState('')
  
  const [userAgent, setUserAgent] = useState<Web.SimpleUser | null>(null)
  const [sessionState, setSessionState] = useState<SessionState>(SessionState.Initial)
  
  const [isMuted, setIsMuted] = useState(false)
  const [canHangUp, setCanHangUp] = useState(true)
  const [whmcsClientInfo, setWhmcsClientInfo] = useState<{
    id: number;
    name: string;
    email: string;
    status: string;
    services?: number;
    unpaid?: number;
  } | null>(null)
  const [activeCallSession, setActiveCallSession] = useState<{ number: string; direction: 'inbound' | 'outbound' } | null>(null)
  const activeCallSessionRef = useRef<any>(null)
  const currentUserRef = useRef<any>(null)
  
  // Sync the ref on every render to bypass stale closures in event listeners
  activeCallSessionRef.current = activeCallSession
  currentUserRef.current = currentUser
  
  const [isTabConflict, setIsTabConflict] = useState(false)
  const [hasMicPermission, setHasMicPermission] = useState<boolean | null>(null)
  const [iceState, setIceState] = useState('new')
  
  // Phase 1: Advanced Call Controls
  const [isOnHold, setIsOnHold] = useState(false)
  const [showTransferInput, setShowTransferInput] = useState(false)
  const [transferNumber, setTransferNumber] = useState('')
  const [showInCallKeypad, setShowInCallKeypad] = useState(false)
  const [isMicMuted, setIsMicMuted] = useState(false)
  const [isClientExpanded, setIsClientExpanded] = useState(false)
  const [callNote, setCallNote] = useState('')
  const [isSavingNote, setIsSavingNote] = useState(false)
  const [noteSaved, setNoteSaved] = useState(false)
  const [lastCallInfo, setLastCallInfo] = useState<{ created_at: string; duration_seconds: number; direction: string; status: string } | null>(null)
  const [matchedConversationId, setMatchedConversationId] = useState<string | null>(null)
  const matchedConversationIdRef = useRef<string | null>(null)
  
  useEffect(() => {
    matchedConversationIdRef.current = matchedConversationId
  }, [matchedConversationId])

  const callDurationRef = useRef<number>(0)
  const [bannerPos, setBannerPos] = useState<{ x: number; y: number } | null>(null)
  const isDraggingRef = useRef(false)
  const dragOffsetRef = useRef({ x: 0, y: 0 })
  const bannerRef = useRef<HTMLDivElement>(null)
  
  const remoteAudioRef = useRef<HTMLAudioElement>(null)
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  
  // Web Audio API Ringtone Synth references
  const audioContextRef = useRef<AudioContext | null>(null)
  const ringOscillatorsRef = useRef<OscillatorNode[]>([])
  const ringIntervalRef = useRef<NodeJS.Timeout | null>(null)
  
  const broadcastChannelRef = useRef<BroadcastChannel | null>(null)

  // Draggable banner handlers
  const handleDragStart = (e: React.MouseEvent | React.TouchEvent) => {
    // Don't drag when interacting with buttons/inputs inside
    const target = e.target as HTMLElement
    if (target.closest('button') || target.closest('input') || target.closest('textarea') || target.closest('a')) return
    
    isDraggingRef.current = true
    const banner = bannerRef.current
    if (!banner) return
    
    const rect = banner.getBoundingClientRect()
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY
    dragOffsetRef.current = { x: clientX - rect.left, y: clientY - rect.top }
  }

  useEffect(() => {
    const handleMove = (e: MouseEvent | TouchEvent) => {
      if (!isDraggingRef.current) return
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY
      const banner = bannerRef.current
      if (!banner) return

      const x = Math.max(0, Math.min(clientX - dragOffsetRef.current.x, window.innerWidth - 370))
      const y = Math.max(0, Math.min(clientY - dragOffsetRef.current.y, window.innerHeight - 100))
      
      // Directly manipulate DOM styles for buttery-smooth instant response
      banner.style.left = `${x}px`
      banner.style.top = `${y}px`
      banner.style.right = 'auto'
      
      // Sync immediately with state to prevent React state timer ticks from overriding the dragged position
      setBannerPos({ x, y })
    }

    const handleUp = () => {
      if (!isDraggingRef.current) return
      isDraggingRef.current = false
      const banner = bannerRef.current
      if (banner) {
        const rect = banner.getBoundingClientRect()
        setBannerPos({ x: rect.left, y: rect.top })
      }
    }
    
    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
    window.addEventListener('touchmove', handleMove, { passive: false })
    window.addEventListener('touchend', handleUp)
    return () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
      window.removeEventListener('touchmove', handleMove)
      window.removeEventListener('touchend', handleUp)
    }
  }, [])

  const startTimer = () => {
    setCallDuration(0)
    callDurationRef.current = 0
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = setInterval(() => {
      setCallDuration(prev => {
        callDurationRef.current = prev + 1
        return prev + 1
      })
    }, 1000)
  }

  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }

  // Synthesize realistic dual-frequency (440Hz + 480Hz) US telephone ringing context
  const playSynthesizedRing = () => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
      if (!AudioCtx) return
      
      // Stop any existing ring first to prevent leaks
      stopSynthesizedRing()
      
      const triggerRingCycle = () => {
        try {
          const ctx = new AudioCtx()
          audioContextRef.current = ctx
          
          const osc1 = ctx.createOscillator()
          const osc2 = ctx.createOscillator()
          const gain = ctx.createGain()
          
          osc1.type = 'sine'
          osc1.frequency.value = 440
          
          osc2.type = 'sine'
          osc2.frequency.value = 480
          
          gain.gain.setValueAtTime(0, ctx.currentTime)
          const now = ctx.currentTime
          gain.gain.linearRampToValueAtTime(0.12, now + 0.1)
          gain.gain.setValueAtTime(0.12, now + 2)
          gain.gain.linearRampToValueAtTime(0, now + 2.1)
          
          osc1.connect(gain)
          osc2.connect(gain)
          gain.connect(ctx.destination)
          
          osc1.start()
          osc2.start()
          
          ringOscillatorsRef.current = [osc1, osc2]
          
          setTimeout(() => {
            try {
              osc1.stop()
              osc2.stop()
              // Only close if still open (stopSynthesizedRing may have already closed it)
              if (ctx.state !== 'closed') {
                ctx.close().catch(() => {})
              }
            } catch(e) {}
          }, 2200)
        } catch(e) {}
      };

      // Ring immediately, then repeat every 6 seconds (cadence: 2s ring, 4s silent)
      triggerRingCycle();
      ringIntervalRef.current = setInterval(triggerRingCycle, 6000)
    } catch (err) {
      console.error("Failed to play synthesized ring:", err)
    }
  }

  const stopSynthesizedRing = () => {
    if (ringIntervalRef.current) {
      clearInterval(ringIntervalRef.current)
      ringIntervalRef.current = null
    }
    try {
      ringOscillatorsRef.current.forEach(osc => {
        try { osc.stop() } catch(e) {}
      })
      ringOscillatorsRef.current = []
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close().catch(() => {})
      }
      audioContextRef.current = null
    } catch (e) {}
  }

  // Explicitly release and terminate all WebRTC media streams to turn off browser green microphone indicators immediately
  const cleanupMediaTracks = (session: any) => {
    if (!session) return;
    try {
      const pc = session.sessionDescriptionHandler?.peerConnection || session.peerConnection;
      if (pc) {
        pc.getSenders().forEach((sender: any) => {
          if (sender.track) {
            console.log("[WebRTC] Stopping local track:", sender.track.label);
            try { sender.track.stop() } catch (e) {}
          }
        });
        pc.getReceivers().forEach((receiver: any) => {
          if (receiver.track) {
            console.log("[WebRTC] Stopping remote track:", receiver.track.label);
            try { receiver.track.stop() } catch (e) {}
          }
        });
      }
    } catch (e) {
      console.warn("[WebRTC] Media track cleanup warning:", e);
    }
  };

  // Bind underlying SIP session state transitions for 100% immediate real-time execution
  const bindSessionEvents = (session: any) => {
    if (!session || session._hasTalkfuzeListener) return
    session._hasTalkfuzeListener = true
    
    // Monitor WebRTC PeerConnection ICE state dynamically
    const monitorWebRTC = () => {
      const pc = session.sessionDescriptionHandler?.peerConnection || session.peerConnection
      if (pc) {
        console.log(`[WebRTC] Initial ICE State: ${pc.iceConnectionState}`)
        setIceState(pc.iceConnectionState)
        pc.oniceconnectionstatechange = () => {
          console.log(`[WebRTC] ICE Connection State Changed: ${pc.iceConnectionState}`)
          setIceState(pc.iceConnectionState)
        }
      } else if (session.state !== 'Terminated' && session.state !== 'Terminating') {
        // Retry a bit later as peerConnection is created asynchronously by sip.js
        setTimeout(monitorWebRTC, 200)
      }
    }
    monitorWebRTC()
    
    // Direct state listener bypassing wrapper delays
    session.stateChange.addListener((newState: any) => {
      console.log(`[SIP] Direct Session State Change: ${newState}`)
      if (newState === 'Terminating' || newState === 'Terminated') {
        // Diagnostic: log stack trace to identify WHO caused the termination
        console.warn(`[SIP] Session terminated/terminating. Stack trace:`, new Error().stack)
        const pc = session.sessionDescriptionHandler?.peerConnection
        if (pc) {
          console.log(`[SIP] PeerConnection state at termination: ICE=${pc.iceConnectionState}, Connection=${pc.connectionState}, Signaling=${pc.signalingState}`)
        }
        
        // Log the call immediately
        const duration = callDurationRef.current
        const activeSess = activeCallSessionRef.current
        const user = currentUserRef.current
        const convId = matchedConversationIdRef.current
        
        if (activeSess && user?.org_id) {
          logSipCallDirect({
            orgId: user.org_id,
            direction: activeSess.direction,
            fromNumber: activeSess.direction === 'outbound' ? 'Browser Dialer' : activeSess.number,
            toNumber: activeSess.direction === 'outbound' ? activeSess.number : 'Browser Dialer',
            durationSeconds: duration,
            status: duration > 0 ? 'ANSWERED' : 'CANCELLED',
            agentName: user.name,
            conversationId: convId || null
          }).catch(console.error)
        }

        setStatus('Registered')
        setSessionState(SessionState.Terminated)
        stopSynthesizedRing()
        stopTimer()
        setActiveCallSession(null)
        setIsMuted(false)
        setIceState('new')
        setCanHangUp(true)
        setWhmcsClientInfo(null)
        setCallNote('')
        setNoteSaved(false)
        setLastCallInfo(null)
        setMatchedConversationId(null)
        setIsClientExpanded(false)
        setBannerPos(null)
        setIsOnHold(false)
        setIsMicMuted(false)
        setShowTransferInput(false)
        setTransferNumber('')
        setShowInCallKeypad(false)
        cleanupMediaTracks(session)
      } else if (newState === 'Established') {
        setStatus('Connected')
        setSessionState(SessionState.Established)
        stopSynthesizedRing()
        startTimer()
      }
    })
  }

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Check microphone permission proactively at mount
    navigator.mediaDevices.getUserMedia({ audio: true })
      .then(stream => {
        stream.getTracks().forEach(track => track.stop())
        setHasMicPermission(true)
      })
      .catch(err => {
        console.warn("[SIP] Microphone permission blocked:", err)
        setHasMicPermission(false)
      })

    // Intercept accidental tab closures and browser reloads during active calls
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (activeCallSessionRef.current) {
        e.preventDefault()
        e.returnValue = 'You are in an active call. Closing this tab will hang up the call. Are you sure you want to leave?'
        return e.returnValue
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)

    // Claim active dialer status via BroadcastChannel to prevent multi-tab conflicts
    if (!broadcastChannelRef.current) {
      broadcastChannelRef.current = new BroadcastChannel('talkfuze_dialer_lock')
    }
    const channel = broadcastChannelRef.current
    channel.postMessage('dialer_claim_active')
    setIsTabConflict(false)

    // Initialize SIP.js SimpleUser with per-agent credentials
    const server = 'wss://sip.talkfuze.com/ws'
    const sipExtension = sipUser?.sip_extension || 'talkfuze_agent'
    const sipPassword = sipUser?.sip_password || 'talkfuze_secure_pass_123'
    const aor = `sip:${sipExtension}@sip.talkfuze.com`
    
    console.log(`[SIP] Registering as ${sipExtension} for ${sipUser?.name || 'Unknown Agent'}`)
    
    const simpleUser = new Web.SimpleUser(server, {
      aor,
      media: {
        remote: {
          audio: remoteAudioRef.current as HTMLAudioElement
        }
      },
      userAgentOptions: {
        authorizationPassword: sipPassword,
        authorizationUsername: sipExtension,
        displayName: sipUser?.name || "TalkFuze Agent",
        sessionDescriptionHandlerFactoryOptions: {
          iceGatheringTimeout: 1500, // Send 200 OK fast - don't wait 5s for all TURN candidates
          peerConnectionConfiguration: {
            iceServers: ICE_SERVERS,
            iceCandidatePoolSize: 1 // Pre-warm ICE agent to reduce gathering delay
          }
        }
      }
    })

    const handleChannelMessage = (msg: MessageEvent) => {
      if (msg.data === 'dialer_claim_active') {
        // Active Call Immunity: If this tab is in a live call, do NOT disconnect.
        // Broadcast busy/running status back to the channel to make the other tab back off.
        if (activeCallSessionRef.current) {
          console.log('[SIP] Active call running. Rejecting registration claim from another tab.')
          channel.postMessage('dialer_active_call_running')
          return
        }

        console.log('[SIP] Dialer claimed by another tab. Disconnecting local SIP.')
        setIsTabConflict(true)
        simpleUser.disconnect()
        setStatus('Disconnected')
        setIsRegistered(false)
        stopSynthesizedRing()
        stopTimer()
        setActiveCallSession(null)
        setIsMuted(false)
      } else if (msg.data === 'dialer_active_call_running') {
        // If we broadcasted a claim but another tab has a live active call, we MUST revoke our claim and back off.
        console.log('[SIP] Another tab has an active call. Revoking registration claim to prevent interruption.')
        setIsTabConflict(true)
        simpleUser.disconnect()
        setStatus('Disconnected')
        setIsRegistered(false)
        stopSynthesizedRing()
        stopTimer()
        setActiveCallSession(null)
        setIsMuted(false)
      }
    }
    channel.addEventListener('message', handleChannelMessage)

    let reconnectTimeout: NodeJS.Timeout | null = null
    let reconnectAttempts = 0
    let isReconnecting = false
    let isMounted = true

    const connectSIP = async () => {
      if (isTabConflict || !isMounted) return
      try {
        isReconnecting = false
        setStatus('Connecting...')
        await simpleUser.connect()
        if (!isMounted) return
        await simpleUser.register()
        reconnectAttempts = 0
      } catch (err) {
        if (!isMounted) return
        console.error("SIP Connection Error:", err)
        setStatus('Connection Failed')
        triggerBackoffReconnect()
      }
    }

    const triggerBackoffReconnect = () => {
      if (isTabConflict || !isMounted) return
      if (isReconnecting) return
      isReconnecting = true
      
      const delay = Math.min(Math.pow(2, reconnectAttempts) * 1000, 30000)
      reconnectAttempts++
      console.log(`[SIP] Reconnecting in ${delay / 1000}s (Attempt ${reconnectAttempts})`)
      
      if (reconnectTimeout) clearTimeout(reconnectTimeout)
      reconnectTimeout = setTimeout(() => {
        if (!isMounted) return
        isReconnecting = false
        connectSIP()
      }, delay)
    }

    simpleUser.delegate = {
      onCallReceived: () => {
        setStatus('Incoming Call...')
        setSessionState(SessionState.Initial)
        setIsMuted(false)
        
        const session = (simpleUser as any).session
        let callerId = 'Unknown'
        if (session && session.remoteIdentity) {
          callerId = session.remoteIdentity.uri.user || 'Unknown'
          setNumber(callerId)
        }

        setActiveCallSession({ number: callerId, direction: 'inbound' })

        // Bind session events immediately to trigger lightning-fast real-time updates
        if (session) {
          bindSessionEvents(session)
        }

        // Play premium synthesized ringing tone
        playSynthesizedRing()

        // Lookup caller name dynamically from contacts using smart last 10 digits matching
        const currentActiveUser = currentUserRef.current
        if (callerId !== 'Unknown' && currentActiveUser?.org_id) {
          const cleanCaller = callerId.replace(/\D/g, '')
          const last10 = cleanCaller.slice(-10) // Extract last 10 digits to resolve country-code prefixes
          
          // First check local contacts
          supabase
            .from('contacts')
            .select('name')
            .eq('org_id', currentActiveUser.org_id)
            .or(`phone.eq.${cleanCaller},phone.like.%${last10},platform_id.like.%${cleanCaller}%`)
            .maybeSingle()
            .then(({ data }) => {
              if (data && data.name) {
                setIncomingCallerName(data.name)
              } else {
                setIncomingCallerName(callerId)
              }
            })

          // Query WHMCS database dynamically
          fetchWhmcsClient(cleanCaller)
            .then(async (client) => {
              if (client && client.id) {
                const name = `${client.firstname} ${client.lastname}`.trim()
                setIncomingCallerName(name) // Prefer real WHMCS client name
                
                // Set base info IMMEDIATELY so UI doesn't delay
                setWhmcsClientInfo({
                  id: client.id,
                  name: name,
                  email: (client as any).email || '',
                  status: (client as any).status || '',
                  services: 0,
                  unpaid: 0
                })

                // Fetch details concurrently
                try {
                  const [servicesRes, unpaidRes] = await Promise.all([
                    fetchWhmcsServices(client.id).catch(() => null),
                    fetchWhmcsUnpaidInvoices(client.id).catch(() => null)
                  ])

                  let activeServices = 0
                  let unpaidAmount = 0

                  if (servicesRes && servicesRes.products) {
                    activeServices = servicesRes.products.filter((p: any) => p.status?.toLowerCase() === 'active').length
                  }
                  if (unpaidRes) {
                    unpaidAmount = unpaidRes.reduce((sum: number, inv: any) => sum + parseFloat(inv.total || '0'), 0)
                  }

                  setWhmcsClientInfo(prev => prev ? {
                    ...prev,
                    services: activeServices,
                    unpaid: unpaidAmount
                  } : prev)
                } catch (e) {
                  console.error("Failed to fetch WHMCS details:", e)
                }
              }
            })
            .catch(err => console.error("WHMCS dynamic client lookup failed:", err))

          // Fetch last call history for this number
          if (currentActiveUser?.org_id) {
            getLastCallForNumber(currentActiveUser.org_id, cleanCaller)
              .then(lastCall => { if (lastCall) setLastCallInfo(lastCall) })
              .catch(() => {})

            // Auto-find conversation for this caller
            findConversationByPhone(currentActiveUser.org_id, cleanCaller)
              .then(convId => {
                if (convId) {
                  setMatchedConversationId(convId)
                }
              })
              .catch(() => {})
          }
        } else {
          setIncomingCallerName(callerId)
        }
      },
      onCallCreated: () => {
        setStatus('Calling...')
        setActiveCallSession(prev => prev || { number: number.replace(/[\s-]/g, ''), direction: 'outbound' })
      },
      onCallAnswered: () => {
        console.log('[SIP] onCallAnswered delegate fired - call is established')
        setStatus('Connected')
        setSessionState(SessionState.Established)
        stopSynthesizedRing()
        startTimer()
      },
      onCallHangup: () => {
        console.warn('[SIP] onCallHangup delegate fired - call ended. Stack:', new Error().stack)
        setStatus('Registered')
        setSessionState(SessionState.Terminated)
        stopSynthesizedRing()
        stopTimer()
        const session = (simpleUser as any).session
        if (session) {
          cleanupMediaTracks(session)
        }
        setActiveCallSession(null)
        setIsMuted(false)
        setIceState('new')
        setIsOnHold(false)
        setIsMicMuted(false)
        setShowTransferInput(false)
        setTransferNumber('')
        setShowInCallKeypad(false)
      },
      onRegistered: () => {
        setStatus('Registered')
        setIsRegistered(true)
        reconnectAttempts = 0
      },
      onUnregistered: () => {
        setIsRegistered(false)
        triggerBackoffReconnect()
        
        // Immunity: If we have an active call, do NOT disrupt the UI or timer.
        if (activeCallSessionRef.current) {
          console.log('[SIP] Unregistered event received, but ignoring to preserve active call.')
          return
        }
        
        setStatus('Disconnected')
        stopSynthesizedRing()
        stopTimer()
        setActiveCallSession(null)
        setIsMuted(false)
        setIsOnHold(false)
        setIsMicMuted(false)
        setShowTransferInput(false)
        setShowInCallKeypad(false)
      },
      onServerDisconnect: () => {
        setIsRegistered(false)
        triggerBackoffReconnect()
        
        // Immunity: If we have an active call, do NOT disrupt the UI or timer.
        if (activeCallSessionRef.current) {
          console.log('[SIP] Server disconnect received, but ignoring to preserve active call.')
          return
        }
        
        setStatus('Disconnected')
        stopSynthesizedRing()
        stopTimer()
        setActiveCallSession(null)
        setIsMuted(false)
        setIsOnHold(false)
        setIsMicMuted(false)
        setShowTransferInput(false)
        setShowInCallKeypad(false)
      }
    }

    const handleOnline = () => {
      console.log('[SIP] Browser came online. Forcing immediate reconnect.')
      reconnectAttempts = 0
      isReconnecting = false
      connectSIP()
    }
    window.addEventListener('online', handleOnline)

    setUserAgent(simpleUser)
    connectSIP()

    return () => {
      isMounted = false
      stopTimer()
      stopSynthesizedRing()
      if (reconnectTimeout) clearTimeout(reconnectTimeout)
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('beforeunload', handleBeforeUnload)
      if (broadcastChannelRef.current) {
        broadcastChannelRef.current.removeEventListener('message', handleChannelMessage)
        broadcastChannelRef.current.close()
        broadcastChannelRef.current = null
      }
      simpleUser.disconnect()
    }
  }, [sipUser?.sip_extension, sipUser?.sip_password])

  const handleDial = async () => {
    if (!userAgent || !number) return
    if (status === 'Dialing...' || status === 'Calling...' || sessionState === SessionState.Established) return
    
    // Explicit browser gesture autoplay bypass
    if (remoteAudioRef.current) {
      remoteAudioRef.current.play().catch(e => console.warn('[WebRTC] Autoplay bypass failed on dial:', e))
    }
    
    try {
      setStatus('Dialing...')
      const cleanNumber = number.replace(/[^\d+]/g, '')
      setActiveCallSession({ number: cleanNumber, direction: 'outbound' })
      
      if (currentUserRef.current?.org_id) {
        findConversationByPhone(currentUserRef.current.org_id, cleanNumber)
          .then(convId => { if (convId) setMatchedConversationId(convId) })
          .catch(() => {})
      }

      await userAgent.call(`sip:${cleanNumber}@sip.talkfuze.com`)
      
      // Bind session events to outbound session immediately
      const session = (userAgent as any).session
      if (session) {
        bindSessionEvents(session)
      }
    } catch (e) {
      console.error("Dial failed", e)
      setStatus('Call Failed')
      setActiveCallSession(null)
      setIsMuted(false)
      setIceState('new')
      setWhmcsClientInfo(null)
      setTimeout(() => setStatus('Registered'), 3000)
    }
  }

  const handleHangup = async () => {
    if (!canHangUp) return
    if (!userAgent) return
    
    // Instant Optimistic Reset to ensure perfect real-time feedback
    setStatus('Registered')
    setSessionState(SessionState.Terminated)
    stopSynthesizedRing()
    stopTimer()
    setActiveCallSession(null)
    setIsMuted(false)
    setIceState('new')
    setCanHangUp(true)
    setWhmcsClientInfo(null)
    setCallNote('')
    setNoteSaved(false)
    setLastCallInfo(null)
    setMatchedConversationId(null)
    setIsClientExpanded(false)
    setBannerPos(null)
    setIsOnHold(false)
    setIsMicMuted(false)
    setShowTransferInput(false)
    setTransferNumber('')
    setShowInCallKeypad(false)
    
    try {
      await userAgent.hangup()
    } catch (e) {
      console.error("Hangup failed", e)
    }
  }

  const handleAnswer = async () => {
    if (!userAgent) return
    
    const session = (userAgent as any).session
    console.log('[SIP] handleAnswer() called.')
    console.log('[SIP] Session exists:', !!session)
    console.log('[SIP] Session state:', session?.state)
    console.log('[SIP] Session id:', session?.id)
    
    if (!session) {
      console.error('[SIP] No session found on SimpleUser - cannot answer')
      return
    }
    
    // Pre-flight: Check session is in the correct state for acceptance
    if (session.state !== 'Initial') {
      console.error(`[SIP] Session state is "${session.state}" but must be "Initial" to accept. Aborting.`)
      return
    }
    
    setCanHangUp(false)
    setTimeout(() => {
      setCanHangUp(true)
    }, 5000)
    
    // Stop ring tone immediately (frees AudioContext before getUserMedia)
    stopSynthesizedRing()
    
    // Instant Optimistic Connect UI change
    setStatus('Connecting...')
    
    // Unmute remote audio element if ring was muted
    if (remoteAudioRef.current) {
      remoteAudioRef.current.muted = false
    }
    
    try {
      // Directly call session.accept() bypassing SimpleUser/SessionManager wrappers
      // This avoids any potential sessionExists() check failures or middleware issues
      console.log('[SIP] Calling session.accept() directly...')
      await session.accept({
        sessionDescriptionHandlerOptions: {
          constraints: { audio: true, video: false },
          iceGatheringTimeout: 1500 // Fast answer - don't wait for slow TURN relay candidates
        }
      })
      console.log('[SIP] session.accept() resolved successfully - call should be establishing')
    } catch (e: any) {
      console.error('[SIP] Accept failed:', e?.message || e)
      console.error('[SIP] Accept error stack:', e?.stack)
      console.error('[SIP] Session state after failure:', session?.state)
      // If accept failed, reset UI
      setStatus('Registered')
      setSessionState(SessionState.Terminated)
      setActiveCallSession(null)
      setCanHangUp(true)
    }
  }

  const handleDecline = async () => {
    if (!userAgent) return
    
    // Instant Optimistic Decline UI reset
    setStatus('Registered')
    setSessionState(SessionState.Terminated)
    stopSynthesizedRing()
    setActiveCallSession(null)
    setIsMuted(false)
    setIceState('new')
    setWhmcsClientInfo(null)
    setCallNote('')
    setNoteSaved(false)
    setLastCallInfo(null)
    setMatchedConversationId(null)
    setIsClientExpanded(false)
    setBannerPos(null)
    setIsOnHold(false)
    setIsMicMuted(false)
    setShowTransferInput(false)
    setTransferNumber('')
    setShowInCallKeypad(false)
    
    try {
      await userAgent.decline()
    } catch (e) {
      console.error("Decline failed", e)
    }
  }

  const handleMuteRing = () => {
    setIsMuted(true)
    stopSynthesizedRing()
    // Also mute the remote audio so agent doesn't hear caller-side hold music
    if (remoteAudioRef.current) {
      remoteAudioRef.current.muted = true
    }
  }

  const handleActivateDialer = async () => {
    setIsTabConflict(false)
    if (typeof window !== 'undefined' && broadcastChannelRef.current) {
      broadcastChannelRef.current.postMessage('dialer_claim_active')
    }
    if (userAgent) {
      try {
        setStatus('Connecting...')
        await userAgent.connect()
        await userAgent.register()
      } catch (err) {
        console.error("Manual dialer activation reconnect failed:", err)
        setStatus('Connection Failed')
      }
    }
  }

  const handleKeyPress = (num: string) => {
    // During active call, send DTMF tones instead of appending to number
    if (sessionState === SessionState.Established && userAgent) {
      sendDTMF(num)
    } else {
      setNumber(prev => prev + num)
    }
  }

  // === PHASE 1: HOLD / RESUME ===
  const handleHold = async () => {
    if (!userAgent) return
    const session = (userAgent as any).session
    if (!session) return
    
    // Use direct track muting approach - most reliable with SimpleUser + Asterisk
    // Re-INVITE SDP modifiers are unreliable with SimpleUser wrapper
    try {
      const pc = session?.sessionDescriptionHandler?.peerConnection
      if (pc) {
        const newHoldState = !isOnHold
        pc.getSenders().forEach((sender: any) => {
          if (sender.track && sender.track.kind === 'audio') {
            sender.track.enabled = !newHoldState // disable track when holding
          }
        })
        // Also mute incoming audio when on hold (local experience)
        pc.getReceivers().forEach((receiver: any) => {
          if (receiver.track && receiver.track.kind === 'audio') {
            receiver.track.enabled = !newHoldState
          }
        })
        setIsOnHold(newHoldState)
        console.log(`[SIP] Call ${newHoldState ? 'held' : 'resumed'} via track muting`)
      }
    } catch (e) {
      console.error('[SIP] Hold/Resume failed:', e)
    }
  }

  // === PHASE 1: MIC MUTE (separate from ring mute) ===
  const handleMicMute = () => {
    if (!userAgent) return
    try {
      const session = (userAgent as any).session
      const pc = session?.sessionDescriptionHandler?.peerConnection
      if (pc) {
        pc.getSenders().forEach((sender: any) => {
          if (sender.track && sender.track.kind === 'audio') {
            sender.track.enabled = isMicMuted // toggle: if currently muted, enable
          }
        })
        setIsMicMuted(!isMicMuted)
      }
    } catch (e) {
      console.error('[SIP] Mic mute failed:', e)
    }
  }

  // === PHASE 1: IN-CALL DTMF ===
  const sendDTMF = (digit: string) => {
    if (!userAgent) return
    try {
      const session = (userAgent as any).session
      if (!session || !session.sessionDescriptionHandler) return
      
      // Try SIP INFO method first (most compatible)
      const options = {
        requestOptions: {
          body: {
            contentDisposition: 'render',
            contentType: 'application/dtmf-relay',
            content: `Signal=${digit}\r\nDuration=160`
          }
        }
      }
      session.info(options)
      console.log(`[DTMF] Sent digit: ${digit}`)
    } catch (e) {
      console.error('[DTMF] Send failed:', e)
    }
  }

  // === PHASE 1: BLIND TRANSFER ===
  const handleBlindTransfer = async () => {
    if (!userAgent || !transferNumber.trim()) return
    try {
      const session = (userAgent as any).session
      if (!session) return
      
      const cleanTarget = transferNumber.trim().replace(/[\s-]/g, '')
      
      // SIP.js session.refer() accepts a URI string or a UserAgent.makeURI
      // For external numbers via trunk, route through Asterisk dialplan context
      const targetURI = UserAgent.makeURI(`sip:${cleanTarget}@sip.talkfuze.com`)
      if (!targetURI) {
        console.error('[SIP] Invalid transfer target URI')
        return
      }
      await session.refer(targetURI)
      
      console.log(`[SIP] Blind transfer to ${cleanTarget} initiated`)
      
      // Reset UI state after brief "Transferred" status display
      setShowTransferInput(false)
      setTransferNumber('')
      setStatus('Transferred')
      setTimeout(() => {
        setStatus('Registered')
        setSessionState(SessionState.Terminated)
        setActiveCallSession(null)
        setIsMuted(false)
        setIsMicMuted(false)
        setIsOnHold(false)
        setIceState('new')
        setWhmcsClientInfo(null)
        setShowInCallKeypad(false)
        stopTimer()
      }, 2000)
    } catch (e) {
      console.error('[SIP] Blind transfer failed:', e)
    }
  }

  // === PHASE 1: CLICK-TO-CALL ===
  useEffect(() => {
    if (pendingDialNumber && isRegistered && sessionState !== SessionState.Established && status !== 'Calling...' && status !== 'Incoming Call...' && status !== 'Dialing...') {
      const dialTarget = pendingDialNumber.replace(/[^\d+]/g, '')
      setNumber(dialTarget)
      setStatus('Dialing...') // Optimistic lock to prevent rapid re-entry
      clearPendingDial()
      
      // Auto-dial after short delay to let state settle
      // Capture dialTarget in closure to avoid stale pendingDialNumber reference
      setTimeout(async () => {
        if (userAgent && isRegistered) {
          try {
            setActiveCallSession({ number: dialTarget, direction: 'outbound' })
            if (currentUserRef.current?.org_id) {
              findConversationByPhone(currentUserRef.current.org_id, dialTarget)
                .then(convId => { if (convId) setMatchedConversationId(convId) })
                .catch(() => {})
            }
            await userAgent.call(`sip:${dialTarget}@sip.talkfuze.com`)
            const session = (userAgent as any).session
            if (session) {
              bindSessionEvents(session)
            }
          } catch (e) {
            console.error('Click-to-call dial failed:', e)
            setStatus('Call Failed')
            setActiveCallSession(null)
            setTimeout(() => setStatus('Registered'), 3000)
          }
        }
      }, 200)
    }
  }, [pendingDialNumber, isRegistered, sessionState, status])

  return (
    <>
      {/* Hidden audio element for WebRTC media stream */}
      <audio ref={remoteAudioRef} autoPlay />

      {/* Premium Floating Call Banner - Draggable Vertical Card */}
      {/* Premium Floating Call Banner - Sleek Draggable Pill */}
      {activeCallSession && (
        <div 
          ref={bannerRef}
          className={`fixed z-[9999] w-[370px] bg-[#1d1d1f]/85 backdrop-blur-2xl border border-white/[0.08] shadow-[0_24px_50px_rgba(0,0,0,0.7)] hover:border-white/15 transition-all duration-300 rounded-[2rem] text-white overflow-hidden ${!bannerPos ? 'animate-in fade-in slide-in-from-top-3' : ''}`}
          style={{
            left: bannerPos?.x ?? 'auto',
            top: bannerPos?.y ?? 16,
            right: bannerPos ? 'auto' : 12
          }}>
          
          <div className="absolute top-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-white/10 to-transparent" />
          
          <style>{`
            @keyframes appleWaveform {
              0%, 100% { transform: scaleY(0.35); }
              50% { transform: scaleY(1); }
            }
            .apple-wave-bar {
              transform-origin: bottom;
              animation: appleWaveform 1.2s ease-in-out infinite;
            }
          `}</style>

          {/* Top Apple Sheet Gesture Grab Handle */}
          <div 
            onMouseDown={handleDragStart}
            onTouchStart={handleDragStart}
            className="w-full h-5 flex items-center justify-center cursor-grab active:cursor-grabbing hover:bg-white/5 transition-colors absolute top-0 left-0 z-10"
          >
            <div className="w-8 h-1 rounded-full bg-white/15" />
          </div>

          {/* Main FaceTime Banner Capsule */}
          <div className="flex items-center justify-between gap-3 px-5 pb-3.5 pt-5 relative">
            <div className="flex items-center gap-3 min-w-0">
              {/* Profile Avatar with absolute overlay badge */}
              <div className="w-11 h-11 rounded-full bg-white/[0.06] border border-white/[0.08] flex items-center justify-center shrink-0 relative shadow-inner">
                <User size={20} strokeWidth={2.5} className="text-white/80" />
                <div className="absolute -bottom-1 -right-1 bg-black border border-white/20 rounded-full p-[2px] shadow-md flex items-center justify-center">
                  <Smartphone size={8} className="text-white" />
                </div>
              </div>

              {/* Identity & Subtitle details */}
              <div className="flex flex-col min-w-0">
                <span className="font-semibold text-white text-[14.5px] leading-snug tracking-wide truncate">
                  {isPhoneNumber(incomingCallerName) ? `+${incomingCallerName}` : incomingCallerName || 'Inbound Call'}
                </span>
                <span className="text-[11px] text-white/60 font-medium leading-none mt-1">
                  {status === 'Connected' ? `from your iPhone - ${formatTime(callDuration)}` :
                   status === 'Incoming Call...' ? 'Incoming Call...' :
                   status === 'Connecting...' ? 'Connecting...' :
                   status === 'Calling...' || status === 'Dialing...' ? 'Calling...' : status}
                </span>
              </div>
            </div>

            {/* Glowing Green Siri Waveform Visualizer */}
            {sessionState === SessionState.Established && (
              <div className="flex items-end gap-[2px] h-5 px-1.5 shrink-0 bg-transparent mb-0.5">
                {[6, 12, 18, 10, 14, 16, 8, 12, 15, 6].map((h, i) => (
                  <span 
                    key={i} 
                    className="w-[2.5px] rounded-full bg-emerald-400 apple-wave-bar shrink-0 shadow-[0_0_8px_rgba(52,211,153,0.5)]"
                    style={{ 
                      height: `${h}px`, 
                      animationDelay: `${i * 0.08}s`
                    }}
                  ></span>
                ))}
              </div>
            )}
          </div>

          {/* Action Row - 5 Circular Buttons */}
          <div className="flex items-center justify-between px-6 pb-5 pt-1.5">
            {/* Keypad Grid Toggle */}
            <button
              onClick={() => setShowInCallKeypad(!showInCallKeypad)}
              disabled={status === 'Incoming Call...'}
              className={`w-[42px] h-[42px] rounded-full flex items-center justify-center transition-all cursor-pointer border ${
                showInCallKeypad
                  ? 'bg-white text-neutral-900 border-white shadow-lg'
                  : 'bg-white/10 border-white/5 text-white hover:bg-white/20 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed'
              }`}
              title="Keypad"
            >
              <Grid3X3 size={18} strokeWidth={2.5} />
            </button>

            {/* Hold/Resume */}
            <button
              onClick={handleHold}
              disabled={status === 'Incoming Call...'}
              className={`w-[42px] h-[42px] rounded-full flex items-center justify-center transition-all cursor-pointer border ${
                isOnHold
                  ? 'bg-amber-500 border-amber-400 text-white shadow-lg shadow-amber-500/20'
                  : 'bg-white/10 border-white/5 text-white hover:bg-white/20 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed'
              }`}
              title={isOnHold ? "Resume" : "Hold"}
            >
              {isOnHold ? <Play size={18} strokeWidth={2.5} /> : <Pause size={18} strokeWidth={2.5} />}
            </button>

            {/* Mic Mute */}
            <button
              onClick={handleMicMute}
              disabled={status === 'Incoming Call...'}
              className={`w-[42px] h-[42px] rounded-full flex items-center justify-center transition-all cursor-pointer border ${
                isMicMuted
                  ? 'bg-rose-500 border-rose-400 text-white shadow-lg shadow-rose-500/20'
                  : 'bg-white/10 border-white/5 text-white hover:bg-white/20 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed'
              }`}
              title={isMicMuted ? "Unmute Mic" : "Mute Mic"}
            >
              {isMicMuted ? <MicOff size={18} strokeWidth={2.5} /> : <Mic size={18} strokeWidth={2.5} />}
            </button>

            {/* Expand / Chevron Down details */}
            <button
              onClick={() => setIsClientExpanded(!isClientExpanded)}
              className={`w-[42px] h-[42px] rounded-full flex items-center justify-center transition-all cursor-pointer border ${
                isClientExpanded
                  ? 'bg-white text-neutral-900 border-white shadow-lg'
                  : 'bg-white/10 border-white/5 text-white hover:bg-white/20 active:scale-95'
              }`}
              title="Details & Notes"
            >
              <ChevronDown size={18} strokeWidth={2.5} className={`transition-transform duration-200 ${isClientExpanded ? 'rotate-180' : ''}`} />
            </button>

            {/* End Call / Answer Trigger */}
            {status === 'Incoming Call...' ? (
              <div className="flex gap-2 shrink-0">
                <button 
                  onClick={handleMuteRing}
                  disabled={isMuted}
                  className={`w-[42px] h-[42px] rounded-full flex items-center justify-center transition-all cursor-pointer border ${
                    isMuted 
                      ? 'bg-white/5 border-white/5 text-white/30 cursor-not-allowed'
                      : 'bg-amber-500 hover:bg-amber-600 border-amber-400 text-white active:scale-95 shadow-lg shadow-amber-500/20'
                  }`}
                  title="Mute Ring"
                >
                  <VolumeX size={18} strokeWidth={2.5} />
                </button>
                <button 
                  onClick={handleAnswer}
                  className="w-[42px] h-[42px] rounded-full bg-[#34c759] hover:bg-[#30b351] border border-[#34c759]/10 text-white flex items-center justify-center transition-all shadow-[0_4px_12px_rgba(52,199,89,0.3)] active:scale-95 cursor-pointer animate-pulse"
                  title="Answer"
                >
                  <Phone size={18} strokeWidth={2.5} />
                </button>
              </div>
            ) : (
              <button 
                onClick={handleHangup}
                disabled={!canHangUp}
                className={`w-[42px] h-[42px] rounded-full flex items-center justify-center transition-all cursor-pointer border ${
                  !canHangUp 
                    ? 'bg-white/5 border-white/10 text-white/50 cursor-not-allowed shadow-none'
                    : 'bg-[#ff3b30] hover:bg-[#ff453a] border border-[#ff3b30]/10 text-white active:scale-95 shadow-[0_4px_12px_rgba(255,59,48,0.3)]'
                }`}
                title={!canHangUp ? "Connecting..." : "Hang up"}
              >
                {!canHangUp ? (
                  <Loader2 size={18} className="animate-spin text-white/40" />
                ) : (
                  <PhoneOff size={18} strokeWidth={2.5} />
                )}
              </button>
            )}
          </div>

          {/* Bottom Expandable Details Tray */}
          {isClientExpanded && (whmcsClientInfo || lastCallInfo) && (
            <div className="border-t border-white/10 bg-black/40 p-4 space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
              
              {/* Transfer Input Overlay inside tray */}
              {showTransferInput && (
                <div className="flex items-center gap-1.5 p-2 bg-white/5 rounded-lg border border-white/10 focus-within:border-emerald-500/30 transition-all">
                  <input
                    type="text"
                    value={transferNumber}
                    onChange={(e) => setTransferNumber(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleBlindTransfer() }}
                    placeholder="Transfer number..."
                    className="flex-1 text-[11.5px] bg-transparent outline-none text-white placeholder-white/30"
                    autoFocus
                  />
                  <button
                    onClick={handleBlindTransfer}
                    disabled={!transferNumber.trim()}
                    className="text-[10px] font-bold px-2.5 py-1 rounded bg-[#34c759] text-white hover:bg-[#30b351] active:scale-95 disabled:opacity-40 transition-all cursor-pointer"
                  >
                    Transfer
                  </button>
                </div>
              )}

              {/* In-Call DTMF Mini Keypad inside tray */}
              {showInCallKeypad && sessionState === SessionState.Established && (
                <div className="grid grid-cols-4 gap-1 p-2 bg-white/5 rounded-lg border border-white/10">
                  {['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'].map((key) => (
                    <button
                      key={key}
                      onClick={() => sendDTMF(key)}
                      className="h-7 rounded bg-white/10 hover:bg-white/20 text-[11px] font-bold text-white flex items-center justify-center active:scale-90 transition-all border border-white/5 cursor-pointer"
                    >
                      {key}
                    </button>
                  ))}
                </div>
              )}

              {/* WHMCS Profile details */}
              {whmcsClientInfo && (
                <div className="space-y-2 text-[12px]">

                  <div className="flex justify-between">
                    <span className="text-white/60 font-medium">Name</span>
                    <span className="text-white font-bold">{whmcsClientInfo.name}</span>
                  </div>
                  {whmcsClientInfo.email && (
                    <div className="flex justify-between">
                      <span className="text-white/60 font-medium">Email</span>
                      <span className="text-white/80 font-medium max-w-[180px] truncate">{whmcsClientInfo.email}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 pt-2">
                    {whmcsClientInfo.services !== undefined && whmcsClientInfo.services > 0 ? (
                      <span className="flex-1 flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg text-[13px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,199,89,0.5)]"></span>
                        {whmcsClientInfo.services} Active
                      </span>
                    ) : null}
                    {whmcsClientInfo.unpaid !== undefined && whmcsClientInfo.unpaid > 0 ? (
                      <span className="flex-1 flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg text-[13px] font-bold bg-rose-500/15 text-rose-400 border border-rose-500/20">
                        <span className="w-2 h-2 rounded-full bg-rose-400 shadow-[0_0_6px_rgba(244,63,94,0.5)]"></span>
                        ৳{whmcsClientInfo.unpaid.toLocaleString()} Due
                      </span>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2 mt-3 w-full">
                    <a
                      href={`https://my.hostnin.com/root/clientssummary.php?userid=${whmcsClientInfo.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-white/10 border border-white/5 hover:bg-white/20 rounded-xl text-[11px] font-bold text-white transition-all active:scale-[0.98]"
                    >
                      <ExternalLink size={12} />
                      View Profile
                    </a>
                    {matchedConversationId && (
                      <button
                        onClick={() => setSelectedId(matchedConversationId)}
                        type="button"
                        className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-[#0070f3] hover:bg-blue-600 rounded-xl text-[11px] font-bold text-white transition-all active:scale-[0.98] shadow-sm hover:shadow"
                      >
                        <MessageSquare size={12} />
                        Go to Chat
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Previous Call */}
              {lastCallInfo && (
                <div className="flex items-center justify-between bg-white/5 border border-white/5 rounded-xl px-3 py-2 text-[11px]">
                  <span className="text-white/60 font-medium">Last Call</span>
                  <span className="text-white font-semibold">
                    {(() => {
                      const diff = Date.now() - new Date(lastCallInfo.created_at).getTime()
                      const mins = Math.floor(diff / 60000)
                      const hours = Math.floor(diff / 3600000)
                      const days = Math.floor(diff / 86400000)
                      const timeAgo = days > 0 ? `${days}d ago` : hours > 0 ? `${hours}h ago` : `${mins}m ago`
                      const dur = lastCallInfo.duration_seconds
                      const durStr = dur >= 60 ? `${Math.floor(dur / 60)}m ${dur % 60}s` : `${dur}s`
                      return `${timeAgo} (${durStr})`
                    })()}
                  </span>
                </div>
              )}


            </div>
          )}
        </div>
      )}

      {/* Floating Dialer Trigger Button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 w-14 h-14 bg-slate-100 border border-slate-200 dark:bg-slate-800 dark:border-slate-700 text-slate-500 hover:text-blue-500 hover:bg-blue-50 dark:text-slate-400 dark:hover:text-blue-400 dark:hover:bg-slate-700/80 rounded-full shadow-lg flex items-center justify-center transition-all hover:scale-105 z-50 cursor-pointer"
        >
          <Phone strokeWidth={2.5} size={22} />
          {isRegistered && <span className="absolute top-0 right-0 w-3 h-3 bg-emerald-500 border-2 border-white dark:border-slate-800 rounded-full" />}
        </button>
      )}

      {/* Dialer Panel */}
      {isOpen && (
        <div className="fixed bottom-6 right-6 w-[250px] bg-white dark:bg-slate-900 rounded-[2rem] shadow-2xl border border-slate-200 dark:border-slate-800 z-50 overflow-hidden flex flex-col pb-4">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-transparent">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-700 dark:text-slate-200 text-sm">TalkFuze Dialer</span>
            </div>
            <button onClick={() => setIsOpen(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
              <X size={18} />
            </button>
          </div>

          {/* Status Banner */}
          <div className={`px-4 py-1.5 text-xs font-medium text-center ${
            status === 'Connected' ? 'bg-blue-100 text-blue-700' :
            status === 'Registered' ? 'bg-blue-50 text-blue-600' :
            status === 'Calling...' ? 'bg-amber-100 text-amber-700' :
            'bg-slate-100 text-slate-500'
          }`}>
            {status === 'Connected' ? `Connected ${formatTime(callDuration)}` : status}
          </div>

          {/* Active Tab Conflict Overlay */}
          {isTabConflict ? (
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center bg-white/60 dark:bg-slate-900/60 backdrop-blur-md z-10">
              <Volume2 className="w-12 h-12 text-blue-500 dark:text-blue-400 mb-3 animate-pulse" />
              <h3 className="font-semibold text-slate-800 dark:text-slate-100 text-sm mb-1">Dialer Active in Another Tab</h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-5 leading-relaxed">
                TalkFuze dialer is running in another tab. Activate here to receive calls on this screen.
              </p>
              <button
                onClick={handleActivateDialer}
                className="px-4 py-2 bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white rounded-full text-xs font-semibold shadow-md active:scale-95 transition-all cursor-pointer"
              >
                Activate Dialer Here
              </button>
            </div>
          ) : (
            <>
              {/* Display */}
              <div className="px-4 py-4 flex items-center justify-center relative min-h-[64px]">
                <input
                  type="text"
                  value={number}
                  onChange={(e) => setNumber(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      if (number && isRegistered && sessionState !== SessionState.Established && status !== 'Calling...' && status !== 'Dialing...') {
                        handleDial();
                      }
                    }
                  }}
                  className="w-full text-center text-2xl font-light bg-transparent outline-none text-slate-800 dark:text-slate-100 tracking-widest placeholder-slate-300"
                  placeholder=""
                  autoFocus
                />
              </div>

              {/* Microphone Blocked Warning Banner */}
              {hasMicPermission === false && (
                <div className="mx-4 mb-2 p-2.5 bg-rose-50 border border-rose-100 rounded-2xl flex items-start gap-2 text-rose-700 dark:bg-rose-950/20 dark:border-rose-900/50 dark:text-rose-400">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <div className="flex flex-col gap-0.5">
                    <span className="font-semibold text-[11px]">Microphone Blocked</span>
                    <span className="text-[9.5px] leading-snug">Allow mic access in your browser settings to make and receive calls.</span>
                  </div>
                </div>
              )}

              {/* Keypad */}
              <div className="px-6 pb-2">
                <div className="grid grid-cols-3 gap-x-4 gap-y-3 mb-5">
                  {['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'].map((key) => (
                    <button
                      key={key}
                      onClick={() => handleKeyPress(key)}
                      onPointerDown={(e) => e.preventDefault()}
                      className="aspect-square rounded-full bg-slate-100/50 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 flex flex-col items-center justify-center active:bg-slate-300 dark:active:bg-slate-600 transition-colors cursor-pointer"
                    >
                      <span className="text-2xl font-light text-slate-800 dark:text-slate-100">{key}</span>
                    </button>
                  ))}
                </div>

                {/* Action Buttons */}
                <div className="flex justify-center items-center relative w-full h-[64px] mb-2">
                  {status === 'Incoming Call...' ? (
                    <div className="flex gap-4">
                      <button
                        onClick={handleMuteRing}
                        disabled={isMuted}
                        className={`w-[64px] h-[64px] rounded-full flex items-center justify-center shadow-md transition-all ${
                          isMuted 
                            ? 'bg-slate-200 dark:bg-slate-800 text-slate-400 cursor-not-allowed shadow-inner'
                            : 'bg-amber-500 hover:bg-amber-600 active:scale-95 text-white shadow-[0_4px_12px_rgba(245,158,11,0.25)] cursor-pointer'
                        }`}
                      >
                        <VolumeX size={24} strokeWidth={2} />
                      </button>
                      <button
                        onClick={handleAnswer}
                        className="w-[64px] h-[64px] rounded-full bg-blue-600 hover:bg-blue-500 text-white flex items-center justify-center shadow-md active:scale-95 transition-all cursor-pointer"
                      >
                        <Phone size={24} strokeWidth={2} className="animate-pulse" />
                      </button>
                    </div>
                  ) : sessionState === SessionState.Established || status === 'Calling...' || status === 'Dialing...' ? (
                    <button
                      onClick={handleHangup}
                      className="w-[64px] h-[64px] rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center shadow-md active:scale-95 transition-all cursor-pointer"
                    >
                      <PhoneOff size={24} strokeWidth={2} />
                    </button>
                  ) : (
                    <button
                      onClick={handleDial}
                      disabled={!number || !isRegistered}
                      className="w-[64px] h-[64px] rounded-full bg-blue-600 hover:bg-blue-500 disabled:bg-blue-400 disabled:cursor-not-allowed text-white flex items-center justify-center shadow-md active:scale-95 transition-all cursor-pointer"
                    >
                      <Phone size={24} strokeWidth={2} />
                    </button>
                  )}

                  {/* Delete Button */}
                  {number.length > 0 && sessionState !== SessionState.Established && status !== 'Calling...' && status !== 'Dialing...' && status !== 'Incoming Call...' && (
                    <button 
                      onClick={() => setNumber(prev => prev.slice(0, -1))}
                      onPointerDown={(e) => e.preventDefault()}
                      className="absolute right-2 w-12 h-12 flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full active:scale-95 transition-all cursor-pointer"
                    >
                      <Delete size={22} strokeWidth={1.5} />
                    </button>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </>
  )
}
