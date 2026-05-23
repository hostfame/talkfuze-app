"use client"

import { useEffect, useState, useRef } from "react"
import { PhoneIncoming, PhoneOutgoing, Clock, Search, Calendar, PhoneOff, X, Play, Pause, Phone, Globe } from "lucide-react"
import { getCallLogs } from "@/actions/calls"
import { useInboxStore, useGlobalAudioStore } from "@/lib/store"
import { supabase } from "@/lib/supabase"

function CustomAudioPlayer({ src }: { src: string }) {
  const audioRef = useRef<HTMLAudioElement>(null)
  
  const { currentSrc, isPlaying: globalIsPlaying, currentTime: globalCurrentTime, play, seek, speed: globalSpeed, setSpeed: setGlobalSpeed } = useGlobalAudioStore()
  const isPlaying = currentSrc === src && globalIsPlaying
  
  const [isDragging, setIsDragging] = useState(false)
  const [duration, setDuration] = useState(0)
  const [localCurrentTime, setLocalCurrentTime] = useState(0)
  const [progress, setProgress] = useState(0)
  
  // Sync with global time if this is the active track
  useEffect(() => {
    if (currentSrc === src && !isDragging) {
      setLocalCurrentTime(globalCurrentTime)
      if (duration > 0) setProgress((globalCurrentTime / duration) * 100)
    }
  }, [globalCurrentTime, currentSrc, src, isDragging, duration])

  const togglePlay = () => {
    play(src)
    if (currentSrc !== src && localCurrentTime > 0) {
      // Small delay to allow the global audio to load the new src before seeking
      setTimeout(() => seek(localCurrentTime), 50)
    }
  }

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration)
    }
  }

  const cycleSpeed = () => {
    const newSpeed = globalSpeed === 1 ? 1.5 : globalSpeed === 1.5 ? 2 : 1
    if (currentSrc === src) {
      setGlobalSpeed(newSpeed)
    }
  }

  // Use the global speed if active, otherwise local doesn't matter since it won't play
  const displaySpeed = currentSrc === src ? globalSpeed : 1

  const formatTime = (time: number) => {
    if (!time || isNaN(time)) return "0:00";
    const m = Math.floor(time / 60);
    const s = Math.floor(time % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // Real-time seek drag/scrub mechanics
  const handleScrub = (clientX: number, currentTarget: HTMLDivElement) => {
    if (!duration) return;
    const rect = currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
    const percentage = x / rect.width;
    const newTime = percentage * duration;
    
    setLocalCurrentTime(newTime);
    setProgress(percentage * 100);
    
    if (currentSrc === src) {
      seek(newTime);
    } else if (audioRef.current) {
      audioRef.current.currentTime = newTime;
    }
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    setIsDragging(true);
    handleScrub(e.clientX, e.currentTarget);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    handleScrub(e.clientX, e.currentTarget);
  };

  const handleMouseUpOrLeave = () => {
    setIsDragging(false);
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    setIsDragging(true);
    if (e.touches.length > 0) {
      handleScrub(e.touches[0].clientX, e.currentTarget);
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    if (e.touches.length > 0) {
      handleScrub(e.touches[0].clientX, e.currentTarget);
    }
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
  };

  // Wave bar heights (compact version for table rows)
  const waveHeights = [6, 10, 8, 14, 10, 16, 12, 18, 14, 20, 16, 18, 12, 14, 8, 12, 8, 10, 6, 8];

  return (
    <div className="flex flex-col gap-1 w-full max-w-[240px]">
      <div className="flex items-center gap-2.5 transition-all duration-300 bg-slate-100/80 dark:bg-slate-800/80 border border-slate-200/50 dark:border-slate-700/50 rounded-xl px-2.5 py-1.5 shadow-sm min-w-[200px]">
        <audio 
          ref={audioRef} 
          src={src} 
          preload="metadata"
          onLoadedMetadata={handleLoadedMetadata}
          className="hidden"
        />
        
        <button 
          onClick={togglePlay} 
          className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 transition-all duration-200 hover:scale-105 active:scale-95 shadow-sm bg-[#0070f3] text-white hover:bg-[#0062d2]"
        >
          {isPlaying ? (
             <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>
          ) : (
             <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" className="ml-0.5"><path d="M8 5v14l11-7z"/></svg>
          )}
        </button>

        <div className="flex-1 flex flex-col justify-center gap-0.5 overflow-hidden pr-1">
          <div className="flex items-center gap-2 w-full">
            <div 
              className="flex items-end gap-[2px] h-5 flex-1 cursor-pointer select-none group/wave relative py-0.5"
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUpOrLeave}
              onMouseLeave={handleMouseUpOrLeave}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
            >
              {waveHeights.map((h, i) => {
                const barProgress = (i / waveHeights.length) * 100;
                const isActive = progress >= barProgress;
                return (
                  <div 
                    key={i} 
                    className="w-[2.5px] rounded-full transition-colors duration-150 relative z-10"
                    style={{ 
                      height: `${h}px`, 
                      backgroundColor: isActive ? '#0070f3' : 'rgba(0,112,243,0.15)' 
                    }}
                  />
                );
              })}
              <div 
                className={`absolute top-1/2 -translate-y-1/2 -ml-1 w-2 h-2 rounded-full shadow-sm transition-all duration-75 z-20 pointer-events-none ${isDragging ? 'scale-125' : 'scale-100'}`}
                style={{ 
                  left: `${progress}%`,
                  backgroundColor: '#0070f3'
                }}
              />
            </div>
          </div>
          <div className="text-[9px] font-semibold flex justify-between tracking-wide px-0.5 text-slate-400 dark:text-slate-500">
            <span>{formatTime(localCurrentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        <button 
          onClick={cycleSpeed}
          className="text-[10px] font-bold text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 shrink-0 w-6 text-center transition-colors bg-slate-200/50 dark:bg-slate-700/50 py-0.5 rounded-md hover:bg-slate-200 dark:hover:bg-slate-700"
        >
          {displaySpeed}x
        </button>
      </div>
    </div>
  )
}

interface CallLog {
  id: string;
  direction: string;
  from_number: string;
  to_number: string;
  created_at: string;
  duration_seconds: number;
  status: string;
  recording_url?: string | null;
  agent_name?: string | null;
  customer_name?: string | null;
  call_type?: string | null;
  conversation_id?: string | null;
}

export default function CallsPage() {
  const { currentUser } = useInboxStore()
  const orgId = currentUser?.org_id || ""
  const isAdmin = currentUser?.role === 'admin'
  const hasRecordingAccess = isAdmin || currentUser?.email === 'aisha@hostnin.com' || currentUser?.name === 'Aisha'
  
  const [logs, setLogs] = useState<CallLog[]>([])
  const [isLoading, setIsLoading] = useState(true)
  
  const [searchQuery, setSearchQuery] = useState('')
  const [dateFilter, setDateFilter] = useState('')

  useEffect(() => {
    if (!orgId) return

    getCallLogs(orgId).then(data => {
      setLogs(data)
      setIsLoading(false)
    })

    // Establish dynamic real-time postgres_changes subscription for newly logged calls
    const channel = supabase
      .channel('call-logs-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'call_logs', filter: `org_id=eq.${orgId}` },
        async (payload) => {
          const newLog = payload.new as CallLog
          if (newLog.call_type === 'browser') return // Exclude browser calls from real-time log list
          
          // Pre-enrich customer name in-memory to prevent visual delays
          const customerPhone = newLog.direction === 'inbound' ? newLog.from_number : newLog.to_number
          const cleanCustomer = customerPhone ? customerPhone.replace(/\D/g, '') : ''
          const last10 = cleanCustomer.slice(-10)

          let matchedContactName = null
          if (cleanCustomer) {
            const { data: contact } = await supabase
              .from('contacts')
              .select('name')
              .eq('org_id', orgId)
              .or(`phone.eq.${cleanCustomer},phone.like.%${last10},platform_id.like.%${cleanCustomer}%`)
              .maybeSingle()
              
            if (contact) {
              matchedContactName = contact.name
            }
          }

          setLogs(prev => [
            { ...newLog, customer_name: matchedContactName },
            ...prev
          ].slice(0, 50))
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [orgId])

  const formatDuration = (seconds: number) => {
    if (!seconds) return "0s"
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    if (m > 0) return `${m}m ${s}s`
    return `${s}s`
  }

  const formatDate = (isoString: string) => {
    const d = new Date(isoString)
    return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  }

  const getStatusBadge = (status: string) => {
    const s = (status || '').toUpperCase()
    if (s === 'ANSWERED' || s === 'ANSWER') {
      return (
        <span className="px-2.5 py-1 text-[11px] font-bold rounded-md uppercase tracking-wide bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
          Answered
        </span>
      )
    }
    if (s === 'CANCEL' || s === 'CANCELLED') {
      return (
        <span className="px-2.5 py-1 text-[11px] font-bold rounded-md uppercase tracking-wide bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
          Cancelled
        </span>
      )
    }
    if (s === 'NOANSWER' || s === 'NO ANSWER') {
      return (
        <span className="px-2.5 py-1 text-[11px] font-bold rounded-md uppercase tracking-wide bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400">
          No Answer
        </span>
      )
    }
    if (s === 'MISSED') {
      return (
        <span className="px-2.5 py-1 text-[11px] font-bold rounded-md uppercase tracking-wide bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400">
          Missed
        </span>
      )
    }
    if (s === 'BUSY') {
      return (
        <span className="px-2.5 py-1 text-[11px] font-bold rounded-md uppercase tracking-wide bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400">
          Busy
        </span>
      )
    }
    if (s === 'CHANUNAVAIL' || s === 'CONGESTION') {
      return (
        <span className="px-2.5 py-1 text-[11px] font-bold rounded-md uppercase tracking-wide bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400">
          Failed
        </span>
      )
    }
    return (
      <span className="px-2.5 py-1 text-[11px] font-bold rounded-md uppercase tracking-wide bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400">
        {status}
      </span>
    )
  }

  const filteredLogs = logs.filter(log => {
    if (log.call_type === 'browser') return false // Guarantee browser calls are excluded
    const matchesSearch = log.from_number.includes(searchQuery) || log.to_number.includes(searchQuery) || (log.customer_name && log.customer_name.toLowerCase().includes(searchQuery.toLowerCase()))
    const logDate = new Date(log.created_at).toISOString().split('T')[0]
    const matchesDate = dateFilter ? logDate === dateFilter : true
    return matchesSearch && matchesDate
  })

  return (
    <div className="flex-1 bg-white dark:bg-slate-900 flex flex-col h-full overflow-hidden border-l border-slate-200 dark:border-slate-800">
      {/* Sleek Inbox-Style Header */}
      <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center gap-4 bg-white/95 dark:bg-slate-900/95 z-20 sticky top-0 backdrop-blur-sm">
        <div className="flex-1">
          <h1 className="text-xl font-semibold text-slate-900 dark:text-white">
            Calls History
          </h1>
          <p className="text-[13px] text-slate-500">View telephony call histories and audio playback recordings.</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Search name or phone..."
            className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white text-[13px] rounded-md outline-none focus:ring-1 focus:ring-blue-500 w-56 transition-all"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <input
            type="date"
            className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white text-[13px] rounded-md outline-none focus:ring-1 focus:ring-blue-500 transition-all"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
          />
          {dateFilter && (
            <button
              onClick={() => setDateFilter('')}
              className="text-[12px] text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
            >
              Clear Date
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-[12px] font-semibold tracking-wider text-slate-500 dark:text-slate-400 uppercase bg-slate-50/95 dark:bg-slate-800/95">
                  <th className="py-3 px-6 whitespace-nowrap">Direction</th>
                  <th className="py-3 px-6 whitespace-nowrap">Agent</th>
                  <th className="py-3 px-6 whitespace-nowrap">Customer</th>
                  <th className="py-3 px-6 whitespace-nowrap">Date</th>
                  <th className="py-3 px-6 whitespace-nowrap">Duration</th>
                  <th className="py-3 px-6 whitespace-nowrap">Status</th>
                  {hasRecordingAccess && <th className="py-3 px-6 whitespace-nowrap">Recording</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="py-4 px-6 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 rounded bg-slate-100 dark:bg-slate-800 shrink-0" />
                        <div className="h-4 bg-slate-100 dark:bg-slate-800 rounded w-16" />
                      </div>
                    </td>
                    <td className="py-4 px-6 whitespace-nowrap">
                      <div className="flex flex-col gap-1.5">
                        <div className="h-4 bg-slate-100 dark:bg-slate-800 rounded w-28" />
                        <div className="h-3 bg-slate-50 dark:bg-slate-800/50 rounded w-20" />
                      </div>
                    </td>
                    <td className="py-4 px-6 whitespace-nowrap">
                      <div className="flex flex-col gap-1.5">
                        <div className="h-4 bg-slate-100 dark:bg-slate-800 rounded w-32" />
                        <div className="h-3 bg-slate-50 dark:bg-slate-800/50 rounded w-24" />
                      </div>
                    </td>
                    <td className="py-4 px-6 whitespace-nowrap">
                      <div className="h-4 bg-slate-100 dark:bg-slate-800 rounded w-28" />
                    </td>
                    <td className="py-4 px-6 whitespace-nowrap">
                      <div className="h-4 bg-slate-100 dark:bg-slate-800 rounded w-14" />
                    </td>
                    <td className="py-4 px-6 whitespace-nowrap">
                      <div className="h-6 bg-slate-100 dark:bg-slate-800 rounded w-16" />
                    </td>
                    {hasRecordingAccess && (
                      <td className="py-4 px-6 whitespace-nowrap">
                        <div className="h-8 bg-slate-100 dark:bg-slate-800 rounded-full w-44" />
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center py-12">
            <div className="w-16 h-16 bg-slate-50 dark:bg-slate-800 rounded-full flex items-center justify-center mb-4">
              <PhoneOff className="text-slate-400" size={28} />
            </div>
            <h3 className="text-lg font-medium text-slate-900 dark:text-white mb-1">No call history found</h3>
            <p className="text-[14px] text-slate-500 max-w-sm">No calls match your current search filters.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 bg-slate-50/95 dark:bg-slate-800/95 backdrop-blur-sm z-10">
              <tr className="border-b border-slate-200 dark:border-slate-800 text-[12px] font-semibold tracking-wider text-slate-500 dark:text-slate-400 uppercase">
                <th className="py-3 px-6 whitespace-nowrap">Direction</th>
                <th className="py-3 px-6 whitespace-nowrap">Agent</th>
                <th className="py-3 px-6 whitespace-nowrap">Customer</th>
                <th className="py-3 px-6 whitespace-nowrap">Date</th>
                <th className="py-3 px-6 whitespace-nowrap">Duration</th>
                <th className="py-3 px-6 whitespace-nowrap">Status</th>
                {hasRecordingAccess && <th className="py-3 px-6 whitespace-nowrap">Recording</th>}
              </tr>
            </thead>
            <tbody className="text-[14px] divide-y divide-slate-100 dark:divide-slate-800/60">
              {filteredLogs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/30 transition-colors group">
                  <td className="py-3 px-6 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      {log.call_type === 'browser' ? (
                        <Globe size={15} className="text-blue-500" />
                      ) : log.direction === 'inbound' ? (
                        <PhoneIncoming size={15} className={log.status === 'MISSED' || log.status === 'NOANSWER' || log.status === 'NO ANSWER' ? 'text-slate-400' : 'text-blue-500'} />
                      ) : (
                        <PhoneOutgoing size={15} className="text-blue-500" />
                      )}
                      <span className="font-medium text-slate-700 dark:text-slate-300 capitalize">
                        {log.call_type === 'browser' ? 'Browser' : log.direction}
                      </span>
                    </div>
                  </td>
                  <td className="py-3 px-6 whitespace-nowrap">
                    <div className="flex flex-col">
                      <span className="font-semibold text-slate-800 dark:text-slate-200">
                        {log.agent_name && log.agent_name !== 'Client' ? log.agent_name : (currentUser?.name || 'Imran Mahmud')}
                      </span>
                      <span className="text-[11px] text-slate-400 font-mono">09617875955</span>
                    </div>
                  </td>
                  <td className="py-3 px-6 whitespace-nowrap">
                    <div className="flex flex-col">
                      <span className="font-semibold text-slate-800 dark:text-slate-200">
                        {log.customer_name || 'Unknown Contact'}
                      </span>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                        {log.direction === 'inbound' ? log.from_number : log.to_number}
                      </span>
                    </div>
                  </td>
                  <td className="py-3 px-6 text-slate-500 dark:text-slate-400 whitespace-nowrap">{formatDate(log.created_at)}</td>
                  <td className="py-3 px-6 text-slate-600 dark:text-slate-400 whitespace-nowrap">
                    <div className="flex items-center gap-1.5">
                      <Clock size={14} className="text-slate-400" /> {formatDuration(log.duration_seconds)}
                    </div>
                  </td>
                  <td className="py-3 px-6 whitespace-nowrap">
                    {getStatusBadge(log.status)}
                  </td>
                  {hasRecordingAccess && (
                    <td className="py-3 px-6 w-64 whitespace-nowrap">
                      {(log.status === 'ANSWERED' || log.status === 'ANSWER') && log.duration_seconds > 0 && log.recording_url ? (
                        <CustomAudioPlayer src={log.recording_url} />
                      ) : (
                        <span className="text-slate-400/70 text-[13px] italic">—</span>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>
    </div>
  )
}
