import Link from "next/link"
import { Paintbrush, Globe, Sparkles, MessageSquare, Zap, MessageCircle, Monitor, BookOpen, Ticket, Users, Webhook, User, Volume2, BrainCircuit, BarChart3 } from "lucide-react"
import { createClient } from "@/lib/supabase/server"
import { supabaseAdmin } from "@/lib/supabase-admin"
import { redirect } from "next/navigation"

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  // Fetch full profile from public.users
  const { data: profile } = await supabaseAdmin
    .from("users")
    .select("*")
    .eq("id", user.id)
    .single()

  if (!profile) {
    redirect("/login")
  }

  const isAgent = profile.role === "agent"

  return (
    <>
      {/* Secondary Sidebar (Settings Navigation) */}
      <aside className="w-[260px] flex flex-col bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 z-10 shrink-0 overflow-y-auto custom-scrollbar">
        
        {/* Personal Settings Section */}
        <div className="pt-6 pb-2 px-4">
          <span className="text-[12px] font-semibold text-slate-500 tracking-wider">PERSONAL</span>
        </div>
        <div className="px-2 pb-4 space-y-0.5 border-b border-slate-100 dark:border-slate-800">
          <NavLink href="/settings/profile" icon={<User size={18} />} label="My Profile" />
          <NavLink href="/settings/appearance" icon={<Monitor size={18} />} label="Appearance & Theme" />
          <NavLink href="/settings/sounds" icon={<Volume2 size={18} />} label="Sound & Notifications" />
        </div>
        
        {!isAgent && (
          <>
            {/* Workspace Settings Section */}
            <div className="pt-4 pb-2 px-4">
              <span className="text-[12px] font-semibold text-slate-500 tracking-wider">WORKSPACE SETTINGS</span>
            </div>
            
            <div className="px-2 pb-4 space-y-0.5 border-b border-slate-100 dark:border-slate-800">
              <NavLink href="/settings/brand" icon={<Paintbrush size={18} />} label="Brand" />
              <NavLink href="/settings/ai-training" icon={<BrainCircuit size={18} />} label="AI Observer" />
              <NavLink href="/settings/analytics" icon={<BarChart3 size={18} />} label="AI Performance" />
              <NavLink href="/settings/channels" icon={<Globe size={18} />} label="Integrations" />
              <NavLink href="/settings/ai" icon={<Sparkles size={18} />} label="AI providers" />
              <NavLink href="/settings/webhooks" icon={<Webhook size={18} />} label="CRM Webhooks" />
              <NavLink href="/settings/whatsapp-transactions" icon={<MessageCircle size={18} />} label="WhatsApp Transactions" />
              <NavLink href="/settings/automation" icon={<Zap size={18} />} label="Automation & Triggers" />
              <NavLink href="/settings/widget" icon={<MessageSquare size={18} />} label="Web Widget" />
              <NavLink href="/settings/knowledge-base" icon={<BookOpen size={18} />} label="Knowledge base" />
              <NavLink href="/settings/tickets" icon={<Ticket size={18} />} label="Tickets" />
            </div>

            {/* My Team Section */}
            <div className="pt-4 pb-2 px-4">
              <span className="text-[12px] font-semibold text-slate-500 tracking-wider">MY TEAM</span>
            </div>

            <div className="px-2 pb-6 space-y-0.5">
              <NavLink href="/settings/team" icon={<Users size={18} />} label="Members" />
            </div>
          </>
        )}
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto bg-[#F8FAFC] dark:bg-slate-950">
        <div className="max-w-5xl mx-auto py-10 px-8">
          {children}
        </div>
      </div>
    </>
  )
}

function NavLink({ href, icon, label }: { href: string, icon: React.ReactNode, label: string }) {
  return (
    <Link href={href} prefetch={true} className="flex items-center gap-3 px-3 py-2 text-[14px] text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-md transition-colors font-medium">
      <span className="text-slate-400 dark:text-slate-500">{icon}</span>
      {label}
    </Link>
  )
}
