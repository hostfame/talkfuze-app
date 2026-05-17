"use client"

import { useCallback, useEffect, useState } from "react"
import { Webhook, Save, Loader2, Link2, Shield } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/lib/auth-context"
import type { ChannelConfig } from "@/lib/types"

export default function CRMWebhooksSettingsPage() {
  const currentUser = useAuth()
  const ORG_ID = currentUser.org_id
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [recordId, setRecordId] = useState<string | null>(null)
  
  const [webhookUrl, setWebhookUrl] = useState("")
  const [webhookSecret, setWebhookSecret] = useState("")
  const [isEnabled, setIsEnabled] = useState(false)

  const fetchWebhook = useCallback(async (showLoading = true) => {
    if (showLoading) setIsLoading(true)
    const { data } = await supabase
      .from('channels') // Reusing channels table for MVP settings storage
      .select('id, config')
      .eq('org_id', ORG_ID)
      .eq('type', 'settings_crm_webhook')
      .single()
    
    const config = data?.config as ChannelConfig | null | undefined
    if (data && config) {
      setWebhookUrl(config.url || "")
      setWebhookSecret(config.secret || "")
      setIsEnabled(config.enabled || false)
      setRecordId(data.id)
    } else if (data) {
      setRecordId(data.id)
    }
    setIsLoading(false)
  }, [ORG_ID])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchWebhook(false)
    }, 0)
    return () => window.clearTimeout(timer)
  }, [fetchWebhook])

  const handleSave = async () => {
    setIsSaving(true)

    const config = {
      url: webhookUrl,
      secret: webhookSecret,
      enabled: isEnabled
    }

    if (recordId) {
      await supabase
        .from('channels')
        .update({ config })
        .eq('id', recordId)
    } else {
      const { data } = await supabase
        .from('channels')
        .insert({
          org_id: ORG_ID,
          type: 'settings_crm_webhook',
          config
        })
        .select('id')
        .single()
      
      if (data) setRecordId(data.id)
    }

    setIsSaving(false)
    alert("Webhook settings saved successfully!")
  }

  return (
    <div className="space-y-6 relative animate-in fade-in duration-300">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            <Webhook className="text-blue-500" /> Universal CRM Webhook
          </h1>
          <p className="text-sm text-slate-500 mt-1">Connect TalkFuze to WHMCS, WooCommerce, or any custom API to pull live customer data.</p>
        </div>
        <button 
          onClick={handleSave}
          disabled={isSaving}
          className="flex items-center gap-2 bg-[#0070f3] hover:bg-blue-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors shadow-sm disabled:opacity-50"
        >
          {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          Save Changes
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center items-center h-40">
          <Loader2 className="animate-spin text-slate-400" />
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm overflow-hidden p-6 max-w-2xl">
          
          <div className="space-y-6">
            
            {/* Enable Toggle */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h3 className="text-sm font-medium text-slate-900 dark:text-white">Enable CRM Data Fetching</h3>
                <p className="text-xs text-slate-500 mt-1">TalkFuze will send a POST request to your URL when a chat opens.</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" className="sr-only peer" checked={isEnabled} onChange={(e) => setIsEnabled(e.target.checked)} />
                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-slate-600 peer-checked:bg-blue-600"></div>
              </label>
            </div>

            {/* URL Input */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
                <Link2 size={16} className="text-slate-400" /> Webhook Endpoint URL
              </label>
              <input 
                type="url" 
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                placeholder="https://your-domain.com/api/talkfuze-webhook"
                className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#0070f3]/20 focus:border-[#0070f3] transition-all"
                disabled={!isEnabled}
              />
              <p className="text-xs text-slate-500 mt-2">
                We will send <code className="bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded text-slate-700 dark:text-slate-300">{"{ phone: '+1234567890' }"}</code> to this endpoint. Return a JSON object with key-value pairs (e.g., LTV, Active Services) to display them in the sidebar.
              </p>
            </div>

            {/* Secret Input */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
                <Shield size={16} className="text-slate-400" /> Verification Secret (Optional)
              </label>
              <input 
                type="password" 
                value={webhookSecret}
                onChange={(e) => setWebhookSecret(e.target.value)}
                placeholder="Enter a secret token..."
                className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#0070f3]/20 focus:border-[#0070f3] transition-all"
                disabled={!isEnabled}
              />
              <p className="text-xs text-slate-500 mt-2">
                If provided, we will pass this in the <code className="bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded text-slate-700 dark:text-slate-300">Authorization: Bearer &lt;secret&gt;</code> header.
              </p>
            </div>

          </div>
        </div>
      )}
    </div>
  )
}
