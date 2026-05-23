"use client"

import { useState, useEffect } from "react"
import { useAuth } from "@/lib/auth-context"
import { getLeaderboardStats } from "@/actions/leaderboard"
import { 
  Clock, 
  MessageSquare, 
  MessagesSquare, 
  Zap, 
  Phone, 
  Users, 
  Target, 
  X,
  Award,
  Flame,
  CheckCircle2,
  ShieldAlert,
  Wrench
} from "lucide-react"

export default function LeaderboardPage() {
  const user = useAuth()
  const [period, setPeriod] = useState<'daily' | 'weekly' | 'monthly'>('daily')
  const [stats, setStats] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedAgent, setSelectedAgent] = useState<any | null>(null)

  useEffect(() => {
    async function loadStats() {
      if (!user?.org_id) return
      setLoading(true)
      try {
        const data = await getLeaderboardStats(user.org_id, period)
        setStats(data)
      } catch (e) {
        console.error(e)
      } finally {
        setLoading(false)
      }
    }
    loadStats()
  }, [user?.org_id, period])

  const formatActiveTime = (minutes: number) => {
    if (minutes < 60) return `${minutes}m`
    const h = Math.floor(minutes / 60)
    const m = minutes % 60
    return `${h}h ${m}m`
  }

  const formatCallDuration = (seconds: number) => {
    if (!seconds || seconds <= 0) return "0s"
    const minutes = Math.round(seconds / 60)
    if (minutes < 60) {
      return `${minutes}m`
    }
    const h = Math.floor(minutes / 60)
    const m = minutes % 60
    return `${h}h ${m}m`
  }

  // Get goals targets based on active period
  const getPeriodTargets = (p: 'daily' | 'weekly' | 'monthly') => {
    if (p === 'daily') {
      return { messages: 100, chats: 30, activeMinutes: 240 } // 4 hours
    } else if (p === 'weekly') {
      return { messages: 200, chats: 40, activeMinutes: 1200 } // 20 hours
    } else {
      return { messages: 800, chats: 150, activeMinutes: 4800 } // 80 hours
    }
  }

  const targets = getPeriodTargets(period)

  return (
    <div className="flex-1 flex flex-col h-full bg-[#f8fafc] dark:bg-[#0b141a]">
      {/* Header - Trophy removed as requested */}
      <div className="flex items-center justify-between p-6 bg-white dark:bg-[#111b21] border-b border-slate-200 dark:border-[#222e35]">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-[#e9edef]">Leaderboard</h1>
          <p className="text-sm text-slate-500 dark:text-[#8696a0]">Track team performance and active time</p>
        </div>
        
        <div className="flex bg-slate-100 dark:bg-[#202c33] p-1 rounded-lg border border-slate-200 dark:border-[#2a3942]">
          {(['daily', 'weekly', 'monthly'] as const).map(p => (
            <button
              key={p}
              onClick={() => {
                setPeriod(p)
                setSelectedAgent(null) // clear selected if period changes to avoid confusion
              }}
              className={`px-4 py-1.5 text-[13px] font-medium rounded-md transition-all capitalize ${
                period === p 
                  ? 'bg-white dark:bg-[#2a3942] text-slate-800 dark:text-[#e9edef] shadow-sm' 
                  : 'text-slate-500 dark:text-[#8696a0] hover:text-slate-700 dark:hover:text-[#d1d7db]'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Main Content - Max width expanded to 1300px to solve white space on sides */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
        <div className="w-full max-w-[1300px] mx-auto space-y-4">
          
          {loading ? (
            <div className="flex flex-col gap-4">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-20 bg-white dark:bg-[#111b21] rounded-2xl border border-slate-200 dark:border-[#222e35] animate-pulse" />
              ))}
            </div>
          ) : stats.length === 0 ? (
            <div className="text-center py-20 text-slate-500 dark:text-[#8696a0]">
              No data available for this period.
            </div>
          ) : (
            stats.map((agent, index) => (
              <div 
                key={agent.id}
                onClick={() => setSelectedAgent({ ...agent, rank: index + 1 })}
                className="flex items-center gap-6 p-5 bg-white dark:bg-[#111b21] rounded-2xl border border-slate-200 dark:border-[#222e35] shadow-sm relative overflow-hidden cursor-pointer hover:border-slate-300 dark:hover:border-[#374248] hover:shadow-md hover:scale-[1.01] transition-all"
              >
                {/* Rank Badge */}
                <div className="w-12 h-12 flex items-center justify-center shrink-0">
                  {index === 0 || index === 1 || index === 2 ? (
                    <div className="w-10 h-10 rounded-full bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 flex items-center justify-center font-semibold text-lg border border-slate-200/60 dark:border-slate-700/60 shadow-sm">
                      {index + 1}
                    </div>
                  ) : (
                    <div className="text-base font-semibold text-slate-400 dark:text-[#8696a0]">
                      #{index + 1}
                    </div>
                  )}
                </div>

                {/* Agent Info */}
                <div className="flex items-center gap-4 w-1/4 min-w-[200px]">
                  {agent.avatar_url ? (
                    <img src={agent.avatar_url} alt={agent.name} className="w-12 h-12 rounded-full object-cover border border-slate-200 dark:border-[#222e35]" />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-blue-50 dark:bg-blue-900/20 text-blue-600 border border-blue-100 dark:border-blue-900/50 flex items-center justify-center font-bold text-lg">
                      {agent.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div>
                    <h3 className="font-bold text-slate-800 dark:text-[#e9edef] text-base">{agent.name}</h3>
                    <span className="text-[12px] font-medium text-slate-500 dark:text-[#8696a0] capitalize px-2 py-0.5 bg-slate-100 dark:bg-[#202c33] rounded-md mt-1 inline-block">
                      {agent.role}
                    </span>
                  </div>
                </div>

                {/* Metrics Grid - Expanded to 4 Columns with Hosting Metrics */}
                <div className="flex-1 grid grid-cols-4 gap-4">
                  <div className="flex flex-col">
                    <div className="flex items-center gap-1.5 text-[12px] text-slate-500 dark:text-[#8696a0] mb-1 font-medium">
                      <MessageSquare size={14} /> Messages
                    </div>
                    <span className="text-2xl font-bold text-slate-800 dark:text-[#e9edef]">{agent.messagesCount}</span>
                    {agent.whispersCount > 0 && (
                      <span className="text-[11px] text-slate-400 dark:text-[#8696a0] mt-0.5">
                        +{agent.whispersCount} whispers
                      </span>
                    )}
                  </div>
                  
                  <div className="flex flex-col">
                    <div className="flex items-center gap-1.5 text-[12px] text-slate-500 dark:text-[#8696a0] mb-1 font-medium">
                      First-Response SLA
                    </div>
                    <span className="text-2xl font-bold text-slate-800 dark:text-[#e9edef]">{agent.firstResponseSlaPercent}%</span>
                    <span className="text-[11px] text-slate-400 dark:text-[#8696a0] mt-0.5">
                      under 60s reply
                    </span>
                  </div>

                  <div className="flex flex-col">
                    <div className="flex items-center gap-1.5 text-[12px] text-slate-500 dark:text-[#8696a0] mb-1 font-medium">
                      <Phone size={14} /> Hotline Calls
                    </div>
                    <span className="text-2xl font-bold text-slate-800 dark:text-[#e9edef]">{agent.callsCount}</span>
                    {agent.totalCallDuration > 0 && (
                      <span className="text-[11px] text-slate-400 dark:text-[#8696a0] mt-0.5">
                        {formatCallDuration(agent.totalCallDuration)} active
                      </span>
                    )}
                  </div>

                  <div className="flex flex-col">
                    <div className="flex items-center gap-1.5 text-[12px] text-slate-500 dark:text-[#8696a0] mb-1 font-medium">
                      <Clock size={14} /> Active Time
                    </div>
                    <span className="text-2xl font-bold text-slate-800 dark:text-[#e9edef]">{formatActiveTime(agent.activeMinutes)}</span>
                    {agent.avgResponseTime > 0 ? (
                      <span className="text-[11px] text-slate-400 dark:text-[#8696a0] mt-0.5 flex items-center gap-1 font-medium">
                        <Clock size={10} /> {agent.avgResponseTime}m avg response
                      </span>
                    ) : (
                      <span className="text-[11px] text-slate-400 dark:text-[#8696a0] mt-0.5">No replies yet</span>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Premium Apple-Style Scorecard Modal Overlay */}
      {selectedAgent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 dark:bg-black/60 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => setSelectedAgent(null)}>
          <div 
            className="bg-white dark:bg-[#111b21] rounded-3xl border border-slate-200 dark:border-[#222e35] shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="relative p-6 border-b border-slate-100 dark:border-[#222e35] bg-slate-50/50 dark:bg-[#182229] flex items-center gap-4">
              <button 
                onClick={() => setSelectedAgent(null)}
                className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 dark:hover:text-[#d1d7db] transition-colors p-1.5 hover:bg-slate-200/50 dark:hover:bg-[#202c33] rounded-full"
              >
                <X size={18} />
              </button>

              {/* Avatar and Identity */}
              {selectedAgent.avatar_url ? (
                <img src={selectedAgent.avatar_url} alt={selectedAgent.name} className="w-16 h-16 rounded-full object-cover border-2 border-[#0070f3]" />
              ) : (
                <div className="w-16 h-16 rounded-full bg-blue-50 dark:bg-blue-900/20 text-[#0070f3] border-2 border-[#0070f3] flex items-center justify-center font-bold text-2xl">
                  {selectedAgent.name.charAt(0).toUpperCase()}
                </div>
              )}
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-bold text-slate-800 dark:text-[#e9edef]">{selectedAgent.name}</h2>
                  <span className="text-[12px] font-semibold text-slate-500 dark:text-[#8696a0] capitalize px-2 py-0.5 bg-slate-200/60 dark:bg-[#2a3942] rounded-md">
                    {selectedAgent.role}
                  </span>
                </div>
                <p className="text-sm text-slate-500 dark:text-[#8696a0] mt-0.5 flex items-center gap-1 font-medium">
                  <Award size={14} className="text-amber-500" /> Currently Rank #{selectedAgent.rank} on {period} board
                </p>
              </div>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
              
              {/* Weekly/Period Targets & Goals Progress */}
              <div className="bg-slate-50 dark:bg-[#182229] rounded-2xl p-5 border border-slate-200/60 dark:border-[#222e35] space-y-4">
                <h3 className="text-[13px] font-bold text-slate-700 dark:text-[#d1d7db] tracking-wider uppercase flex items-center gap-1.5">
                  <Target size={15} className="text-[#0070f3]" /> {period} Target Metrics
                </h3>
                
                {/* Progress Messages */}
                <div className="space-y-2">
                  <div className="flex justify-between text-xs font-semibold text-slate-600 dark:text-[#8696a0]">
                    <span>Messages Sent ({selectedAgent.messagesCount} / {targets.messages})</span>
                    <span>{Math.min(100, Math.round((selectedAgent.messagesCount / targets.messages) * 100))}%</span>
                  </div>
                  <div className="w-full bg-slate-200 dark:bg-[#202c33] h-2 rounded-full overflow-hidden">
                    <div 
                      className="bg-[#0070f3] h-full rounded-full transition-all duration-500" 
                      style={{ width: `${Math.min(100, (selectedAgent.messagesCount / targets.messages) * 100)}%` }} 
                    />
                  </div>
                </div>

                {/* Progress Chats */}
                <div className="space-y-2">
                  <div className="flex justify-between text-xs font-semibold text-slate-600 dark:text-[#8696a0]">
                    <span>Chats Handled ({selectedAgent.chatsCount} / {targets.chats})</span>
                    <span>{Math.min(100, Math.round((selectedAgent.chatsCount / targets.chats) * 100))}%</span>
                  </div>
                  <div className="w-full bg-slate-200 dark:bg-[#202c33] h-2 rounded-full overflow-hidden">
                    <div 
                      className="bg-slate-400 dark:bg-slate-500 h-full rounded-full transition-all duration-500" 
                      style={{ width: `${Math.min(100, (selectedAgent.chatsCount / targets.chats) * 100)}%` }} 
                    />
                  </div>
                </div>
              </div>

              {/* Detailed Performance Scorecard Grid */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold text-slate-400 dark:text-[#8696a0] tracking-wider uppercase">Hosting Performance Scorecard</h3>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 rounded-xl border border-slate-100 dark:border-[#222e35] bg-white dark:bg-[#111b21] flex flex-col shadow-sm">
                    <span className="text-xs text-slate-400 dark:text-[#8696a0] font-medium mb-1">First-Response SLA</span>
                    <span className="text-2xl font-bold text-slate-800 dark:text-[#e9edef]">{selectedAgent.firstResponseSlaPercent}%</span>
                  </div>
                  
                  <div className="p-4 rounded-xl border border-slate-100 dark:border-[#222e35] bg-white dark:bg-[#111b21] flex flex-col shadow-sm">
                    <span className="text-xs text-slate-400 dark:text-[#8696a0] font-medium mb-1">Emergency SLA Avg</span>
                    <span className="text-2xl font-bold text-slate-800 dark:text-[#e9edef]">{selectedAgent.emergencyResponseTime > 0 ? `${selectedAgent.emergencyResponseTime}s` : 'N/A'}</span>
                  </div>

                  <div className="p-4 rounded-xl border border-slate-100 dark:border-[#222e35] bg-white dark:bg-[#111b21] flex flex-col shadow-sm">
                    <span className="text-xs text-slate-400 dark:text-[#8696a0] font-medium mb-1">Hotline Call Duration</span>
                    <span className="text-2xl font-bold text-slate-800 dark:text-[#e9edef]">{formatCallDuration(selectedAgent.totalCallDuration)}</span>
                  </div>

                  <div className="p-4 rounded-xl border border-slate-100 dark:border-[#222e35] bg-white dark:bg-[#111b21] flex flex-col shadow-sm">
                    <span className="text-xs text-slate-400 dark:text-[#8696a0] font-medium mb-1">Sysadmin Escalations</span>
                    <span className="text-2xl font-bold text-slate-800 dark:text-[#e9edef]">{selectedAgent.escalatedTicketsCount} tickets</span>
                  </div>

                  <div className="p-4 rounded-xl border border-slate-100 dark:border-[#222e35] bg-white dark:bg-[#111b21] flex flex-col shadow-sm">
                    <span className="text-xs text-slate-400 dark:text-[#8696a0] font-medium mb-1">Total Active Time</span>
                    <span className="text-2xl font-bold text-slate-800 dark:text-[#e9edef]">{formatActiveTime(selectedAgent.activeMinutes)}</span>
                  </div>

                  <div className="p-4 rounded-xl border border-slate-100 dark:border-[#222e35] bg-white dark:bg-[#111b21] flex flex-col shadow-sm">
                    <span className="text-xs text-slate-400 dark:text-[#8696a0] font-medium mb-1">Total Public Messages</span>
                    <span className="text-2xl font-bold text-slate-800 dark:text-[#e9edef]">{selectedAgent.messagesCount}</span>
                  </div>
                </div>
              </div>

              {/* Achievements & Gamified Hosting Badges */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold text-slate-400 dark:text-[#8696a0] tracking-wider uppercase">Earned Hosting Badges</h3>
                
                <div className="space-y-2">
                  {selectedAgent.firstResponseSlaPercent >= 85 && selectedAgent.totalFirstResponses > 0 && (
                    <div className="flex items-center gap-3 p-3 bg-blue-50/50 dark:bg-blue-950/10 border border-blue-100/50 dark:border-blue-900/20 rounded-xl">
                      <div className="w-8 h-8 rounded-lg bg-blue-100/40 dark:bg-blue-950/30 text-[#0070f3] flex items-center justify-center shrink-0">
                        <Clock size={16} />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-slate-800 dark:text-[#e9edef]">LiteSpeed Responder</h4>
                        <p className="text-xs text-slate-500 dark:text-[#8696a0]">Maintained outstanding under-60-seconds First Response SLA.</p>
                      </div>
                    </div>
                  )}

                  {selectedAgent.emergencyResponseTime > 0 && selectedAgent.emergencyResponseTime <= 90 && (
                    <div className="flex items-center gap-3 p-3 bg-blue-50/50 dark:bg-blue-950/10 border border-blue-100/50 dark:border-blue-900/20 rounded-xl">
                      <div className="w-8 h-8 rounded-lg bg-blue-100/40 dark:bg-blue-950/30 text-[#0070f3] flex items-center justify-center shrink-0">
                        <ShieldAlert size={16} />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-slate-800 dark:text-[#e9edef]">NOC Incident Commander</h4>
                        <p className="text-xs text-slate-500 dark:text-[#8696a0]">Slashed down-site and database outage response times under 90s.</p>
                      </div>
                    </div>
                  )}

                  {selectedAgent.callsCount >= 1 && (
                    <div className="flex items-center gap-3 p-3 bg-blue-50/50 dark:bg-blue-950/10 border border-blue-100/50 dark:border-blue-900/20 rounded-xl">
                      <div className="w-8 h-8 rounded-lg bg-blue-100/40 dark:bg-blue-950/30 text-[#0070f3] flex items-center justify-center shrink-0">
                        <Phone size={16} />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-slate-800 dark:text-[#e9edef]">Hotline Specialist</h4>
                        <p className="text-xs text-slate-500 dark:text-[#8696a0]">Maintained critical telephone hotlines with active customer talk time.</p>
                      </div>
                    </div>
                  )}

                  {selectedAgent.escalatedTicketsCount >= 1 && (
                    <div className="flex items-center gap-3 p-3 bg-blue-50/50 dark:bg-blue-950/10 border border-blue-100/50 dark:border-blue-900/20 rounded-xl">
                      <div className="w-8 h-8 rounded-lg bg-blue-100/40 dark:bg-blue-950/30 text-[#0070f3] flex items-center justify-center shrink-0">
                        <Wrench size={16} />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-slate-800 dark:text-[#e9edef]">Sysadmin Escalation Pro</h4>
                        <p className="text-xs text-slate-500 dark:text-[#8696a0]">Migrated complex customer server issues to WHMCS support tickets.</p>
                      </div>
                    </div>
                  )}

                  {/* Fallback if no badges earned yet */}
                  {!(selectedAgent.firstResponseSlaPercent >= 85 && selectedAgent.totalFirstResponses > 0) &&
                    !(selectedAgent.emergencyResponseTime > 0 && selectedAgent.emergencyResponseTime <= 90) &&
                    !(selectedAgent.callsCount >= 1) &&
                    !(selectedAgent.escalatedTicketsCount >= 1) && (
                      <div className="text-center py-4 border border-dashed border-slate-200 dark:border-[#222e35] rounded-xl text-slate-400 text-xs">
                        Keep grinding to unlock Hostnin support badges!
                      </div>
                    )}
                </div>
              </div>



            </div>
          </div>
        </div>
      )}
    </div>
  )
}
