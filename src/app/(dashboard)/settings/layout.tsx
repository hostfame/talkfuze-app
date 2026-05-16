import Link from "next/link"
import { Users, Globe, Shield, CreditCard, Paintbrush } from "lucide-react"

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* Secondary Sidebar (Settings Navigation) */}
      <aside className="w-[240px] flex flex-col bg-[#F9FAFB] dark:bg-slate-950 border-r border-slate-200 dark:border-slate-800 z-10 shrink-0 overflow-y-auto">
        <div className="p-5 pb-4">
          <h2 className="font-semibold text-[18px] text-slate-900 dark:text-white">Settings</h2>
        </div>

        <div className="px-3 space-y-0.5">
          <div className="mt-2 mb-1 px-3">
            <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Workspace</span>
          </div>
          
          <Link href="/settings/team" className="flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800/50 rounded-md cursor-pointer transition-all">
            <Users size={16} strokeWidth={2} /> Teammates
          </Link>
          
          <Link href="/settings/channels" className="flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800/50 rounded-md cursor-pointer transition-all">
            <Globe size={16} strokeWidth={2} /> Integrations & Channels
          </Link>

          <div className="flex items-center gap-2 px-3 py-2 text-sm text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-900/20 rounded-md cursor-not-allowed transition-all" title="Coming soon">
            <Paintbrush size={16} strokeWidth={2} /> Brand & Appearance
          </div>
          
          <div className="flex items-center gap-2 px-3 py-2 text-sm text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-900/20 rounded-md cursor-not-allowed transition-all" title="Coming soon">
            <Shield size={16} strokeWidth={2} /> Security
          </div>
          
          <div className="flex items-center gap-2 px-3 py-2 text-sm text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-900/20 rounded-md cursor-not-allowed transition-all" title="Coming soon">
            <CreditCard size={16} strokeWidth={2} /> Billing
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto bg-white dark:bg-slate-900">
        <div className="max-w-4xl mx-auto py-10 px-8">
          {children}
        </div>
      </div>
    </>
  )
}
