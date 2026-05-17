import Link from "next/link"
import { Paintbrush, Globe, Sparkles, Bot, FileText, Mail, LayoutTemplate, Tag, MessageSquare, Zap, MessageCircle, Monitor, BookOpen, Ticket, Users, Building2, Bell, Webhook, User } from "lucide-react"

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
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
        </div>
        
        {/* Workspace Settings Section */}
        <div className="pt-4 pb-2 px-4">
          <span className="text-[12px] font-semibold text-slate-500 tracking-wider">WORKSPACE SETTINGS</span>
        </div>
        
        <div className="px-2 pb-4 space-y-0.5 border-b border-slate-100 dark:border-slate-800">
          <NavLink href="/settings/brand" icon={<Paintbrush size={18} />} label="Brand" />
          <NavLink href="/settings/channels" icon={<Globe size={18} />} label="Integrations" />
          <NavLink href="/settings/ai" icon={<Sparkles size={18} />} label="AI providers" />
          <NavLink href="/settings/ai-assistants" icon={<Bot size={18} />} label="AI assistants" />
          <NavLink href="/settings/forms" icon={<FileText size={18} />} label="Forms" />
          <NavLink href="/settings/email" icon={<Mail size={18} />} label="Email settings" />
          <NavLink href="/settings/email-templates" icon={<LayoutTemplate size={18} />} label="Email templates" />
          <NavLink href="/settings/tags" icon={<Tag size={18} />} label="Tags" />
          <NavLink href="/settings/live-chat" icon={<MessageSquare size={18} />} label="Live chat integrations" />
          <NavLink href="/settings/quick-replies" icon={<Zap size={18} />} label="Live chat quick replies" />
          <NavLink href="/settings/webhooks" icon={<Webhook size={18} />} label="CRM Webhooks" />
          <NavLink href="/settings/conversations" icon={<MessageCircle size={18} />} label="Conversations settings" />
          <NavLink href="/settings/appearance" icon={<Monitor size={18} />} label="Appearance settings" />
          <NavLink href="/settings/knowledge-base" icon={<BookOpen size={18} />} label="Knowledge base" />
          <NavLink href="/settings/tickets" icon={<Ticket size={18} />} label="Tickets" />
        </div>

        {/* My Team Section */}
        <div className="pt-4 pb-2 px-4">
          <span className="text-[12px] font-semibold text-slate-500 tracking-wider">MY TEAM</span>
        </div>

        <div className="px-2 pb-6 space-y-0.5">
          <NavLink href="/settings/team" icon={<Users size={18} />} label="Members" />
          <NavLink href="/settings/departments" icon={<Building2 size={18} />} label="Departments" />
          <NavLink href="/settings/notifications" icon={<Bell size={18} />} label="Notification settings" />
        </div>
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
  // Using active checking would require "use client" and usePathname, 
  // but for layout server component we can just use simple links.
  return (
    <Link href={href} className="flex items-center gap-3 px-3 py-2 text-[14px] text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-md transition-colors font-medium">
      <span className="text-slate-400 dark:text-slate-500">{icon}</span>
      {label}
    </Link>
  )
}
