"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { 
  BrainCircuit, 
  CheckCircle2, 
  Clock, 
  AlertCircle,
  TrendingUp,
  Archive,
  BookOpen,
  RefreshCcw
} from "lucide-react"

interface TrainingLog {
  id: string
  conversation_id: string
  raw_messages_count: number
  distilled_summary: string
  learned_tags: string[]
  status: "pending" | "processing" | "completed" | "failed"
  error_message: string
  created_at: string
}

export default function AITrainingDashboard() {
  const supabase = createClient()
  const [logs, setLogs] = useState<TrainingLog[]>([])
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({
    totalArchived: 0,
    successfullyTrained: 0,
    pending: 0,
    failed: 0
  })

  const fetchLogs = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from("ai_training_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50)

    if (data) {
      setLogs(data)
      
      // Calculate simple stats based on loaded data (in production, use aggregation)
      const trained = data.filter(l => l.status === "completed").length
      const pend = data.filter(l => l.status === "pending" || l.status === "processing").length
      const fail = data.filter(l => l.status === "failed").length
      
      setStats({
        totalArchived: data.length, // Simplified for this view
        successfullyTrained: trained,
        pending: pend,
        failed: fail
      })
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchLogs()

    // Realtime subscription for live updates
    const channel = supabase
      .channel("ai_training_logs_changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "ai_training_logs" },
        (payload) => {
          fetchLogs() // Refresh on any change
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  return (
    <div className="flex-1 flex flex-col h-full bg-[#F8FAFC] dark:bg-[#0b141a] overflow-y-auto">
      <div className="max-w-5xl w-full mx-auto p-6 md:p-10">
        
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-semibold text-slate-800 dark:text-[#e9edef] flex items-center gap-3">
              <BrainCircuit className="text-blue-500" />
              AI Observer Dashboard
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Real-time monitoring of the continuous learning distillation pipeline.
            </p>
          </div>
          <button 
            onClick={fetchLogs}
            className="p-2 rounded-lg bg-white dark:bg-[#202c33] border border-slate-200 dark:border-[#2a3942] text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[#2a3942] transition-colors"
          >
            <RefreshCcw size={18} className={loading ? "animate-spin" : ""} />
          </button>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <StatCard 
            icon={<Archive className="text-slate-500" />} 
            title="Archived (24h)" 
            value={stats.totalArchived} 
          />
          <StatCard 
            icon={<BookOpen className="text-blue-500" />} 
            title="Trained" 
            value={stats.successfullyTrained} 
          />
          <StatCard 
            icon={<Clock className="text-amber-500" />} 
            title="Processing" 
            value={stats.pending} 
          />
          <StatCard 
            icon={<AlertCircle className="text-red-500" />} 
            title="Failed" 
            value={stats.failed} 
          />
        </div>

        {/* Logs Table */}
        <div className="bg-white dark:bg-[#111b21] rounded-2xl border border-slate-200 dark:border-[#2a3942] overflow-hidden shadow-sm">
          <div className="px-6 py-4 border-b border-slate-100 dark:border-[#202c33]">
            <h2 className="text-sm font-semibold text-slate-800 dark:text-[#e9edef]">Recent Distillation Logs</h2>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
              <thead className="bg-slate-50 dark:bg-[#202c33]/50 text-slate-500 dark:text-slate-400 uppercase text-xs">
                <tr>
                  <th className="px-6 py-3 font-medium">Status</th>
                  <th className="px-6 py-3 font-medium">Time</th>
                  <th className="px-6 py-3 font-medium">Distilled Summary</th>
                  <th className="px-6 py-3 font-medium">Learned Tags</th>
                  <th className="px-6 py-3 font-medium text-right">Raw Msgs</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-[#202c33]">
                {logs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-slate-400">
                      {loading ? "Loading logs..." : "No training logs yet. Conversations will be archived after 24h of inactivity."}
                    </td>
                  </tr>
                ) : (
                  logs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50 dark:hover:bg-[#202c33]/30 transition-colors">
                      <td className="px-6 py-4">
                        <StatusBadge status={log.status} />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-xs text-slate-500">
                        {new Date(log.created_at).toLocaleString()}
                      </td>
                      <td className="px-6 py-4 max-w-md">
                        {log.distilled_summary ? (
                          <p className="truncate" title={log.distilled_summary}>{log.distilled_summary}</p>
                        ) : (
                          <span className="text-slate-400 italic">Waiting for processing...</span>
                        )}
                        {log.error_message && (
                          <p className="text-red-500 text-xs mt-1 truncate" title={log.error_message}>{log.error_message}</p>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-wrap gap-1">
                          {log.learned_tags && log.learned_tags.length > 0 ? (
                            log.learned_tags.map((tag, i) => (
                              <span key={i} className="px-2 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400 border border-blue-100 dark:border-blue-800/30">
                                {tag}
                              </span>
                            ))
                          ) : (
                            <span className="text-slate-400 text-xs">-</span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right font-medium">
                        {log.raw_messages_count > 0 ? log.raw_messages_count : '-'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}

function StatCard({ icon, title, value }: { icon: React.ReactNode, title: string, value: number }) {
  return (
    <div className="bg-white dark:bg-[#111b21] rounded-2xl border border-slate-200 dark:border-[#2a3942] p-5 shadow-sm flex items-center gap-4">
      <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#202c33]">
        {icon}
      </div>
      <div>
        <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">{title}</p>
        <p className="text-2xl font-semibold text-slate-800 dark:text-[#e9edef] mt-0.5">{value}</p>
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'completed':
      return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400 border border-green-200 dark:border-green-800/30"><CheckCircle2 size={12} /> Trained</span>
    case 'processing':
      return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400 border border-blue-200 dark:border-blue-800/30"><RefreshCcw size={12} className="animate-spin" /> Distilling</span>
    case 'failed':
      return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400 border border-red-200 dark:border-red-800/30"><AlertCircle size={12} /> Failed</span>
    default:
      return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400 border border-amber-200 dark:border-amber-800/30"><Clock size={12} /> Pending</span>
  }
}
