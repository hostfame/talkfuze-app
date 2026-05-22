"use client"

import { useCallback, useEffect, useState } from "react"
import { Zap, Save, Loader2, MessageSquare, PhoneCall, AlertCircle, CheckCircle2 } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/lib/auth-context"

export default function AutomationSettingsPage() {
  const currentUser = useAuth()
  const ORG_ID = currentUser.org_id

  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isSaved, setIsSaved] = useState(false)
  const [errorMsg, setErrorMsg] = useState("")

  // Form states
  const [enabled, setEnabled] = useState(false)
  const [replyText, setReplyText] = useState("")
  const [hotlineNumber, setHotlineNumber] = useState("")

  const [widgetAutoReplyEnabled, setWidgetAutoReplyEnabled] = useState(false)
  const [widgetAutoReplyEn, setWidgetAutoReplyEn] = useState("")
  const [widgetAutoReplyBn, setWidgetAutoReplyBn] = useState("")

  const DEFAULT_REPLY = "Hi! Thank you for calling us on WhatsApp. We are currently moving our voice support to our direct hotline. We will call you back shortly, or you can reach us directly at {hotline}."
  const DEFAULT_WIDGET_EN = "It seems all our support agents are currently busy. For faster support, you can message us on WhatsApp: {whatsapp_number}"
  const DEFAULT_WIDGET_BN = "সম্ভবত আমাদের সকল সাপোর্ট এজেন্ট এই মুহূর্তে ব্যস্ত আছেন। দ্রুত সাপোর্ট পেতে আমাদের হোয়াটসঅ্যাপ এ মেসেজ করতে পারেনঃ {whatsapp_number}"

  // Fetch settings from supabase
  const fetchSettings = useCallback(async () => {
    setIsLoading(true)
    setErrorMsg("")
    try {
      const { data: org, error } = await supabase
        .from("organizations")
        .select("settings")
        .eq("id", ORG_ID)
        .single()

      if (error) throw error

      if (org?.settings) {
        const settings = org.settings as any
        setEnabled(!!settings.wa_call_auto_reply_enabled)
        setReplyText(settings.wa_call_auto_reply_text || DEFAULT_REPLY)
        setHotlineNumber(settings.wa_call_hotline_number || "+880 9612 345678")
        
        setWidgetAutoReplyEnabled(!!settings.widget_auto_reply_enabled)
        setWidgetAutoReplyEn(settings.widget_auto_reply_text_en || DEFAULT_WIDGET_EN)
        setWidgetAutoReplyBn(settings.widget_auto_reply_text_bn || DEFAULT_WIDGET_BN)
      }
    } catch (err: any) {
      console.error("[AUTOMATION_SETTINGS] Fetch error:", err)
      setErrorMsg("Failed to load automation settings.")
    } finally {
      setIsLoading(false)
    }
  }, [ORG_ID])

  useEffect(() => {
    if (ORG_ID) {
      void fetchSettings()
    }
  }, [ORG_ID, fetchSettings])

  // Save settings back to JSONB field
  const handleSave = async () => {
    setIsSaving(true)
    setErrorMsg("")
    setIsSaved(false)

    try {
      const { data: org, error: fetchErr } = await supabase
        .from("organizations")
        .select("settings")
        .eq("id", ORG_ID)
        .single()

      if (fetchErr) throw fetchErr

      const currentSettings = org?.settings || {}
      const updatedSettings = {
        ...currentSettings,
        wa_call_auto_reply_enabled: enabled,
        wa_call_auto_reply_text: replyText.trim(),
        wa_call_hotline_number: hotlineNumber.trim(),
        widget_auto_reply_enabled: widgetAutoReplyEnabled,
        widget_auto_reply_text_en: widgetAutoReplyEn.trim(),
        widget_auto_reply_text_bn: widgetAutoReplyBn.trim()
      }

      const { error: updateErr } = await supabase
        .from("organizations")
        .update({ settings: updatedSettings })
        .eq("id", ORG_ID)

      if (updateErr) throw updateErr

      setIsSaved(true)
      setTimeout(() => setIsSaved(false), 3000)
    } catch (err: any) {
      console.error("[AUTOMATION_SETTINGS] Save error:", err)
      setErrorMsg("Failed to save settings. Please try again.")
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="space-y-6 relative animate-in fade-in duration-300">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            <Zap className="text-blue-500" /> Automation & Triggers
          </h1>
          <p className="text-sm text-slate-500 mt-1">Configure automated replies, triggers, and notification flows for incoming support events.</p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center items-center h-48">
          <Loader2 className="animate-spin text-slate-400" />
        </div>
      ) : (
        <div className="max-w-3xl space-y-6">
          {errorMsg && (
            <div className="flex items-center gap-2.5 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-sm">
              <AlertCircle size={18} />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Trigger Card: WhatsApp Missed Call */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-start gap-4">
              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                  <PhoneCall size={18} className="text-slate-400" />
                  WhatsApp Missed Call Auto-Reply
                </h3>
                <p className="text-sm text-slate-500 mt-1">
                  Trigger an automated message to the customer when they attempt to call your WhatsApp business number, routing them straight to your hotline.
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-1">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={enabled}
                  onChange={(e) => setEnabled(e.target.checked)}
                />
                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-slate-600 peer-checked:bg-[#0070f3]"></div>
              </label>
            </div>

            {enabled && (
              <div className="p-6 space-y-5 bg-slate-50/50 dark:bg-slate-900/50">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2">
                      Outbound SIP Hotline Number
                    </label>
                    <input
                      type="text"
                      value={hotlineNumber}
                      onChange={(e) => setHotlineNumber(e.target.value)}
                      placeholder="+880 9612 345678"
                      className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-800 dark:text-white outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all font-mono"
                    />
                    <p className="text-[11px] text-slate-400 mt-1.5">
                      This number replaces the {"{hotline}"} placeholder in your automated message text.
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                    Automated Auto-Reply Message Copy
                  </label>
                  <textarea
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    rows={4}
                    className="w-full px-3.5 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-800 dark:text-white outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all leading-relaxed"
                    placeholder="Enter auto-reply text template..."
                  />
                  <div className="flex justify-between items-center text-[11px] text-slate-400">
                    <span>Use <code className="bg-slate-200 dark:bg-slate-800 px-1 py-0.5 rounded font-mono font-bold">{"{hotline}"}</code> to dynamically output your hotline number.</span>
                    <button
                      type="button"
                      onClick={() => setReplyText(DEFAULT_REPLY)}
                      className="text-[#0070f3] hover:underline font-medium"
                    >
                      Reset to default copy
                    </button>
                  </div>
                </div>

                {/* Event Hook Preview */}
                <div className="p-4 rounded-xl bg-blue-500/5 border border-blue-500/10 space-y-2.5">
                  <div className="flex items-center gap-2 text-xs font-semibold text-blue-600 dark:text-blue-400">
                    <MessageSquare size={16} />
                    <span>Real-time Trigger Flow</span>
                  </div>
                  <p className="text-[12.5px] text-slate-600 dark:text-slate-400 leading-relaxed font-normal">
                    When active, TalkFuze automatically processes rejected incoming calls. It replies to the client instantly and triggers a persistent call-back alert on your agent workspace call icons.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Trigger Card: Widget Auto-Reply */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-start gap-4">
              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                  <MessageSquare size={18} className="text-slate-400" />
                  Live Chat Unresponsive Auto-Reply
                </h3>
                <p className="text-sm text-slate-500 mt-1">
                  Trigger an automated fallback message if no agent replies to a new live chat visitor within 60 seconds.
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-1">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={widgetAutoReplyEnabled}
                  onChange={(e) => setWidgetAutoReplyEnabled(e.target.checked)}
                />
                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-slate-600 peer-checked:bg-[#0070f3]"></div>
              </label>
            </div>

            {widgetAutoReplyEnabled && (
              <div className="p-6 space-y-5 bg-slate-50/50 dark:bg-slate-900/50">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                      English Message
                    </label>
                    <textarea
                      value={widgetAutoReplyEn}
                      onChange={(e) => setWidgetAutoReplyEn(e.target.value)}
                      rows={3}
                      className="w-full px-3.5 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-800 dark:text-white outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all leading-relaxed"
                      placeholder="Enter auto-reply text template for English..."
                    />
                    <div className="flex justify-between items-center text-[11px] text-slate-400">
                      <span>Use <code className="bg-slate-200 dark:bg-slate-800 px-1 py-0.5 rounded font-mono font-bold">{"{whatsapp_number}"}</code> to output your configured WhatsApp number.</span>
                      <button
                        type="button"
                        onClick={() => setWidgetAutoReplyEn(DEFAULT_WIDGET_EN)}
                        className="text-[#0070f3] hover:underline font-medium"
                      >
                        Reset English
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                      Bengali Message
                    </label>
                    <textarea
                      value={widgetAutoReplyBn}
                      onChange={(e) => setWidgetAutoReplyBn(e.target.value)}
                      rows={3}
                      className="w-full px-3.5 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-800 dark:text-white outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all leading-relaxed"
                      placeholder="Enter auto-reply text template for Bengali..."
                    />
                    <div className="flex justify-end items-center text-[11px]">
                      <button
                        type="button"
                        onClick={() => setWidgetAutoReplyBn(DEFAULT_WIDGET_BN)}
                        className="text-[#0070f3] hover:underline font-medium"
                      >
                        Reset Bengali
                      </button>
                    </div>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-blue-500/5 border border-blue-500/10 space-y-2.5">
                  <div className="flex items-center gap-2 text-xs font-semibold text-blue-600 dark:text-blue-400">
                    <Zap size={16} />
                    <span>Language Detection</span>
                  </div>
                  <p className="text-[12.5px] text-slate-600 dark:text-slate-400 leading-relaxed font-normal">
                    TalkFuze automatically detects the language of the visitor's message and selects the appropriate localized template. If no Bengali script is found, the English version is used by default.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Action Row */}
          <div className="flex justify-end pt-4">
            <button
              onClick={handleSave}
              disabled={isSaving}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-medium text-white transition-all shadow-sm ${
                isSaved ? "bg-emerald-500 hover:bg-emerald-600" : "bg-blue-600 hover:bg-blue-700"
              }`}
            >
              {isSaving ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Saving Changes
                </>
              ) : isSaved ? (
                <>
                  <CheckCircle2 size={16} />
                  Saved Successfully
                </>
              ) : (
                <>
                  <Save size={16} />
                  Save Changes
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
