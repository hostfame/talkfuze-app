"use client"

import React, { useState, useEffect, useRef } from 'react'
import { Phone, PhoneOff, X, PhoneCall } from 'lucide-react'
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
        await simpleUser.register({
          requestOptions: {
            extraHeaders: [
              'Authorization: Digest username="talkfuze_agent", password="talkfuze_secure_pass_123"'
            ]
          }
        })
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
        <div className="fixed bottom-6 right-6 w-80 bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 z-50 overflow-hidden flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <PhoneCall size={18} className="text-emerald-500" />
              <span className="font-semibold text-slate-700 dark:text-slate-200">TalkFuze Dialer</span>
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
          <div className="px-4 py-4 text-center">
            <input
              type="text"
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              className="w-full text-center text-2xl font-semibold bg-transparent outline-none text-slate-800 dark:text-slate-100 tracking-wider"
              placeholder="0961..."
            />
          </div>

          {/* Keypad */}
          <div className="px-6 pb-5">
            <div className="grid grid-cols-3 gap-2 mb-4">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'].map((key) => (
                <button
                  key={key}
                  onClick={() => handleKeyPress(key)}
                  className="w-full h-10 rounded-full bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center justify-center text-lg font-medium text-slate-700 dark:text-slate-200 active:bg-slate-200 transition-colors"
                >
                  {key}
                </button>
              ))}
            </div>

            {/* Action Buttons */}
            <div className="flex justify-center items-center gap-4">
              {sessionState === SessionState.Established || status === 'Calling...' || status === 'Dialing...' ? (
                <button
                  onClick={handleHangup}
                  className="w-12 h-12 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center shadow-md shadow-red-500/20 active:scale-95 transition-all"
                >
                  <PhoneOff size={20} />
                </button>
              ) : (
                <button
                  onClick={handleDial}
                  disabled={!number || !isRegistered}
                  className="w-12 h-12 rounded-full bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-300 disabled:cursor-not-allowed text-white flex items-center justify-center shadow-md shadow-emerald-500/20 active:scale-95 transition-all"
                >
                  <Phone size={20} />
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
