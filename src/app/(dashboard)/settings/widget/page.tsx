"use client"

import { useState } from "react"
import { Copy, Check, MessageSquare, PaintBucket, Type } from "lucide-react"

export default function WidgetSettingsPage() {
  const [copied, setCopied] = useState(false)
  const [orgId, setOrgId] = useState("test-org-123") // Hardcoded for now, should come from auth/context
  
  const snippet = `<!-- TalkFuze Widget -->
<script src="https://app.talkfuze.com/talkfuze-widget.js" data-org-id="${orgId}"></script>`

  const handleCopy = () => {
    navigator.clipboard.writeText(snippet)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Web Widget</h1>
        <p className="text-slate-500 mt-1">Configure your Intercom-style chat widget and add it to your website.</p>
      </div>

      {/* Code Snippet */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
          <h2 className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
            <MessageSquare size={18} className="text-blue-600" />
            Installation Code
          </h2>
          <button 
            onClick={handleCopy}
            className="flex items-center gap-1.5 text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-blue-600 transition-colors"
          >
            {copied ? <Check size={16} className="text-emerald-500" /> : <Copy size={16} />}
            {copied ? 'Copied!' : 'Copy code'}
          </button>
        </div>
        <div className="p-6 bg-slate-50 dark:bg-slate-950/50">
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">Paste this code right before the closing <code className="bg-slate-200 dark:bg-slate-800 px-1.5 py-0.5 rounded text-slate-800 dark:text-slate-300">&lt;/body&gt;</code> tag of your website.</p>
          <pre className="p-4 rounded-lg bg-slate-900 text-slate-300 text-sm overflow-x-auto font-mono leading-relaxed">
            <code>{snippet}</code>
          </pre>
        </div>
      </div>

      {/* Settings Form */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
         <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800">
            <h2 className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
               <PaintBucket size={18} className="text-blue-600" />
               Appearance & Text
            </h2>
         </div>
         <div className="p-6 space-y-6">
            
            <div className="space-y-3">
               <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Theme Color</label>
               <div className="flex gap-3">
                  <button className="w-10 h-10 rounded-full bg-blue-600 ring-2 ring-offset-2 ring-blue-600 dark:ring-offset-slate-900"></button>
                  <button className="w-10 h-10 rounded-full bg-emerald-500 hover:scale-110 transition-transform"></button>
                  <button className="w-10 h-10 rounded-full bg-indigo-500 hover:scale-110 transition-transform"></button>
                  <button className="w-10 h-10 rounded-full bg-slate-900 hover:scale-110 transition-transform"></button>
                  <button className="w-10 h-10 rounded-full border border-slate-300 bg-white hover:scale-110 transition-transform flex items-center justify-center text-slate-400">
                     +
                  </button>
               </div>
            </div>

            <div className="space-y-3">
               <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Greeting Title</label>
               <input 
                  type="text" 
                  defaultValue="Hey there 👋"
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg p-3 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
               />
            </div>

            <div className="space-y-3">
               <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Greeting Subtitle</label>
               <input 
                  type="text" 
                  defaultValue="How can we help?"
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg p-3 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
               />
            </div>

         </div>
         <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 flex justify-end">
            <button className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-6 rounded-lg shadow-sm transition-colors">
               Save Changes
            </button>
         </div>
      </div>
    </div>
  )
}
