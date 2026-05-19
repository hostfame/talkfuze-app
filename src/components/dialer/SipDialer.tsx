"use client"

import React, { useState, useEffect, useRef } from 'react'
import { Phone, PhoneOff, X, PhoneCall, Delete, VolumeX, Volume2, AlertTriangle } from 'lucide-react'
import { Web, SessionState } from 'sip.js'
import { useInboxStore } from '@/lib/store'
import { supabase } from '@/lib/supabase'

export default function SipDialer() {
  const { currentUser } = useInboxStore()
  const [isOpen, setIsOpen] = useState(false)
  const [number, setNumber] = useState('')
  const [status, setStatus] = useState('Disconnected')
  const [isRegistered, setIsRegistered] = useState(false)
  const [callDuration, setCallDuration] = useState(0)
  const [incomingCallerName, setIncomingCallerName] = useState('')
  
  const [userAgent, setUserAgent] = useState<Web.SimpleUser | null>(null)
  const [sessionState, setSessionState] = useState<SessionState>(SessionState.Initial)
  
  const [isMuted, setIsMuted] = useState(false)
  const [activeCallSession, setActiveCallSession] = useState<{ number: string; direction: 'inbound' | 'outbound' } | null>(null)
  const activeCallSessionRef = useRef<any>(null)
  
  // Sync the ref on every render to bypass stale closures in event listeners
  activeCallSessionRef.current = activeCallSession
  
  const [isTabConflict, setIsTabConflict] = useState(false)
  const [hasMicPermission, setHasMicPermission] = useState<boolean | null>(null)
  const [iceState, setIceState] = useState('new')
  
  const remoteAudioRef = useRef<HTMLAudioElement>(null)
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  
  // Web Audio API Ringtone Synth references
  const audioContextRef = useRef<AudioContext | null>(null)
  const ringOscillatorsRef = useRef<OscillatorNode[]>([])
  const ringIntervalRef = useRef<NodeJS.Timeout | null>(null)

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
      const pc = session.peerConnection;
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
      const pc = session.peerConnection
      if (pc) {
        console.log(`[WebRTC] Initial ICE State: ${pc.iceConnectionState}`)
        setIceState(pc.iceConnectionState)
        pc.oniceconnectionstatechange = () => {
          console.log(`[WebRTC] ICE Connection State Changed: ${pc.iceConnectionState}`)
          setIceState(pc.iceConnectionState)
        }
      } else {
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

    // Initialize SIP.js SimpleUser
    const server = 'wss://sip.talkfuze.com/ws'
    const aor = 'sip:talkfuze_agent@sip.talkfuze.com'
    
    const simpleUser = new Web.SimpleUser(server, {
      aor,
      media: {
        remote: {
          audio: remoteAudioRef.current as HTMLAudioElement
        }
      },
      userAgentOptions: {
        authorizationPassword: "talkfuze_secure_pass_123",
        authorizationUsername: "talkfuze_agent",
        displayName: currentUser?.name || "TalkFuze Agent"
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

    const connectSIP = async () => {
      if (isTabConflict) return
      try {
        isReconnecting = false
        setStatus('Connecting...')
        await simpleUser.connect()
        await simpleUser.register()
        reconnectAttempts = 0
      } catch (err) {
        console.error("SIP Connection Error:", err)
        setStatus('Connection Failed')
        triggerBackoffReconnect()
      }
    }

    const triggerBackoffReconnect = () => {
      if (isTabConflict) return
      if (isReconnecting) return
      isReconnecting = true
      
      const delay = Math.min(Math.pow(2, reconnectAttempts) * 1000, 30000)
      reconnectAttempts++
      console.log(`[SIP] Reconnecting in ${delay / 1000}s (Attempt ${reconnectAttempts})`)
      
      if (reconnectTimeout) clearTimeout(reconnectTimeout)
      reconnectTimeout = setTimeout(() => {
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
      },
      onRegistered: () => {
        setStatus('Registered')
        setIsRegistered(true)
        reconnectAttempts = 0
      },
      onUnregistered: () => {
        setStatus('Disconnected')
        setIsRegistered(false)
        stopSynthesizedRing()
        stopTimer()
        setActiveCallSession(null)
        setIsMuted(false)
        triggerBackoffReconnect()
      },
      onServerDisconnect: () => {
        setStatus('Disconnected')
        setIsRegistered(false)
        stopSynthesizedRing()
        stopTimer()
        setActiveCallSession(null)
        setIsMuted(false)
        triggerBackoffReconnect()
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
    
    // Explicit browser gesture autoplay bypass
    if (remoteAudioRef.current) {
      remoteAudioRef.current.play().catch(e => console.warn('[WebRTC] Autoplay bypass failed on dial:', e))
    }
    
    try {
      setStatus('Dialing...')
      const cleanNumber = number.replace(/[\s-]/g, '')
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
      setTimeout(() => setStatus('Registered'), 3000)
    }
  }

  const handleHangup = async () => {
    if (!userAgent) return
    
    // Instant Optimistic Reset to ensure perfect real-time feedback
    setStatus('Registered')
    setSessionState(SessionState.Terminated)
    stopSynthesizedRing()
    stopTimer()
    setActiveCallSession(null)
    setIsMuted(false)
    setIceState('new')
    
    try {
      await userAgent.hangup()
    } catch (e) {
      console.error("Hangup failed", e)
    }
  }

  const handleAnswer = async () => {
    if (!userAgent) return
    
    // Instant Optimistic Connect UI change
    setStatus('Connecting...')
    stopSynthesizedRing()
    
    // Explicit browser gesture autoplay bypass
    if (remoteAudioRef.current) {
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
    
    try {
      await userAgent.decline()
    } catch (e) {
      console.error("Decline failed", e)
    }
  }

  const handleMuteRing = () => {
    setIsMuted(true)
    stopSynthesizedRing()
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
    setNumber(prev => prev + num)
  }

  return (
    <>
      {/* Hidden audio element for WebRTC media stream */}
      <audio ref={remoteAudioRef} autoPlay />

      {/* Modern Premium macOS Incoming Call Floating Banner Notification */}
      {activeCallSession && (
        <div className="fixed top-6 right-6 z-[9999] w-[340px] bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border border-white/20 dark:border-slate-800/80 shadow-[0_15px_30px_rgba(0,0,0,0.12)] dark:shadow-[0_20px_40px_rgba(0,0,0,0.4)] rounded-3xl p-4 flex items-center justify-between gap-3 transition-all duration-500 animate-in fade-in slide-in-from-top-5 duration-300">
          <div className="flex items-center gap-3 min-w-0">
            {/* Avatar with ringing pulsing ripples */}
            <div className="relative shrink-0">
              {status === 'Incoming Call...' && !isMuted && (
                <div className="absolute inset-0 bg-emerald-500 rounded-full animate-ping opacity-25" />
              )}
              <div className={`w-12 h-12 rounded-full bg-gradient-to-tr ${
                status === 'Connected' ? 'from-emerald-500 to-teal-600' : 'from-blue-500 to-indigo-600'
              } text-white flex items-center justify-center font-bold text-[16px] shadow-md`}>
                {incomingCallerName ? incomingCallerName.slice(0, 2).toUpperCase() : 'IN'}
              </div>
            </div>
            
            {/* Text Information */}
            <div className="flex flex-col min-w-0">
              <span className="font-bold text-slate-900 dark:text-white text-[15px] truncate">
                {incomingCallerName || 'Inbound Call'}
              </span>
              <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium truncate flex items-center gap-1">
                {iceState === 'disconnected' ? (
                  <>
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-500 animate-pulse shrink-0" />
                    <span className="text-amber-600 dark:text-amber-400 font-semibold animate-pulse">Weak Connection • Reconnecting audio...</span>
                  </>
                ) : (
                  status === 'Connected' ? `Connected • ${formatTime(callDuration)}` :
                  status === 'Incoming Call...' ? `Incoming Call • ${number}` :
                  status === 'Connecting...' ? 'Connecting...' :
                  status === 'Calling...' || status === 'Dialing...' ? 'Calling...' :
                  `${status} • ${number}`
                )}
              </span>
            </div>
          </div>
          
          {/* Apple-style Decline and Answer circular pill actions */}
          <div className="flex items-center gap-2.5 shrink-0">
            {status === 'Incoming Call...' ? (
              <>
                <button 
                  onClick={handleMuteRing}
                  disabled={isMuted}
                  className={`w-10 h-10 rounded-full flex items-center justify-center transition-all cursor-pointer ${
                    isMuted 
                      ? 'bg-slate-200 dark:bg-slate-800 text-slate-400 cursor-not-allowed shadow-inner'
                      : 'bg-amber-500 hover:bg-amber-600 active:scale-95 text-white shadow-[0_4px_12px_rgba(245,158,11,0.25)]'
                  }`}
                  title={isMuted ? "Muted" : "Mute Ringtone"}
                >
                  <VolumeX size={16} strokeWidth={2.5} />
                </button>
                <button 
                  onClick={handleAnswer}
                  className="w-10 h-10 rounded-full bg-emerald-500 hover:bg-emerald-600 active:scale-95 text-white flex items-center justify-center transition-all shadow-[0_4px_12px_rgba(16,185,129,0.25)] cursor-pointer"
                  title="Answer"
                >
                  <Phone size={16} strokeWidth={2.5} className="animate-bounce" style={{ animationDuration: '1.2s' }} />
                </button>
              </>
            ) : (
              <button 
                onClick={handleHangup}
                className="w-10 h-10 rounded-full bg-rose-500 hover:bg-rose-600 active:scale-95 text-white flex items-center justify-center transition-all shadow-[0_4px_12px_rgba(239,68,68,0.25)] cursor-pointer"
                title="Hang up"
              >
                <PhoneOff size={16} strokeWidth={2.5} />
              </button>
            )}
          </div>
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
