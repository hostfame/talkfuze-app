import Link from "next/link"
import { Inbox, Users, BarChart3, Settings, Bell } from "lucide-react"
import { createClient } from "@/lib/supabase/server"
import { supabaseAdmin } from "@/lib/supabase-admin"
import { redirect } from "next/navigation"
import { logout } from "@/actions/auth"
import { AuthProvider } from "@/lib/auth-context"
import SipDialer from "@/components/dialer/SipDialer"

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
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
    // If auth user exists but no profile, redirect or show error
    redirect("/login")
  }

  return (
    <AuthProvider user={profile}>
      <div className="flex h-screen overflow-hidden bg-[#F8FAFC] dark:bg-slate-900 text-slate-800 dark:text-slate-200 text-sm font-sans">
        {/* 1. Far Left Thin Navigation Strip */}
        <aside className="w-[64px] flex flex-col items-center py-5 bg-slate-50/50 dark:bg-slate-950 border-r border-slate-200/60 dark:border-slate-800 z-10 shrink-0">
          <div className="w-10 h-10 mb-6 flex items-center justify-center active:scale-95 transition-all">
            <img src="/talkfuze-logo.png" alt="TalkFuze Logo" className="w-full h-full object-contain rounded-xl" />
          </div>
          
          <div className="flex-1 space-y-3 w-full px-2 flex flex-col items-center">
            <Link href="/inbox" prefetch={true} className="w-11 h-11 flex items-center justify-center text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 rounded-2xl shadow-sm border border-blue-100 dark:border-blue-800/50 transition-all duration-200 active:scale-95">
              <Inbox size={22} strokeWidth={2.5} />
            </Link>
            <Link href="/contacts" prefetch={true} className="w-11 h-11 flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-white dark:hover:bg-slate-800 rounded-2xl hover:shadow-sm hover:border hover:border-slate-200 dark:hover:border-slate-700 transition-all duration-200 active:scale-95">
              <Users size={22} strokeWidth={2} />
            </Link>
            <Link href="/analytics" prefetch={true} className="w-11 h-11 flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-white dark:hover:bg-slate-800 rounded-2xl hover:shadow-sm hover:border hover:border-slate-200 dark:hover:border-slate-700 transition-all duration-200 active:scale-95">
              <BarChart3 size={22} strokeWidth={2} />
            </Link>
          </div>
          
          <div className="mt-auto w-full px-2 flex flex-col items-center space-y-3">
            <button className="w-11 h-11 flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-white dark:hover:bg-slate-800 rounded-2xl hover:shadow-sm hover:border hover:border-slate-200 dark:hover:border-slate-700 transition-all duration-200 active:scale-95">
              <Bell size={22} strokeWidth={2} />
            </button>
            <Link href="/settings/brand" prefetch={true} className="w-11 h-11 flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-white dark:hover:bg-slate-800 rounded-2xl hover:shadow-sm hover:border hover:border-slate-200 dark:hover:border-slate-700 transition-all duration-200 active:scale-95">
              <Settings size={22} strokeWidth={2} />
            </Link>
            <form action={logout} className="w-full flex justify-center">
              <button type="submit" className="w-9 h-9 rounded-full bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-400 mt-2 shadow-sm border border-slate-200 dark:border-slate-600 cursor-pointer active:scale-95 transition-all flex items-center justify-center text-xs font-bold overflow-hidden" title={profile.name + " (Click to logout)"}>
                {profile.name.charAt(0).toUpperCase()}
              </button>
            </form>
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 flex overflow-hidden relative bg-white dark:bg-slate-900">
          {children}
        </main>
        
        {/* WebRTC PBX Dialer */}
        <SipDialer />
      </div>
    </AuthProvider>
  )
}
