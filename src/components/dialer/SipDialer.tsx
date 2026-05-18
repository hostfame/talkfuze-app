"use client"

import React, { useState, useEffect, useRef } from 'react'
import { Phone, PhoneOff, X, PhoneCall, Delete } from 'lucide-react'
import { Web, SessionState } from 'sip.js'

export default function SipDialer() {
  const [isOpen, setIsOpen] = useState(false)
  const [number, setNumber] = useState('')
  const [status, setStatus] = useState('Disconnected')
  const [isRegistered, setIsRegistered] = useState(false)
  
  const [userAgent, setUserAgent] = useState<Web.SimpleUser | null>(null)
  const [sessionState, setSessionState] = useState<SessionState>(SessionState.Initial)
  
  const remoteAudioRef = useRef<HTMLAudioElement>(null)

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
        authorizationUsername: "talkfuze_agent"
      }
    })

    simpleUser.delegate = {
      onCallCreated: () => setStatus('Calling...'),
      onCallAnswered: () => {
        setStatus('Connected')
        setSessionState(SessionState.Established)
      },
      onCallHangup: () => {
        setStatus('Registered')
        setSessionState(SessionState.Terminated)
      },
      onRegistered: () => {
        setStatus('Registered')
        setIsRegistered(true)
      },
      onUnregistered: () => {
        setStatus('Disconnected')
        setIsRegistered(false)
      },
      onServerDisconnect: () => {
        setStatus('Disconnected')
        setIsRegistered(false)
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
      simpleUser.disconnect()
    }
  }, [])

  const handleDial = async () => {
    if (!userAgent || !number) return
    try {
      setStatus('Dialing...')
      await userAgent.call(`sip:${number}@sip.talkfuze.com`)
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

  const handleKeyPress = (num: string) => {
    setNumber(prev => prev + num)
  }

  return (
    <>
      {/* Hidden audio element for WebRTC media stream */}
      <audio ref={remoteAudioRef} autoPlay />

      {/* Floating Button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 w-14 h-14 bg-emerald-500 hover:bg-emerald-600 text-white rounded-full shadow-lg flex items-center justify-center transition-transform hover:scale-105 z-50"
        >
          <Phone strokeWidth={2.5} size={24} />
          {isRegistered && <span className="absolute top-0 right-0 w-3 h-3 bg-white border-2 border-emerald-500 rounded-full" />}
        </button>
      )}

      {/* Dialer Popup */}
      {isOpen && (
        <div className="fixed bottom-6 right-6 w-[280px] bg-white dark:bg-slate-900 rounded-[2rem] shadow-2xl border border-slate-200 dark:border-slate-800 z-50 overflow-hidden flex flex-col pb-4">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 bg-transparent">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-700 dark:text-slate-200 text-sm">TalkFuze</span>
            </div>
            <button onClick={() => setIsOpen(false)} className="text-slate-400 hover:text-slate-600">
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
            {status}
          </div>

          {/* Display */}
          <div className="px-6 py-6 flex items-center justify-between relative min-h-[80px]">
            <input
              type="text"
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              className="w-full text-center text-3xl font-light bg-transparent outline-none text-slate-800 dark:text-slate-100 tracking-widest placeholder-slate-300"
              placeholder=""
            />
            {number.length > 0 && (
              <button 
                onClick={() => setNumber(prev => prev.slice(0, -1))}
                className="absolute right-4 text-slate-400 hover:text-slate-600 active:scale-95 transition-all"
              >
                <Delete size={24} strokeWidth={1.5} />
              </button>
            )}
          </div>

          {/* Keypad */}
          <div className="px-8 pb-2">
            <div className="grid grid-cols-3 gap-x-6 gap-y-4 mb-6">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'].map((key) => (
                <button
                  key={key}
                  onClick={() => handleKeyPress(key)}
                  className="aspect-square rounded-full bg-slate-100/50 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 flex flex-col items-center justify-center active:bg-slate-300 dark:active:bg-slate-600 transition-colors"
                >
                  <span className="text-3xl font-light text-slate-800 dark:text-slate-100">{key}</span>
                </button>
              ))}
            </div>

            {/* Action Buttons */}
            <div className="flex justify-center items-center">
              {sessionState === SessionState.Established || status === 'Calling...' || status === 'Dialing...' ? (
                <button
                  onClick={handleHangup}
                  className="w-[72px] h-[72px] rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center shadow-md active:scale-95 transition-all"
                >
                  <PhoneOff size={24} strokeWidth={2} />
                </button>
              ) : (
                <button
                  onClick={handleDial}
                  disabled={!number || !isRegistered}
                  className="w-[72px] h-[72px] rounded-full bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-300 disabled:cursor-not-allowed text-white flex items-center justify-center shadow-md active:scale-95 transition-all"
                >
                  <Phone size={24} strokeWidth={2} />
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
