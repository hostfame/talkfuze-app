"use client"

import { useState } from "react"
import { LogOut, Loader2 } from "lucide-react"
import { logout } from "@/actions/auth"

export default function LogoutButton() {
  const [isLoggingOut, setIsLoggingOut] = useState(false)

  async function handleLogout() {
    setIsLoggingOut(true)
    await logout()
  }

  return (
    <>
      {isLoggingOut && (
        <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-slate-50/80 dark:bg-[#0b141a]/80 backdrop-blur-sm transition-all duration-300">
          <Loader2 size={40} className="text-blue-600 dark:text-blue-500 animate-spin mb-4" />
          <p className="text-lg font-medium text-slate-800 dark:text-[#e9edef]">Logging out...</p>
          <p className="text-sm text-slate-500 dark:text-[#8696a0] mt-2">See you next time!</p>
        </div>
      )}
      <button 
        onClick={handleLogout}
        disabled={isLoggingOut}
        className="w-11 h-11 flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-2xl transition-all duration-200 active:scale-95 cursor-pointer disabled:opacity-50" 
        title="Log Out"
      >
        <LogOut size={22} strokeWidth={2} />
      </button>
    </>
  )
}
