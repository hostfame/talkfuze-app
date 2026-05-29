"use client"

import { useCallback, useEffect, useState } from "react"
import { Sparkles, Key, CheckCircle2, Eye, EyeOff, Loader2, Save } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/lib/auth-context"
import type { ChannelConfig, ChannelType } from "@/lib/types"

type ProviderType = Extract<ChannelType, 'ai_openai' | 'ai_anthropic' | 'ai_gemini'>
type ProviderState = Record<string, { id: string, config: ChannelConfig }>

const PROVIDERS_META = [
  {
    type: 'ai_openai' as ProviderType,
    name: 'OpenAI',
    description: 'Power your AI Assistant with GPT-4o for intelligent, conversational responses.',
    color: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20',
  },
  {
    type: 'ai_anthropic' as ProviderType,
    name: 'Anthropic Claude',
    description: 'Use Claude 3.5 Sonnet for nuanced, highly accurate customer support interactions.',
    color: 'bg-amber-50 text-amber-600 dark:bg-amber-900/20',
  },
  {
    type: 'ai_gemini' as ProviderType,
    name: 'Google Gemini',
    description: 'Integrate Gemini 1.5 Pro for massive context windows and multimodal support.',
    color: 'bg-blue-50 text-blue-600 dark:bg-blue-900/20',
  }
]

export default function AIProvidersSettingsPage() {
  const currentUser = useAuth()
  const ORG_ID = currentUser.org_id
  const [providers, setProviders] = useState<ProviderState>({})
  const [isLoading, setIsLoading] = useState(true)

  // Modal State
  const [activeModal, setActiveModal] = useState<string | null>(null)
  const [apiKeyInput, setApiKeyInput] = useState("")
  const [showKey, setShowKey] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  // Holiday Mode State
  const [holidayModeEnabled, setHolidayModeEnabled] = useState(false)
  const [holidayModeMessage, setHolidayModeMessage] = useState("Support is currently limited due to holiday/Eid. Expect delayed responses. We cannot offer immediate remote support right now.")
  const [isSavingHoliday, setIsSavingHoliday] = useState(false)
  const [orgSettings, setOrgSettings] = useState<any>({})

  const fetchProviders = useCallback(async (showLoading = true) => {
    if (showLoading) setIsLoading(true)
    const { data } = await supabase
      .from('channels')
      .select('id, type, config')
      .eq('org_id', ORG_ID)
      .like('type', 'ai_%')
    
    if (data) {
      const pMap: ProviderState = {}
      data.forEach(d => {
        pMap[d.type] = { id: d.id, config: (d.config || {}) as ChannelConfig }
      })
      setProviders(pMap)
    }

    const { data: orgData } = await supabase
      .from('organizations')
      .select('settings')
      .eq('id', ORG_ID)
      .single()

    if (orgData?.settings) {
      setOrgSettings(orgData.settings)
      setHolidayModeEnabled(!!(orgData.settings as any).holiday_mode_enabled)
      if ((orgData.settings as any).holiday_mode_message) {
        setHolidayModeMessage((orgData.settings as any).holiday_mode_message)
      }
    }

    setIsLoading(false)
  }, [ORG_ID])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchProviders(false)
    }, 0)
    return () => window.clearTimeout(timer)
  }, [fetchProviders])

  const handleOpenModal = (type: string) => {
    setActiveModal(type)
    setApiKeyInput(providers[type]?.config?.api_key || "")
    setShowKey(false)
  }

  const handleSaveKey = async () => {
    if (!activeModal) return
    setIsSaving(true)

    const existing = providers[activeModal]
    
    if (existing) {
      await supabase
        .from('channels')
        .update({ config: { api_key: apiKeyInput } })
        .eq('id', existing.id)
    } else {
      await supabase
        .from('channels')
        .insert({
          org_id: ORG_ID,
          type: activeModal,
          config: { api_key: apiKeyInput }
        })
    }

    await fetchProviders()
    setIsSaving(false)
    setActiveModal(null)
  }

  const handleSaveHolidayMode = async () => {
    setIsSavingHoliday(true)
    const updatedSettings = {
      ...orgSettings,
      holiday_mode_enabled: holidayModeEnabled,
      holiday_mode_message: holidayModeMessage
    }

    await supabase
      .from('organizations')
      .update({ settings: updatedSettings })
      .eq('id', ORG_ID)

    setOrgSettings(updatedSettings)
    setIsSavingHoliday(false)
  }

  const activeProviderMeta = PROVIDERS_META.find(p => p.type === activeModal)

  return (
    <div className="space-y-6 relative animate-in fade-in duration-300">
      <div className="border-b border-slate-200 dark:border-slate-800 pb-5">
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-white flex items-center gap-2">
          <Sparkles className="text-blue-500" /> AI Providers
        </h1>
        <p className="text-sm text-slate-500 mt-1">Connect your preferred LLM providers to power TalkFuze AI Agents and Copilot.</p>
      </div>

      {isLoading ? (
        <div className="flex justify-center items-center h-40">
          <Loader2 className="animate-spin text-slate-400" />
        </div>
      ) : (
        <>
          {/* Holiday Mode Section */}
          <div className="bg-white dark:bg-slate-950 border border-amber-200 dark:border-amber-900/30 rounded-xl shadow-sm overflow-hidden mb-6">
            <div className="p-5 border-b border-amber-100 dark:border-amber-900/20 bg-amber-50/50 dark:bg-amber-900/10 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-amber-900 dark:text-amber-500">Holiday & Vacation Mode</h3>
                <p className="text-sm text-amber-700/70 dark:text-amber-400/70 mt-1">
                  When enabled, the AI will automatically mention this context (e.g. limited support during Eid) when users ask for immediate or remote help.
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input 
                  type="checkbox" 
                  className="sr-only peer"
                  checked={holidayModeEnabled}
                  onChange={(e) => setHolidayModeEnabled(e.target.checked)}
                />
                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-slate-600 peer-checked:bg-amber-500"></div>
              </label>
            </div>
            
            {holidayModeEnabled && (
              <div className="p-5 space-y-4 bg-white dark:bg-slate-950">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    Holiday Context / Limitation Message
                  </label>
                  <textarea 
                    value={holidayModeMessage}
                    onChange={(e) => setHolidayModeMessage(e.target.value)}
                    rows={3}
                    placeholder="e.g. Due to Eid holidays, our support team is limited. We cannot provide live remote support until..."
                    className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-lg text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all resize-none"
                  />
                </div>
                <div className="flex justify-end">
                  <button 
                    onClick={handleSaveHolidayMode}
                    disabled={isSavingHoliday}
                    className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 shadow-sm"
                  >
                    {isSavingHoliday ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                    Save Settings
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {PROVIDERS_META.map((meta) => {
            const isConnected = !!providers[meta.type]?.config?.api_key
            
            return (
              <div key={meta.type} className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm hover:shadow-md transition-all flex flex-col h-full group relative overflow-hidden">
                {/* Status Badge */}
                <div className="absolute top-5 right-5">
                  {isConnected ? (
                    <span className="flex items-center gap-1 bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400 text-[11px] font-medium px-2.5 py-1 rounded-full border border-green-200 dark:border-green-800/50">
                      <CheckCircle2 size={12} /> Connected
                    </span>
                  ) : (
                    <span className="bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400 text-[11px] font-medium px-2.5 py-1 rounded-full border border-slate-200 dark:border-slate-700">
                      Not Configured
                    </span>
                  )}
                </div>

                <div className="mb-4">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${meta.color}`}>
                    <Sparkles size={24} strokeWidth={2} />
                  </div>
                </div>
                
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{meta.name}</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-2 mb-8 flex-1 leading-relaxed">
                  {meta.description}
                </p>

                <button 
                  onClick={() => handleOpenModal(meta.type)}
                  className={`w-full py-2.5 rounded-lg text-sm font-medium transition-all ${
                    isConnected 
                      ? "bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-300" 
                      : "bg-[#0070f3] hover:bg-blue-600 text-white shadow-sm"
                  }`}
                >
                  {isConnected ? "Manage API Key" : "Connect Provider"}
                </button>
              </div>
            )
          })}
        </div>
        </>
      )}

      {/* API Key Modal */}
      {activeModal && activeProviderMeta && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${activeProviderMeta.color}`}>
                <Key size={18} />
              </div>
              <div>
                <h3 className="font-semibold text-lg text-slate-900 dark:text-white">Connect {activeProviderMeta.name}</h3>
                <p className="text-xs text-slate-500">Securely store your API keys.</p>
              </div>
            </div>
            
            <div className="p-6">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Secret API Key
              </label>
              <div className="relative">
                <input 
                  type={showKey ? "text" : "password"}
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  placeholder="sk-..."
                  className="w-full pl-3 pr-10 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#0070f3]/20 focus:border-[#0070f3] transition-all"
                />
                <button 
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <p className="text-[11px] text-slate-500 mt-2">
                Your keys are encrypted at rest and never shared with anyone.
              </p>

              <div className="flex gap-3 mt-8">
                <button 
                  onClick={() => setActiveModal(null)}
                  className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-300 rounded-lg text-sm font-medium transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleSaveKey}
                  disabled={isSaving}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-[#0070f3] hover:bg-blue-600 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 shadow-sm"
                >
                  {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                  Save Key
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
