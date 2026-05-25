"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Inbox, Phone, Users, BarChart3, TrendingUp, Trophy, BrainCircuit, Library, CreditCard } from "lucide-react"

interface SidebarNavigationProps {
  isAgent: boolean
}

export default function SidebarNavigation({ isAgent }: SidebarNavigationProps) {
  const pathname = usePathname()

  const navItems: {
    href: string
    label: string
    icon: any
    isActive: boolean
    visible: boolean
    activeColor?: string
    hoverColor?: string
  }[] = [
    {
      href: "/inbox",
      label: "Inbox",
      icon: Inbox,
      isActive: pathname.startsWith("/inbox"),
      visible: true
    },
    {
      href: "/calls",
      label: "Calls",
      icon: Phone,
      isActive: pathname === "/calls",
      visible: true
    },
    {
      href: "/calls/unpaid",
      label: "Unpaid Invoices Calls",
      icon: CreditCard,
      isActive: pathname.startsWith("/calls/unpaid"),
      visible: true
    },
    {
      href: "/contacts",
      label: "Contacts",
      icon: Users,
      isActive: pathname.startsWith("/contacts"),
      visible: !isAgent
    },
    {
      href: "/analytics",
      label: "AI Analytics",
      icon: BarChart3,
      isActive: pathname.startsWith("/analytics"),
      visible: !isAgent
    },
    {
      href: "/reports",
      label: "Volume Reports",
      icon: TrendingUp,
      isActive: pathname.startsWith("/reports"),
      visible: !isAgent
    },
    {
      href: "/leaderboard",
      label: "Leaderboard",
      icon: Trophy,
      isActive: pathname.startsWith("/leaderboard"),
      visible: true
    },
    {
      href: "/snippets",
      label: "Snippets",
      icon: Library,
      isActive: pathname.startsWith("/snippets"),
      visible: true
    },
    {
      href: "/ai-training",
      label: "AI Observer",
      icon: BrainCircuit,
      isActive: pathname.startsWith("/ai-training"),
      visible: !isAgent
    }
  ]

  return (
    <div className="flex-1 space-y-3 w-full px-2 flex flex-col items-center">
      {navItems
        .filter((item) => item.visible)
        .map((item) => {
          const Icon = item.icon
          const customActive = item.activeColor || "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/10 border-blue-100 dark:border-blue-900/30"
          const customHover = item.hoverColor || "hover:text-slate-600 dark:hover:text-slate-300 hover:bg-white dark:hover:bg-[#202c33] hover:border-slate-200 dark:hover:border-[#2a3942]"

          return (
            <Link
              key={item.href}
              href={item.href}
              prefetch={true}
              title={item.label}
              className={`w-11 h-11 flex items-center justify-center rounded-2xl hover:shadow-sm hover:border transition-all duration-200 active:scale-95 ${
                item.isActive
                  ? `${customActive} shadow-sm border`
                  : `text-slate-400 ${customHover} border-transparent border`
              }`}
            >
              <Icon size={22} strokeWidth={item.isActive ? 2.5 : 2} />
            </Link>
          )
        })}
    </div>
  )
}
