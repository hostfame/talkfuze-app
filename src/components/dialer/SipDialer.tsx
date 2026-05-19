"use client"

import React, { useState, useEffect, useRef } from 'react'
import { Phone, PhoneOff, X, PhoneCall, Delete } from 'lucide-react'
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

  useEffect(() => {
    if (typeof window === 'undefined') return;

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

    simpleUser.delegate = {
      onCallReceived: () => {
        setStatus('Incoming Call...')
        setSessionState(SessionState.Initial)
        
        const session = (simpleUser as any).session
        let callerId = 'Unknown'
        if (session && session.remoteIdentity) {
          callerId = session.remoteIdentity.uri.user || 'Unknown'
          setNumber(callerId)
        }

        // Play premium synthesized ringing tone
        playSynthesizedRing()

        // Lookup caller name dynamically from contacts
        if (callerId !== 'Unknown' && currentUser?.org_id) {
          const cleanCaller = callerId.replace(/\D/g, '')
          supabase
            .from('contacts')
            .select('name')
            .eq('org_id', currentUser.org_id)
            .or(`phone.eq.${cleanCaller},platform_id.like.%${cleanCaller}%`)
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
      onCallCreated: () => setStatus('Calling...'),
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
      },
      onRegistered: () => {
        setStatus('Registered')
        setIsRegistered(true)
      },
      onUnregistered: () => {
        setStatus('Disconnected')
        setIsRegistered(false)
        stopSynthesizedRing()
        stopTimer()
      },
      onServerDisconnect: () => {
        setStatus('Disconnected')
        setIsRegistered(false)
        stopSynthesizedRing()
        stopTimer()
      }
    }

    const connectSIP = async () => {
      try {
        setStatus('Connecting...')
        await simpleUser.connect()
        await simpleUser.register()
      } catch (err) {
        console.error("SIP Connection Error:", err)
        setStatus('Connection Failed')
      }
    }

    setUserAgent(simpleUser)
    connectSIP()

    return () => {
      stopTimer()
      stopSynthesizedRing()
      simpleUser.disconnect()
    }
  }, [currentUser])

  const handleDial = async () => {
    if (!userAgent || !number) return
    try {
      setStatus('Dialing...')
      const cleanNumber = number.replace(/[\s-]/g, '')
      await userAgent.call(`sip:${cleanNumber}@sip.talkfuze.com`)
    } catch (e) {
      console.error("Dial failed", e)
      setStatus('Call Failed')
      setTimeout(() => setStatus('Registered'), 3000)
    }
  }

  const handleHangup = async () => {
    if (!userAgent) return
    try {
      await userAgent.hangup()
    } catch (e) {
      console.error("Hangup failed", e)
    }
  }

  const handleAnswer = async () => {
    if (!userAgent) return
    try {
      setStatus('Connecting...')
      stopSynthesizedRing()
      await userAgent.answer()
    } catch (e) {
      console.error("Answer failed", e)
    }
  }

  const handleDecline = async () => {
    if (!userAgent) return
    try {
      stopSynthesizedRing()
      await userAgent.decline()
      setStatus('Registered')
    } catch (e) {
      console.error("Decline failed", e)
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
      {status === 'Incoming Call...' && (
        <div className="fixed top-6 right-6 z-[9999] w-[340px] bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border border-white/20 dark:border-slate-800/80 shadow-[0_15px_30px_rgba(0,0,0,0.12)] dark:shadow-[0_20px_40px_rgba(0,0,0,0.4)] rounded-3xl p-4 flex items-center justify-between gap-3 transition-all duration-500 animate-in fade-in slide-in-from-top-5 duration-300">
          <div className="flex items-center gap-3 min-w-0">
            {/* Avatar with ringing pulsing ripples */}
            <div className="relative shrink-0">
              <div className="absolute inset-0 bg-emerald-500 rounded-full animate-ping opacity-25" />
              <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-blue-500 to-indigo-600 text-white flex items-center justify-center font-bold text-[16px] shadow-md">
                {incomingCallerName ? incomingCallerName.slice(0, 2).toUpperCase() : 'IN'}
              </div>
            </div>
            
            {/* Text Information */}
            <div className="flex flex-col min-w-0">
              <span className="font-bold text-slate-900 dark:text-white text-[15px] truncate">
                {incomingCallerName || 'Inbound Call'}
              </span>
              <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium truncate">
                TalkFuze Call • {number}
              </span>
            </div>
          </div>
          
          {/* Apple-style Decline and Answer circular pill actions */}
          <div className="flex items-center gap-2.5 shrink-0">
            <button 
              onClick={handleDecline}
              className="w-10 h-10 rounded-full bg-rose-500 hover:bg-rose-600 active:scale-95 text-white flex items-center justify-center transition-all shadow-[0_4px_12px_rgba(239,68,68,0.25)] cursor-pointer"
              title="Decline"
            >
              <PhoneOff size={16} strokeWidth={2.5} />
            </button>
            <button 
              onClick={handleAnswer}
              className="w-10 h-10 rounded-full bg-emerald-500 hover:bg-emerald-600 active:scale-95 text-white flex items-center justify-center transition-all shadow-[0_4px_12px_rgba(16,185,129,0.25)] cursor-pointer"
              title="Answer"
            >
              <Phone size={16} strokeWidth={2.5} className="animate-bounce" style={{ animationDuration: '1.2s' }} />
            </button>
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
                    onClick={handleDecline}
                    className="w-[64px] h-[64px] rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center shadow-md active:scale-95 transition-all cursor-pointer"
                  >
                    <PhoneOff size={24} strokeWidth={2} />
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
        </div>
      )}
    </>
  )
}
