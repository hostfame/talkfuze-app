"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Inbox, Phone, CreditCard, Trophy, Library } from "lucide-react"
import { useInboxStore } from "@/lib/store"

export default function MobileBottomNavigation() {
  const pathname = usePathname()
  const { mobileView, setMobileView } = useInboxStore()

  // Hide bottom nav if inside a chat thread on mobile
  const isInboxChat = pathname.startsWith("/inbox") && mobileView === "chat"
  
  if (isInboxChat) {
    return null
  }

  const items = [
    {
      href: "/inbox",
      label: "Inbox",
      icon: Inbox,
      isActive: pathname.startsWith("/inbox"),
      onClick: () => {
        setMobileView("list")
      }
    },
    {
      href: "/calls",
      label: "Calls",
      icon: Phone,
      isActive: pathname === "/calls"
    },
    {
      href: "/calls/unpaid",
      label: "Unpaid",
      icon: CreditCard,
      isActive: pathname.startsWith("/calls/unpaid")
    },
    {
      href: "/leaderboard",
      label: "Stars",
      icon: Trophy,
      isActive: pathname.startsWith("/leaderboard")
    },
    {
      href: "/snippets",
      label: "Snippets",
      icon: Library,
      isActive: pathname.startsWith("/snippets")
    }
  ]

  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-white/90 dark:bg-slate-900/90 backdrop-blur-lg border-t border-slate-200/50 dark:border-slate-800/50 z-50 px-4 flex items-center justify-around pb-safe shadow-[0_-4px_12px_rgba(0,0,0,0.03)] select-none">
      {items.map((item) => {
        const Icon = item.icon
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={item.onClick}
            className="flex flex-col items-center justify-center flex-1 h-full py-1 transition-all active:scale-90"
          >
            <div className={`relative p-1.5 rounded-xl transition-all ${
              item.isActive 
                ? "text-[#0070f3] dark:text-blue-400 bg-blue-50/50 dark:bg-blue-950/20" 
                : "text-slate-400 dark:text-slate-500"
            }`}>
              <Icon size={20} strokeWidth={item.isActive ? 2.5 : 2} />
              {item.isActive && (
                <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 bg-[#0070f3] dark:bg-blue-400 rounded-full" />
              )}
            </div>
            <span className={`text-[10px] mt-0.5 font-medium tracking-wide ${
              item.isActive 
                ? "text-[#0070f3] dark:text-blue-400 font-semibold" 
                : "text-slate-500 dark:text-slate-400"
            }`}>
              {item.label}
            </span>
          </Link>
        )
      })}
    </div>
  )
}
