"use client"

import { useState } from "react"
import { login } from "@/actions/auth"
import { Loader2, Lock, Mail } from "lucide-react"

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  async function handleSubmit(formData: FormData) {
    setIsLoading(true)
    setError(null)
    
    const result = await login(formData)
    
    if (result?.error) {
      setError(result.error)
      setIsLoading(false)
    }
    // If successful, the server action will redirect
  }

  return (
    <>
      {isLoading && !error && (
        <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-slate-50/80 dark:bg-slate-950/80 backdrop-blur-sm transition-all duration-300">
          <Loader2 size={40} className="text-blue-600 dark:text-blue-500 animate-spin mb-4" />
          <p className="text-lg font-medium text-slate-800 dark:text-white">Authenticating...</p>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">Preparing your workspace</p>
        </div>
      )}
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-4 font-sans">
      <div className="w-full max-w-[400px]">
        {/* Logo */}
        <div className="flex justify-center mb-8">
          <img src="/talkfuze-logo.png" alt="TalkFuze Logo" className="w-16 h-16 rounded-2xl shadow-sm" />
        </div>
        
        {/* Card */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
          <div className="p-8">
            <h1 className="text-xl font-semibold text-slate-900 dark:text-white mb-2 text-center">
              Welcome back
            </h1>
            <p className="text-[14px] text-slate-500 dark:text-slate-400 text-center mb-8">
              Sign in to your TalkFuze workspace
            </p>

            <form action={handleSubmit} className="space-y-4">
              {error && (
                <div className="bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 p-3 rounded-lg text-[13px] font-medium text-center border border-red-100 dark:border-red-900/50">
                  {error}
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-[13px] font-medium text-slate-700 dark:text-slate-300">
                  Email
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Mail size={16} className="text-slate-400" />
                  </div>
                  <input
                    name="email"
                    type="email"
                    required
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-[14px] text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                    placeholder="agent@hostnin.com"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-[13px] font-medium text-slate-700 dark:text-slate-300">
                    Password
                  </label>
                  <a href="#" className="text-[13px] text-blue-600 hover:text-blue-700 font-medium">
                    Forgot?
                  </a>
                </div>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Lock size={16} className="text-slate-400" />
                  </div>
                  <input
                    name="password"
                    type="password"
                    required
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-[14px] text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                    placeholder="••••••••"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 rounded-lg text-[14px] transition-all flex items-center justify-center gap-2 disabled:opacity-70 mt-2 shadow-sm"
              >
                {isLoading ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  "Sign In"
                )}
              </button>
            </form>
          </div>
          <div className="bg-slate-50 dark:bg-slate-950/50 border-t border-slate-100 dark:border-slate-800 p-4 text-center">
            <p className="text-[13px] text-slate-500">
              Powered by <span className="font-semibold text-slate-700 dark:text-slate-300">TalkFuze Enterprise</span>
            </p>
          </div>
        </div>
      </div>
    </div>
    </>
  )
}
