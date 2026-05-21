"use client"

import { useState } from "react"
import { Volume2, Play, Check, Phone, Send, MessageSquareText, AlertTriangle } from "lucide-react"
import {
  SOUND_PRESETS, getSelectedSound, setSelectedSound, getSoundVolume, setSoundVolume, previewSound, type SoundPreset,
  RINGTONE_PRESETS, getSelectedRingtone, setSelectedRingtone, getRingtoneVolume, setRingtoneVolume, previewRingtone, type RingtonePreset,
  MIN_SOUND_VOLUME, MIN_RINGTONE_VOLUME, playUISound
} from "@/lib/sounds"

// ─── Reusable Sound Card ───
function SoundCard<T extends string>({
  presets,
  selectedId,
  playingId,
  accentColor,
  onSelect,
  onPreview,
}: {
  presets: { id: T; name: string; description: string }[]
  selectedId: T
  playingId: T | null
  accentColor: 'blue' | 'emerald' | 'amber'
  onSelect: (id: T) => void
  onPreview: (id: T) => void
}) {
  const colors = {
    blue: {
      bg: 'bg-blue-50 dark:bg-blue-500/10',
      border: 'border-blue-200 dark:border-blue-500/30',
      ring: 'ring-1 ring-blue-500/20',
      radio: 'border-blue-600 bg-blue-600',
      text: 'text-blue-700 dark:text-blue-300',
      preview: 'bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400',
    },
    emerald: {
      bg: 'bg-emerald-50 dark:bg-emerald-500/10',
      border: 'border-emerald-200 dark:border-emerald-500/30',
      ring: 'ring-1 ring-emerald-500/20',
      radio: 'border-emerald-600 bg-emerald-600',
      text: 'text-emerald-700 dark:text-emerald-300',
      preview: 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400',
    },
    amber: {
      bg: 'bg-amber-50 dark:bg-amber-500/10',
      border: 'border-amber-200 dark:border-amber-500/30',
      ring: 'ring-1 ring-amber-500/20',
      radio: 'border-amber-600 bg-amber-600',
      text: 'text-amber-700 dark:text-amber-300',
      preview: 'bg-amber-100 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400',
    },
  }
  const c = colors[accentColor]

  return (
    <div className="space-y-2">
      {presets.map((preset) => {
        const isSelected = selectedId === preset.id
        const isPlaying = playingId === preset.id
        return (
          <div
            key={preset.id}
            onClick={() => onSelect(preset.id)}
            className={`flex items-center gap-3 p-3.5 rounded-xl cursor-pointer transition-all duration-150 border ${
              isSelected
                ? `${c.bg} ${c.border} ${c.ring}`
                : 'bg-slate-50 dark:bg-slate-950 border-slate-100 dark:border-slate-800 hover:border-slate-200 dark:hover:border-slate-700 hover:bg-slate-100/50 dark:hover:bg-slate-800/50'
            }`}
          >
            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${
              isSelected ? c.radio : 'border-slate-300 dark:border-slate-600'
            }`}>
              {isSelected && <Check size={12} className="text-white" strokeWidth={3} />}
            </div>
            <div className="flex-1 min-w-0">
              <div className={`text-[13.5px] font-medium ${isSelected ? c.text : 'text-slate-800 dark:text-slate-200'}`}>
                {preset.name}
              </div>
              <div className="text-[12px] text-slate-500 dark:text-slate-400">
                {preset.description}
              </div>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); onPreview(preset.id) }}
              className={`p-2 rounded-lg shrink-0 transition-all ${
                isPlaying
                  ? `${c.preview} scale-110`
                  : 'hover:bg-slate-200/70 dark:hover:bg-slate-700/50 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300'
              }`}
              title={`Preview ${preset.name}`}
            >
              <Play size={14} className={isPlaying ? 'animate-pulse' : ''} fill={isPlaying ? 'currentColor' : 'none'} />
            </button>
          </div>
        )
      })}
    </div>
  )
}

// ─── Volume Slider with minimum ───
function VolumeSlider({
  value,
  min,
  accentColor,
  onChange,
}: {
  value: number
  min: number
  accentColor: string
  onChange: (v: number) => void
}) {
  const pct = Math.round(value * 100)
  const minPct = Math.round(min * 100)
  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-2">
        <label className="text-[13px] font-medium text-slate-700 dark:text-slate-300">Volume</label>
        <span className="text-[12px] font-mono text-slate-400">{pct}%</span>
      </div>
      <input
        type="range"
        min={min}
        max={1}
        step={0.05}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className={`w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full appearance-none cursor-pointer accent-${accentColor}-600 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-${accentColor}-600 [&::-webkit-slider-thumb]:shadow-sm [&::-webkit-slider-thumb]:cursor-pointer`}
      />
      <div className="flex items-center gap-1 mt-1.5">
        <AlertTriangle size={11} className="text-amber-500" />
        <span className="text-[11px] text-slate-400">Minimum {minPct}% to ensure you never miss a message</span>
      </div>
    </div>
  )
}


export default function SoundsSettingsPage() {
  // ── Incoming message sound ──
  const [msgPreset, setMsgPreset] = useState<SoundPreset>(() => getSelectedSound())
  const [msgVol, setMsgVol] = useState<number>(() => getSoundVolume())
  const [playingMsg, setPlayingMsg] = useState<SoundPreset | null>(null)

  // ── Reply / send sound ──
  const [sendVol, setSendVol] = useState<number>(() => {
    if (typeof window === 'undefined') return 0.5
    const stored = localStorage.getItem('talkfuze_send_volume')
    return stored ? Math.max(0.15, parseFloat(stored)) : 0.5
  })

  // ── Call ringtone ──
  const [ringPreset, setRingPreset] = useState<RingtonePreset>(() => getSelectedRingtone())
  const [ringVol, setRingVol] = useState<number>(() => getRingtoneVolume())
  const [playingRing, setPlayingRing] = useState<RingtonePreset | null>(null)

  // ── Handlers: Message Sound ──
  const handleMsgPresetChange = (preset: SoundPreset) => {
    setMsgPreset(preset)
    setSelectedSound(preset)
    setPlayingMsg(preset)
    previewSound(preset)
    setTimeout(() => setPlayingMsg(null), 600)
  }
  const handleMsgVolChange = (v: number) => {
    setMsgVol(v)
    setSoundVolume(v)
  }
  const handleMsgPreview = (preset: SoundPreset) => {
    setPlayingMsg(preset)
    previewSound(preset)
    setTimeout(() => setPlayingMsg(null), 600)
  }

  // ── Handlers: Send Sound ──
  const handleSendVolChange = (v: number) => {
    setSendVol(v)
    if (typeof window !== 'undefined') {
      localStorage.setItem('talkfuze_send_volume', String(Math.max(0.15, v)))
    }
  }
  const handleSendPreview = () => {
    playUISound('send')
  }

  // ── Handlers: Call Ringtone ──
  const handleRingPresetChange = (preset: RingtonePreset) => {
    setRingPreset(preset)
    setSelectedRingtone(preset)
    setPlayingRing(preset)
    previewRingtone(preset)
    setTimeout(() => setPlayingRing(null), 1200)
  }
  const handleRingVolChange = (v: number) => {
    setRingVol(v)
    setRingtoneVolume(v)
  }
  const handleRingPreview = (preset: RingtonePreset) => {
    setPlayingRing(preset)
    previewRingtone(preset)
    setTimeout(() => setPlayingRing(null), 1200)
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">Sound & Notifications</h1>
        <p className="text-sm text-slate-500 mt-1">
          Customize notification sounds, reply sounds, and call ringtones. Settings are saved per device.
        </p>
      </div>

      {/* ─── 1. Incoming Message Sound ─── */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden mb-6">
        <div className="p-6 md:p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center">
              <MessageSquareText size={20} className="text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h3 className="text-lg font-medium text-slate-900 dark:text-white">Incoming Message</h3>
              <p className="text-[13px] text-slate-500">Plays when a customer sends you a message.</p>
            </div>
          </div>

          <VolumeSlider value={msgVol} min={MIN_SOUND_VOLUME} accentColor="blue" onChange={handleMsgVolChange} />

          <SoundCard
            presets={SOUND_PRESETS}
            selectedId={msgPreset}
            playingId={playingMsg}
            accentColor="blue"
            onSelect={handleMsgPresetChange}
            onPreview={handleMsgPreview}
          />
        </div>
      </div>

      {/* ─── 2. Reply / Send Sound ─── */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden mb-6">
        <div className="p-6 md:p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-500/10 flex items-center justify-center">
              <Send size={20} className="text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <h3 className="text-lg font-medium text-slate-900 dark:text-white">Reply / Send Sound</h3>
              <p className="text-[13px] text-slate-500">Plays when you send a message to a customer.</p>
            </div>
          </div>

          {/* Volume */}
          <div className="mb-5">
            <div className="flex items-center justify-between mb-2">
              <label className="text-[13px] font-medium text-slate-700 dark:text-slate-300">Volume</label>
              <span className="text-[12px] font-mono text-slate-400">{Math.round(sendVol * 100)}%</span>
            </div>
            <input
              type="range"
              min={0.15}
              max={1}
              step={0.05}
              value={sendVol}
              onChange={(e) => handleSendVolChange(parseFloat(e.target.value))}
              className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full appearance-none cursor-pointer accent-amber-600 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-amber-600 [&::-webkit-slider-thumb]:shadow-sm [&::-webkit-slider-thumb]:cursor-pointer"
            />
          </div>

          {/* Preview */}
          <button
            onClick={handleSendPreview}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 text-amber-700 dark:text-amber-300 text-[13px] font-medium hover:bg-amber-100 dark:hover:bg-amber-500/20 transition-colors"
          >
            <Play size={14} />
            Preview send sound
          </button>

          <p className="text-[11.5px] text-slate-400 dark:text-slate-500 mt-4">
            This is the subtle swoosh that plays when you send a reply. Minimum 15%.
          </p>
        </div>
      </div>

      {/* ─── 3. Call Ringtone ─── */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden mb-6">
        <div className="p-6 md:p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center">
              <Phone size={20} className="text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <h3 className="text-lg font-medium text-slate-900 dark:text-white">Call Ringtone</h3>
              <p className="text-[13px] text-slate-500">Plays when a customer calls you through the widget.</p>
            </div>
          </div>

          <VolumeSlider value={ringVol} min={MIN_RINGTONE_VOLUME} accentColor="emerald" onChange={handleRingVolChange} />

          <SoundCard
            presets={RINGTONE_PRESETS}
            selectedId={ringPreset}
            playingId={playingRing}
            accentColor="emerald"
            onSelect={handleRingPresetChange}
            onPreview={handleRingPreview}
          />
        </div>
      </div>

      {/* ─── Info Footer ─── */}
      <div className="bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 mb-6">
        <div className="flex gap-3">
          <Volume2 size={18} className="text-slate-400 shrink-0 mt-0.5" />
          <div className="text-[12.5px] text-slate-500 dark:text-slate-400 leading-relaxed">
            <p className="font-medium text-slate-700 dark:text-slate-300 mb-1">Why is there a minimum volume?</p>
            <p>
              To make sure no agent ever misses a customer message or call, we enforce minimum volume levels.
              Incoming messages cannot go below 30%, and call ringtones cannot go below 40%.
              If your environment is noisy, select "Loud Ping" or "Siren" for maximum attention.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
