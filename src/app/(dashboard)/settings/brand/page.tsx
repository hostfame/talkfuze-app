"use client"

import { useState } from "react"
import { Paintbrush, Image as ImageIcon, Check } from "lucide-react"

export default function BrandSettingsPage() {
  const [primaryColor, setPrimaryColor] = useState("#2563eb")
  const [isSaved, setIsSaved] = useState(false)

  const handleSave = () => {
    setIsSaved(true)
    setTimeout(() => setIsSaved(false), 3000)
  }

  return (
    <div className="max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Brand Appearance</h1>
        <p className="text-sm text-slate-500 mt-1">Customize how your TalkFuze workspace looks to your team and customers.</p>
      </div>

      <div className="mt-8 space-y-8">
        
        {/* Logo Section */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
          <div className="p-6 border-b border-slate-100 dark:border-slate-800">
            <h3 className="text-lg font-medium text-slate-900 dark:text-white flex items-center gap-2">
              <ImageIcon size={18} className="text-slate-400" />
              Workspace Logo
            </h3>
            <p className="text-sm text-slate-500 mt-1">Upload a logo for your workspace. This will be used in the top-left corner.</p>
          </div>
          <div className="p-6 bg-slate-50 dark:bg-slate-900/50 flex items-start gap-6">
            <div className="w-20 h-20 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl flex items-center justify-center overflow-hidden">
              <img src="/talkfuze-logo.png" alt="Logo" className="w-12 h-12 object-contain" />
            </div>
            <div>
              <div className="flex gap-3">
                <button className="px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
                  Change logo
                </button>
                <button className="px-4 py-2 text-slate-500 text-sm font-medium hover:text-red-600 transition-colors">
                  Remove
                </button>
              </div>
              <p className="text-xs text-slate-400 mt-3">Recommended size: 256x256px. Formats: PNG, JPG, SVG.</p>
            </div>
          </div>
        </div>

        {/* Brand Colors */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
          <div className="p-6 border-b border-slate-100 dark:border-slate-800">
            <h3 className="text-lg font-medium text-slate-900 dark:text-white flex items-center gap-2">
              <Paintbrush size={18} className="text-slate-400" />
              Brand Colors
            </h3>
            <p className="text-sm text-slate-500 mt-1">Select your primary brand color. This affects buttons, links, and highlights.</p>
          </div>
          <div className="p-6 space-y-5">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Primary Color</label>
              <div className="flex items-center gap-4">
                <input 
                  type="color" 
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className="w-12 h-12 rounded-lg cursor-pointer border-0 p-0"
                />
                <input 
                  type="text" 
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className="px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-mono w-28 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">Color Presets</label>
              <div className="flex flex-wrap gap-3">
                {['#2563eb', '#16a34a', '#dc2626', '#ca8a04', '#9333ea', '#db2777', '#0f172a'].map(color => (
                  <button
                    key={color}
                    onClick={() => setPrimaryColor(color)}
                    className="w-10 h-10 rounded-full flex items-center justify-center transition-transform hover:scale-110 active:scale-95"
                    style={{ backgroundColor: color }}
                  >
                    {primaryColor === color && <Check size={16} className="text-white" />}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Save Button */}
        <div className="flex justify-end pt-4">
          <button 
            onClick={handleSave}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-medium text-white transition-all ${
              isSaved ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {isSaved ? (
              <><Check size={16} /> Saved Successfully</>
            ) : (
              'Save Changes'
            )}
          </button>
        </div>

      </div>
    </div>
  )
}
