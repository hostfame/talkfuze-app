"use client"

import { useState, useEffect } from "react"
import { useAuth } from "@/lib/auth-context"
import { getVolumeStats } from "@/actions/reports"
import { BarChart3, MessageSquare, Activity, CalendarDays, LineChart } from "lucide-react"

export default function ReportsPage() {
  const user = useAuth()
  const [days, setDays] = useState<number>(7)
  const [stats, setStats] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadStats() {
      if (!user?.org_id) return
      setLoading(true)
      try {
        const data = await getVolumeStats(user.org_id, days)
        setStats(data)
      } catch (e) {
        console.error(e)
      } finally {
        setLoading(false)
      }
    }
    loadStats()
  }, [user?.org_id, days])

  const maxMessages = stats.length > 0 ? Math.max(...stats.map(s => s.messages)) : 0

  return (
    <div className="flex-1 flex flex-col h-full bg-[#f8fafc] dark:bg-[#0b141a]">
      {/* Header */}
      <div className="flex items-center justify-between p-6 bg-white dark:bg-[#111b21] border-b border-slate-200 dark:border-[#222e35]">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-[#e9edef] flex items-center gap-2">
            <BarChart3 className="text-[#0070f3]" size={24} /> Volume Reports
          </h1>
          <p className="text-sm text-slate-500 dark:text-[#8696a0] mt-1">Compare peak and off-peak days</p>
        </div>
        
        <div className="flex bg-slate-100 dark:bg-[#202c33] p-1 rounded-lg border border-slate-200 dark:border-[#2a3942]">
          {[7, 14, 30].map(d => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`px-4 py-1.5 text-[13px] font-medium rounded-md transition-all ${
                days === d 
                  ? 'bg-white dark:bg-[#2a3942] text-slate-800 dark:text-[#e9edef] shadow-sm' 
                  : 'text-slate-500 dark:text-[#8696a0] hover:text-slate-700 dark:hover:text-[#d1d7db]'
              }`}
            >
              {d} Days
            </button>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
        <div className="w-full max-w-[1300px] mx-auto space-y-6">
          
          {loading ? (
            <div className="flex flex-col gap-4">
              <div className="h-64 bg-white dark:bg-[#111b21] rounded-2xl border border-slate-200 dark:border-[#222e35] animate-pulse" />
            </div>
          ) : stats.length === 0 ? (
            <div className="text-center py-20 text-slate-500 dark:text-[#8696a0]">
              No data available for this period.
            </div>
          ) : (
            <div className="space-y-6">
              
              {/* Daily Volume Bar Chart */}
              <div className="bg-white dark:bg-[#111b21] rounded-2xl border border-slate-200 dark:border-[#222e35] p-6 shadow-sm">
                <h2 className="text-sm font-bold text-slate-800 dark:text-[#e9edef] mb-6 flex items-center gap-2">
                  <Activity size={18} className="text-[#0070f3]" /> Daily Message Volume
                </h2>
                
                <div className="h-64 flex items-end gap-2">
                  {stats.map((stat, i) => {
                    const height = maxMessages > 0 ? (stat.messages / maxMessages) * 100 : 0
                    const isWeekend = new Date(stat.date).getDay() === 0 || new Date(stat.date).getDay() === 6
                    
                    return (
                      <div key={stat.date} className="flex-1 flex flex-col items-center gap-2 group relative">
                        {/* Tooltip */}
                        <div className="absolute -top-12 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-800 text-white text-xs py-1 px-2 rounded whitespace-nowrap z-10 pointer-events-none">
                          {stat.date}<br/>
                          {stat.messages} msgs | {stat.newChats} chats
                        </div>
                        
                        <div className="w-full bg-slate-100 dark:bg-[#202c33] rounded-t-sm overflow-hidden flex flex-col justify-end" style={{ height: '100%' }}>
                          <div 
                            className={`w-full rounded-t-sm transition-all duration-500 ${isWeekend ? 'bg-slate-300 dark:bg-slate-600' : 'bg-[#0070f3]'}`} 
                            style={{ height: `${height}%` }}
                          />
                        </div>
                        <span className="text-[10px] text-slate-400 font-medium rotate-45 origin-left w-6 overflow-visible">
                          {new Date(stat.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </span>
                      </div>
                    )
                  })}
                </div>
                <div className="mt-8 pt-4 border-t border-slate-100 dark:border-[#222e35] flex items-center justify-between text-xs text-slate-500">
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-[#0070f3]"></div> Weekday</div>
                    <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-slate-300 dark:bg-slate-600"></div> Weekend</div>
                  </div>
                  <div>Hover over bars for details</div>
                </div>
              </div>

              {/* Stats Table */}
              <div className="bg-white dark:bg-[#111b21] rounded-2xl border border-slate-200 dark:border-[#222e35] overflow-hidden shadow-sm">
                <div className="p-5 border-b border-slate-100 dark:border-[#222e35]">
                  <h2 className="text-sm font-bold text-slate-800 dark:text-[#e9edef] flex items-center gap-2">
                    <CalendarDays size={18} className="text-[#0070f3]" /> Detailed Breakdown
                  </h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 dark:bg-[#182229] text-slate-500 dark:text-[#8696a0] border-b border-slate-200 dark:border-[#222e35]">
                      <tr>
                        <th className="px-6 py-3 font-medium">Date</th>
                        <th className="px-6 py-3 font-medium">Total Messages</th>
                        <th className="px-6 py-3 font-medium">Customer Messages</th>
                        <th className="px-6 py-3 font-medium">Agent Replies</th>
                        <th className="px-6 py-3 font-medium">New Conversations</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-[#222e35]">
                      {[...stats].reverse().map((stat) => (
                        <tr key={stat.date} className="hover:bg-slate-50/50 dark:hover:bg-[#1c272e] transition-colors">
                          <td className="px-6 py-4 font-medium text-slate-800 dark:text-[#e9edef]">
                            {new Date(stat.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                          </td>
                          <td className="px-6 py-4 text-slate-600 dark:text-[#d1d7db]">{stat.messages}</td>
                          <td className="px-6 py-4 text-slate-600 dark:text-[#d1d7db]">{stat.customerMessages}</td>
                          <td className="px-6 py-4 text-[#0070f3] font-medium">{stat.agentMessages}</td>
                          <td className="px-6 py-4 text-slate-600 dark:text-[#d1d7db]">{stat.newChats}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>
          )}
        </div>
      </div>
    </div>
  )
}
