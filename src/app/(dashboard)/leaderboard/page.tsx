"use client"

import { useState, useEffect } from "react"
import { useAuth } from "@/lib/auth-context"
import { getLeaderboardStats, getMissedChatsStats } from "@/actions/leaderboard"
import { 
  Clock, 
  MessageSquare, 
  Zap, 
  BrainCircuit,
  Phone, 
  Target, 
  X,
  Award,
  ShieldAlert,
  Wrench,
  AlertCircle,
  Eye,
  TrendingUp,
  TrendingDown,
  Minus,
  CheckCircle2,
  CalendarDays
} from "lucide-react"

// ---------- Tiny Sparkline Bars ----------
function SparklineBars({ data }: { data: { day: string; count: number }[] }) {
  const max = Math.max(...data.map(d => d.count), 1);
  return (
    <div className="flex items-end gap-[2px] h-7">
      {data.map((d, i) => {
        const h = Math.max(2, Math.round((d.count / max) * 28));
        const isToday = i === data.length - 1;
        return (
          <div
            key={d.day}
            title={`${d.day}: ${d.count} msgs`}
            style={{ height: `${h}px` }}
            className={`w-[6px] rounded-sm shrink-0 ${
              isToday
                ? 'bg-[#0070f3]'
                : 'bg-slate-300 dark:bg-[#2a3942]'
            }`}
          />
        );
      })}
    </div>
  );
}

// ---------- Tiny 24h Heatmap Row ----------
function HeatmapRow({ data }: { data: number[] }) {
  const max = Math.max(...data, 1);
  return (
    <div className="flex gap-[1.5px]">
      {data.map((count, h) => {
        const intensity = count / max;
        const opacity = count === 0 ? 0.06 : 0.15 + intensity * 0.85;
        return (
          <div
            key={h}
            title={`${h}:00 BDT - ${count} msgs`}
            className="rounded-[2px] shrink-0"
            style={{
              width: '7px',
              height: '14px',
              backgroundColor: `rgba(0, 112, 243, ${opacity})`,
            }}
          />
        );
      })}
    </div>
  );
}

// ---------- Full-size Heatmap for Modal ----------
function HeatmapFull({ data }: { data: number[] }) {
  const max = Math.max(...data, 1);
  const labels = ['12A','1','2','3','4','5','6','7','8','9','10','11','12P','1','2','3','4','5','6','7','8','9','10','11'];
  return (
    <div>
      <div className="flex gap-[3px] mb-1">
        {data.map((count, h) => {
          const intensity = count / max;
          const opacity = count === 0 ? 0.06 : 0.12 + intensity * 0.88;
          return (
            <div
              key={h}
              title={`${h}:00 BDT - ${count} msgs`}
              className="rounded-[3px] shrink-0 flex-1"
              style={{
                height: '28px',
                backgroundColor: `rgba(0, 112, 243, ${opacity})`,
              }}
            />
          );
        })}
      </div>
      <div className="flex gap-[3px]">
        {labels.map((l, i) => (
          <div key={i} className="flex-1 text-center text-[8px] text-slate-400 dark:text-[#8696a0] shrink-0">{l}</div>
        ))}
      </div>
    </div>
  );
}

// ---------- Full Sparkline for Modal ----------
function SparklineFull({ data }: { data: { day: string; count: number }[] }) {
  const max = Math.max(...data.map(d => d.count), 1);
  const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  return (
    <div>
      <div className="flex items-end gap-[4px] h-16 mb-1">
        {data.map((d, i) => {
          const h = Math.max(3, Math.round((d.count / max) * 64));
          const isToday = i === data.length - 1;
          return (
            <div
              key={d.day}
              title={`${d.day}: ${d.count} msgs`}
              className="flex-1 rounded-t-sm relative group"
              style={{
                height: `${h}px`,
                backgroundColor: isToday ? '#0070f3' : 'rgba(0,112,243,0.25)',
              }}
            >
              <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-[10px] text-slate-600 dark:text-[#8696a0] opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                {d.count}
              </span>
            </div>
          );
        })}
      </div>
      <div className="flex gap-[4px]">
        {data.map((d, i) => {
          const date = new Date(d.day + 'T00:00:00Z');
          const dayLabel = i === data.length - 1 ? 'Today' : dayNames[date.getUTCDay()];
          return (
            <div key={d.day} className="flex-1 text-center text-[9px] text-slate-400 dark:text-[#8696a0]">{dayLabel}</div>
          );
        })}
      </div>
    </div>
  );
}

// ---------- Trend Arrow ----------
function TrendArrow({ today, yesterday }: { today: number; yesterday: number }) {
  if (today > yesterday) {
    return <TrendingUp size={14} className="text-emerald-500 shrink-0" />;
  } else if (today < yesterday) {
    return <TrendingDown size={14} className="text-rose-500 shrink-0" />;
  }
  return <Minus size={14} className="text-slate-400 shrink-0" />;
}

// ---------- Tenure helper ----------
function getTenureDays(joinedAt: string | null): number | null {
  if (!joinedAt) return null;
  const joined = new Date(joinedAt);
  const now = new Date();
  return Math.floor((now.getTime() - joined.getTime()) / (1000 * 60 * 60 * 24));
}

export default function LeaderboardPage() {
  const user = useAuth()
  const [view, setView] = useState<'leaderboard' | 'missed'>('leaderboard')
  const [period, setPeriod] = useState<'daily' | 'weekly' | 'monthly' | 'custom'>('daily')
  const [customDate, setCustomDate] = useState<string>(() => new Date().toISOString().split('T')[0])
  const [stats, setStats] = useState<any[]>([])
  const [missedChats, setMissedChats] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedAgent, setSelectedAgent] = useState<any | null>(null)

  useEffect(() => {
    async function loadStats() {
      if (!user?.org_id) return
      setLoading(true)
      try {
        if (view === 'leaderboard') {
          const data = await getLeaderboardStats(user.org_id, period, period === 'custom' ? customDate : undefined)
          setStats(data)
        } else {
          const data = await getMissedChatsStats(user.org_id, period, period === 'custom' ? customDate : undefined)
          setMissedChats(data)
        }
      } catch (e) {
        console.error(e)
      } finally {
        setLoading(false)
      }
    }
    loadStats()
  }, [user?.org_id, period, customDate, view])

  const formatActiveTime = (minutes: number) => {
    if (minutes < 60) return `${minutes}m`
    const h = Math.floor(minutes / 60)
    const m = minutes % 60
    return `${h}h ${m}m`
  }

  const formatCallDuration = (seconds: number) => {
    if (!seconds || seconds <= 0) return "0s"
    const minutes = Math.round(seconds / 60)
    if (minutes < 60) return `${minutes}m`
    const h = Math.floor(minutes / 60)
    const m = minutes % 60
    return `${h}h ${m}m`
  }

  const getPeriodTargets = (p: 'daily' | 'weekly' | 'monthly' | 'custom') => {
    if (p === 'daily' || p === 'custom') {
      return { messages: 100, chats: 30, activeMinutes: 240 }
    } else if (p === 'weekly') {
      return { messages: 200, chats: 40, activeMinutes: 1200 }
    } else {
      return { messages: 800, chats: 150, activeMinutes: 4800 }
    }
  }

  const targets = getPeriodTargets(period)

  return (
    <div className="flex-1 flex flex-col h-full bg-[#f8fafc] dark:bg-[#0b141a] pb-16 md:pb-0">
      {/* Header */}
      <div className="flex items-center justify-between p-6 bg-white dark:bg-[#111b21] border-b border-slate-200 dark:border-[#222e35]">
        <div className="flex items-center gap-6">
          <div>
            <h1 className="text-xl font-bold text-slate-800 dark:text-[#e9edef]">Leaderboard</h1>
            <p className="text-sm text-slate-500 dark:text-[#8696a0]">Track team performance and active time</p>
          </div>
          <div className="flex bg-slate-100 dark:bg-[#202c33] p-1 rounded-lg border border-slate-200 dark:border-[#2a3942]">
            <button
              onClick={() => setView('leaderboard')}
              className={`px-4 py-1.5 text-[13px] font-medium rounded-md transition-all ${
                view === 'leaderboard' 
                  ? 'bg-white dark:bg-[#2a3942] text-slate-800 dark:text-[#e9edef] shadow-sm' 
                  : 'text-slate-500 dark:text-[#8696a0] hover:text-slate-700 dark:hover:text-[#d1d7db]'
              }`}
            >
              Performance
            </button>
            <button
              onClick={() => setView('missed')}
              className={`px-4 py-1.5 text-[13px] font-medium rounded-md transition-all ${
                view === 'missed' 
                  ? 'bg-white dark:bg-[#2a3942] text-rose-600 dark:text-rose-400 shadow-sm' 
                  : 'text-slate-500 dark:text-[#8696a0] hover:text-slate-700 dark:hover:text-[#d1d7db]'
              }`}
            >
              Missed Chats
            </button>
          </div>
        </div>
        
        <div className="flex bg-slate-100 dark:bg-[#202c33] p-1 rounded-lg border border-slate-200 dark:border-[#2a3942] items-center">
          {(['daily', 'weekly', 'monthly'] as const).map(p => (
            <button
              key={p}
              onClick={() => {
                setPeriod(p)
                setSelectedAgent(null)
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
          <div className="flex items-center ml-2 pl-2 border-l border-slate-200 dark:border-[#2a3942]">
            <input
              type="date"
              value={customDate}
              onChange={(e) => {
                setCustomDate(e.target.value)
                setPeriod('custom')
                setSelectedAgent(null)
              }}
              className={`px-3 py-1 text-[13px] font-medium rounded-md bg-transparent focus:outline-none transition-all ${
                period === 'custom' 
                  ? 'bg-white dark:bg-[#2a3942] text-slate-800 dark:text-[#e9edef] shadow-sm' 
                  : 'text-slate-500 dark:text-[#8696a0] hover:text-slate-700 dark:hover:text-[#d1d7db]'
              }`}
            />
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
        <div className="w-full max-w-[1400px] mx-auto space-y-3">
          
          {loading ? (
            <div className="flex flex-col gap-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-24 bg-white dark:bg-[#111b21] rounded-2xl border border-slate-200 dark:border-[#222e35] animate-pulse" />
              ))}
            </div>
          ) : view === 'leaderboard' ? (
            stats.length === 0 ? (
              <div className="text-center py-20 text-slate-500 dark:text-[#8696a0]">
                No data available for this period.
              </div>
            ) : (
              stats.map((agent, index) => {
                const resolutionRate = agent.chatsCount > 0
                  ? Math.round((agent.resolvedCount / agent.chatsCount) * 100)
                  : 0;

                return (
                  <div
                    key={agent.id}
                    onClick={() => setSelectedAgent({ ...agent, rank: index + 1 })}
                    className="flex items-center gap-4 px-5 py-4 bg-white dark:bg-[#111b21] rounded-2xl border border-slate-200 dark:border-[#222e35] shadow-sm relative overflow-hidden cursor-pointer hover:border-slate-300 dark:hover:border-[#374248] hover:shadow-md hover:scale-[1.005] transition-all"
                  >
                    {/* Rank Badge */}
                    <div className="w-10 flex items-center justify-center shrink-0">
                      {index < 3 ? (
                        <div className="w-9 h-9 rounded-full bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 flex items-center justify-center font-bold text-base border border-slate-200/60 dark:border-slate-700/60 shadow-sm">
                          {index + 1}
                        </div>
                      ) : (
                        <div className="text-sm font-semibold text-slate-400 dark:text-[#8696a0]">
                          #{index + 1}
                        </div>
                      )}
                    </div>

                    {/* Agent Info */}
                    <div className="flex items-center gap-3 w-[180px] shrink-0">
                      {agent.avatar_url ? (
                        <img src={agent.avatar_url} alt={agent.name} className="w-10 h-10 rounded-full object-cover border border-slate-200 dark:border-[#222e35] shrink-0" />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-blue-50 dark:bg-blue-900/20 text-blue-600 border border-blue-100 dark:border-blue-900/50 flex items-center justify-center font-bold text-base shrink-0">
                          {agent.name.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0">
                        <h3 className="font-bold text-slate-800 dark:text-[#e9edef] text-sm truncate">{agent.name}</h3>
                        <span className="text-[11px] font-medium text-slate-500 dark:text-[#8696a0] capitalize px-1.5 py-0.5 bg-slate-100 dark:bg-[#202c33] rounded mt-0.5 inline-block">
                          {agent.role}
                        </span>
                      </div>
                    </div>

                    {/* Left Section: Fixed Stats */}
                    <div className="flex items-center gap-5 flex-1 min-w-0">
                      {/* Messages + trend */}
                      <div className="flex flex-col min-w-[90px]">
                        <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-[#8696a0] mb-0.5 font-medium">
                          <MessageSquare size={12} /> Messages
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xl font-bold text-slate-800 dark:text-[#e9edef] leading-none">{agent.messagesCount}</span>
                          <TrendArrow today={agent.msgsToday} yesterday={agent.msgsYesterday} />
                        </div>
                        <span className="text-[10px] text-slate-400 dark:text-[#8696a0] mt-0.5">
                          {agent.msgsToday} today / {agent.msgsYesterday} yest.
                        </span>
                      </div>

                      {/* Convos + resolution rate */}
                      <div className="flex flex-col min-w-[80px]">
                        <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-[#8696a0] mb-0.5 font-medium">
                          <CheckCircle2 size={12} /> Resolved
                        </div>
                        <span className="text-xl font-bold text-slate-800 dark:text-[#e9edef] leading-none">{agent.resolvedCount}</span>
                        <span className="text-[10px] text-slate-400 dark:text-[#8696a0] mt-0.5">
                          {resolutionRate}% of {agent.chatsCount} chats
                        </span>
                      </div>

                      {/* Avg response time */}
                      <div className="flex flex-col min-w-[72px]">
                        <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-[#8696a0] mb-0.5 font-medium">
                          <Clock size={12} /> Avg Reply
                        </div>
                        <span className="text-xl font-bold text-slate-800 dark:text-[#e9edef] leading-none">
                          {agent.avgResponseTime > 0 ? `${agent.avgResponseTime}m` : '-'}
                        </span>
                        <span className="text-[10px] text-slate-400 dark:text-[#8696a0] mt-0.5">response time</span>
                      </div>

                      {/* Calls */}
                      <div className="flex flex-col min-w-[64px]">
                        <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-[#8696a0] mb-0.5 font-medium">
                          <Phone size={12} /> Calls
                        </div>
                        <span className="text-xl font-bold text-slate-800 dark:text-[#e9edef] leading-none">{agent.callsCount}</span>
                        {agent.totalCallDuration > 0 && (
                          <span className="text-[10px] text-slate-400 dark:text-[#8696a0] mt-0.5">{formatCallDuration(agent.totalCallDuration)}</span>
                        )}
                      </div>

                      {/* SLA */}
                      <div className="flex flex-col min-w-[64px]">
                        <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-[#8696a0] mb-0.5 font-medium">
                          SLA
                        </div>
                        <span className={`text-xl font-bold leading-none ${agent.firstResponseSlaPercent >= 80 ? 'text-emerald-600 dark:text-emerald-400' : agent.firstResponseSlaPercent >= 60 ? 'text-amber-500' : 'text-rose-500'}`}>
                          {agent.firstResponseSlaPercent}%
                        </span>
                        <span className="text-[10px] text-slate-400 dark:text-[#8696a0] mt-0.5">under 60s</span>
                      </div>
                    </div>

                    {/* Right Section: Visual data (hidden on small screens) */}
                    <div className="hidden lg:flex items-center gap-4 shrink-0">
                      {/* 7-day sparkline */}
                      {agent.dailyTrend && agent.dailyTrend.length > 0 && (
                        <div className="flex flex-col items-start gap-1">
                          <span className="text-[10px] text-slate-400 dark:text-[#8696a0] font-medium">7-day trend</span>
                          <SparklineBars data={agent.dailyTrend} />
                        </div>
                      )}

                      {/* 24h heatmap */}
                      {agent.hourlyActivity && (
                        <div className="flex flex-col items-start gap-1">
                          <span className="text-[10px] text-slate-400 dark:text-[#8696a0] font-medium">Work hours (BDT)</span>
                          <HeatmapRow data={agent.hourlyActivity} />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )
          ) : view === 'missed' ? (
            missedChats.length === 0 ? (
              <div className="text-center py-20 text-slate-500 dark:text-[#8696a0]">
                No missed chats for this period. Great job!
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between px-2 mb-4">
                  <h2 className="text-lg font-bold text-slate-800 dark:text-[#e9edef] flex items-center gap-2">
                    <AlertCircle className="text-rose-500" size={20} />
                    Missed Chats ({missedChats.length})
                  </h2>
                  <span className="text-sm text-slate-500">Unanswered for &gt;30 mins</span>
                </div>
                {missedChats.map((chat) => (
                  <div 
                    key={chat.id}
                    className="flex items-center justify-between p-5 bg-white dark:bg-[#111b21] rounded-2xl border border-slate-200 dark:border-[#222e35] shadow-sm hover:border-rose-200 dark:hover:border-rose-900/50 hover:shadow-md transition-all"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-full bg-rose-50 dark:bg-rose-900/20 text-rose-600 border border-rose-100 dark:border-rose-900/50 flex items-center justify-center font-bold text-lg">
                        {chat.contactName.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <h3 className="font-bold text-slate-800 dark:text-[#e9edef] text-base">{chat.contactName}</h3>
                        <p className="text-sm text-slate-500 dark:text-[#8696a0] mt-0.5 max-w-xl truncate">
                          &quot;{chat.lastMessageContent}&quot;
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-6">
                      <div className="flex flex-col items-end">
                        <span className="text-[13px] font-semibold text-rose-600 dark:text-rose-400">
                          Missed {chat.timeSinceLastMessage >= 60 ? `${Math.floor(chat.timeSinceLastMessage / 60)}h ${chat.timeSinceLastMessage % 60}m` : `${chat.timeSinceLastMessage}m`} ago
                        </span>
                        <span className="text-[11px] text-slate-400 dark:text-[#8696a0] mt-0.5">
                          {new Date(chat.lastMessageTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                        </span>
                      </div>
                      
                      <a 
                        href={`/inbox?c=${chat.id}`}
                        target="_blank"
                        className="flex items-center gap-1.5 px-4 py-2 bg-slate-50 hover:bg-slate-100 dark:bg-[#182229] dark:hover:bg-[#202c33] text-slate-700 dark:text-[#e9edef] text-sm font-medium rounded-lg border border-slate-200 dark:border-[#2a3942] transition-colors"
                      >
                        <Eye size={16} /> View Chat
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : null}
        </div>
      </div>

      {/* Detail Modal */}
      {selectedAgent && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 dark:bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setSelectedAgent(null)}
        >
          <div
            className="bg-white dark:bg-[#111b21] rounded-3xl border border-slate-200 dark:border-[#222e35] shadow-2xl w-full max-w-xl overflow-hidden flex flex-col max-h-[92vh] animate-in zoom-in-95 duration-200"
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

              {selectedAgent.avatar_url ? (
                <img src={selectedAgent.avatar_url} alt={selectedAgent.name} className="w-16 h-16 rounded-full object-cover border-2 border-[#0070f3] shrink-0" />
              ) : (
                <div className="w-16 h-16 rounded-full bg-blue-50 dark:bg-blue-900/20 text-[#0070f3] border-2 border-[#0070f3] flex items-center justify-center font-bold text-2xl shrink-0">
                  {selectedAgent.name.charAt(0).toUpperCase()}
                </div>
              )}
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-xl font-bold text-slate-800 dark:text-[#e9edef]">{selectedAgent.name}</h2>
                  <span className="text-[12px] font-semibold text-slate-500 dark:text-[#8696a0] capitalize px-2 py-0.5 bg-slate-200/60 dark:bg-[#2a3942] rounded-md">
                    {selectedAgent.role}
                  </span>
                </div>
                <p className="text-sm text-slate-500 dark:text-[#8696a0] mt-0.5 flex items-center gap-1 font-medium">
                  <Award size={14} className="text-slate-400 dark:text-[#8696a0]" />
                  Rank #{selectedAgent.rank} - {period} board
                </p>
                {getTenureDays(selectedAgent.joinedAt) !== null && (
                  <p className="text-xs text-slate-400 dark:text-[#8696a0] mt-0.5 flex items-center gap-1">
                    <CalendarDays size={12} />
                    Member for {getTenureDays(selectedAgent.joinedAt)} days
                  </p>
                )}
              </div>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-5 custom-scrollbar">

              {/* Today vs Yesterday */}
              <div className="bg-slate-50 dark:bg-[#182229] rounded-2xl p-4 border border-slate-200/60 dark:border-[#222e35]">
                <h3 className="text-[11px] font-bold text-slate-500 dark:text-[#8696a0] tracking-wider uppercase mb-3">Messages - Today vs Yesterday</h3>
                <div className="flex items-center gap-4">
                  <div className="flex flex-col">
                    <span className="text-[11px] text-slate-400 dark:text-[#8696a0]">Today</span>
                    <span className="text-2xl font-bold text-slate-800 dark:text-[#e9edef]">{selectedAgent.msgsToday}</span>
                  </div>
                  <div className="flex items-center gap-1 mt-2">
                    <TrendArrow today={selectedAgent.msgsToday} yesterday={selectedAgent.msgsYesterday} />
                    {selectedAgent.msgsToday > selectedAgent.msgsYesterday ? (
                      <span className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold">+{selectedAgent.msgsToday - selectedAgent.msgsYesterday} vs yest.</span>
                    ) : selectedAgent.msgsToday < selectedAgent.msgsYesterday ? (
                      <span className="text-xs text-rose-500 font-semibold">{selectedAgent.msgsToday - selectedAgent.msgsYesterday} vs yest.</span>
                    ) : (
                      <span className="text-xs text-slate-400 font-semibold">Same as yest.</span>
                    )}
                  </div>
                  <div className="flex flex-col ml-auto">
                    <span className="text-[11px] text-slate-400 dark:text-[#8696a0]">Yesterday</span>
                    <span className="text-2xl font-bold text-slate-500 dark:text-[#8696a0]">{selectedAgent.msgsYesterday}</span>
                  </div>
                </div>
              </div>

              {/* 7-day Trend */}
              {selectedAgent.dailyTrend && selectedAgent.dailyTrend.length > 0 && (
                <div className="bg-slate-50 dark:bg-[#182229] rounded-2xl p-4 border border-slate-200/60 dark:border-[#222e35]">
                  <h3 className="text-[11px] font-bold text-slate-500 dark:text-[#8696a0] tracking-wider uppercase mb-3">7-Day Message Trend</h3>
                  <SparklineFull data={selectedAgent.dailyTrend} />
                </div>
              )}

              {/* Hourly Heatmap */}
              {selectedAgent.hourlyActivity && (
                <div className="bg-slate-50 dark:bg-[#182229] rounded-2xl p-4 border border-slate-200/60 dark:border-[#222e35]">
                  <h3 className="text-[11px] font-bold text-slate-500 dark:text-[#8696a0] tracking-wider uppercase mb-3">Work Shift Heatmap (Last 14 Days, BDT)</h3>
                  <HeatmapFull data={selectedAgent.hourlyActivity} />
                </div>
              )}

              {/* Resolution Rate */}
              <div className="grid grid-cols-3 gap-3">
                <div className="p-4 rounded-xl border border-slate-100 dark:border-[#222e35] bg-white dark:bg-[#111b21] flex flex-col shadow-sm">
                  <span className="text-xs text-slate-400 dark:text-[#8696a0] font-medium mb-1">Resolved</span>
                  <span className="text-2xl font-bold text-slate-800 dark:text-[#e9edef]">{selectedAgent.resolvedCount}</span>
                  <span className="text-[10px] text-slate-400 dark:text-[#8696a0] mt-0.5">
                    {selectedAgent.chatsCount > 0 ? Math.round((selectedAgent.resolvedCount / selectedAgent.chatsCount) * 100) : 0}% rate
                  </span>
                </div>
                <div className="p-4 rounded-xl border border-slate-100 dark:border-[#222e35] bg-white dark:bg-[#111b21] flex flex-col shadow-sm">
                  <span className="text-xs text-slate-400 dark:text-[#8696a0] font-medium mb-1">Avg Reply</span>
                  <span className="text-2xl font-bold text-slate-800 dark:text-[#e9edef]">
                    {selectedAgent.avgResponseTime > 0 ? `${selectedAgent.avgResponseTime}m` : 'N/A'}
                  </span>
                  <span className="text-[10px] text-slate-400 dark:text-[#8696a0] mt-0.5">response time</span>
                </div>
                <div className="p-4 rounded-xl border border-slate-100 dark:border-[#222e35] bg-white dark:bg-[#111b21] flex flex-col shadow-sm">
                  <span className="text-xs text-slate-400 dark:text-[#8696a0] font-medium mb-1">Active Time</span>
                  <span className="text-2xl font-bold text-slate-800 dark:text-[#e9edef]">{formatActiveTime(selectedAgent.activeMinutes)}</span>
                  <span className="text-[10px] text-slate-400 dark:text-[#8696a0] mt-0.5">{selectedAgent.actionsPerHour || 0} actions/hr</span>
                </div>
              </div>

              {/* Target Progress */}
              <div className="bg-slate-50 dark:bg-[#182229] rounded-2xl p-5 border border-slate-200/60 dark:border-[#222e35] space-y-4">
                <h3 className="text-[11px] font-bold text-slate-500 dark:text-[#8696a0] tracking-wider uppercase flex items-center gap-1.5">
                  <Target size={13} className="text-[#0070f3]" /> {period} Target Metrics
                </h3>
                
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

              {/* Hosting Performance Scorecard */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold text-slate-400 dark:text-[#8696a0] tracking-wider uppercase">Hosting Performance Scorecard</h3>
                
                <div className="grid grid-cols-2 gap-3">
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
                    <span className="text-xs text-slate-400 dark:text-[#8696a0] font-medium mb-1">Total Public Messages</span>
                    <span className="text-2xl font-bold text-slate-800 dark:text-[#e9edef]">{selectedAgent.messagesCount}</span>
                  </div>

                  <div className="p-4 rounded-xl border border-slate-100 dark:border-[#222e35] bg-white dark:bg-[#111b21] flex flex-col shadow-sm">
                    <span className="text-xs text-slate-400 dark:text-[#8696a0] font-medium mb-1">AI Assisted</span>
                    <span className="text-2xl font-bold text-slate-800 dark:text-[#e9edef]">{selectedAgent.aiAssistedPercent}%</span>
                    <span className="text-[10px] text-slate-400 dark:text-[#8696a0] mt-0.5">{selectedAgent.aiDraftCount} drafts used</span>
                  </div>

                  <div className="col-span-2 p-4 rounded-xl border border-blue-100 dark:border-blue-900/30 bg-blue-50/20 dark:bg-blue-950/10 flex items-center justify-between shadow-sm">
                    <div className="flex flex-col">
                      <span className="text-xs text-blue-600 dark:text-blue-400 font-bold uppercase tracking-wide">Engagement Efficiency</span>
                      <span className="text-2xl font-bold text-slate-800 dark:text-[#e9edef] mt-1">{selectedAgent.actionsPerHour || 0} <span className="text-sm font-medium text-slate-500">actions / hour</span></span>
                    </div>
                    <Zap size={22} className="text-blue-500" />
                  </div>
                </div>
              </div>

              {/* Badges */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold text-slate-400 dark:text-[#8696a0] tracking-wider uppercase">Earned Hosting Badges</h3>
                
                <div className="space-y-2">
                  {selectedAgent.firstResponseSlaPercent >= 85 && selectedAgent.totalFirstResponses > 0 && (
                    <div className="flex items-center gap-3 p-3 bg-slate-50/50 dark:bg-[#182229] border border-slate-100 dark:border-[#222e35] rounded-xl">
                      <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-[#202c33] text-slate-500 dark:text-[#8696a0] border border-slate-200/50 dark:border-[#2a3942] flex items-center justify-center shrink-0">
                        <Clock size={16} />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-slate-800 dark:text-[#e9edef]">LiteSpeed Responder</h4>
                        <p className="text-xs text-slate-500 dark:text-[#8696a0]">Maintained outstanding under-60-seconds First Response SLA.</p>
                      </div>
                    </div>
                  )}

                  {selectedAgent.emergencyResponseTime > 0 && selectedAgent.emergencyResponseTime <= 90 && (
                    <div className="flex items-center gap-3 p-3 bg-slate-50/50 dark:bg-[#182229] border border-slate-100 dark:border-[#222e35] rounded-xl">
                      <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-[#202c33] text-slate-500 dark:text-[#8696a0] border border-slate-200/50 dark:border-[#2a3942] flex items-center justify-center shrink-0">
                        <ShieldAlert size={16} />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-slate-800 dark:text-[#e9edef]">NOC Incident Commander</h4>
                        <p className="text-xs text-slate-500 dark:text-[#8696a0]">Slashed down-site and database outage response times under 90s.</p>
                      </div>
                    </div>
                  )}

                  {selectedAgent.callsCount >= 1 && (
                    <div className="flex items-center gap-3 p-3 bg-slate-50/50 dark:bg-[#182229] border border-slate-100 dark:border-[#222e35] rounded-xl">
                      <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-[#202c33] text-slate-500 dark:text-[#8696a0] border border-slate-200/50 dark:border-[#2a3942] flex items-center justify-center shrink-0">
                        <Phone size={16} />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-slate-800 dark:text-[#e9edef]">Hotline Specialist</h4>
                        <p className="text-xs text-slate-500 dark:text-[#8696a0]">Maintained critical telephone hotlines with active customer talk time.</p>
                      </div>
                    </div>
                  )}

                  {selectedAgent.escalatedTicketsCount >= 1 && (
                    <div className="flex items-center gap-3 p-3 bg-slate-50/50 dark:bg-[#182229] border border-slate-100 dark:border-[#222e35] rounded-xl">
                      <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-[#202c33] text-slate-500 dark:text-[#8696a0] border border-slate-200/50 dark:border-[#2a3942] flex items-center justify-center shrink-0">
                        <Wrench size={16} />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-slate-800 dark:text-[#e9edef]">Sysadmin Escalation Pro</h4>
                        <p className="text-xs text-slate-500 dark:text-[#8696a0]">Migrated complex customer server issues to WHMCS support tickets.</p>
                      </div>
                    </div>
                  )}

                  {selectedAgent.resolvedCount >= 5 && (
                    <div className="flex items-center gap-3 p-3 bg-slate-50/50 dark:bg-[#182229] border border-slate-100 dark:border-[#222e35] rounded-xl">
                      <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-[#202c33] text-slate-500 dark:text-[#8696a0] border border-slate-200/50 dark:border-[#2a3942] flex items-center justify-center shrink-0">
                        <CheckCircle2 size={16} />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-slate-800 dark:text-[#e9edef]">Resolution Machine</h4>
                        <p className="text-xs text-slate-500 dark:text-[#8696a0]">Resolved {selectedAgent.resolvedCount}+ conversations this period.</p>
                      </div>
                    </div>
                  )}

                  {!(selectedAgent.firstResponseSlaPercent >= 85 && selectedAgent.totalFirstResponses > 0) &&
                    !(selectedAgent.emergencyResponseTime > 0 && selectedAgent.emergencyResponseTime <= 90) &&
                    !(selectedAgent.callsCount >= 1) &&
                    !(selectedAgent.escalatedTicketsCount >= 1) &&
                    !(selectedAgent.resolvedCount >= 5) && (
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
