"use client"

import { useEffect, useState } from "react"
import { PhoneIncoming, PhoneOutgoing, Clock, Search, Calendar, PhoneOff, X } from "lucide-react"
import { getCallLogs } from "@/actions/calls"
import { useInboxStore } from "@/lib/store"

export default function CallsPage() {
  const { currentUser } = useInboxStore()
  const orgId = currentUser?.org_id || ""
  const isAdmin = currentUser?.role === 'admin'
  
  const [logs, setLogs] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  
  const [searchQuery, setSearchQuery] = useState('')
  const [dateFilter, setDateFilter] = useState('')

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

  const filteredLogs = logs.filter(log => {
    const matchesSearch = log.from_number.includes(searchQuery) || log.to_number.includes(searchQuery)
    const logDate = new Date(log.created_at).toISOString().split('T')[0]
    const matchesDate = dateFilter ? logDate === dateFilter : true
    return matchesSearch && matchesDate
  })

  return (
    <div className="flex-1 bg-white dark:bg-slate-900 flex flex-col h-full overflow-hidden border-l border-slate-200 dark:border-slate-800">
      {/* Sleek Inbox-Style Header */}
      <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center gap-4 bg-white/95 dark:bg-slate-900/95 z-20 sticky top-0 backdrop-blur-sm">
        <div className="relative flex-1 max-w-3xl">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input 
            type="text"
            placeholder="Search phone numbers..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-100 dark:bg-slate-800 border border-transparent rounded-lg text-[14px] text-slate-900 dark:text-white focus:bg-white dark:focus:bg-slate-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/30 transition-all outline-none"
          />
        </div>
        <div className="relative flex items-center shrink-0">
          <Calendar className="absolute left-3.5 text-slate-400 pointer-events-none z-10" size={14} />
          <input 
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="w-[160px] pl-10 pr-8 py-2 text-[14px] bg-slate-100 dark:bg-slate-800 border border-transparent rounded-lg text-slate-700 dark:text-slate-300 focus:bg-white dark:focus:bg-slate-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/30 transition-all outline-none appearance-none cursor-pointer relative"
          />
          {dateFilter && (
            <button 
              onClick={() => setDateFilter('')}
              className="absolute right-2.5 p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors z-10"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto bg-white dark:bg-slate-900 pb-48">
        {isLoading ? (
          <div className="flex items-center justify-center h-40">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-[50vh] text-center">
            <div className="w-16 h-16 bg-slate-50 dark:bg-slate-800 rounded-full flex items-center justify-center mb-4">
              <PhoneOff className="text-slate-400" size={28} />
            </div>
            <h3 className="text-lg font-medium text-slate-900 dark:text-white mb-1">No call history found</h3>
            <p className="text-[14px] text-slate-500 max-w-sm">No calls match your current search filters.</p>
          </div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 bg-slate-50/95 dark:bg-slate-800/95 backdrop-blur-sm z-10">
              <tr className="border-b border-slate-200 dark:border-slate-800 text-[12px] font-semibold tracking-wider text-slate-500 dark:text-slate-400 uppercase">
                <th className="py-3 px-6 whitespace-nowrap">Direction</th>
                <th className="py-3 px-6 whitespace-nowrap">From</th>
                <th className="py-3 px-6 whitespace-nowrap">To</th>
                <th className="py-3 px-6 whitespace-nowrap">Date</th>
                <th className="py-3 px-6 whitespace-nowrap">Duration</th>
                <th className="py-3 px-6 whitespace-nowrap">Status</th>
                {isAdmin && <th className="py-3 px-6 whitespace-nowrap">Recording</th>}
              </tr>
            </thead>
            <tbody className="text-[14px] divide-y divide-slate-100 dark:divide-slate-800/60">
              {filteredLogs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/30 transition-colors group">
                  <td className="py-3 px-6 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      {log.direction === 'inbound' ? (
                        <PhoneIncoming size={15} className={log.status === 'MISSED' ? 'text-rose-500' : 'text-blue-500'} />
                      ) : (
                        <PhoneOutgoing size={15} className="text-emerald-500" />
                      )}
                      <span className="font-medium text-slate-700 dark:text-slate-300 capitalize">{log.direction}</span>
                    </div>
                  </td>
                  <td className="py-3 px-6 text-slate-600 dark:text-slate-400 font-mono text-[13px] whitespace-nowrap">{log.from_number}</td>
                  <td className="py-3 px-6 text-slate-600 dark:text-slate-400 font-mono text-[13px] whitespace-nowrap">{log.to_number}</td>
                  <td className="py-3 px-6 text-slate-500 dark:text-slate-400 whitespace-nowrap">{formatDate(log.created_at)}</td>
                  <td className="py-3 px-6 text-slate-600 dark:text-slate-400 whitespace-nowrap">
                    <div className="flex items-center gap-1.5">
                      <Clock size={14} className="text-slate-400" /> {formatDuration(log.duration_seconds)}
                    </div>
                  </td>
                  <td className="py-3 px-6 whitespace-nowrap">
                    <span className={`px-2.5 py-1 text-[11px] font-bold rounded-md uppercase tracking-wide
                      ${log.status === 'ANSWERED' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 
                        log.status === 'MISSED' ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400' : 
                        'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'}`}
                    >
                      {log.status}
                    </span>
                  </td>
                  {isAdmin && (
                    <td className="py-3 px-6 w-64 whitespace-nowrap">
                      {log.recording_url ? (
                        <audio controls controlsList="nodownload" className="h-[32px] w-full max-w-[220px] opacity-70 group-hover:opacity-100 transition-opacity" src={log.recording_url} />
                      ) : (
                        <span className="text-slate-400 text-[13px] italic">No recording</span>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
