"use client"

import { useState, useEffect, useCallback } from "react"
import {
  Volume2, Play, Check, Phone, Send, MessageSquareText, Bell, BellOff, Eye, EyeOff,
  Clock, Moon, RefreshCw, Monitor, Vibrate, ChevronRight
} from "lucide-react"
import {
  SOUND_PRESETS, getSelectedSound, setSelectedSound, getSoundVolume, setSoundVolume, previewSound, type SoundPreset,
  RINGTONE_PRESETS, getSelectedRingtone, setSelectedRingtone, getRingtoneVolume, setRingtoneVolume, previewRingtone, type RingtonePreset,
  MIN_SOUND_VOLUME, MIN_RINGTONE_VOLUME, playUISound
} from "@/lib/sounds"

// ─── Helpers ───
const ls = {
  get: (key: string, fallback: string) => typeof window !== 'undefined' ? (localStorage.getItem(key) ?? fallback) : fallback,
  set: (key: string, val: string) => typeof window !== 'undefined' && localStorage.setItem(key, val),
  getBool: (key: string, fallback: boolean) => typeof window !== 'undefined' ? (localStorage.getItem(key) === 'true' || (localStorage.getItem(key) === null && fallback)) : fallback,
  getNum: (key: string, fallback: number) => typeof window !== 'undefined' ? (parseFloat(localStorage.getItem(key) ?? String(fallback))) : fallback,
}

// ─── Toggle Switch (Apple-style) ───
function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-[26px] w-[46px] shrink-0 cursor-pointer rounded-full transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:opacity-40 disabled:cursor-not-allowed ${
        checked ? 'bg-blue-600' : 'bg-slate-200 dark:bg-slate-700'
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-[22px] w-[22px] transform rounded-full bg-white shadow-md ring-0 transition-transform duration-200 ease-in-out ${
          checked ? 'translate-x-[22px]' : 'translate-x-[2px]'
        } mt-[2px]`}
      />
    </button>
  )
}

// ─── Volume Slider ───
function VolumeSlider({ value, min, onChange }: { value: number; min: number; onChange: (v: number) => void }) {
  const pct = Math.round(value * 100)
  const minPct = Math.round(min * 100)
  const fillPct = ((value - min) / (1 - min)) * 100
  return (
    <div>
      <div className="flex items-center justify-between mb-2.5">
        <span className="text-[13px] text-slate-500 dark:text-slate-400">Volume</span>
        <span className="text-[13px] font-semibold tabular-nums text-slate-800 dark:text-slate-200">{pct}%</span>
      </div>
      <div className="relative">
        <input
          type="range"
          min={min}
          max={1}
          step={0.01}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="w-full h-[6px] rounded-full appearance-none cursor-pointer bg-transparent [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-[20px] [&::-webkit-slider-thumb]:h-[20px] [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-[0_1px_4px_rgba(0,0,0,0.2)] [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:border-[2px] [&::-webkit-slider-thumb]:border-blue-600 [&::-webkit-slider-thumb]:relative [&::-webkit-slider-thumb]:z-10"
          style={{
            background: `linear-gradient(to right, #2563eb 0%, #2563eb ${fillPct}%, #e2e8f0 ${fillPct}%, #e2e8f0 100%)`
          }}
        />
      </div>
      <p className="text-[11px] text-slate-400 mt-1.5">Minimum {minPct}% enforced</p>
    </div>
  )
}

// ─── Sound Preset Selector ───
function PresetSelector<T extends string>({
  presets,
  selectedId,
  playingId,
  onSelect,
  onPreview,
}: {
  presets: { id: T; name: string; description: string }[]
  selectedId: T
  playingId: T | null
  onSelect: (id: T) => void
  onPreview: (id: T) => void
}) {
  return (
    <div className="grid gap-2">
      {presets.map((p) => {
        const sel = selectedId === p.id
        const playing = playingId === p.id
        return (
          <button
            key={p.id}
            onClick={() => onSelect(p.id)}
            className={`group flex items-center gap-3 px-4 py-3 rounded-[14px] text-left transition-all duration-150 border ${
              sel
                ? 'bg-blue-50/80 dark:bg-blue-500/8 border-blue-200/80 dark:border-blue-500/25 shadow-[0_0_0_1px_rgba(37,99,235,0.08)]'
                : 'bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60'
            }`}
          >
            {/* Radio */}
            <div className={`w-[18px] h-[18px] rounded-full border-[2px] flex items-center justify-center shrink-0 transition-all ${
              sel ? 'border-blue-600 bg-blue-600' : 'border-slate-300 dark:border-slate-600 group-hover:border-slate-400'
            }`}>
              {sel && <Check size={10} className="text-white" strokeWidth={3} />}
            </div>

            {/* Label */}
            <div className="flex-1 min-w-0">
              <span className={`text-[13px] font-medium ${sel ? 'text-blue-700 dark:text-blue-300' : 'text-slate-700 dark:text-slate-200'}`}>
                {p.name}
              </span>
              <span className="text-[11.5px] text-slate-400 dark:text-slate-500 ml-2">{p.description}</span>
            </div>

            {/* Play */}
            <div
              onClick={(e) => { e.stopPropagation(); onPreview(p.id) }}
              className={`w-[30px] h-[30px] rounded-full flex items-center justify-center shrink-0 transition-all ${
                playing
                  ? 'bg-blue-600 text-white scale-105'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-400 hover:bg-blue-100 dark:hover:bg-blue-500/15 hover:text-blue-600 dark:hover:text-blue-400'
              }`}
            >
              <Play size={12} fill={playing ? 'currentColor' : 'none'} />
            </div>
          </button>
        )
      })}
    </div>
  )
}

// ─── Section Card ───
function Section({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
      {children}
    </div>
  )
}

function SectionHeader({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="p-5 pb-0">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-[10px] bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center text-blue-600 dark:text-blue-400">
          {icon}
        </div>
        <div>
          <h3 className="text-[15px] font-semibold text-slate-900 dark:text-white leading-tight">{title}</h3>
          <p className="text-[12px] text-slate-400 dark:text-slate-500 mt-0.5">{description}</p>
        </div>
      </div>
    </div>
  )
}

function SectionBody({ children }: { children: React.ReactNode }) {
  return <div className="p-5">{children}</div>
}

function SettingRow({ icon, label, description, children }: { icon: React.ReactNode; label: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-3.5 border-b border-slate-100/80 dark:border-slate-800/60 last:border-0">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <span className="text-slate-400 dark:text-slate-500">{icon}</span>
        <div className="min-w-0">
          <div className="text-[13.5px] font-medium text-slate-800 dark:text-slate-200">{label}</div>
          {description && <div className="text-[11.5px] text-slate-400 dark:text-slate-500 mt-0.5">{description}</div>}
        </div>
      </div>
      <div className="shrink-0 ml-3">{children}</div>
    </div>
  )
}


// ─── Main Page ───
export default function SoundsSettingsPage() {
  // ── Sound States ──
  const [msgPreset, setMsgPreset] = useState<SoundPreset>(() => getSelectedSound())
  const [msgVol, setMsgVol] = useState<number>(() => getSoundVolume())
  const [playingMsg, setPlayingMsg] = useState<SoundPreset | null>(null)

  const [sendVol, setSendVol] = useState<number>(() => ls.getNum('talkfuze_send_volume', 0.5))

  const [ringPreset, setRingPreset] = useState<RingtonePreset>(() => getSelectedRingtone())
  const [ringVol, setRingVol] = useState<number>(() => getRingtoneVolume())
  const [playingRing, setPlayingRing] = useState<RingtonePreset | null>(null)

  // ── Notification Settings ──
  const [desktopNotifs, setDesktopNotifs] = useState(() => ls.getBool('talkfuze_desktop_notifs', true))
  const [notifPreview, setNotifPreview] = useState(() => ls.getBool('talkfuze_notif_preview', true))
  const [tabBadge, setTabBadge] = useState(() => ls.getBool('talkfuze_tab_badge', true))
  const [repeatAlerts, setRepeatAlerts] = useState(() => ls.getBool('talkfuze_repeat_alerts', true))
  const [repeatInterval, setRepeatInterval] = useState(() => ls.getNum('talkfuze_repeat_interval', 30))
  const [dndEnabled, setDndEnabled] = useState(() => ls.getBool('talkfuze_dnd', false))
  const [dndStart, setDndStart] = useState(() => ls.get('talkfuze_dnd_start', '22:00'))
  const [dndEnd, setDndEnd] = useState(() => ls.get('talkfuze_dnd_end', '07:00'))
  const [assignSound, setAssignSound] = useState(() => ls.getBool('talkfuze_assign_sound', true))
  const [mentionSound, setMentionSound] = useState(() => ls.getBool('talkfuze_mention_sound', true))

  // ── Permission state ──
  const [notifPermission, setNotifPermission] = useState<NotificationPermission>('default')
  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setNotifPermission(Notification.permission)
    }
  }, [])

  // ── Persist helpers ──
  const persist = useCallback((key: string, val: string | boolean | number) => {
    ls.set(key, String(val))
  }, [])

  // ── Handlers: Message ──
  const handleMsgPreset = (p: SoundPreset) => {
    setMsgPreset(p); setSelectedSound(p)
    setPlayingMsg(p); previewSound(p); setTimeout(() => setPlayingMsg(null), 600)
  }
  const handleMsgVol = (v: number) => { setMsgVol(v); setSoundVolume(v) }
  const handleMsgPreview = (p: SoundPreset) => {
    setPlayingMsg(p); previewSound(p); setTimeout(() => setPlayingMsg(null), 600)
  }

  // ── Handlers: Send ──
  const handleSendVol = (v: number) => {
    const clamped = Math.max(0.15, v)
    setSendVol(clamped); persist('talkfuze_send_volume', clamped)
  }

  // ── Handlers: Ringtone ──
  const handleRingPreset = (p: RingtonePreset) => {
    setRingPreset(p); setSelectedRingtone(p)
    setPlayingRing(p); previewRingtone(p); setTimeout(() => setPlayingRing(null), 1200)
  }
  const handleRingVol = (v: number) => { setRingVol(v); setRingtoneVolume(v) }
  const handleRingPreview = (p: RingtonePreset) => {
    setPlayingRing(p); previewRingtone(p); setTimeout(() => setPlayingRing(null), 1200)
  }

  // ── Handlers: Notifications ──
  const handleDesktopNotifs = async (v: boolean) => {
    if (v && 'Notification' in window && Notification.permission !== 'granted') {
      const perm = await Notification.requestPermission()
      setNotifPermission(perm)
      if (perm !== 'granted') return
    }
    setDesktopNotifs(v); persist('talkfuze_desktop_notifs', v)
  }
  const handleNotifPreview = (v: boolean) => { setNotifPreview(v); persist('talkfuze_notif_preview', v) }
  const handleTabBadge = (v: boolean) => { setTabBadge(v); persist('talkfuze_tab_badge', v) }
  const handleRepeatAlerts = (v: boolean) => { setRepeatAlerts(v); persist('talkfuze_repeat_alerts', v) }
  const handleRepeatInterval = (v: number) => { setRepeatInterval(v); persist('talkfuze_repeat_interval', v) }
  const handleDnd = (v: boolean) => { setDndEnabled(v); persist('talkfuze_dnd', v) }
  const handleDndStart = (v: string) => { setDndStart(v); persist('talkfuze_dnd_start', v) }
  const handleDndEnd = (v: string) => { setDndEnd(v); persist('talkfuze_dnd_end', v) }
  const handleAssignSound = (v: boolean) => { setAssignSound(v); persist('talkfuze_assign_sound', v) }
  const handleMentionSound = (v: boolean) => { setMentionSound(v); persist('talkfuze_mention_sound', v) }

  return (
    <div className="max-w-[640px]">

      {/* Page Header */}
      <div className="mb-8">
        <h1 className="text-[22px] font-bold text-slate-900 dark:text-white tracking-tight">Sound & Notifications</h1>
        <p className="text-[13px] text-slate-500 mt-1">
          Control how you get alerted about new messages and calls. All settings save per device.
        </p>
      </div>

      <div className="space-y-5">

        {/* ───────────── NOTIFICATION BEHAVIOR ───────────── */}
        <Section>
          <SectionHeader
            icon={<Bell size={18} />}
            title="Notification Behavior"
            description="Control how and when you receive alerts"
          />
          <SectionBody>
            <SettingRow
              icon={<Monitor size={16} />}
              label="Desktop notifications"
              description={notifPermission === 'denied' ? 'Blocked by browser - check site permissions' : 'Show browser notification popups'}
            >
              <Toggle
                checked={desktopNotifs}
                onChange={handleDesktopNotifs}
                disabled={notifPermission === 'denied'}
              />
            </SettingRow>

            <SettingRow
              icon={<Eye size={16} />}
              label="Show message preview"
              description="Display message content in notifications"
            >
              <Toggle checked={notifPreview} onChange={handleNotifPreview} />
            </SettingRow>

            <SettingRow
              icon={<Monitor size={16} />}
              label="Tab badge count"
              description="Show unread count in browser tab title"
            >
              <Toggle checked={tabBadge} onChange={handleTabBadge} />
            </SettingRow>

            <SettingRow
              icon={<Bell size={16} />}
              label="Sound on assignment"
              description="Play sound when a conversation is assigned to you"
            >
              <Toggle checked={assignSound} onChange={handleAssignSound} />
            </SettingRow>

            <SettingRow
              icon={<MessageSquareText size={16} />}
              label="Sound on @mention"
              description="Play sound when a teammate mentions you"
            >
              <Toggle checked={mentionSound} onChange={handleMentionSound} />
            </SettingRow>
          </SectionBody>
        </Section>

        {/* ───────────── REPEAT ALERTS ───────────── */}
        <Section>
          <SectionHeader
            icon={<RefreshCw size={18} />}
            title="Repeat Alerts"
            description="Re-alert for unread messages so nothing gets missed"
          />
          <SectionBody>
            <SettingRow
              icon={<Vibrate size={16} />}
              label="Repeat unread alerts"
              description="Replay notification sound if message stays unread"
            >
              <Toggle checked={repeatAlerts} onChange={handleRepeatAlerts} />
            </SettingRow>

            {repeatAlerts && (
              <div className="pt-2 pb-1">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[12.5px] text-slate-500">Repeat every</span>
                  <span className="text-[12.5px] font-semibold text-slate-700 dark:text-slate-300 tabular-nums">{repeatInterval}s</span>
                </div>
                <div className="flex gap-2">
                  {[15, 30, 60, 120].map((s) => (
                    <button
                      key={s}
                      onClick={() => handleRepeatInterval(s)}
                      className={`flex-1 py-2 text-[12px] font-medium rounded-lg transition-all ${
                        repeatInterval === s
                          ? 'bg-blue-600 text-white shadow-sm'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                      }`}
                    >
                      {s < 60 ? `${s}s` : `${s / 60}m`}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </SectionBody>
        </Section>

        {/* ───────────── DO NOT DISTURB ───────────── */}
        <Section>
          <SectionHeader
            icon={<Moon size={18} />}
            title="Do Not Disturb"
            description="Silence all sounds during scheduled hours"
          />
          <SectionBody>
            <SettingRow
              icon={<BellOff size={16} />}
              label="Enable quiet hours"
              description="No sounds during the scheduled window"
            >
              <Toggle checked={dndEnabled} onChange={handleDnd} />
            </SettingRow>

            {dndEnabled && (
              <div className="flex items-center gap-3 pt-3">
                <div className="flex-1">
                  <label className="text-[11.5px] text-slate-400 mb-1 block">From</label>
                  <input
                    type="time"
                    value={dndStart}
                    onChange={(e) => handleDndStart(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-[13px] text-slate-800 dark:text-slate-200 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <ChevronRight size={14} className="text-slate-300 mt-4" />
                <div className="flex-1">
                  <label className="text-[11.5px] text-slate-400 mb-1 block">Until</label>
                  <input
                    type="time"
                    value={dndEnd}
                    onChange={(e) => handleDndEnd(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-[13px] text-slate-800 dark:text-slate-200 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>
            )}
          </SectionBody>
        </Section>

        {/* ───────────── INCOMING MESSAGE SOUND ───────────── */}
        <Section>
          <SectionHeader
            icon={<MessageSquareText size={18} />}
            title="Incoming Message"
            description="Sound when a customer sends a message"
          />
          <SectionBody>
            <div className="mb-5">
              <VolumeSlider value={msgVol} min={MIN_SOUND_VOLUME} onChange={handleMsgVol} />
            </div>
            <PresetSelector
              presets={SOUND_PRESETS}
              selectedId={msgPreset}
              playingId={playingMsg}
              onSelect={handleMsgPreset}
              onPreview={handleMsgPreview}
            />
          </SectionBody>
        </Section>

        {/* ───────────── REPLY SOUND ───────────── */}
        <Section>
          <SectionHeader
            icon={<Send size={18} />}
            title="Reply Sound"
            description="Confirmation sound when you send a message"
          />
          <SectionBody>
            <div className="mb-4">
              <VolumeSlider value={sendVol} min={0.15} onChange={handleSendVol} />
            </div>
            <button
              onClick={() => playUISound('send')}
              className="flex items-center gap-2.5 px-4 py-2.5 rounded-[12px] bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-[13px] font-medium hover:bg-slate-100 dark:hover:bg-slate-700 active:scale-[0.98] transition-all"
            >
              <Play size={13} />
              Preview
            </button>
          </SectionBody>
        </Section>

        {/* ───────────── CALL RINGTONE ───────────── */}
        <Section>
          <SectionHeader
            icon={<Phone size={18} />}
            title="Call Ringtone"
            description="Sound when a customer calls through the widget"
          />
          <SectionBody>
            <div className="mb-5">
              <VolumeSlider value={ringVol} min={MIN_RINGTONE_VOLUME} onChange={handleRingVol} />
            </div>
            <PresetSelector
              presets={RINGTONE_PRESETS}
              selectedId={ringPreset}
              playingId={playingRing}
              onSelect={handleRingPreset}
              onPreview={handleRingPreview}
            />
          </SectionBody>
        </Section>

        {/* ───────────── Footer Note ───────────── */}
        <div className="flex items-start gap-3 px-1 pb-6 pt-1">
          <Volume2 size={15} className="text-slate-300 dark:text-slate-600 mt-0.5 shrink-0" />
          <p className="text-[11.5px] text-slate-400 dark:text-slate-500 leading-relaxed">
            Volume minimums are enforced to keep your team responsive. If your environment is noisy,
            use <strong>Loud Ping</strong> for messages or <strong>Siren</strong> for calls.
            All settings are saved locally on this device.
          </p>
        </div>

      </div>
    </div>
  )
}
