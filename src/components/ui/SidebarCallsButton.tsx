"use client"

import { Phone } from "lucide-react"
import { usePathname } from "next/navigation"
import Link from "next/link"

export default function SidebarCallsButton() {
  const pathname = usePathname()
  const isActive = pathname === '/calls'

  return (
    <Link 
      href="/calls"
      prefetch={true}
      className={`w-11 h-11 flex items-center justify-center rounded-2xl hover:shadow-sm hover:border transition-all duration-200 active:scale-95 ${
        isActive
          ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/10 border-blue-100 dark:border-blue-900/30 shadow-sm border'
          : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-white dark:hover:bg-[#202c33] hover:border-slate-200 dark:hover:border-[#2a3942] border-transparent border'
      }`}
      title="Calls"
    >
      <Phone size={22} strokeWidth={2} />
    </Link>
  )
}
