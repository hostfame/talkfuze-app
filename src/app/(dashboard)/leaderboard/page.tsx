"use client"

import { useState, useEffect } from "react"
import { useAuth } from "@/lib/auth-context"
import { getLeaderboardStats } from "@/actions/leaderboard"
import { Trophy, Clock, MessageSquare, MessagesSquare, Medal } from "lucide-react"

export default function LeaderboardPage() {
  const user = useAuth()
  const [period, setPeriod] = useState<'daily' | 'weekly' | 'monthly'>('daily')
  const [stats, setStats] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

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

  return (
    <div className="flex-1 flex flex-col h-full bg-[#f8fafc] dark:bg-[#0b141a]">
      {/* Header */}
      <div className="flex items-center justify-between p-6 bg-white dark:bg-[#111b21] border-b border-slate-200 dark:border-[#222e35]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-900/20 text-amber-500 flex items-center justify-center border border-amber-100 dark:border-amber-900/30">
            <Trophy size={20} strokeWidth={2.5} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800 dark:text-[#e9edef]">Leaderboard</h1>
            <p className="text-sm text-slate-500 dark:text-[#8696a0]">Track team performance and active time</p>
          </div>
        </div>
        
        <div className="flex bg-slate-100 dark:bg-[#202c33] p-1 rounded-lg border border-slate-200 dark:border-[#2a3942]">
          {(['daily', 'weekly', 'monthly'] as const).map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
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
                className="flex items-center gap-6 p-5 bg-white dark:bg-[#111b21] rounded-2xl border border-slate-200 dark:border-[#222e35] shadow-sm relative overflow-hidden"
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

                {/* Metrics */}
                <div className="flex-1 grid grid-cols-3 gap-4">
                  <div className="flex flex-col">
                    <div className="flex items-center gap-1.5 text-[12px] text-slate-500 dark:text-[#8696a0] mb-1 font-medium">
                      <MessageSquare size={14} /> Messages
                    </div>
                    <span className="text-2xl font-bold text-slate-800 dark:text-[#e9edef]">{agent.messagesCount}</span>
                  </div>
                  
                  <div className="flex flex-col">
                    <div className="flex items-center gap-1.5 text-[12px] text-slate-500 dark:text-[#8696a0] mb-1 font-medium">
                      <MessagesSquare size={14} /> Chats Handled
                    </div>
                    <span className="text-2xl font-bold text-slate-800 dark:text-[#e9edef]">{agent.chatsCount}</span>
                  </div>

                  <div className="flex flex-col">
                    <div className="flex items-center gap-1.5 text-[12px] text-slate-500 dark:text-[#8696a0] mb-1 font-medium">
                      <Clock size={14} /> Active Time
                    </div>
                    <span className="text-2xl font-bold text-slate-800 dark:text-[#e9edef]">{formatActiveTime(agent.activeMinutes)}</span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
