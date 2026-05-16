"use client"

import { Ticket, Mail, Save, Hash, Settings2, UserPlus } from "lucide-react"

export default function TicketsSettingsPage() {
  return (
    <div className="space-y-6 relative animate-in fade-in duration-300">
      <div className="border-b border-slate-200 dark:border-slate-800 pb-5">
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-white flex items-center gap-2">
          <Ticket className="text-teal-500 fill-teal-500/20" /> Tickets Settings
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Configure how support tickets are generated, routed, and identified in your workspace.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Settings Form */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex items-center gap-2">
              <Settings2 size={18} className="text-slate-400" />
              <h2 className="font-medium text-slate-800 dark:text-slate-200">General Preferences</h2>
            </div>
            
            <div className="p-6 space-y-6">
              {/* Ticket Prefix */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Ticket Prefix
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1 max-w-xs">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                      <Hash size={16} />
                    </span>
                    <input 
                      type="text" 
                      defaultValue="TF"
                      className="w-full pl-9 pr-4 py-2 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-sm font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#0070f3]/20 focus:border-[#0070f3] transition-all uppercase"
                    />
                  </div>
                  <span className="inline-flex items-center text-sm text-slate-500 font-mono">
                    - 10425
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 mt-2">
                  The prefix attached to all ticket IDs (e.g., TF-10425). Maximum 5 characters.
                </p>
              </div>

              {/* Default Assignee */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Default Assignee
                </label>
                <div className="relative max-w-sm">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                    <UserPlus size={16} />
                  </span>
                  <select 
                    className="w-full pl-9 pr-10 py-2 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#0070f3]/20 focus:border-[#0070f3] appearance-none transition-all"
                  >
                    <option value="unassigned">Unassigned (Team Inbox)</option>
                    <option value="auto">Auto-assign to available agent (Round Robin)</option>
                    <option value="imran">Imran</option>
                  </select>
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none text-xs">▼</span>
                </div>
                <p className="text-[11px] text-slate-500 mt-2">
                  Determine who automatically receives new tickets when they are created via email or portal.
                </p>
              </div>

              {/* Status Automation */}
              <div>
                <label className="flex items-center gap-3">
                  <input type="checkbox" defaultChecked className="w-4 h-4 text-[#0070f3] bg-slate-100 border-slate-300 rounded focus:ring-[#0070f3]" />
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Close inactive tickets automatically</span>
                </label>
                <p className="text-[11px] text-slate-500 mt-1 ml-7">
                  Tickets in "Waiting for Customer" state will be automatically closed after 72 hours of inactivity.
                </p>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 flex justify-end">
              <button className="flex items-center gap-2 bg-[#0070f3] hover:bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm">
                <Save size={16} /> Save Changes
              </button>
            </div>
          </div>
        </div>

        {/* Sidebar / Email Piping */}
        <div className="space-y-6">
          <div className="bg-gradient-to-b from-slate-50 to-white dark:from-slate-900/50 dark:to-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-10">
              <Mail size={100} />
            </div>
            
            <div className="relative z-10">
              <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center mb-4">
                <Mail className="text-blue-600 dark:text-blue-400" size={20} />
              </div>
              <h3 className="font-medium text-slate-900 dark:text-white mb-2">Email Forwarding</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-4 leading-relaxed">
                Forward emails from your support address to TalkFuze to automatically create tickets and track conversations.
              </p>
              
              <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg p-3">
                <p className="text-[10px] uppercase font-bold tracking-wider text-slate-400 mb-1">Your Forwarding Address</p>
                <code className="text-xs font-mono text-slate-800 dark:text-slate-200 break-all select-all">
                  support.ec2f8436@inbound.talkfuze.com
                </code>
              </div>
              
              <button className="w-full mt-4 py-2 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg text-sm font-medium transition-colors">
                Copy Address
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
