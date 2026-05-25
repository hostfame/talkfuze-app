"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { validateRuleEffectiveness } from "@/actions/ai"
import { 
  BrainCircuit, 
  CheckCircle2, 
  Clock, 
  AlertCircle,
  Archive,
  BookOpen,
  RefreshCcw,
  Play,
  Sparkles,
  ChevronRight,
  ShieldCheck,
  Check,
  X,
  Zap,
  Activity
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

interface CorrectedDraft {
  id: string
  ai_draft: string
  agent_sent: string
  customer_context: string
  correction_feedback: string
  validation_score: number | null
  validation_verdict: string | null
  validation_draft: string | null
  created_at: string
}

export default function AITrainingDashboard() {
  const supabase = createClient()
  const [activeTab, setActiveTab] = useState<'observer' | 'validation'>('observer')
  
  // Tab 1: Observer States
  const [logs, setLogs] = useState<TrainingLog[]>([])
  const [loading, setLoading] = useState(true)
  const [testing, setTesting] = useState(false)
  const [stats, setStats] = useState({
    totalArchived: 0,
    successfullyTrained: 0,
    pending: 0,
    failed: 0
  })

  // Tab 2: Validation States
  const [correctedDrafts, setCorrectedDrafts] = useState<CorrectedDraft[]>([])
  const [loadingValidation, setLoadingValidation] = useState(false)
  const [validatingId, setValidatingId] = useState<string | null>(null)

  const fetchLogs = async () => {
    setLoading(true)
    const getCount = async (status: string | null) => {
      let query = supabase.from("ai_training_logs").select("*", { count: 'exact', head: true })
      if (status) query = query.eq('status', status)
      const { count } = await query
      return count || 0
    }

    const [total, trained, processing, pending, failed] = await Promise.all([
      getCount(null),
      getCount('completed'),
      getCount('processing'),
      getCount('pending'),
      getCount('failed')
    ])

    setStats({
      totalArchived: total,
      successfullyTrained: trained,
      pending: processing + pending,
      failed: failed
    })

    const { data } = await supabase
      .from("ai_training_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50)

    if (data) {
      setLogs(data)
    }
    setLoading(false)
  }

  const fetchValidationData = async () => {
    setLoadingValidation(true)
    const { data } = await supabase
      .from("ai_draft_logs")
      .select("id, ai_draft, agent_sent, customer_context, correction_feedback, validation_score, validation_verdict, validation_draft, created_at")
      .eq("was_edited", true)
      .not("correction_feedback", "is", null)
      .order("created_at", { ascending: false })
      .limit(20)

    if (data) {
      setCorrectedDrafts(data)
    }
    setLoadingValidation(false)
  }

  const handleTestPipeline = async () => {
    setTesting(true)
    try {
      const { data: convs, error: fetchErr } = await supabase
        .from("conversations")
        .select("id")
        .neq("status", "closed")
        .limit(1)

      if (fetchErr || !convs || convs.length === 0) {
        alert("No open conversations found to test with.")
        setTesting(false)
        return
      }

      const { error: updateErr } = await supabase
        .from("conversations")
        .update({ status: "closed" })
        .eq("id", convs[0].id)

      if (updateErr) {
        alert("Failed to close conversation: " + updateErr.message)
      }
      
      setTimeout(() => fetchLogs(), 1500)
    } catch (e) {
      console.error(e)
    }
    setTesting(false)
  }

  const handleRunValidation = async (logId: string) => {
    setValidatingId(logId)
    try {
      const res = await validateRuleEffectiveness(logId)
      if (res.success) {
        setCorrectedDrafts(prev => prev.map(d => d.id === logId ? {
          ...d,
          validation_score: res.score ?? null,
          validation_verdict: res.verdict ?? null,
          validation_draft: res.newDraft ?? null
        } : d))
      } else {
        alert("Validation failed: " + res.error)
      }
    } catch (e) {
      console.error(e)
    }
    setValidatingId(null)
  }

  useEffect(() => {
    if (activeTab === 'observer') {
      fetchLogs()
    } else {
      fetchValidationData()
    }
  }, [activeTab])

  useEffect(() => {
    // Realtime subscription for live updates
    const channel = supabase
      .channel("ai_training_logs_changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "ai_training_logs" },
        () => {
          if (activeTab === 'observer') fetchLogs()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [activeTab])

  return (
    <div className="flex-1 flex flex-col h-full bg-[#F8FAFC] dark:bg-[#0b141a] overflow-hidden">
      
      {/* Application Toolbar / Header */}
      <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111b21] flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0 z-10">
        <div className="flex items-center gap-6">
          <div>
            <h1 className="text-lg font-semibold text-slate-900 dark:text-[#e9edef]">
              AI Observer & Learning Suite
            </h1>
          </div>
          
          <div className="hidden sm:block h-5 w-px bg-slate-200 dark:bg-slate-800"></div>

          {/* Segmented Control */}
          <div className="flex bg-slate-100 dark:bg-[#0b141a] p-1 rounded-lg border border-slate-200/50 dark:border-slate-800/50">
            <button
              onClick={() => setActiveTab('observer')}
              className={`py-1.5 px-4 rounded-md text-xs font-semibold transition-all ${
                activeTab === 'observer'
                  ? "bg-white dark:bg-[#202c33] text-slate-800 dark:text-[#e9edef] shadow-sm border border-slate-200/50 dark:border-slate-700/50"
                  : "text-slate-500 hover:text-slate-800 dark:hover:text-[#e9edef]"
              }`}
            >
              Observer Logs
            </button>
            <button
              onClick={() => setActiveTab('validation')}
              className={`py-1.5 px-4 rounded-md text-xs font-semibold transition-all ${
                activeTab === 'validation'
                  ? "bg-white dark:bg-[#202c33] text-slate-800 dark:text-[#e9edef] shadow-sm border border-slate-200/50 dark:border-slate-700/50"
                  : "text-slate-500 hover:text-slate-800 dark:hover:text-[#e9edef]"
              }`}
            >
              Validation Playground
            </button>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {activeTab === 'observer' && (
            <button 
              onClick={handleTestPipeline}
              disabled={testing}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-800 dark:bg-slate-700 text-white hover:bg-slate-700 disabled:opacity-50 transition-colors shadow-sm"
            >
              {testing ? "Triggering..." : "Simulate 24h Auto-Archive"}
            </button>
          )}
          <button 
            onClick={activeTab === 'observer' ? fetchLogs : fetchValidationData}
            className="p-1.5 rounded-lg border border-slate-200 dark:border-[#2a3942] text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[#2a3942] transition-colors"
          >
            <RefreshCcw size={14} className={(loading || loadingValidation) ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-7xl w-full mx-auto p-6">
        
        {/* Tab 1: Observer Dashboard View */}
        {activeTab === 'observer' && (
          <>
            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              <StatCard title="Archived (24h)" value={stats.totalArchived} />
              <StatCard title="Trained" value={stats.successfullyTrained} />
              <StatCard title="Processing" value={stats.pending} />
              <StatCard title="Failed" value={stats.failed} />
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
                                  <span key={i} className="px-2 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-[#0070f3] dark:bg-blue-900/20 dark:text-blue-400 border border-blue-100 dark:border-blue-800/30">
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
          </>
        )}

        {/* Tab 2: Accuracy Validation View */}
        {activeTab === 'validation' && (
          <div className="space-y-6">
            <div className="bg-slate-50 dark:bg-[#111b21] rounded-xl border border-slate-200 dark:border-[#2a3942] p-4 shadow-sm">
              <h3 className="text-sm font-semibold text-slate-800 dark:text-[#e9edef] mb-1">How accuracy validation works</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                We match your past support draft corrections against our vector database. Click <strong>Run Live Test</strong> on any corrected message card. The CRM will dynamically draft a <strong>new reply</strong> with the active learning rule, then let Claude 4.5 Sonnet score the improvement side-by-side!
              </p>
            </div>

            {loadingValidation ? (
              <div className="text-center py-20 text-slate-400 text-sm flex flex-col items-center gap-3">
                <RefreshCcw className="animate-spin text-[#0070f3]" size={24} />
                Fetching corrected drafts...
              </div>
            ) : correctedDrafts.length === 0 ? (
              <div className="text-center py-20 text-slate-400 text-sm border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl">
                No draft logs with feedback found in the database.
              </div>
            ) : (
              <div className="space-y-6">
                {correctedDrafts.map((draft) => (
                  <div key={draft.id} className="bg-white dark:bg-[#111b21] rounded-xl border border-slate-200 dark:border-[#2a3942] overflow-hidden shadow-sm">
                    {/* Header: Displays active rule */}
                    <div className="px-5 py-3 bg-slate-50 dark:bg-[#202c33]/40 border-b border-slate-100 dark:border-[#2a3942] flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-slate-800 dark:text-[#e9edef]">
                          Rule: <span className="font-normal text-slate-600 dark:text-slate-300 italic">"{draft.correction_feedback}"</span>
                        </span>
                      </div>
                      <span className="text-[10px] font-semibold text-slate-400">
                        {new Date(draft.created_at).toLocaleDateString()}
                      </span>
                    </div>

                    {/* Content Split Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-100 dark:divide-[#2a3942]">
                      
                      {/* Left Side: Original Scenario */}
                      <div className="p-5 space-y-4">
                        <div>
                          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Customer Asked</span>
                          <div className="mt-1 p-3 rounded-lg bg-slate-50 dark:bg-[#202c33]/50 border border-slate-100 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300 leading-relaxed font-mono">
                            {draft.customer_context}
                          </div>
                        </div>

                        <div className="grid grid-cols-1 gap-3">
                          <div>
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Mistaken AI Draft</span>
                            <div className="mt-1 p-3 rounded-lg bg-slate-50 dark:bg-[#202c33]/30 border border-slate-100 dark:border-slate-800/50 text-xs text-slate-500 line-through leading-relaxed">
                              {draft.ai_draft}
                            </div>
                          </div>
                          <div>
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Agent Final Target</span>
                            <div className="mt-1 p-3 rounded-lg bg-slate-50 dark:bg-[#202c33]/30 border border-slate-100 dark:border-slate-800/50 text-xs text-slate-700 dark:text-slate-300 font-medium leading-relaxed">
                              {draft.agent_sent}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Right Side: Live Learning Validation */}
                      <div className="p-5 bg-slate-50/20 dark:bg-[#111b21] flex flex-col justify-between">
                        
                        {draft.validation_score !== null ? (
                          <div className="space-y-4 h-full flex flex-col justify-between">
                            <div className="space-y-3">
                              {/* Score Badges */}
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">New Live AI Draft</span>
                                <div className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide border ${
                                  draft.validation_score >= 90
                                    ? "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700"
                                    : "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700"
                                }`}>
                                  Score: {draft.validation_score}%
                                </div>
                              </div>

                              {/* New Live Draft Box */}
                              <div className="p-3 rounded-lg bg-white dark:bg-[#202c33]/40 border border-slate-200 dark:border-slate-800 text-xs text-slate-800 dark:text-slate-200 leading-relaxed">
                                {draft.validation_draft}
                              </div>

                              {/* Critique Box */}
                              <div className="p-3 rounded-lg bg-slate-100/50 dark:bg-[#182229] border border-slate-200/50 dark:border-[#2a3942] text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed italic">
                                <span className="font-semibold not-italic text-slate-600 dark:text-slate-300 block mb-1">Validation Critique:</span>
                                "{draft.validation_verdict}"
                              </div>
                            </div>

                            <button
                              onClick={() => handleRunValidation(draft.id)}
                              disabled={validatingId === draft.id}
                              className="mt-4 px-4 py-2 w-full text-center rounded-lg bg-slate-800 dark:bg-slate-700 text-white text-xs font-semibold hover:bg-slate-700 dark:hover:bg-slate-600 transition-colors disabled:opacity-50"
                            >
                              {validatingId === draft.id ? "Testing..." : "Re-Validate Accuracy"}
                            </button>
                          </div>
                        ) : (
                          <div className="h-full flex flex-col items-center justify-center text-center p-8 space-y-3">
                            <div>
                              <h4 className="text-xs font-semibold text-slate-700 dark:text-[#e9edef]">Not tested yet</h4>
                              <p className="text-[11px] text-slate-500 mt-1 max-w-[220px] leading-relaxed">
                                Run a live test to see if the AI successfully avoids the mistake in real-time.
                              </p>
                            </div>
                            <button
                              onClick={() => handleRunValidation(draft.id)}
                              disabled={validatingId === draft.id}
                              className="mt-2 px-5 py-2 w-full max-w-[160px] rounded-lg bg-slate-800 dark:bg-slate-700 text-white text-xs font-semibold hover:bg-slate-700 dark:hover:bg-slate-600 transition-colors disabled:opacity-50"
                            >
                              {validatingId === draft.id ? "Validating..." : "Run Live Test"}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        </div>
      </div>
    </div>
  )
}

function StatCard({ title, value }: { title: string, value: number }) {
  return (
    <div className="bg-white dark:bg-[#111b21] rounded-xl border border-slate-200 dark:border-[#2a3942] p-4 shadow-sm">
      <p className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 font-bold mb-1">{title}</p>
      <p className="text-2xl font-bold text-slate-800 dark:text-[#e9edef]">{value}</p>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'completed':
      return <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/30">Trained</span>
    case 'processing':
      return <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-blue-50 text-[#0070f3] dark:bg-blue-900/20 dark:text-[#0070f3] border border-blue-200 dark:border-blue-800/30">Distilling</span>
    case 'failed':
      return <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400 border border-red-200 dark:border-red-800/30">Failed</span>
    default:
      return <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border border-slate-200 dark:border-slate-700">Pending</span>
  }
}
