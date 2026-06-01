"use client"

import { useState, useEffect, useRef } from "react"
import { useAuth } from "@/lib/auth-context"
import { getLeaderboardStats, getMissedChatsStats, getAnalyticsStats } from "@/actions/leaderboard"
import { 
  Clock, 
  MessageSquare, 
  Activity,
  BrainCircuit,
  Phone, 
  Target, 
  X,
  Award,
  ShieldAlert,
  Wrench,
  AlertCircle,
  AlertTriangle,
  Eye,
  TrendingUp,
  TrendingDown,
  Minus,
  Ticket,
  BarChart3,
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight
} from "lucide-react"

// ---------- Tiny Sparkline Bars ----------
function SparklineBars({ data }: { data: { day: string; count: number }[] }) {
  const max = Math.max(...data.map(d => d.count), 1);
  const dayShort = ['S','M','T','W','T','F','S'];
  return (
    <div className="flex items-end gap-[3px] h-10">
      {data.map((d, i) => {
        const h = Math.max(3, Math.round((d.count / max) * 36));
        const isToday = i === data.length - 1;
        const date = new Date(d.day + 'T00:00:00Z');
        return (
          <div key={d.day} className="flex flex-col items-center gap-0.5" title={`${d.day}: ${d.count} msgs`}>
            <span className={`text-[8px] font-bold leading-none ${d.count > 0 ? 'text-slate-500 dark:text-[#8696a0]' : 'text-transparent'}`}>{d.count}</span>
            <div
              style={{ height: `${h}px` }}
              className={`w-[8px] rounded-sm shrink-0 ${
                isToday
                  ? 'bg-[#0070f3]'
                  : d.count > 0 ? 'bg-slate-300 dark:bg-[#3a4a52]' : 'bg-slate-200 dark:bg-[#202c33]'
              }`}
            />
            <span className={`text-[7px] font-medium ${isToday ? 'text-[#0070f3]' : 'text-slate-400 dark:text-[#8696a0]'}`}>{isToday ? 'T' : dayShort[date.getUTCDay()]}</span>
          </div>
        );
      })}
    </div>
  );
}

// ---------- Active Shift Text ----------
function ActiveShiftText({ text }: { text: string }) {
  if (!text) return <span className="text-xs text-slate-400 dark:text-[#8696a0]">-</span>;
  // Clean up edge cases
  const display = text === '12AM - 12AM' ? 'All Day' : text;
  return (
    <span className="text-xs font-semibold text-slate-600 dark:text-[#d1d7db]">
      {display}
    </span>
  );
}

// ---------- Full-size Heatmap for Modal ----------
function HeatmapFull({ data }: { data: number[] }) {
  const max = Math.max(...data, 1);
  const labels = ['12 AM','1 AM','2 AM','3 AM','4 AM','5 AM','6 AM','7 AM','8 AM','9 AM','10 AM','11 AM','12 PM','1 PM','2 PM','3 PM','4 PM','5 PM','6 PM','7 PM','8 PM','9 PM','10 PM','11 PM'];
  return (
    <div className="space-y-[2px]">
      {data.map((count, h) => {
        const pct = max > 0 ? (count / max) * 100 : 0;
        const isActive = count > max * 0.1;
        return (
          <div key={h} className="flex items-center gap-2">
            <span className={`text-[10px] font-medium w-[42px] text-right shrink-0 ${
              isActive ? 'text-slate-600 dark:text-[#d1d7db]' : 'text-slate-400 dark:text-[#8696a0]'
            }`}>{labels[h]}</span>
            <div className="flex-1 h-[14px] bg-slate-100 dark:bg-[#202c33] rounded-sm overflow-hidden relative">
              <div
                className="h-full rounded-sm transition-all"
                style={{
                  width: `${pct}%`,
                  backgroundColor: count === 0 ? 'transparent' : `rgba(0, 112, 243, ${0.3 + (pct / 100) * 0.7})`,
                }}
              />
            </div>
            <span className={`text-[10px] font-bold w-[28px] text-right ${
              count > 0 ? 'text-slate-600 dark:text-[#d1d7db]' : 'text-slate-300 dark:text-[#2a3942]'
            }`}>{count}</span>
          </div>
        );
      })}
    </div>
  );
}

// ---------- Full Sparkline for Modal ----------
function SparklineFull({ data }: { data: { day: string; count: number }[] }) {
  const max = Math.max(...data.map(d => d.count), 1);
  const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  return (
    <div>
      <div className="flex items-end gap-2 h-20 mb-1">
        {data.map((d, i) => {
          const h = Math.max(4, Math.round((d.count / max) * 72));
          const isToday = i === data.length - 1;
          return (
            <div key={d.day} className="flex-1 flex flex-col items-center justify-end gap-1">
              <span className={`text-[11px] font-bold ${
                isToday ? 'text-[#0070f3]' : 'text-slate-500 dark:text-[#8696a0]'
              }`}>{d.count}</span>
              <div
                className="w-full rounded-t-md"
                style={{
                  height: `${h}px`,
                  backgroundColor: isToday ? '#0070f3' : d.count > 0 ? 'rgba(0,112,243,0.25)' : 'rgba(0,112,243,0.08)',
                }}
              />
            </div>
          );
        })}
      </div>
      <div className="flex gap-2">
        {data.map((d, i) => {
          const date = new Date(d.day + 'T00:00:00Z');
          const dayLabel = i === data.length - 1 ? 'Today' : dayNames[date.getUTCDay()];
          return (
            <div key={d.day} className={`flex-1 text-center text-[10px] font-medium ${
              i === data.length - 1 ? 'text-[#0070f3]' : 'text-slate-400 dark:text-[#8696a0]'
            }`}>{dayLabel}</div>
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


// ---------- Custom Date Picker ----------
function CustomDatePicker({ value, onChange }: { value: string; onChange: (date: string) => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const [viewDate, setViewDate] = useState(() => {
    const d = value ? new Date(value + 'T00:00:00') : new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const daysInMonth = new Date(viewDate.year, viewDate.month + 1, 0).getDate();
  const firstDayOfWeek = new Date(viewDate.year, viewDate.month, 1).getDay();
  const monthName = new Date(viewDate.year, viewDate.month).toLocaleString('en-US', { month: 'long' });

  const days: (number | null)[] = [];
  for (let i = 0; i < firstDayOfWeek; i++) days.push(null);
  for (let i = 1; i <= daysInMonth; i++) days.push(i);

  const selectedParts = value ? value.split('-').map(Number) : [];
  const isSelected = (day: number) =>
    selectedParts.length === 3 &&
    viewDate.year === selectedParts[0] &&
    viewDate.month === selectedParts[1] - 1 &&
    day === selectedParts[2];

  const isToday = (day: number) => {
    const now = new Date();
    return viewDate.year === now.getFullYear() && viewDate.month === now.getMonth() && day === now.getDate();
  };

  const handleSelect = (day: number) => {
    const mm = String(viewDate.month + 1).padStart(2, '0');
    const dd = String(day).padStart(2, '0');
    onChange(`${viewDate.year}-${mm}-${dd}`);
    setIsOpen(false);
  };

  const prevMonth = () => {
    setViewDate(prev => prev.month === 0 ? { year: prev.year - 1, month: 11 } : { ...prev, month: prev.month - 1 });
  };
  const nextMonth = () => {
    setViewDate(prev => prev.month === 11 ? { year: prev.year + 1, month: 0 } : { ...prev, month: prev.month + 1 });
  };

  const goToToday = () => {
    const now = new Date();
    setViewDate({ year: now.getFullYear(), month: now.getMonth() });
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    onChange(`${now.getFullYear()}-${mm}-${dd}`);
    setIsOpen(false);
  };

  const displayText = value || 'Pick date';

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`px-4 py-1.5 text-[13px] font-medium rounded-md transition-all flex items-center gap-2 ${
          value
            ? 'bg-white dark:bg-[#2a3942] text-slate-800 dark:text-[#e9edef] shadow-sm'
            : 'text-slate-500 dark:text-[#8696a0] hover:text-slate-700 dark:hover:text-[#d1d7db]'
        }`}
      >
        <CalendarIcon size={14} />
        {displayText}
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-2 z-50 bg-white dark:bg-[#111b21] rounded-2xl border border-slate-200 dark:border-[#222e35] shadow-2xl p-4 w-[280px] animate-in fade-in zoom-in-95 duration-150">
          <div className="flex items-center justify-between mb-3">
            <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-[#202c33] text-slate-500 dark:text-[#8696a0] transition-colors">
              <ChevronLeft size={16} />
            </button>
            <span className="text-sm font-bold text-slate-800 dark:text-[#e9edef]">
              {monthName} {viewDate.year}
            </span>
            <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-[#202c33] text-slate-500 dark:text-[#8696a0] transition-colors">
              <ChevronRight size={16} />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-0.5 mb-1">
            {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => (
              <div key={d} className="text-center text-[11px] font-semibold text-slate-400 dark:text-[#8696a0] py-1">{d}</div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-0.5">
            {days.map((day, idx) => (
              <div key={idx} className="aspect-square flex items-center justify-center">
                {day !== null && (
                  <button
                    onClick={() => handleSelect(day)}
                    className={`w-8 h-8 rounded-lg text-[13px] font-medium transition-all ${
                      isSelected(day)
                        ? 'bg-[#0070f3] text-white shadow-sm'
                        : isToday(day)
                        ? 'bg-blue-50 dark:bg-blue-900/20 text-[#0070f3] font-bold ring-1 ring-[#0070f3]/30'
                        : 'text-slate-700 dark:text-[#d1d7db] hover:bg-slate-100 dark:hover:bg-[#202c33]'
                    }`}
                  >
                    {day}
                  </button>
                )}
              </div>
            ))}
          </div>

          <div className="flex justify-between items-center mt-3 pt-3 border-t border-slate-100 dark:border-[#222e35]">
            <button
              onClick={() => { onChange(''); setIsOpen(false); }}
              className="text-[12px] text-slate-400 dark:text-[#8696a0] hover:text-slate-600 dark:hover:text-[#d1d7db] font-medium"
            >
              Clear
            </button>
            <button
              onClick={goToToday}
              className="text-[12px] text-[#0070f3] hover:text-blue-700 font-semibold"
            >
              Today
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function LeaderboardPage() {
  const user = useAuth()
  const [view, setView] = useState<'leaderboard' | 'missed' | 'analytics'>('leaderboard')
  const [period, setPeriod] = useState<'daily' | 'weekly' | 'monthly' | 'custom'>('daily')
  const [customDate, setCustomDate] = useState<string>(() => new Date().toISOString().split('T')[0])
  const [stats, setStats] = useState<any[]>([])
  const [missedChats, setMissedChats] = useState<any[]>([])
  const [analyticsData, setAnalyticsData] = useState<any | null>(null)
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
        } else if (view === 'missed') {
          const data = await getMissedChatsStats(user.org_id, period, period === 'custom' ? customDate : undefined)
          setMissedChats(data)
        } else if (view === 'analytics') {
          const data = await getAnalyticsStats(user.org_id)
          setAnalyticsData(data)
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
            <button
              onClick={() => setView('analytics')}
              className={`px-4 py-1.5 text-[13px] font-medium rounded-md transition-all ${
                view === 'analytics' 
                  ? 'bg-white dark:bg-[#2a3942] text-[#0070f3] shadow-sm' 
                  : 'text-slate-500 dark:text-[#8696a0] hover:text-slate-700 dark:hover:text-[#d1d7db]'
              }`}
            >
              Analytics
            </button>
          </div>
        </div>
        
        {view !== 'analytics' && (
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
              <CustomDatePicker
                value={period === 'custom' ? customDate : ''}
                onChange={(date) => {
                  if (date) {
                    setCustomDate(date);
                    setPeriod('custom');
                  } else {
                    setPeriod('daily');
                  }
                  setSelectedAgent(null);
                }}
              />
            </div>
          </div>
        )}
        {view === 'analytics' && (
          <span className="text-xs font-medium text-slate-400 dark:text-[#8696a0] px-3 py-1.5 bg-slate-100 dark:bg-[#202c33] rounded-lg border border-slate-200 dark:border-[#2a3942]">
            Last 14 days
          </span>
        )}
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
                        {agent.performanceGrade && (
                          <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded mt-0.5 inline-block ml-1 ${
                            agent.performanceGrade.startsWith('A') ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400' :
                            agent.performanceGrade.startsWith('B') ? 'bg-blue-50 dark:bg-blue-900/20 text-[#0070f3]' :
                            agent.performanceGrade === 'C' ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-600' :
                            'bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400'
                          }`}>
                            {agent.performanceGrade}
                          </span>
                        )}
                        <div className="flex items-center gap-1.5 mt-0.5">
                          {agent.activeDaysCount > 0 && (
                            <span className="text-[10px] font-semibold text-slate-500 dark:text-[#8696a0] px-1.5 py-0.5 bg-slate-100 dark:bg-[#202c33] rounded">
                              {agent.activeDaysCount}/7 days
                            </span>
                          )}
                          {agent.peakHour >= 0 && (
                            <span className="text-[10px] font-semibold text-slate-500 dark:text-[#8696a0] px-1.5 py-0.5 bg-slate-100 dark:bg-[#202c33] rounded">
                              Peak: {agent.peakHour === 0 ? '12AM' : agent.peakHour === 12 ? '12PM' : agent.peakHour < 12 ? `${agent.peakHour}AM` : `${agent.peakHour - 12}PM`}
                            </span>
                          )}
                        </div>
                        {/* Productivity Score Bar */}
                        {agent.productivityScore > 0 && (
                          <div className="flex items-center gap-1.5 mt-1">
                            <div className="w-16 h-[5px] bg-slate-200 dark:bg-[#202c33] rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all ${
                                  agent.productivityScore >= 75 ? 'bg-emerald-500' : agent.productivityScore >= 50 ? 'bg-amber-500' : 'bg-rose-500'
                                }`}
                                style={{ width: `${agent.productivityScore}%` }}
                              />
                            </div>
                            <span className={`text-[9px] font-bold ${
                              agent.productivityScore >= 75 ? 'text-emerald-600 dark:text-emerald-400' : agent.productivityScore >= 50 ? 'text-amber-500' : 'text-rose-500'
                            }`}>{agent.productivityScore}%</span>
                          </div>
                        )}
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

                      {/* Tickets Created */}
                      <div className="flex flex-col min-w-[80px]">
                        <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-[#8696a0] mb-0.5 font-medium">
                          <Ticket size={12} /> Tickets
                        </div>
                        <span className="text-xl font-bold text-slate-800 dark:text-[#e9edef] leading-none">{agent.ticketsCreated}</span>
                        <span className="text-[10px] text-slate-400 dark:text-[#8696a0] mt-0.5">
                          of {agent.chatsCount} chats
                        </span>
                      </div>

                      {/* WHMCS Ticket Replies */}
                      {(agent.whmcsReplies > 0 || agent.whmcsTicketsHandled > 0) && (
                        <div className="flex flex-col min-w-[72px]">
                          <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-[#8696a0] mb-0.5 font-medium">
                            <Wrench size={12} /> WHMCS
                          </div>
                          <span className="text-xl font-bold text-slate-800 dark:text-[#e9edef] leading-none">{agent.whmcsReplies}</span>
                          <span className="text-[10px] text-slate-400 dark:text-[#8696a0] mt-0.5">
                            {agent.whmcsTicketsHandled} tickets
                          </span>
                        </div>
                      )}

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
                        <span className={`text-xl font-bold leading-none ${agent.firstResponseSlaPercent < 0 ? 'text-slate-400 dark:text-[#8696a0]' : agent.firstResponseSlaPercent >= 80 ? 'text-emerald-600 dark:text-emerald-400' : agent.firstResponseSlaPercent >= 60 ? 'text-amber-500' : 'text-rose-500'}`}>
                          {agent.firstResponseSlaPercent < 0 ? 'N/A' : `${agent.firstResponseSlaPercent}%`}
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

                      {/* Active shift */}
                      {agent.activeShiftText && (
                        <div className="flex flex-col items-start gap-1">
                          <span className="text-[10px] text-slate-400 dark:text-[#8696a0] font-medium">Shift (BST)</span>
                          <ActiveShiftText text={agent.activeShiftText} />
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
                {/* Blame summary */}
                <div className="flex flex-wrap items-center gap-2 px-2 mb-3">
                  {(() => {
                    const counts: Record<string, number> = {};
                    missedChats.forEach((c: any) => {
                      const name = c.missedByAgent || 'Unassigned';
                      counts[name] = (counts[name] || 0) + 1;
                    });
                    return Object.entries(counts).map(([name, count]) => (
                      <span key={name} className="text-xs font-medium px-2 py-0.5 rounded-md bg-slate-100 dark:bg-[#202c33] text-slate-600 dark:text-[#d1d7db]">
                        {name}: {count}
                      </span>
                    ));
                  })()}
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
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-slate-800 dark:text-[#e9edef] text-base">{chat.contactName}</h3>
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400">
                            {chat.missedByAgent || 'Unassigned'}
                          </span>
                        </div>
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
          ) : view === 'analytics' ? (
            !analyticsData ? (
              <div className="text-center py-20 text-slate-500 dark:text-[#8696a0]">
                No analytics data available.
              </div>
            ) : (
              <div className="space-y-6">
                {/* Section A: Customer Demand vs Agent Coverage */}
                <div className="bg-white dark:bg-[#111b21] rounded-2xl border border-slate-200 dark:border-[#222e35] p-5 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-xs font-bold text-slate-400 dark:text-[#8696a0] tracking-wider uppercase flex items-center gap-1.5">
                      <BarChart3 size={13} className="text-[#0070f3]" /> Customer Demand vs Agent Coverage (BST, Last 14 Days)
                    </h3>
                    <div className="flex items-center gap-4 text-[10px] text-slate-400 dark:text-[#8696a0]">
                      <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-slate-300 dark:bg-[#2a3942] inline-block" /> Demand</span>
                      <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-[#0070f3] inline-block" /> Supply</span>
                    </div>
                  </div>
                  {(() => {
                    const maxVal = Math.max(...analyticsData.customerDemand, ...analyticsData.totalAgentSupply, 1);
                    const labels = ['12A','1A','2A','3A','4A','5A','6A','7A','8A','9A','10A','11A','12P','1P','2P','3P','4P','5P','6P','7P','8P','9P','10P','11P'];
                    const deadZoneSet = new Set(analyticsData.deadZones);
                    return (
                      <div>
                        <div className="flex items-end gap-[3px] h-[140px] mb-1">
                          {analyticsData.customerDemand.map((demand: number, h: number) => {
                            const supply = analyticsData.totalAgentSupply[h];
                            const demandH = Math.max(2, Math.round((demand / maxVal) * 130));
                            const supplyH = Math.max(0, Math.round((supply / maxVal) * 130));
                            const isGap = demand > 0 && supply === 0;
                            const isUnderstaffed = demand > supply * 1.5 && demand > 10;
                            return (
                              <div key={h} className="flex-1 flex flex-col items-center justify-end relative group">
                                <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-[9px] text-slate-500 dark:text-[#8696a0] opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10 bg-white dark:bg-[#111b21] px-1 rounded shadow-sm border border-slate-200 dark:border-[#222e35]">
                                  {demand}D / {supply}S
                                </span>
                                <div className="w-full relative" style={{ height: `${demandH}px` }}>
                                  <div
                                    className="absolute inset-0 rounded-t-sm bg-slate-200 dark:bg-[#2a3942]"
                                  />
                                  <div
                                    className="absolute bottom-0 left-0 right-0 rounded-t-sm bg-[#0070f3]"
                                    style={{ height: `${supplyH}px` }}
                                  />
                                </div>
                                {(isGap || isUnderstaffed) && (
                                  <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-rose-500 rounded-b" />
                                )}
                              </div>
                            );
                          })}
                        </div>
                        <div className="flex gap-[3px]">
                          {labels.map((label, i) => (
                            <div key={i} className={`flex-1 text-center text-[8px] font-medium ${analyticsData.deadZones?.includes(i) ? 'text-rose-500' : 'text-slate-400 dark:text-[#8696a0]'}`}>
                              {label}
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                  {/* Dead zone alerts */}
                  {analyticsData.deadZones && analyticsData.deadZones.length > 0 && (
                    <div className="mt-4 space-y-2">
                      {analyticsData.deadZones.map((h: number) => {
                        const formatHr = (hour: number) => hour === 0 ? '12AM' : hour === 12 ? '12PM' : hour < 12 ? `${hour}AM` : `${hour - 12}PM`;
                        return (
                          <div key={h} className="flex items-center gap-2 px-3 py-2 bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/40 rounded-xl text-xs font-medium text-rose-700 dark:text-rose-400">
                            <AlertTriangle size={14} className="shrink-0" />
                            DEAD ZONE: {formatHr(h)} BST - No agent coverage. {analyticsData.customerDemand[h]} customer messages went unattended.
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Section B: Day-of-Week Consistency Grid */}
                <div className="bg-white dark:bg-[#111b21] rounded-2xl border border-slate-200 dark:border-[#222e35] p-5 shadow-sm">
                  <h3 className="text-xs font-bold text-slate-400 dark:text-[#8696a0] tracking-wider uppercase mb-4">Day-of-Week Message Distribution (Last 14 Days)</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-100 dark:border-[#222e35]">
                          <th className="text-left text-[11px] font-bold text-slate-500 dark:text-[#8696a0] py-2 pr-4 w-[120px]">Agent</th>
                          {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d => (
                            <th key={d} className="text-center text-[11px] font-bold text-slate-500 dark:text-[#8696a0] py-2 px-2 min-w-[56px]">{d}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {analyticsData.agentNames.map((name: string) => {
                          const row = analyticsData.dayOfWeekGrid[name];
                          if (!row) return null;
                          // Reorder: Mon=1,Tue=2,...,Sat=6,Sun=0
                          const ordered = [row[1], row[2], row[3], row[4], row[5], row[6], row[0]];
                          const rowMax = Math.max(...ordered, 1);
                          const rowAvg = ordered.reduce((a: number, b: number) => a + b, 0) / 7;
                          return (
                            <tr key={name} className="border-b border-slate-50 dark:border-[#1a2730]">
                              <td className="text-[12px] font-semibold text-slate-700 dark:text-[#d1d7db] py-2 pr-4">{name}</td>
                              {ordered.map((val: number, i: number) => {
                                const intensity = val / rowMax;
                                const isLow = val < rowAvg * 0.2 && rowAvg > 10;
                                return (
                                  <td key={i} className="text-center py-2 px-1">
                                    <span
                                      className={`inline-block px-2 py-1 rounded-md text-[11px] font-bold min-w-[40px] ${
                                        isLow
                                          ? 'bg-rose-50 dark:bg-rose-950/20 text-rose-600 dark:text-rose-400'
                                          : 'text-slate-700 dark:text-[#d1d7db]'
                                      }`}
                                      style={!isLow ? {
                                        backgroundColor: `rgba(0, 112, 243, ${val === 0 ? 0.03 : 0.08 + intensity * 0.3})`,
                                      } : undefined}
                                    >
                                      {val}
                                    </span>
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Section C: Response Time Distribution */}
                <div className="bg-white dark:bg-[#111b21] rounded-2xl border border-slate-200 dark:border-[#222e35] p-5 shadow-sm">
                  <h3 className="text-xs font-bold text-slate-400 dark:text-[#8696a0] tracking-wider uppercase mb-4 flex items-center gap-1.5">
                    <Clock size={13} /> Response Time Distribution
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-100 dark:border-[#222e35]">
                          <th className="text-left text-[11px] font-bold text-slate-500 dark:text-[#8696a0] py-2 pr-4 w-[120px]">Agent</th>
                          <th className="text-center text-[11px] font-bold text-emerald-600 dark:text-emerald-400 py-2 px-2">&lt;1min</th>
                          <th className="text-center text-[11px] font-bold text-[#0070f3] py-2 px-2">1-5min</th>
                          <th className="text-center text-[11px] font-bold text-slate-500 dark:text-[#8696a0] py-2 px-2">5-15min</th>
                          <th className="text-center text-[11px] font-bold text-amber-500 py-2 px-2">15-60min</th>
                          <th className="text-center text-[11px] font-bold text-rose-500 py-2 px-2">&gt;1hr</th>
                        </tr>
                      </thead>
                      <tbody>
                        {analyticsData.agentNames.map((name: string) => {
                          const b = analyticsData.responseTimeBuckets[name];
                          if (!b || b.total === 0) return null;
                          const pct = (v: number) => Math.round((v / b.total) * 100);
                          return (
                            <tr key={name} className="border-b border-slate-50 dark:border-[#1a2730]">
                              <td className="text-[12px] font-semibold text-slate-700 dark:text-[#d1d7db] py-2.5 pr-4">{name}</td>
                              <td className="text-center py-2.5"><span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">{pct(b.under1m)}%</span> <span className="text-[9px] text-slate-400">({b.under1m})</span></td>
                              <td className="text-center py-2.5"><span className="text-[11px] font-bold text-[#0070f3]">{pct(b.m1to5)}%</span> <span className="text-[9px] text-slate-400">({b.m1to5})</span></td>
                              <td className="text-center py-2.5"><span className="text-[11px] font-bold text-slate-600 dark:text-slate-300">{pct(b.m5to15)}%</span> <span className="text-[9px] text-slate-400">({b.m5to15})</span></td>
                              <td className="text-center py-2.5"><span className="text-[11px] font-bold text-amber-500">{pct(b.m15to60)}%</span> <span className="text-[9px] text-slate-400">({b.m15to60})</span></td>
                              <td className="text-center py-2.5"><span className="text-[11px] font-bold text-rose-500">{pct(b.over1h)}%</span> <span className="text-[9px] text-slate-400">({b.over1h})</span></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Section D: Quality Metrics */}
                <div className="bg-white dark:bg-[#111b21] rounded-2xl border border-slate-200 dark:border-[#222e35] p-5 shadow-sm">
                  <h3 className="text-xs font-bold text-slate-400 dark:text-[#8696a0] tracking-wider uppercase mb-4 flex items-center gap-1.5">
                    <Award size={13} /> Quality Metrics
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-100 dark:border-[#222e35]">
                          <th className="text-left text-[11px] font-bold text-slate-500 dark:text-[#8696a0] py-2 pr-4 w-[120px]">Agent</th>
                          <th className="text-center text-[11px] font-bold text-slate-500 dark:text-[#8696a0] py-2 px-3">Avg Reply Length</th>
                          <th className="text-center text-[11px] font-bold text-slate-500 dark:text-[#8696a0] py-2 px-3">Satisfaction Score</th>
                          <th className="text-center text-[11px] font-bold text-slate-500 dark:text-[#8696a0] py-2 px-3">Tickets Created</th>
                        </tr>
                      </thead>
                      <tbody>
                        {analyticsData.agentNames.map((name: string) => {
                          const q = analyticsData.qualityMetrics[name];
                          const s = analyticsData.sentimentByAgent[name];
                          if (!q) return null;
                          const satScore = s && (s.positive + s.negative) > 0
                            ? Math.round((s.positive / (s.positive + s.negative)) * 100)
                            : null;
                          return (
                            <tr key={name} className="border-b border-slate-50 dark:border-[#1a2730]">
                              <td className="text-[12px] font-semibold text-slate-700 dark:text-[#d1d7db] py-2.5 pr-4">{name}</td>
                              <td className="text-center py-2.5">
                                <span className="text-[12px] font-bold text-slate-700 dark:text-[#d1d7db]">{q.avgMsgLength}</span>
                                <span className="text-[10px] text-slate-400 ml-1">chars</span>
                              </td>
                              <td className="text-center py-2.5">
                                {satScore !== null ? (
                                  <span className={`text-[12px] font-bold ${satScore >= 70 ? 'text-emerald-600 dark:text-emerald-400' : satScore >= 50 ? 'text-amber-500' : 'text-rose-500'}`}>
                                    {satScore}% positive
                                  </span>
                                ) : (
                                  <span className="text-[11px] text-slate-400">N/A</span>
                                )}
                              </td>
                              <td className="text-center py-2.5">
                                <span className="text-[12px] font-bold text-slate-700 dark:text-[#d1d7db]">{q.ticketsCreated}</span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Section E: Coverage Gap Alerts */}
                {analyticsData.coverageGaps && analyticsData.coverageGaps.length > 0 && (
                  <div className="bg-white dark:bg-[#111b21] rounded-2xl border border-slate-200 dark:border-[#222e35] p-5 shadow-sm">
                    <h3 className="text-xs font-bold text-slate-400 dark:text-[#8696a0] tracking-wider uppercase mb-4 flex items-center gap-1.5">
                      <AlertTriangle size={13} className="text-rose-500" /> Coverage Gap Alerts
                    </h3>
                    <div className="space-y-2">
                      {analyticsData.coverageGaps.map((gap: any, i: number) => {
                        const formatHr = (hour: number) => hour === 0 ? '12AM' : hour === 12 ? '12PM' : hour < 12 ? `${hour}AM` : `${hour - 12}PM`;
                        const isDead = gap.supply === 0;
                        return (
                          <div key={i} className={`flex items-start gap-2.5 px-4 py-3 rounded-xl border text-xs font-medium ${
                            isDead
                              ? 'bg-rose-50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900/40 text-rose-700 dark:text-rose-400'
                              : 'bg-amber-50 dark:bg-amber-950/10 border-amber-200 dark:border-amber-900/40 text-amber-700 dark:text-amber-400'
                          }`}>
                            <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                            <div>
                              {isDead ? (
                                <span>DEAD ZONE: {formatHr(gap.hour)} BST - No agent coverage. {gap.demand} customer messages went unattended.</span>
                              ) : (
                                <span>UNDERSTAFFED: {formatHr(gap.hour)} BST - {gap.demand} customer messages vs {gap.supply} agent replies.{gap.agents.length > 0 ? ` Active: ${gap.agents.join(', ')}` : ''}</span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Section F: WHMCS Ticket Overview */}
                {analyticsData.whmcsAdminStats && analyticsData.whmcsAdminStats.length > 0 && (
                  <div className="bg-white dark:bg-[#111b21] rounded-2xl border border-slate-200 dark:border-[#222e35] p-5 shadow-sm">
                    <h3 className="text-xs font-bold text-slate-400 dark:text-[#8696a0] tracking-wider uppercase mb-4 flex items-center gap-1.5">
                      <Wrench size={13} /> WHMCS Ticket Overview (Last 14 Days)
                    </h3>

                    {/* Status summary */}
                    {analyticsData.ticketsByStatus && Object.keys(analyticsData.ticketsByStatus).length > 0 && (
                      <div className="flex flex-wrap gap-2 mb-4">
                        {Object.entries(analyticsData.ticketsByStatus).map(([status, count]: [string, any]) => (
                          <span key={status} className="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-[#202c33] text-slate-600 dark:text-[#d1d7db] border border-slate-200/60 dark:border-[#2a3942]">
                            {status}: {count}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Admin stats table */}
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-slate-100 dark:border-[#222e35]">
                            <th className="text-left text-[11px] font-bold text-slate-500 dark:text-[#8696a0] py-2 pr-4 w-[120px]">Agent</th>
                            <th className="text-center text-[11px] font-bold text-slate-500 dark:text-[#8696a0] py-2 px-3">Replies</th>
                            <th className="text-center text-[11px] font-bold text-slate-500 dark:text-[#8696a0] py-2 px-3">Tickets Handled</th>
                            <th className="text-center text-[11px] font-bold text-slate-500 dark:text-[#8696a0] py-2 px-3">Avg Rating</th>
                            <th className="text-center text-[11px] font-bold text-slate-500 dark:text-[#8696a0] py-2 px-3">Feedback</th>
                          </tr>
                        </thead>
                        <tbody>
                          {analyticsData.whmcsAdminStats.map((admin: any) => (
                            <tr key={admin.name} className="border-b border-slate-50 dark:border-[#1a2730]">
                              <td className="text-[12px] font-semibold text-slate-700 dark:text-[#d1d7db] py-2.5 pr-4">{admin.name}</td>
                              <td className="text-center py-2.5">
                                <span className="text-[12px] font-bold text-slate-700 dark:text-[#d1d7db]">{admin.replies}</span>
                              </td>
                              <td className="text-center py-2.5">
                                <span className="text-[12px] font-bold text-slate-700 dark:text-[#d1d7db]">{admin.tickets_handled}</span>
                              </td>
                              <td className="text-center py-2.5">
                                {admin.avg_rating !== null && admin.avg_rating !== undefined ? (
                                  <span className={`text-[12px] font-bold ${
                                    admin.avg_rating >= 9.0 ? 'text-emerald-600 dark:text-emerald-400' :
                                    admin.avg_rating >= 7.0 ? 'text-[#0070f3]' :
                                    admin.avg_rating >= 5.0 ? 'text-amber-500' : 'text-rose-500'
                                  }`}>{admin.avg_rating}/10</span>
                                ) : (
                                  <span className="text-[11px] text-slate-400">N/A</span>
                                )}
                              </td>
                              <td className="text-center py-2.5">
                                <span className="text-[12px] font-bold text-slate-700 dark:text-[#d1d7db]">{admin.feedback_count}</span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
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
                  <h3 className="text-[11px] font-bold text-slate-500 dark:text-[#8696a0] tracking-wider uppercase mb-3">Work Shift Heatmap (Last 14 Days, BST)</h3>
                  <HeatmapFull data={selectedAgent.hourlyActivity} />
                </div>
              )}

              {/* Resolution Rate */}
              <div className="grid grid-cols-3 gap-3">
                <div className="p-4 rounded-xl border border-slate-100 dark:border-[#222e35] bg-white dark:bg-[#111b21] flex flex-col shadow-sm">
                  <span className="text-xs text-slate-400 dark:text-[#8696a0] font-medium mb-1">Tickets Created</span>
                  <span className="text-2xl font-bold text-slate-800 dark:text-[#e9edef]">{selectedAgent.ticketsCreated}</span>
                  <span className="text-[10px] text-slate-400 dark:text-[#8696a0] mt-0.5">Each ticket = potential churn save</span>
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
                  <Target size={13} className="text-slate-400 dark:text-[#8696a0]" /> {period} Target Metrics
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
                    <span className="text-xs text-slate-400 dark:text-[#8696a0] font-medium mb-1">Tickets Created</span>
                    <span className="text-2xl font-bold text-slate-800 dark:text-[#e9edef]">{selectedAgent.ticketsCreated} tickets</span>
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
                    <Activity size={22} className="text-slate-400 dark:text-[#8696a0]" />
                  </div>
                </div>
              </div>

              {/* WHMCS Ticket Performance */}
              {(selectedAgent.whmcsReplies > 0 || selectedAgent.whmcsTicketsHandled > 0) && (
                <div className="space-y-3">
                  <h3 className="text-xs font-bold text-slate-400 dark:text-[#8696a0] tracking-wider uppercase flex items-center gap-1.5">
                    <Wrench size={13} className="text-slate-400 dark:text-[#8696a0]" /> WHMCS Ticket Performance
                  </h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-4 rounded-xl border border-slate-100 dark:border-[#222e35] bg-white dark:bg-[#111b21] flex flex-col shadow-sm">
                      <span className="text-xs text-slate-400 dark:text-[#8696a0] font-medium mb-1">Ticket Replies</span>
                      <span className="text-2xl font-bold text-slate-800 dark:text-[#e9edef]">{selectedAgent.whmcsReplies}</span>
                    </div>
                    <div className="p-4 rounded-xl border border-slate-100 dark:border-[#222e35] bg-white dark:bg-[#111b21] flex flex-col shadow-sm">
                      <span className="text-xs text-slate-400 dark:text-[#8696a0] font-medium mb-1">Unique Tickets</span>
                      <span className="text-2xl font-bold text-slate-800 dark:text-[#e9edef]">{selectedAgent.whmcsTicketsHandled}</span>
                    </div>
                    <div className="p-4 rounded-xl border border-slate-100 dark:border-[#222e35] bg-white dark:bg-[#111b21] flex flex-col shadow-sm">
                      <span className="text-xs text-slate-400 dark:text-[#8696a0] font-medium mb-1">Customer Rating</span>
                      {selectedAgent.whmcsAvgRating !== null && selectedAgent.whmcsAvgRating !== undefined ? (
                        <span className={`text-2xl font-bold ${
                          selectedAgent.whmcsAvgRating >= 9.0 ? 'text-emerald-600 dark:text-emerald-400' :
                          selectedAgent.whmcsAvgRating >= 7.0 ? 'text-[#0070f3]' :
                          selectedAgent.whmcsAvgRating >= 5.0 ? 'text-amber-500' : 'text-rose-500'
                        }`}>{selectedAgent.whmcsAvgRating}/10</span>
                      ) : (
                        <span className="text-lg font-semibold text-slate-400 dark:text-[#8696a0]">No ratings</span>
                      )}
                    </div>
                    <div className="p-4 rounded-xl border border-slate-100 dark:border-[#222e35] bg-white dark:bg-[#111b21] flex flex-col shadow-sm">
                      <span className="text-xs text-slate-400 dark:text-[#8696a0] font-medium mb-1">Feedback Count</span>
                      <span className="text-2xl font-bold text-slate-800 dark:text-[#e9edef]">{selectedAgent.whmcsFeedbackCount}</span>
                    </div>
                  </div>
                </div>
              )}

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

                  {selectedAgent.ticketsCreated >= 1 && (
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

                  {selectedAgent.ticketsCreated >= 10 && (
                    <div className="flex items-center gap-3 p-3 bg-slate-50/50 dark:bg-[#182229] border border-slate-100 dark:border-[#222e35] rounded-xl">
                      <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-[#202c33] text-slate-500 dark:text-[#8696a0] border border-slate-200/50 dark:border-[#2a3942] flex items-center justify-center shrink-0">
                        <Ticket size={16} />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-slate-800 dark:text-[#e9edef]">Ticket Pro</h4>
                        <p className="text-xs text-slate-500 dark:text-[#8696a0]">Created {selectedAgent.ticketsCreated}+ support tickets this period.</p>
                      </div>
                    </div>
                  )}

                  {selectedAgent.whmcsReplies >= 100 && (
                    <div className="flex items-center gap-3 p-3 bg-slate-50/50 dark:bg-[#182229] border border-slate-100 dark:border-[#222e35] rounded-xl">
                      <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-[#202c33] text-slate-500 dark:text-[#8696a0] border border-slate-200/50 dark:border-[#2a3942] flex items-center justify-center shrink-0">
                        <Ticket size={16} />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-slate-800 dark:text-[#e9edef]">WHMCS Power Agent</h4>
                        <p className="text-xs text-slate-500 dark:text-[#8696a0]">Delivered {selectedAgent.whmcsReplies}+ ticket replies through WHMCS this period.</p>
                      </div>
                    </div>
                  )}

                  {!(selectedAgent.firstResponseSlaPercent >= 85 && selectedAgent.totalFirstResponses > 0) &&
                    !(selectedAgent.emergencyResponseTime > 0 && selectedAgent.emergencyResponseTime <= 90) &&
                    !(selectedAgent.callsCount >= 1) &&
                    !(selectedAgent.ticketsCreated >= 1) &&
                    !(selectedAgent.ticketsCreated >= 10) &&
                    !(selectedAgent.whmcsReplies >= 100) && (
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
