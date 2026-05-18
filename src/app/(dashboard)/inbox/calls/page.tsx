"use client"

import { useEffect, useState } from "react"
import { Phone, PhoneIncoming, PhoneOutgoing, PhoneMissed, Clock, PlayCircle } from "lucide-react"
import { getCallLogs } from "@/actions/calls"
import { useInboxStore } from "@/lib/store"

export default function CallsPage() {
  const { currentUser } = useInboxStore()
  const orgId = currentUser?.org_id || ""
  
  const [logs, setLogs] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (orgId) {
      getCallLogs(orgId).then(data => {
        setLogs(data)
        setIsLoading(false)
      })
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

  return (
    <div className="flex-1 bg-white dark:bg-slate-900 flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="h-[72px] border-b border-slate-200 dark:border-slate-800 flex items-center px-8 shrink-0 bg-white/95 dark:bg-slate-900/95 z-10 sticky top-0">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            <Phone className="text-blue-500" size={20} />
            Call History
          </h1>
          <p className="text-[13px] text-slate-500 mt-0.5">Track and listen to inbound and outbound calls.</p>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-8 bg-slate-50/50 dark:bg-slate-950/50">
        {isLoading ? (
          <div className="flex items-center justify-center h-40">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-[50vh] text-center border border-dashed border-slate-300 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900/50">
            <div className="w-16 h-16 bg-blue-50 dark:bg-blue-900/20 rounded-full flex items-center justify-center mb-4">
              <Phone className="text-blue-500" size={28} />
            </div>
            <h3 className="text-lg font-medium text-slate-900 dark:text-white mb-1">No call history yet</h3>
            <p className="text-[14px] text-slate-500 max-w-sm">Calls made or received through TalkFuze will appear here along with their audio recordings.</p>
          </div>
        ) : (
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 text-[13px] font-medium text-slate-500 dark:text-slate-400">
                  <th className="py-3 px-6 font-medium">Direction</th>
                  <th className="py-3 px-6 font-medium">From</th>
                  <th className="py-3 px-6 font-medium">To</th>
                  <th className="py-3 px-6 font-medium">Date</th>
                  <th className="py-3 px-6 font-medium">Duration</th>
                  <th className="py-3 px-6 font-medium">Status</th>
                  <th className="py-3 px-6 font-medium">Recording</th>
                </tr>
              </thead>
              <tbody className="text-[14px] divide-y divide-slate-100 dark:divide-slate-800">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/30 transition-colors">
                    <td className="py-3.5 px-6">
                      <div className="flex items-center gap-2">
                        {log.direction === 'inbound' ? (
                          <PhoneIncoming size={16} className={log.status === 'MISSED' ? 'text-rose-500' : 'text-blue-500'} />
                        ) : (
                          <PhoneOutgoing size={16} className="text-emerald-500" />
                        )}
                        <span className="font-medium text-slate-700 dark:text-slate-300 capitalize">{log.direction}</span>
                      </div>
                    </td>
                    <td className="py-3.5 px-6 text-slate-600 dark:text-slate-400 font-mono text-[13px]">{log.from_number}</td>
                    <td className="py-3.5 px-6 text-slate-600 dark:text-slate-400 font-mono text-[13px]">{log.to_number}</td>
                    <td className="py-3.5 px-6 text-slate-500 dark:text-slate-400">{formatDate(log.created_at)}</td>
                    <td className="py-3.5 px-6 text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
                      <Clock size={14} className="text-slate-400" /> {formatDuration(log.duration_seconds)}
                    </td>
                    <td className="py-3.5 px-6">
                      <span className={`px-2.5 py-1 text-[11px] font-bold rounded-md uppercase tracking-wide
                        ${log.status === 'ANSWERED' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 
                          log.status === 'MISSED' ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400' : 
                          'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'}`}
                      >
                        {log.status}
                      </span>
                    </td>
                    <td className="py-3.5 px-6 w-64">
                      {log.recording_url ? (
                        <audio controls controlsList="nodownload" className="h-8 w-full max-w-[200px]" src={log.recording_url} />
                      ) : (
                        <span className="text-slate-400 text-[13px] italic">No recording</span>
                      )}
                    </td>
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
