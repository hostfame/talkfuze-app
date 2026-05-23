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
  CheckCircle2
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

  // Get goals targets based on active period
  const getPeriodTargets = (p: 'daily' | 'weekly' | 'monthly') => {
    if (p === 'daily') {
      return { messages: 50, chats: 10, activeMinutes: 240 } // 4 hours
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

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
        <div className="max-w-4xl mx-auto space-y-4">
          
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
                  {index === 0 ? (
                    <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-500 flex items-center justify-center font-bold text-lg border border-amber-200 dark:border-amber-800/50">
                      1
                    </div>
                  ) : index === 1 ? (
                    <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 flex items-center justify-center font-bold text-lg border border-slate-200 dark:border-slate-700">
                      2
                    </div>
                  ) : index === 2 ? (
                    <div className="w-10 h-10 rounded-full bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-500 flex items-center justify-center font-bold text-lg border border-orange-200 dark:border-orange-900/30">
                      3
                    </div>
                  ) : (
                    <div className="text-lg font-bold text-slate-400 dark:text-[#8696a0]">
                      #{index + 1}
                    </div>
                  )}
                </div>

                {/* Agent Info */}
                <div className="flex items-center gap-4 w-1/3 min-w-[200px]">
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

                {/* Metrics Grid */}
                <div className="flex-1 grid grid-cols-3 gap-4">
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
                      <MessagesSquare size={14} /> Chats Handled
                    </div>
                    <span className="text-2xl font-bold text-slate-800 dark:text-[#e9edef]">{agent.chatsCount}</span>
                    {agent.callsCount > 0 && (
                      <span className="text-[11px] text-slate-400 dark:text-[#8696a0] mt-0.5">
                        +{agent.callsCount} voice calls
                      </span>
                    )}
                  </div>

                  <div className="flex flex-col">
                    <div className="flex items-center gap-1.5 text-[12px] text-slate-500 dark:text-[#8696a0] mb-1 font-medium">
                      <Clock size={14} /> Active Time
                    </div>
                    <span className="text-2xl font-bold text-slate-800 dark:text-[#e9edef]">{formatActiveTime(agent.activeMinutes)}</span>
                    {agent.avgResponseTime > 0 ? (
                      <span className={`text-[11px] font-semibold mt-0.5 flex items-center gap-1 ${
                        agent.avgResponseTime <= 2 
                          ? 'text-emerald-600 dark:text-emerald-500' 
                          : agent.avgResponseTime <= 5 
                          ? 'text-amber-600 dark:text-amber-500' 
                          : 'text-slate-500 dark:text-[#8696a0]'
                      }`}>
                        <Zap size={10} className="fill-current" /> {agent.avgResponseTime}m avg response
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 dark:bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
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
                      className="bg-emerald-500 h-full rounded-full transition-all duration-500" 
                      style={{ width: `${Math.min(100, (selectedAgent.chatsCount / targets.chats) * 100)}%` }} 
                    />
                  </div>
                </div>
              </div>

              {/* Detailed Performance Scorecard Grid */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold text-slate-400 dark:text-[#8696a0] tracking-wider uppercase">Performance Scorecard</h3>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 rounded-xl border border-slate-100 dark:border-[#222e35] bg-white dark:bg-[#111b21] flex flex-col shadow-sm">
                    <span className="text-xs text-slate-400 dark:text-[#8696a0] font-medium mb-1">Public Messages</span>
                    <span className="text-2xl font-bold text-slate-800 dark:text-[#e9edef]">{selectedAgent.messagesCount}</span>
                  </div>
                  
                  <div className="p-4 rounded-xl border border-slate-100 dark:border-[#222e35] bg-white dark:bg-[#111b21] flex flex-col shadow-sm">
                    <span className="text-xs text-slate-400 dark:text-[#8696a0] font-medium mb-1">Internal Whispers</span>
                    <span className="text-2xl font-bold text-slate-800 dark:text-[#e9edef]">{selectedAgent.whispersCount}</span>
                  </div>

                  <div className="p-4 rounded-xl border border-slate-100 dark:border-[#222e35] bg-white dark:bg-[#111b21] flex flex-col shadow-sm">
                    <span className="text-xs text-slate-400 dark:text-[#8696a0] font-medium mb-1">Conversations</span>
                    <span className="text-2xl font-bold text-slate-800 dark:text-[#e9edef]">{selectedAgent.chatsCount}</span>
                  </div>

                  <div className="p-4 rounded-xl border border-slate-100 dark:border-[#222e35] bg-white dark:bg-[#111b21] flex flex-col shadow-sm">
                    <span className="text-xs text-slate-400 dark:text-[#8696a0] font-medium mb-1">Phone Calls</span>
                    <span className="text-2xl font-bold text-slate-800 dark:text-[#e9edef]">{selectedAgent.callsCount}</span>
                  </div>

                  <div className="p-4 rounded-xl border border-slate-100 dark:border-[#222e35] bg-white dark:bg-[#111b21] flex flex-col shadow-sm">
                    <span className="text-xs text-slate-400 dark:text-[#8696a0] font-medium mb-1">Total Active Time</span>
                    <span className="text-2xl font-bold text-slate-800 dark:text-[#e9edef]">{formatActiveTime(selectedAgent.activeMinutes)}</span>
                  </div>

                  <div className="p-4 rounded-xl border border-slate-100 dark:border-[#222e35] bg-white dark:bg-[#111b21] flex flex-col shadow-sm">
                    <span className="text-xs text-slate-400 dark:text-[#8696a0] font-medium mb-1">Avg Response Speed</span>
                    <span className="text-2xl font-bold text-slate-800 dark:text-[#e9edef]">{selectedAgent.avgResponseTime > 0 ? `${selectedAgent.avgResponseTime}m` : 'N/A'}</span>
                  </div>
                </div>
              </div>

              {/* Achievements & Gamified Badges */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold text-slate-400 dark:text-[#8696a0] tracking-wider uppercase">Earned Badges</h3>
                
                <div className="space-y-2">
                  {selectedAgent.avgResponseTime > 0 && selectedAgent.avgResponseTime <= 2 && (
                    <div className="flex items-center gap-3 p-3 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/30 rounded-xl">
                      <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                        <Zap size={16} className="fill-current" />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-emerald-800 dark:text-emerald-300">Lightning Responder</h4>
                        <p className="text-xs text-emerald-600/90 dark:text-emerald-400/90">Maintained an average response speed under 2 minutes.</p>
                      </div>
                    </div>
                  )}

                  {selectedAgent.whispersCount >= (period === 'daily' ? 2 : period === 'weekly' ? 10 : 40) && (
                    <div className="flex items-center gap-3 p-3 bg-blue-50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/30 rounded-xl">
                      <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/40 text-[#0070f3] flex items-center justify-center shrink-0">
                        <Users size={16} />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-blue-800 dark:text-blue-300">Team Collaborator</h4>
                        <p className="text-xs text-blue-600/90 dark:text-blue-400/90">Highly active in internal whisper notes helping team members.</p>
                      </div>
                    </div>
                  )}

                  {selectedAgent.callsCount >= (period === 'daily' ? 1 : period === 'weekly' ? 5 : 20) && (
                    <div className="flex items-center gap-3 p-3 bg-indigo-50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/30 rounded-xl">
                      <div className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                        <Phone size={16} />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-indigo-800 dark:text-indigo-300">Voice Specialist</h4>
                        <p className="text-xs text-indigo-600/90 dark:text-indigo-400/90">Successfully resolved critical customer queries via voice calls.</p>
                      </div>
                    </div>
                  )}

                  {selectedAgent.activeMinutes >= targets.activeMinutes && (
                    <div className="flex items-center gap-3 p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/30 rounded-xl">
                      <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                        <Flame size={16} className="fill-current animate-pulse" />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-amber-800 dark:text-amber-300">Active Workhorse</h4>
                        <p className="text-xs text-amber-600/90 dark:text-amber-400/90">Surpassed the target active hour limits for this period.</p>
                      </div>
                    </div>
                  )}

                  {/* Fallback if no badges earned yet */}
                  {!(selectedAgent.avgResponseTime > 0 && selectedAgent.avgResponseTime <= 2) &&
                    !(selectedAgent.whispersCount >= (period === 'daily' ? 2 : period === 'weekly' ? 10 : 40)) &&
                    !(selectedAgent.callsCount >= (period === 'daily' ? 1 : period === 'weekly' ? 5 : 20)) &&
                    !(selectedAgent.activeMinutes >= targets.activeMinutes) && (
                      <div className="text-center py-4 border border-dashed border-slate-200 dark:border-[#222e35] rounded-xl text-slate-400 text-xs">
                        Keep grinding to unlock performance badges!
                      </div>
                    )}
                </div>
              </div>

              {/* Motivational Insight Banner */}
              <div className="p-4 bg-slate-50 dark:bg-[#182229] border border-slate-200/60 dark:border-[#222e35] rounded-2xl flex items-start gap-3">
                <CheckCircle2 size={16} className="text-[#0070f3] shrink-0 mt-0.5" />
                <div className="text-xs text-slate-600 dark:text-[#8696a0] leading-relaxed">
                  <span className="font-bold text-[#0070f3]">Imran says:</span> Response speed is revenue! To climb the leaderboard, reply to customer tickets within 2 minutes and log call notes cleanly. Keep pushing team!
                </div>
              </div>

            </div>
          </div>
        </div>
      )}
    </div>
  )
}
