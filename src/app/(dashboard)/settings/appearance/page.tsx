"use client"

import { useTheme, Theme } from "@/lib/theme-context"
import { Sun, Moon, Monitor, Check } from "lucide-react"

export default function AppearanceSettingsPage() {
  const { theme, setTheme } = useTheme()

  const options = [
    {
      id: "light" as Theme,
      name: "Classic Mode (Light)",
      desc: "Clean and crisp background, ideal for bright working spaces.",
      icon: <Sun className="w-5 h-5 text-amber-500" />,
      preview: (
        <div className="w-full h-24 rounded-lg bg-slate-50 border border-slate-200/80 p-3 flex flex-col gap-2 relative overflow-hidden">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-slate-300" />
            <div className="w-16 h-2 rounded bg-slate-200" />
          </div>
          <div className="flex-1 rounded bg-white border border-slate-100 p-2 flex flex-col gap-1.5 shadow-sm">
            <div className="w-2/3 h-2 rounded bg-slate-200" />
            <div className="w-1/2 h-1.5 rounded bg-slate-100" />
          </div>
        </div>
      ),
    },
    {
      id: "dark" as Theme,
      name: "Dark Mode",
      desc: "Deep and natural colors that are soothing for your eyes.",
      icon: <Moon className="w-5 h-5 text-blue-400" />,
      preview: (
        <div className="w-full h-24 rounded-lg bg-slate-950 border border-slate-800 p-3 flex flex-col gap-2 relative overflow-hidden">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-slate-800" />
            <div className="w-16 h-2 rounded bg-slate-850" />
          </div>
          <div className="flex-1 rounded bg-slate-900 border border-slate-800/80 p-2 flex flex-col gap-1.5 shadow-sm">
            <div className="w-2/3 h-2 rounded bg-slate-850" />
            <div className="w-1/2 h-1.5 rounded bg-slate-800" />
          </div>
        </div>
      ),
    },
    {
      id: "system" as Theme,
      name: "System Preference",
      desc: "Automatically adjust theme based on your system configuration.",
      icon: <Monitor className="w-5 h-5 text-indigo-400" />,
      preview: (
        <div className="w-full h-24 rounded-lg bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-850 flex overflow-hidden relative">
          {/* Light half */}
          <div className="w-1/2 h-full bg-slate-50 p-3 flex flex-col gap-2 border-r border-slate-200">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-slate-300" />
              <div className="w-8 h-2 rounded bg-slate-200" />
            </div>
            <div className="flex-1 rounded-l bg-white border border-slate-100 p-2 flex flex-col gap-1.5 shadow-sm">
              <div className="w-full h-2 rounded bg-slate-200" />
            </div>
          </div>
          {/* Dark half */}
          <div className="w-1/2 h-full bg-slate-950 p-3 flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-slate-800" />
              <div className="w-8 h-2 rounded bg-slate-850" />
            </div>
            <div className="flex-1 rounded-r bg-slate-900 border border-slate-800/80 p-2 flex flex-col gap-1.5 shadow-sm">
              <div className="w-full h-2 rounded bg-slate-850" />
            </div>
          </div>
        </div>
      ),
    },
  ]

  return (
    <div className="max-w-4xl">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">Theme & Appearance</h1>
        <p className="text-sm text-slate-500 mt-1">
          Customize how the TalkFuze interface looks on your device. Protect your eyes with our naturally dark mode.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {options.map((opt) => {
          const isActive = theme === opt.id
          return (
            <button
              key={opt.id}
              onClick={() => setTheme(opt.id)}
              className={`flex flex-col text-left rounded-2xl border bg-white dark:bg-slate-900 p-5 transition-all duration-300 relative select-none cursor-pointer focus:outline-none hover:shadow-md ${
                isActive
                  ? "border-blue-600 dark:border-blue-500 ring-2 ring-blue-600/10 dark:ring-blue-500/10 shadow-sm"
                  : "border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-750"
              }`}
            >
              {/* Preview block */}
              <div className="w-full mb-4">{opt.preview}</div>

              {/* Title & Icon */}
              <div className="flex items-center justify-between w-full mb-2">
                <div className="flex items-center gap-2.5">
                  <span className="shrink-0">{opt.icon}</span>
                  <span className="font-semibold text-slate-900 dark:text-white text-[15px]">{opt.name}</span>
                </div>
                {isActive && (
                  <span className="w-5 h-5 rounded-full bg-blue-600 dark:bg-blue-500 flex items-center justify-center text-white shrink-0">
                    <Check className="w-3.5 h-3.5" strokeWidth={3} />
                  </span>
                )}
              </div>

              {/* Description */}
              <p className="text-[13px] text-slate-500 dark:text-slate-400 leading-relaxed mt-1 flex-1">
                {opt.desc}
              </p>
            </button>
          )
        })}
      </div>
    </div>
  )
}
