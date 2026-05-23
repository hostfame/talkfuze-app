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
    <div className="flex-1 flex flex-col h-full bg-[#F8FAFC] dark:bg-[#0b141a] overflow-y-auto">
      <div className="max-w-5xl w-full mx-auto p-6 md:p-10">
        
        {/* Dashboard Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-semibold text-slate-800 dark:text-[#e9edef] flex items-center gap-3">
              <BrainCircuit className="text-[#0070f3]" />
              AI Observer & Learning Suite
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Real-time monitoring, auto-distillation, and rule validation engine.
            </p>
          </div>
          
          <div className="flex gap-2">
            {activeTab === 'observer' && (
              <button 
                onClick={handleTestPipeline}
                disabled={testing}
                className="px-4 py-2 flex items-center gap-2 rounded-lg bg-[#0070f3] text-white font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                <Play size={16} />
                {testing ? "Triggering..." : "Simulate 24h Auto-Archive"}
              </button>
            )}
            <button 
              onClick={activeTab === 'observer' ? fetchLogs : fetchValidationData}
              className="p-2 rounded-lg bg-white dark:bg-[#202c33] border border-slate-200 dark:border-[#2a3942] text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[#2a3942] transition-colors"
            >
              <RefreshCcw size={18} className={(loading || loadingValidation) ? "animate-spin" : ""} />
            </button>
          </div>
        </div>

        {/* Apple-style minimalist tab selector */}
        <div className="flex bg-slate-100 dark:bg-[#111b21] p-1 rounded-xl self-start mb-8 max-w-sm border border-slate-200/50 dark:border-slate-800">
          <button
            onClick={() => setActiveTab('observer')}
            className={`flex-1 py-2 px-4 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
              activeTab === 'observer'
                ? "bg-white dark:bg-[#202c33] text-slate-800 dark:text-[#e9edef] shadow-sm"
                : "text-slate-500 hover:text-slate-800 dark:hover:text-[#e9edef]"
            }`}
          >
            <Activity size={14} />
            Observer Logs
          </button>
          <button
            onClick={() => setActiveTab('validation')}
            className={`flex-1 py-2 px-4 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
              activeTab === 'validation'
                ? "bg-white dark:bg-[#202c33] text-slate-800 dark:text-[#e9edef] shadow-sm"
                : "text-slate-500 hover:text-slate-800 dark:hover:text-[#e9edef]"
            }`}
          >
            <Zap size={14} />
            Rule Validation Playground
          </button>
        </div>

        {/* Tab 1: Observer Dashboard View */}
        {activeTab === 'observer' && (
          <>
            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
              <StatCard 
                icon={<Archive className="text-slate-500" />} 
                title="Archived (24h)" 
                value={stats.totalArchived} 
              />
              <StatCard 
                icon={<BookOpen className="text-[#0070f3]" />} 
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
            <div className="bg-blue-50/50 dark:bg-[#111b21] rounded-2xl border border-blue-100 dark:border-[#2a3942] p-5 flex items-start gap-4 shadow-sm">
              <div className="p-3 rounded-xl bg-blue-100/60 dark:bg-blue-900/20 text-[#0070f3] shrink-0">
                <Sparkles size={20} />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-800 dark:text-[#e9edef]">How accuracy validation works</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                  We match your past support draft corrections against our vector database. Click **Run Live Test** on any corrected message card. The CRM will dynamically draft a **new reply** with the active learning rule, then let Claude 4.5 Sonnet score the improvement side-by-side!
                </p>
              </div>
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
                  <div key={draft.id} className="bg-white dark:bg-[#111b21] rounded-2xl border border-slate-200 dark:border-[#2a3942] overflow-hidden shadow-sm">
                    {/* Header: Displays active rule */}
                    <div className="px-6 py-4 bg-slate-50/50 dark:bg-[#202c33]/40 border-b border-slate-100 dark:border-[#2a3942] flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2.5">
                        <span className="p-1.5 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-[#0070f3]"><Sparkles size={14} /></span>
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
                      <div className="p-6 space-y-4">
                        <div>
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Customer Asked</span>
                          <div className="mt-1.5 p-3 rounded-xl bg-slate-50 dark:bg-[#202c33]/50 border border-slate-100 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300 leading-relaxed font-mono">
                            {draft.customer_context}
                          </div>
                        </div>

                        <div className="grid grid-cols-1 gap-3">
                          <div>
                            <span className="text-[10px] font-bold text-red-400 uppercase tracking-wider flex items-center gap-1"><X size={10} /> Mistaken AI Draft</span>
                            <div className="mt-1.5 p-3 rounded-xl bg-red-50/30 dark:bg-red-950/10 border border-red-100/30 dark:border-red-900/10 text-xs text-slate-500 line-through leading-relaxed">
                              {draft.ai_draft}
                            </div>
                          </div>
                          <div>
                            <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-wider flex items-center gap-1"><Check size={10} /> Agent Final Target</span>
                            <div className="mt-1.5 p-3 rounded-xl bg-emerald-50/20 dark:bg-emerald-950/10 border border-emerald-100/20 dark:border-emerald-900/10 text-xs text-slate-700 dark:text-slate-300 font-medium leading-relaxed">
                              {draft.agent_sent}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Right Side: Live Learning Validation */}
                      <div className="p-6 bg-slate-50/20 dark:bg-[#111b21] flex flex-col justify-between">
                        
                        {draft.validation_score !== null ? (
                          <div className="space-y-4 h-full flex flex-col justify-between">
                            <div className="space-y-3">
                              {/* Score Badges */}
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] font-bold text-[#0070f3] uppercase tracking-wider flex items-center gap-1"><Zap size={10} /> New Live AI Draft</span>
                                <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${
                                  draft.validation_score >= 90
                                    ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"
                                    : "bg-amber-500/10 text-amber-500 border border-amber-500/20"
                                }`}>
                                  <ShieldCheck size={12} />
                                  Score: {draft.validation_score}% {draft.validation_score >= 90 ? 'PASS' : 'WARNING'}
                                </div>
                              </div>

                              {/* New Live Draft Box */}
                              <div className="p-3 rounded-xl bg-emerald-50/10 dark:bg-[#202c33]/40 border border-emerald-500/30 dark:border-emerald-500/10 text-xs text-slate-800 dark:text-slate-200 leading-relaxed">
                                {draft.validation_draft}
                              </div>

                              {/* Critique Box */}
                              <div className="p-3.5 rounded-xl bg-blue-50/30 dark:bg-blue-950/10 border border-blue-100/30 dark:border-blue-900/10 text-xs text-slate-500 dark:text-slate-400 leading-relaxed italic">
                                <span className="font-semibold not-italic text-[#0070f3] block mb-0.5">Claude 4.5 Sonnet QA Critique:</span>
                                "{draft.validation_verdict}"
                              </div>
                            </div>

                            <button
                              onClick={() => handleRunValidation(draft.id)}
                              disabled={validatingId === draft.id}
                              className="mt-4 px-4 py-2 w-full flex items-center justify-center gap-2 rounded-lg bg-white dark:bg-[#202c33] border border-slate-200 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300 font-semibold hover:bg-slate-50 dark:hover:bg-[#2a3942] transition-colors disabled:opacity-50"
                            >
                              <RefreshCcw size={12} className={validatingId === draft.id ? "animate-spin" : ""} />
                              {validatingId === draft.id ? "Testing..." : "Re-Validate Accuracy"}
                            </button>
                          </div>
                        ) : (
                          <div className="h-full flex flex-col items-center justify-center text-center p-8 space-y-4">
                            <div className="p-4 rounded-full bg-slate-100 dark:bg-[#202c33] text-slate-400">
                              <Zap size={28} />
                            </div>
                            <div>
                              <h4 className="text-xs font-semibold text-slate-700 dark:text-[#e9edef]">Not tested yet</h4>
                              <p className="text-[11px] text-slate-400 mt-1 max-w-[240px] leading-relaxed">
                                Run a live test to see if the AI successfully avoids the mistake in real-time.
                              </p>
                            </div>
                            <button
                              onClick={() => handleRunValidation(draft.id)}
                              disabled={validatingId === draft.id}
                              className="px-5 py-2.5 w-full max-w-[200px] flex items-center justify-center gap-2 rounded-xl bg-[#0070f3] text-white text-xs font-semibold hover:bg-blue-700 transition-colors shadow-sm disabled:opacity-50"
                            >
                              <Play size={12} fill="white" />
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
      return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-50 text-[#0070f3] dark:bg-blue-900/20 dark:text-[#0070f3] border border-blue-200 dark:border-blue-800/30"><RefreshCcw size={12} className="animate-spin" /> Distilling</span>
    case 'failed':
      return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400 border border-red-200 dark:border-red-800/30"><AlertCircle size={12} /> Failed</span>
    default:
      return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400 border border-amber-200 dark:border-amber-800/30"><Clock size={12} /> Pending</span>
  }
}
