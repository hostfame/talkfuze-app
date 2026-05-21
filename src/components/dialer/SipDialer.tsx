"use client"

import React, { useState, useEffect, useRef } from 'react'
import { Phone, PhoneOff, X, PhoneCall, Delete, VolumeX, Volume2, AlertTriangle, User, Loader2, Pause, Play, PhoneForwarded, Grid3X3, Mic, MicOff, ChevronDown, ExternalLink } from 'lucide-react'
import { Web, SessionState, UserAgent } from 'sip.js'
import { useInboxStore } from '@/lib/store'
import { useAuth } from '@/lib/auth-context'
import { supabase } from '@/lib/supabase'
import { fetchWhmcsClient, fetchWhmcsServices, fetchWhmcsUnpaidInvoices } from '@/actions/whmcs'
import { getLastCallForNumber, findConversationByPhone, saveCallNote } from '@/actions/calls'

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
  
  // Sync the ref on every render to bypass stale closures in event listeners
  activeCallSessionRef.current = activeCallSession
  
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

      const x = Math.max(0, Math.min(clientX - dragOffsetRef.current.x, window.innerWidth - 350))
      const y = Math.max(0, Math.min(clientY - dragOffsetRef.current.y, window.innerHeight - 100))
      
      // Directly manipulate DOM for 60fps buttery-smooth dragging
      banner.style.left = `${x}px`
      banner.style.top = `${y}px`
      banner.style.right = 'auto' // override default right position
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
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = setInterval(() => {
      setCallDuration(prev => prev + 1)
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
      
      const triggerRingCycle = () => {
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
            ctx.close()
          } catch(e) {}
        }, 2200)
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
        audioContextRef.current.close()
      }
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
    if (!session) return
    
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
    const channel = new BroadcastChannel('talkfuze_dialer_lock')
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
        displayName: sipUser?.name || "TalkFuze Agent"
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
        if (callerId !== 'Unknown' && currentUser?.org_id) {
          const cleanCaller = callerId.replace(/\D/g, '')
          const last10 = cleanCaller.slice(-10) // Extract last 10 digits to resolve country-code prefixes
          
          // First check local contacts
          supabase
            .from('contacts')
            .select('name')
            .eq('org_id', currentUser.org_id)
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
                
                let activeServices = 0
                let unpaidAmount = 0
                
                try {
                  const servicesRes = await fetchWhmcsServices(client.id)
                  if (servicesRes && servicesRes.products) {
                    activeServices = servicesRes.products.filter((p: any) => p.status?.toLowerCase() === 'active').length
                  }
                } catch (e) {
                  console.error("Failed to fetch active services:", e)
                }

                try {
                  const unpaidRes = await fetchWhmcsUnpaidInvoices(client.id)
                  if (unpaidRes) {
                    unpaidAmount = unpaidRes.reduce((sum: number, inv: any) => sum + parseFloat(inv.total || '0'), 0)
                  }
                } catch (e) {
                  console.error("Failed to fetch unpaid invoices:", e)
                }
                
                setWhmcsClientInfo({
                  id: client.id,
                  name: name,
                  email: (client as any).email || '',
                  status: (client as any).status || '',
                  services: activeServices,
                  unpaid: unpaidAmount
                })
              }
            })
            .catch(err => console.error("WHMCS dynamic client lookup failed:", err))

          // Fetch last call history for this number
          if (currentUser?.org_id) {
            getLastCallForNumber(currentUser.org_id, cleanCaller)
              .then(lastCall => { if (lastCall) setLastCallInfo(lastCall) })
              .catch(() => {})

            // Auto-find conversation for this caller
            findConversationByPhone(currentUser.org_id, cleanCaller)
              .then(convId => {
                if (convId) {
                  setMatchedConversationId(convId)
                  setSelectedId(convId) // Auto-navigate to their conversation
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
        setStatus('Connected')
        setSessionState(SessionState.Established)
        stopSynthesizedRing()
        startTimer()
      },
      onCallHangup: () => {
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
      channel.removeEventListener('message', handleChannelMessage)
      channel.close()
      simpleUser.disconnect()
    }
  }, [currentUser])

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
    
    setCanHangUp(false)
    setTimeout(() => {
      setCanHangUp(true)
    }, 5000)
    
    // Instant Optimistic Connect UI change
    setStatus('Connecting...')
    stopSynthesizedRing()
    
    // Explicit browser gesture autoplay bypass + unmute if ring was muted
    if (remoteAudioRef.current) {
      remoteAudioRef.current.muted = false
      remoteAudioRef.current.play().catch(e => console.warn('[WebRTC] Autoplay bypass failed on answer:', e))
    }
    
    try {
      await userAgent.answer()
    } catch (e) {
      console.error("Answer failed", e)
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
    if (typeof window !== 'undefined') {
      const channel = new BroadcastChannel('talkfuze_dialer_lock')
      channel.postMessage('dialer_claim_active')
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
          className={`fixed z-[9999] w-[340px] bg-gradient-to-b from-[#1c222b] to-[#12161c] text-white border border-emerald-500/20 shadow-[0_12px_40px_rgba(0,0,0,0.4),0_0_20px_rgba(16,185,129,0.06)] rounded-2xl overflow-hidden ${!bannerPos ? 'animate-in fade-in slide-in-from-top-3' : ''}`}
          style={bannerPos ? { left: bannerPos.x, top: bannerPos.y } : { top: 16, right: 12 }}>
          
          {/* Main Pill Row */}
          <div className="flex items-center justify-between gap-2.5 px-3 py-2.5 min-h-[58px] bg-slate-900/40">
            {/* Drag Handle & Avatar */}
            <div 
              className="flex items-center gap-2 cursor-grab active:cursor-grabbing shrink-0"
              onMouseDown={handleDragStart}
              onTouchStart={handleDragStart}
            >
              {/* Sleek dotted drag handle */}
              <div className="flex flex-col gap-0.5 opacity-40 hover:opacity-75">
                <div className="flex gap-0.5">
                  <span className="w-0.5 h-0.5 rounded-full bg-emerald-400"></span>
                  <span className="w-0.5 h-0.5 rounded-full bg-emerald-400"></span>
                </div>
                <div className="flex gap-0.5">
                  <span className="w-0.5 h-0.5 rounded-full bg-emerald-400"></span>
                  <span className="w-0.5 h-0.5 rounded-full bg-emerald-400"></span>
                </div>
                <div className="flex gap-0.5">
                  <span className="w-0.5 h-0.5 rounded-full bg-emerald-400"></span>
                  <span className="w-0.5 h-0.5 rounded-full bg-emerald-400"></span>
                </div>
              </div>
              
              <div className="w-8 h-8 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center shrink-0 shadow-inner relative group">
                <User size={15} strokeWidth={2.5} className="text-emerald-400" />
                {sessionState === SessionState.Established && (
                  <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 border-2 border-[#1c222b] animate-pulse"></span>
                )}
              </div>
            </div>

            {/* Identity & Status */}
            <div className="flex flex-col min-w-0 flex-1 justify-center">
              <span className="font-bold text-slate-100 text-[12.5px] tracking-wide truncate leading-tight">
                {isPhoneNumber(incomingCallerName) ? `+${incomingCallerName}` : incomingCallerName || 'Inbound Call'}
              </span>
              <span className="text-[10px] text-slate-400 font-semibold flex items-center gap-1.5 mt-1">
                {iceState === 'disconnected' ? (
                  <>
                    <AlertTriangle className="w-2.5 h-2.5 text-amber-500 animate-pulse shrink-0" />
                    <span className="text-amber-400 font-semibold animate-pulse">Weak Connection</span>
                  </>
                ) : (
                  status === 'Connected' ? (
                    <span className="text-emerald-400 font-bold flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                      {`Connected • ${formatTime(callDuration)}`}
                    </span>
                  ) :
                  status === 'Incoming Call...' ? (
                    <span className="text-emerald-400 font-semibold animate-pulse flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                      Incoming Call...
                    </span>
                  ) :
                  status === 'Connecting...' ? 'Connecting...' :
                  status === 'Calling...' || status === 'Dialing...' ? 'Calling...' :
                  status
                )}
              </span>
            </div>

            {/* Actions & Toggles */}
            <div className="flex items-center gap-1 shrink-0">
              {/* Toggle Info / Expand Tray (Only if info available) */}
              {(whmcsClientInfo || matchedConversationId) && (
                <button 
                  onClick={() => setIsClientExpanded(!isClientExpanded)}
                  className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all cursor-pointer border ${isClientExpanded ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'text-slate-400 border-transparent hover:text-white hover:bg-slate-800/60'}`}
                  title="Client Details & Notes"
                >
                  <ChevronDown size={14} className={`transition-transform duration-200 ${isClientExpanded ? 'rotate-180' : ''}`} />
                </button>
              )}

              {/* Controls */}
              {status === 'Incoming Call...' ? (
                <div className="flex items-center gap-1">
                  <button 
                    onClick={handleMuteRing}
                    disabled={isMuted}
                    className={`w-7 h-7 rounded-full flex items-center justify-center transition-all cursor-pointer ${
                      isMuted 
                        ? 'bg-slate-800 text-slate-600 cursor-not-allowed'
                        : 'bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 border border-amber-500/10'
                    }`}
                    title={isMuted ? "Muted" : "Mute Ring"}
                  >
                    <VolumeX size={13} strokeWidth={2.5} />
                  </button>
                  <button 
                    onClick={handleAnswer}
                    className="w-7 h-7 rounded-full bg-emerald-500 hover:bg-emerald-600 active:scale-95 text-slate-900 flex items-center justify-center transition-all shadow-md cursor-pointer animate-pulse"
                    title="Answer"
                  >
                    <Phone size={13} strokeWidth={2.5} />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-1">
                  {/* Hold/Resume */}
                  {sessionState === SessionState.Established && (
                    <button
                      onClick={handleHold}
                      className={`w-7 h-7 rounded-full flex items-center justify-center transition-all cursor-pointer border ${
                        isOnHold
                          ? 'bg-amber-500/20 border-amber-500/30 text-amber-400'
                          : 'text-slate-300 border-transparent hover:bg-slate-800/80 hover:text-white'
                      }`}
                      title={isOnHold ? "Resume" : "Hold"}
                    >
                      {isOnHold ? <Play size={12} strokeWidth={2.5} /> : <Pause size={12} strokeWidth={2.5} />}
                    </button>
                  )}
                  
                  {/* Mic Mute */}
                  {sessionState === SessionState.Established && (
                    <button
                      onClick={handleMicMute}
                      className={`w-7 h-7 rounded-full flex items-center justify-center transition-all cursor-pointer border ${
                        isMicMuted
                          ? 'bg-rose-500/20 border-rose-500/30 text-rose-400'
                          : 'text-slate-300 border-transparent hover:bg-slate-800/80 hover:text-white'
                      }`}
                      title={isMicMuted ? "Unmute Mic" : "Mute Mic"}
                    >
                      {isMicMuted ? <MicOff size={12} strokeWidth={2.5} /> : <Mic size={12} strokeWidth={2.5} />}
                    </button>
                  )}
                  
                  {/* DTMF Keypad Toggle */}
                  {sessionState === SessionState.Established && (
                    <button
                      onClick={() => setShowInCallKeypad(!showInCallKeypad)}
                      className={`w-7 h-7 rounded-full flex items-center justify-center transition-all cursor-pointer border ${
                        showInCallKeypad
                          ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400'
                          : 'text-slate-300 border-transparent hover:bg-slate-800/80 hover:text-white'
                      }`}
                      title="Keypad"
                    >
                      <Grid3X3 size={12} strokeWidth={2.5} />
                    </button>
                  )}
                  
                  {/* Transfer */}
                  {sessionState === SessionState.Established && (
                    <button
                      onClick={() => setShowTransferInput(!showTransferInput)}
                      className={`w-7 h-7 rounded-full flex items-center justify-center transition-all cursor-pointer border ${
                        showTransferInput
                          ? 'bg-indigo-500/20 border-indigo-500/30 text-indigo-400'
                          : 'text-slate-300 border-transparent hover:bg-slate-800/80 hover:text-white'
                      }`}
                      title="Transfer Call"
                    >
                      <PhoneForwarded size={12} strokeWidth={2.5} />
                    </button>
                  )}
                  
                  {/* Hangup */}
                  <button 
                    onClick={handleHangup}
                    disabled={!canHangUp}
                    className={`w-7 h-7 rounded-full flex items-center justify-center transition-all shadow-md cursor-pointer ${
                      !canHangUp 
                        ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                        : 'bg-rose-500 hover:bg-rose-600 hover:shadow-[0_0_12px_rgba(239,68,68,0.3)] active:scale-95 text-white'
                    }`}
                    title={!canHangUp ? "Connecting..." : "Hang up"}
                  >
                    {!canHangUp ? (
                      <Loader2 size={12} className="animate-spin text-slate-400" />
                    ) : (
                      <PhoneOff size={12} strokeWidth={2.5} />
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Bottom Expandable Details Tray */}
          {isClientExpanded && (whmcsClientInfo || matchedConversationId || lastCallInfo) && (
            <div className="border-t border-slate-800/80 bg-[#0f1217] p-3.5 space-y-3.5 animate-in fade-in slide-in-from-top-2 duration-200">
              
              {/* Transfer Input Overlay inside tray */}
              {showTransferInput && (
                <div className="flex items-center gap-1.5 p-2 bg-slate-900 rounded-lg border border-slate-800/80 focus-within:border-emerald-500/30 transition-all">
                  <input
                    type="text"
                    value={transferNumber}
                    onChange={(e) => setTransferNumber(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleBlindTransfer() }}
                    placeholder="Transfer number..."
                    className="flex-1 text-[11.5px] bg-transparent outline-none text-slate-200 placeholder-slate-500"
                    autoFocus
                  />
                  <button
                    onClick={handleBlindTransfer}
                    disabled={!transferNumber.trim()}
                    className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500 text-slate-900 hover:bg-emerald-600 active:scale-95 disabled:opacity-40 transition-all cursor-pointer"
                  >
                    Transfer
                  </button>
                </div>
              )}

              {/* In-Call DTMF Mini Keypad inside tray */}
              {showInCallKeypad && sessionState === SessionState.Established && (
                <div className="grid grid-cols-4 gap-1 p-2 bg-[#14181f] rounded-lg border border-slate-800/80">
                  {['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'].map((key) => (
                    <button
                      key={key}
                      onClick={() => sendDTMF(key)}
                      className="h-6 rounded bg-slate-800/50 hover:bg-emerald-500/20 hover:text-emerald-400 text-[10px] font-bold text-slate-300 flex items-center justify-center active:scale-90 transition-all cursor-pointer"
                    >
                      {key}
                    </button>
                  ))}
                </div>
              )}

              {/* WHMCS Profile details */}
              {whmcsClientInfo && (
                <div className="space-y-2 text-[11.5px]">
                  <div className="flex items-center justify-between border-b border-slate-900/60 pb-1.5">
                    <span className="text-slate-400 font-medium">WHMCS Client</span>
                    <span className="px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-mono text-[10px] font-bold rounded">
                      #{whmcsClientInfo.id} ({whmcsClientInfo.status})
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400 font-medium">Name</span>
                    <span className="text-slate-200 font-bold">{whmcsClientInfo.name}</span>
                  </div>
                  {whmcsClientInfo.email && (
                    <div className="flex justify-between">
                      <span className="text-slate-400 font-medium">Email</span>
                      <span className="text-slate-300 font-medium max-w-[160px] truncate">{whmcsClientInfo.email}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-1.5 pt-1">
                    {whmcsClientInfo.services && whmcsClientInfo.services > 0 ? (
                      <span className="px-2 py-0.5 rounded-full text-[9px] font-semibold bg-emerald-950/40 border border-emerald-500/20 text-emerald-400 flex items-center gap-1">
                        <span className="w-1 h-1 rounded-full bg-emerald-400"></span>
                        {whmcsClientInfo.services} Active
                      </span>
                    ) : null}
                    {whmcsClientInfo.unpaid && whmcsClientInfo.unpaid > 0 ? (
                      <span className="px-2 py-0.5 rounded-full text-[9px] font-semibold bg-rose-950/40 border border-rose-500/20 text-rose-400 flex items-center gap-1">
                        <span className="w-1 h-1 rounded-full bg-rose-400"></span>
                        ৳{whmcsClientInfo.unpaid.toLocaleString()} Unpaid
                      </span>
                    ) : null}
                  </div>
                  <a
                    href={`https://my.hostnin.com/root/clientssummary.php?userid=${whmcsClientInfo.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-center gap-1.5 w-full mt-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 hover:bg-emerald-500/20 rounded-lg text-[10px] font-bold text-emerald-400 transition-all active:scale-[0.98]"
                  >
                    <ExternalLink size={10} />
                    View WHMCS Profile
                  </a>
                </div>
              )}

              {/* Previous Call */}
              {lastCallInfo && (
                <div className="flex items-center justify-between bg-slate-900/30 border border-slate-800/40 rounded-lg px-2 py-1.5 text-[10.5px]">
                  <span className="text-slate-400 font-medium">Last Call</span>
                  <span className="text-slate-300 font-medium">
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

              {/* Call Note */}
              {matchedConversationId && (
                <div className="space-y-1.5">
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Call Note</span>
                  <div className="rounded-lg bg-[#14181f] border border-slate-800 overflow-hidden focus-within:border-emerald-500/40 transition-colors">
                    <textarea
                      value={callNote}
                      onChange={(e) => { setCallNote(e.target.value); setNoteSaved(false) }}
                      placeholder="Type brief note here..."
                      className="w-full px-2 py-1.5 text-[11px] bg-transparent outline-none text-slate-200 placeholder-slate-600 resize-none"
                      rows={2}
                    />
                    {callNote.trim() && (
                      <div className="flex items-center justify-end px-2 pb-1.5 gap-1.5">
                        {noteSaved && (
                          <span className="text-[9.5px] text-emerald-400 font-medium">Saved</span>
                        )}
                        <button
                          onClick={async () => {
                            if (!callNote.trim() || !currentUser?.org_id || !currentUser?.id) return
                            setIsSavingNote(true)
                            const res = await saveCallNote(currentUser.org_id, matchedConversationId, callNote.trim(), currentUser.id)
                            setIsSavingNote(false)
                            if (res.success) {
                              setNoteSaved(true)
                              setCallNote('')
                            }
                          }}
                          disabled={isSavingNote || noteSaved}
                          className="text-[9.5px] font-bold px-2.5 py-1 rounded bg-emerald-500 hover:bg-emerald-600 active:scale-95 text-slate-900 transition-all cursor-pointer"
                        >
                          {isSavingNote ? 'Saving...' : 'Save'}
                        </button>
                      </div>
                    )}
                  </div>
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
          className="fixed bottom-6 right-6 w-14 h-14 bg-emerald-500 hover:bg-emerald-600 text-white rounded-full shadow-lg flex items-center justify-center transition-transform hover:scale-105 z-50 cursor-pointer"
        >
          <Phone strokeWidth={2.5} size={24} />
          {isRegistered && <span className="absolute top-0 right-0 w-3 h-3 bg-white border-2 border-emerald-500 rounded-full" />}
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
            status === 'Connected' ? 'bg-emerald-100 text-emerald-700' :
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
                        className="w-[64px] h-[64px] rounded-full bg-emerald-500 hover:bg-emerald-600 text-white flex items-center justify-center shadow-md active:scale-95 transition-all cursor-pointer"
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
                      className="w-[64px] h-[64px] rounded-full bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-300 disabled:cursor-not-allowed text-white flex items-center justify-center shadow-md active:scale-95 transition-all cursor-pointer"
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
