'use client'

import { useState, useEffect, useCallback, useRef, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  Search, Plus, Download, Upload, MoreHorizontal, MessageSquare,
  Trash2, Tag, User, Phone, PhoneCall, Mail, AlertTriangle,
  ChevronLeft, ChevronRight, X, Check, Copy, Clock,
  Building2, TrendingUp, GitMerge, StickyNote,
  Loader2, ExternalLink, Filter
} from 'lucide-react'
import {
  getContacts, createContact, deleteContact, bulkDeleteContacts,
  updateContactLabels, updateContactName, updateContactNotes,
  importContacts, getAllContactsForExport, getContactTimeline,
  detectDuplicateContacts, mergeContacts
} from '@/actions/contacts'
import { fetchWhmcsDashboardDataBySearch } from '@/actions/whmcs'
import { useInboxStore } from '@/lib/store'

// ─── Types ────────────────────────────────────────────────────────────────────

type ContactRow = {
  id: string
  name: string
  phone: string | null
  email: string | null
  platform_type: string
  platform_id: string
  labels: string[]
  displayPhone: string | null
  conversation_count: number
  last_contacted_at: string
  channel_type: string
  latest_conversation_id: string | null
  is_at_risk: boolean
  contact_score: number
  created_at: string
  metadata?: any
}

// All labels use only blue and gray tones
const LABEL_OPTIONS = [
  { value: 'hot-lead',  label: 'Hot Lead',  color: 'bg-blue-100 text-blue-700 border-blue-200' },
  { value: 'vip',       label: 'VIP',        color: 'bg-blue-600 text-white border-blue-600' },
  { value: 'unpaid',    label: 'Unpaid',     color: 'bg-slate-200 text-slate-800 border-slate-300' },
  { value: 'customer',  label: 'Customer',   color: 'bg-blue-50 text-blue-600 border-blue-200' },
  { value: 'prospect',  label: 'Prospect',   color: 'bg-slate-100 text-slate-700 border-slate-200' },
  { value: 'churned',   label: 'Churned',    color: 'bg-slate-100 text-slate-500 border-slate-200' },
]

// All sources use only blue and gray tones - distinguished by shade, not hue
const SOURCE_CONFIG: Record<string, { label: string; bg: string }> = {
  whatsapp:  { label: 'WhatsApp',  bg: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700' },
  messenger: { label: 'Messenger', bg: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700' },
  widget:    { label: 'Widget',    bg: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700' },
  instagram: { label: 'Instagram', bg: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700' },
  manual:    { label: 'Manual',    bg: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700' },
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getInitials(name: string) {
  if (!name) return '?'
  const parts = name.trim().split(' ').filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return name.substring(0, 2).toUpperCase()
}

function formatRelativeTime(dateStr: string) {
  if (!dateStr) return 'Never'
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`
  return new Date(dateStr).toLocaleDateString()
}



// ─── Modals ───────────────────────────────────────────────────────────────────

function AddContactModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [selectedLabels, setSelectedLabels] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setError('Name is required'); return }
    if (!phone.trim() && !email.trim()) { setError('Phone or email required'); return }
    setLoading(true)
    const res = await createContact({ name, phone, email, labels: selectedLabels })
    setLoading(false)
    if (res.success) { onSuccess(); onClose() }
    else setError(res.error || 'Failed')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <User size={16} className="text-blue-500" /> New Contact
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 transition-colors"><X size={16} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <p className="text-[12px] text-slate-700 bg-slate-100 border border-slate-300 rounded-lg px-3 py-2 flex items-center gap-2">
              <AlertTriangle size={12} className="text-slate-500 shrink-0" /> {error}
            </p>
          )}
          <div>
            <label className="text-[12px] font-medium text-slate-600 dark:text-slate-400 mb-1 block">Name *</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Full name"
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="text-[12px] font-medium text-slate-600 dark:text-slate-400 mb-1 block">Phone</label>
            <div className="relative">
              <Phone size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+8801XXXXXXXXX"
                className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          <div>
            <label className="text-[12px] font-medium text-slate-600 dark:text-slate-400 mb-1 block">Email</label>
            <div className="relative">
              <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={email} onChange={e => setEmail(e.target.value)} placeholder="email@example.com" type="email"
                className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          <div>
            <label className="text-[12px] font-medium text-slate-600 dark:text-slate-400 mb-2 block">Labels</label>
            <div className="flex flex-wrap gap-1.5">
              {LABEL_OPTIONS.map(l => (
                <button key={l.value} type="button"
                  onClick={() => setSelectedLabels(prev => prev.includes(l.value) ? prev.filter(x => x !== l.value) : [...prev, l.value])}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-all ${selectedLabels.includes(l.value) ? l.color + ' ring-2 ring-offset-1 ring-blue-400' : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'}`}>
                  {l.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={loading}
              className="flex-1 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
              {loading ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              {loading ? 'Adding...' : 'Add Contact'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function ImportModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<string>('')
  const [isError, setIsError] = useState(false)

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    setFile(f)
    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target?.result as string
      const lines = text.split('\n').filter(Boolean)
      const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/"/g, ''))
      const rows = lines.slice(1, 6).map(line => {
        const vals = line.split(',').map(v => v.trim().replace(/"/g, ''))
        return Object.fromEntries(headers.map((h, i) => [h, vals[i] || '']))
      })
      setPreview(rows)
    }
    reader.readAsText(f)
  }

  async function handleImport() {
    if (!file) return
    setLoading(true)
    const reader = new FileReader()
    reader.onload = async (ev) => {
      const text = ev.target?.result as string
      const lines = text.split('\n').filter(Boolean)
      const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/"/g, ''))
      const rows = lines.slice(1).map(line => {
        const vals = line.split(',').map(v => v.trim().replace(/"/g, ''))
        const obj: any = Object.fromEntries(headers.map((h, i) => [h, vals[i] || '']))
        return { name: obj.name || obj.full_name || '', phone: obj.phone || obj.phonenumber || '', email: obj.email || '' }
      })
      const res = await importContacts(rows)
      setLoading(false)
      if (res.success) { setResult(`Imported ${res.imported} contacts`); setIsError(false); onSuccess() }
      else { setResult(`Error: ${res.error}`); setIsError(true) }
    }
    reader.readAsText(file)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Upload size={16} className="text-blue-500" /> Import Contacts
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 transition-colors"><X size={16} /></button>
        </div>
        <div className="p-6 space-y-4">
          <div className="border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl p-6 text-center">
            <Upload size={24} className="mx-auto text-slate-300 mb-2" />
            <p className="text-sm text-slate-500 mb-3">CSV with columns: name, phone, email</p>
            <label className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg cursor-pointer hover:bg-blue-700 transition-colors">
              Choose File
              <input type="file" accept=".csv" onChange={handleFile} className="hidden" />
            </label>
            {file && <p className="text-xs text-slate-500 mt-2">{file.name}</p>}
          </div>
          {preview.length > 0 && (
            <div>
              <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wider mb-2">Preview (first 5 rows)</p>
              <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
                <table className="w-full text-[12px]">
                  <thead className="bg-slate-50 dark:bg-slate-800">
                    <tr>{Object.keys(preview[0]).slice(0, 3).map(k => <th key={k} className="px-3 py-2 text-left text-slate-500 font-medium">{k}</th>)}</tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {preview.map((row, i) => (
                      <tr key={i}>{Object.values(row).slice(0, 3).map((v: any, j) => <td key={j} className="px-3 py-1.5 text-slate-700 dark:text-slate-300 truncate max-w-[120px]">{v}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {result && (
            <p className={`text-sm rounded-lg px-3 py-2 border ${isError ? 'bg-slate-100 text-slate-700 border-slate-300' : 'bg-blue-50 text-blue-700 border-blue-200'}`}>
              {result}
            </p>
          )}
          <div className="flex gap-2">
            <button onClick={onClose} className="flex-1 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-50 transition-colors">Cancel</button>
            <button onClick={handleImport} disabled={!file || loading}
              className="flex-1 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
              {loading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
              {loading ? 'Importing...' : 'Import'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function ContactDetailDrawer({ contact, onClose, onRefresh }: { contact: ContactRow; onClose: () => void; onRefresh: () => void }) {
  const router = useRouter()
  const [tab, setTab] = useState<'overview' | 'timeline' | 'hostnin' | 'notes'>('overview')
  const [notes, setNotes] = useState((contact.metadata?.notes as string) || '')
  const [savingNotes, setSavingNotes] = useState(false)
  const [timeline, setTimeline] = useState<any[]>([])
  const [hostnin, setHostnin] = useState<any>(null)
  const [loadingHostnin, setLoadingHostnin] = useState(false)
  const [loadingTimeline, setLoadingTimeline] = useState(false)
  const [editingName, setEditingName] = useState(false)
  const [newName, setNewName] = useState(contact.name)
  const [activeLabels, setActiveLabels] = useState<string[]>(contact.labels || [])
  const [labelMenuOpen, setLabelMenuOpen] = useState(false)

  async function loadTimeline() {
    if (loadingTimeline || timeline.length > 0) return
    setLoadingTimeline(true)
    const { getContactTimeline } = await import('@/actions/contacts')
    const data = await getContactTimeline(contact.id)
    setTimeline(data)
    setLoadingTimeline(false)
  }

  async function loadHostnin() {
    if (loadingHostnin || hostnin !== null) return
    setLoadingHostnin(true)
    // Use phone, email, AND platform_id as search sources.
    // platform_id often contains the most canonical phone (e.g. 8801715296979@s.whatsapp.net).
    const search = contact.displayPhone || contact.phone || contact.email || ''
    if (!search && !contact.platform_id) { setHostnin(false); setLoadingHostnin(false); return }
    const data = await fetchWhmcsDashboardDataBySearch(
      search || contact.platform_id,
      contact.platform_id  // passed as secondary source to normalizer
    )
    setHostnin(data)
    setLoadingHostnin(false)
  }

  useEffect(() => {
    if (tab === 'timeline') loadTimeline()
    if (tab === 'hostnin') loadHostnin()
  }, [tab])

  async function saveName() {
    if (newName === contact.name) { setEditingName(false); return }
    const { updateContactName } = await import('@/actions/contacts')
    await updateContactName(contact.id, newName)
    setEditingName(false)
    onRefresh()
  }

  async function saveNotes() {
    setSavingNotes(true)
    const { updateContactNotes } = await import('@/actions/contacts')
    await updateContactNotes(contact.id, notes)
    setSavingNotes(false)
    onRefresh()
  }

  async function toggleLabel(label: string) {
    const next = activeLabels.includes(label) ? activeLabels.filter(l => l !== label) : [...activeLabels, label]
    setActiveLabels(next)
    const { updateContactLabels } = await import('@/actions/contacts')
    await updateContactLabels(contact.id, next)
    onRefresh()
  }

  const source = SOURCE_CONFIG[contact.platform_type] || SOURCE_CONFIG.manual

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="w-[480px] bg-white dark:bg-slate-900 shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-right duration-300">

        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center text-blue-700 dark:text-blue-300 font-bold text-sm shrink-0">
              {getInitials(contact.name)}
            </div>
            <div className="min-w-0">
              {editingName ? (
                <div className="flex items-center gap-1">
                  <input value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => e.key === 'Enter' && saveName()}
                    className="text-sm font-semibold text-slate-900 dark:text-slate-100 border border-blue-400 rounded px-2 py-0.5 focus:outline-none bg-white dark:bg-slate-800 w-[180px]" autoFocus />
                  <button onClick={saveName} className="p-1 text-blue-600 hover:bg-blue-50 rounded"><Check size={14} /></button>
                  <button onClick={() => setEditingName(false)} className="p-1 text-slate-400 hover:bg-slate-100 rounded"><X size={14} /></button>
                </div>
              ) : (
                <button onClick={() => setEditingName(true)}
                  className="text-sm font-semibold text-slate-900 dark:text-slate-100 hover:text-blue-600 transition-colors truncate text-left max-w-[200px] block">
                  {contact.name}
                </button>
              )}
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${source.bg} mt-0.5`}>
                {source.label}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400"><X size={16} /></button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-100 dark:border-slate-800 shrink-0">
          {(['overview', 'timeline', 'hostnin', 'notes'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-1 py-2.5 text-[12px] font-medium capitalize transition-colors border-b-2 ${tab === t ? 'border-blue-500 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}>
              {t === 'hostnin' ? 'Hostnin CRM' : t}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto">

          {/* Overview Tab */}
          {tab === 'overview' && (
            <div className="p-5 space-y-5">
              <div className="space-y-2.5">
                {contact.displayPhone && (
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-slate-50 dark:bg-slate-800 flex items-center justify-center shrink-0">
                      <Phone size={14} className="text-slate-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] text-slate-400 uppercase tracking-wider">Phone</p>
                      <p className="text-sm text-slate-900 dark:text-slate-100 font-medium font-mono">{contact.displayPhone}</p>
                    </div>
                    <button onClick={() => navigator.clipboard.writeText(contact.displayPhone || '')}
                      className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors">
                      <Copy size={13} />
                    </button>
                  </div>
                )}
                {contact.email && (
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-slate-50 dark:bg-slate-800 flex items-center justify-center shrink-0">
                      <Mail size={14} className="text-slate-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] text-slate-400 uppercase tracking-wider">Email</p>
                      <p className="text-sm text-slate-900 dark:text-slate-100 font-medium truncate">{contact.email}</p>
                    </div>
                    <button onClick={() => navigator.clipboard.writeText(contact.email || '')}
                      className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors">
                      <Copy size={13} />
                    </button>
                  </div>
                )}
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-slate-50 dark:bg-slate-800 flex items-center justify-center shrink-0">
                    <Clock size={14} className="text-slate-400" />
                  </div>
                  <div>
                    <p className="text-[11px] text-slate-400 uppercase tracking-wider">Last Contact</p>
                    <p className="text-sm text-slate-900 dark:text-slate-100 font-medium">{formatRelativeTime(contact.last_contacted_at)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-slate-50 dark:bg-slate-800 flex items-center justify-center shrink-0">
                    <MessageSquare size={14} className="text-slate-400" />
                  </div>
                  <div>
                    <p className="text-[11px] text-slate-400 uppercase tracking-wider">Conversations</p>
                    <p className="text-sm text-slate-900 dark:text-slate-100 font-medium">{contact.conversation_count}</p>
                  </div>
                </div>
              </div>

              {/* Labels */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Labels</p>
                  <button onClick={() => setLabelMenuOpen(!labelMenuOpen)}
                    className="text-[11px] text-blue-500 hover:text-blue-700 flex items-center gap-1">
                    <Tag size={11} /> Manage
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {activeLabels.length === 0 && <span className="text-[12px] text-slate-400 italic">No labels</span>}
                  {activeLabels.map(l => {
                    const cfg = LABEL_OPTIONS.find(x => x.value === l)
                    return <span key={l} className={`px-2 py-0.5 rounded-full text-[11px] font-medium border ${cfg?.color || 'bg-slate-100 text-slate-600 border-slate-200'}`}>{cfg?.label || l}</span>
                  })}
                </div>
                {labelMenuOpen && (
                  <div className="mt-2 p-3 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 flex flex-wrap gap-1.5">
                    {LABEL_OPTIONS.map(l => (
                      <button key={l.value} onClick={() => toggleLabel(l.value)}
                        className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-all ${activeLabels.includes(l.value) ? l.color : 'bg-white dark:bg-slate-700 text-slate-500 border-slate-200 dark:border-slate-600 hover:bg-slate-100'}`}>
                        {activeLabels.includes(l.value) && <Check size={9} className="inline mr-1" />}
                        {l.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="space-y-2">
                {contact.latest_conversation_id && (
                  <button onClick={() => router.push(`/inbox?c=${contact.latest_conversation_id}`)}
                    className="w-full flex items-center justify-center gap-2 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-medium transition-colors">
                    <MessageSquare size={15} /> View Chat
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Timeline Tab */}
          {tab === 'timeline' && (
            <div className="p-5">
              {loadingTimeline ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 size={20} className="animate-spin text-slate-400" />
                </div>
              ) : timeline.length === 0 ? (
                <div className="text-center py-12 text-slate-400">
                  <MessageSquare size={32} className="mx-auto mb-2 text-slate-300" />
                  <p className="text-sm">No conversations yet</p>
                </div>
              ) : (
                <div className="relative">
                  <div className="absolute left-3.5 top-0 bottom-0 w-px bg-slate-200 dark:bg-slate-700" />
                  <div className="space-y-4">
                    {timeline.map((conv: any) => {
                      const type = Array.isArray(conv.channels) ? conv.channels[0]?.type : conv.channels?.type
                      const src = SOURCE_CONFIG[type] || SOURCE_CONFIG.manual
                      const msgs = (conv.messages || []).filter((m: any) => !m.is_internal).slice(0, 3)
                      return (
                        <div key={conv.id} className="relative pl-9">
                          <div className="absolute left-1.5 top-1.5 w-4 h-4 rounded-full border-2 border-white dark:border-slate-900 bg-slate-400" />
                          <div className="bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-3">
                            <div className="flex items-center justify-between mb-2">
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border ${src.bg}`}>
                                {src.label}
                              </span>
                              <div className="flex items-center gap-2">
                                {/* Status: blue for resolved, gray for open - no green/amber */}
                                <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${conv.status === 'resolved' ? 'bg-blue-50 text-blue-600 border border-blue-200' : 'bg-slate-100 text-slate-600 border border-slate-200'}`}>
                                  {conv.status}
                                </span>
                                <span className="text-[11px] text-slate-400">{formatRelativeTime(conv.last_message_at)}</span>
                              </div>
                            </div>
                            {msgs.length > 0 && (
                              <div className="space-y-1">
                                {msgs.map((m: any) => (
                                  <p key={m.id} className={`text-[12px] px-2 py-1 rounded-lg ${m.sender_type === 'agent' ? 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 text-right' : 'bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-300'}`}>
                                    {m.content_type === 'text' ? m.content : `[${m.content_type}]`}
                                  </p>
                                ))}
                              </div>
                            )}
                            <button onClick={() => router.push(`/inbox?c=${conv.id}`)}
                              className="mt-2 text-[11px] text-blue-500 hover:text-blue-700 flex items-center gap-1">
                              <ExternalLink size={10} /> Open in inbox
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Hostnin CRM Tab */}
          {tab === 'hostnin' && (
            <div className="p-5">
              {loadingHostnin ? (
                <div className="flex flex-col items-center justify-center py-12 gap-2">
                  <Loader2 size={20} className="animate-spin text-blue-500" />
                  <p className="text-sm text-slate-500">Looking up in Hostnin...</p>
                </div>
              ) : !hostnin || !hostnin.client ? (
                <div className="text-center py-12">
                  <Building2 size={32} className="mx-auto mb-2 text-slate-300" />
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100">Not a Hostnin client</p>
                  <p className="text-[12px] text-slate-400 mt-1">No matching account in WHMCS</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Client card - blue toned */}
                  <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{hostnin.client.firstname} {hostnin.client.lastname}</p>
                        <p className="text-[12px] text-blue-600 dark:text-blue-300">{hostnin.client.email}</p>
                        <p className="text-[12px] text-slate-400 mt-0.5">ID: #{hostnin.client.id}</p>
                      </div>
                      {/* Active = blue, inactive = slate - no green/red */}
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${hostnin.client.status === 'Active' ? 'bg-blue-100 text-blue-700 border-blue-200' : 'bg-slate-100 text-slate-600 border-slate-300'}`}>
                        {hostnin.client.status || 'Active'}
                      </span>
                    </div>
                  </div>

                  {/* Unpaid invoices - slate with blue accent, no red */}
                  {hostnin.invoices && hostnin.invoices.length > 0 && (
                    <div>
                      <p className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider mb-2 flex items-center gap-1">
                        <AlertTriangle size={10} className="text-slate-500" /> Unpaid Invoices ({hostnin.invoices.length})
                      </p>
                      <div className="space-y-1.5">
                        {hostnin.invoices.slice(0, 3).map((inv: any) => (
                          <div key={inv.id} className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                            <p className="text-[12px] font-medium text-slate-700">#{inv.id} - {inv.date}</p>
                            <span className="text-[12px] font-bold text-blue-700">{inv.currencyprefix}{inv.balance}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Services - slate rows, blue active badge */}
                  {hostnin.services?.products && hostnin.services.products.length > 0 && (
                    <div>
                      <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1">
                        <Building2 size={10} /> Services ({hostnin.services.products.length})
                      </p>
                      <div className="space-y-1.5">
                        {hostnin.services.products.slice(0, 4).map((p: any) => (
                          <div key={p.id} className="flex items-center justify-between bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2">
                            <div>
                              <p className="text-[12px] font-medium text-slate-700 dark:text-slate-300">{p.name}</p>
                              {p.domain && <p className="text-[11px] text-slate-400 font-mono">{p.domain}</p>}
                            </div>
                            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${p.status === 'Active' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                              {p.status}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* All paid - blue check, not green */}
                  {hostnin.invoices?.length === 0 && (
                    <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg">
                      <Check size={14} className="text-blue-600 shrink-0" />
                      <p className="text-[12px] text-blue-700 font-medium">All invoices paid</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Notes Tab */}
          {tab === 'notes' && (
            <div className="p-5 flex flex-col h-full gap-4">
              <div className="flex items-center gap-2">
                <StickyNote size={14} className="text-blue-500" />
                <p className="text-[12px] font-medium text-slate-600 dark:text-slate-400">Sticky notes - visible to all agents</p>
              </div>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Add notes about this contact..."
                className="flex-1 min-h-[200px] resize-none p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-slate-400"
              />
              <button onClick={saveNotes} disabled={savingNotes}
                className="py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                {savingNotes ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                {savingNotes ? 'Saving...' : 'Save Notes'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function DuplicatesModal({ onClose, onRefresh }: { onClose: () => void; onRefresh: () => void }) {
  const [groups, setGroups] = useState<any[][]>([])
  const [loading, setLoading] = useState(true)
  const [merging, setMerging] = useState<string | null>(null)

  useEffect(() => {
    detectDuplicateContacts().then(data => { setGroups(data); setLoading(false) })
  }, [])

  async function handleMerge(keepId: string, mergeId: string) {
    setMerging(mergeId)
    await mergeContacts(keepId, mergeId)
    setGroups(prev => prev.map(g => g.filter(c => c.id !== mergeId)).filter(g => g.length > 1))
    setMerging(null)
    onRefresh()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <GitMerge size={16} className="text-blue-500" /> Duplicate Contacts
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400"><X size={16} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="flex items-center justify-center py-12"><Loader2 size={20} className="animate-spin text-slate-400" /></div>
          ) : groups.length === 0 ? (
            <div className="text-center py-12">
              <Check size={32} className="mx-auto mb-2 text-blue-400" />
              <p className="text-sm font-medium text-slate-900 dark:text-slate-100">No duplicates found</p>
              <p className="text-[12px] text-slate-400 mt-1">All contacts have unique phone numbers</p>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-[12px] text-slate-500">Found {groups.length} duplicate group(s). Keep one and merge the rest.</p>
              {groups.map((group, gi) => (
                <div key={gi} className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
                  {group.map((contact, ci) => (
                    <div key={contact.id} className={`flex items-center justify-between px-4 py-3 ${ci < group.length - 1 ? 'border-b border-slate-100 dark:border-slate-800' : ''}`}>
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center text-blue-700 text-xs font-bold shrink-0">
                          {getInitials(contact.name)}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">{contact.name}</p>
                          <p className="text-[11px] text-slate-400 font-mono">{contact.phone}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {ci === 0 ? (
                          <span className="text-[10px] font-semibold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full">Keep</span>
                        ) : (
                          <button onClick={() => handleMerge(group[0].id, contact.id)} disabled={merging === contact.id}
                            className="flex items-center gap-1 text-[11px] text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 border border-blue-200 px-2.5 py-1 rounded-lg transition-colors disabled:opacity-50">
                            {merging === contact.id ? <Loader2 size={10} className="animate-spin" /> : <GitMerge size={10} />}
                            Merge in
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="px-6 py-3 border-t border-slate-100 dark:border-slate-800 shrink-0">
          <button onClick={onClose} className="w-full py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-50 transition-colors">Close</button>
        </div>
      </div>
    </div>
  )
}

// ─── Row Actions Menu ─────────────────────────────────────────────────────────

function RowActions({ contact, onDelete, onOpenDetail, onViewChat }: {
  contact: ContactRow
  onDelete: () => void
  onOpenDetail: () => void
  onViewChat: () => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(!open)}
        className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded opacity-0 group-hover:opacity-100 transition-all">
        <MoreHorizontal size={16} />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-44 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl z-30 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
          {contact.latest_conversation_id && (
            <button onClick={() => { onViewChat(); setOpen(false) }}
              className="w-full text-left flex items-center gap-2.5 px-3.5 py-2.5 text-[13px] text-slate-700 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:text-blue-700 transition-colors">
              <MessageSquare size={13} className="text-blue-500" /> View Chat
            </button>
          )}
          <button onClick={() => { onOpenDetail(); setOpen(false) }}
            className="w-full text-left flex items-center gap-2.5 px-3.5 py-2.5 text-[13px] text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
            <User size={13} /> View Profile
          </button>
          {(contact.displayPhone || contact.phone) && (
            <button onClick={() => { navigator.clipboard.writeText(contact.displayPhone || contact.phone || ''); setOpen(false) }}
              className="w-full text-left flex items-center gap-2.5 px-3.5 py-2.5 text-[13px] text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
              <Copy size={13} /> Copy Phone
            </button>
          )}
          <div className="border-t border-slate-100 dark:border-slate-700" />
          {/* Delete: slate styling, no red - consistent with mono palette */}
          <button onClick={() => { onDelete(); setOpen(false) }}
            className="w-full text-left flex items-center gap-2.5 px-3.5 py-2.5 text-[13px] text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
            <Trash2 size={13} /> Delete
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ContactsClient({ initialContacts, initialTotal }: {
  initialContacts: ContactRow[]
  initialTotal: number
}) {
  const router = useRouter()
  const { triggerDial } = useInboxStore()
  const [, startTransition] = useTransition()

  const [contacts, setContacts] = useState<ContactRow[]>(initialContacts)
  const [totalCount, setTotalCount] = useState(initialTotal)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [labelFilter, setLabelFilter] = useState('all')
  const [loading, setLoading] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const [showAdd, setShowAdd] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [showDuplicates, setShowDuplicates] = useState(false)
  const [detailContact, setDetailContact] = useState<ContactRow | null>(null)

  const searchDebounce = useRef<NodeJS.Timeout | null>(null)
  const pageSize = 100
  const totalPages = Math.ceil(totalCount / pageSize)

  const loadContacts = useCallback(async (p: number, q: string, lf: string) => {
    setLoading(true)
    const res = await getContacts(p, pageSize, q, lf)
    setContacts(res.contacts as ContactRow[])
    setTotalCount(res.totalCount)
    setSelectedIds(new Set())
    setLoading(false)
  }, [])

  function handleSearch(q: string) {
    setSearch(q)
    if (searchDebounce.current) clearTimeout(searchDebounce.current)
    searchDebounce.current = setTimeout(() => { setPage(1); loadContacts(1, q, labelFilter) }, 350)
  }

  function handleLabelFilter(lf: string) {
    setLabelFilter(lf)
    setPage(1)
    loadContacts(1, search, lf)
  }

  function handlePageChange(p: number) {
    setPage(p)
    loadContacts(p, search, labelFilter)
    window.scrollTo(0, 0)
  }

  async function handleExport() {
    const data = await getAllContactsForExport()
    const headers = ['Name', 'Phone', 'Email', 'Source', 'Labels', 'Created At']
    const rows = data.map((c: any) => [
      c.name || '', c.phone || '', c.email || '', c.platform_type || '',
      (c.labels || []).join('; '), new Date(c.created_at).toLocaleDateString()
    ])
    const csv = [headers, ...rows].map(r => r.map((v: string) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `contacts_${new Date().toISOString().slice(0, 10)}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this contact and their conversations?')) return
    await deleteContact(id)
    loadContacts(page, search, labelFilter)
  }

  async function handleBulkDelete() {
    if (selectedIds.size === 0) return
    if (!confirm(`Delete ${selectedIds.size} selected contacts and their conversations?`)) return
    await bulkDeleteContacts(Array.from(selectedIds))
    loadContacts(page, search, labelFilter)
  }

  function toggleSelect(id: string) {
    setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  function toggleSelectAll() {
    setSelectedIds(selectedIds.size === contacts.length ? new Set() : new Set(contacts.map(c => c.id)))
  }

  return (
    <div className="flex flex-col h-full w-full bg-white dark:bg-slate-900 overflow-hidden">

      {/* Header */}
      <div className="h-16 flex items-center justify-between px-6 border-b border-slate-200 dark:border-slate-800 shrink-0">
        <h1 className="text-xl font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
          Contacts
          <span className="text-sm font-normal text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full">{totalCount}</span>
        </h1>
        <div className="flex items-center gap-2">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
            {loading && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 animate-spin" size={14} />}
            <input type="text" value={search} onChange={e => handleSearch(e.target.value)} placeholder="Search contacts..."
              className="pl-9 pr-9 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm w-[220px] focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all dark:text-slate-200 focus:w-[280px]" />
          </div>

          {/* Label filter */}
          <select value={labelFilter} onChange={e => handleLabelFilter(e.target.value)}
            className="py-2 pl-3 pr-8 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none cursor-pointer">
            <option value="all">All Labels</option>
            {LABEL_OPTIONS.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
          </select>

          <button onClick={() => setShowDuplicates(true)} title="Find duplicates"
            className="p-2 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
            <GitMerge size={17} />
          </button>
          <button onClick={() => setShowImport(true)} title="Import CSV"
            className="p-2 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
            <Upload size={17} />
          </button>
          <button onClick={handleExport} title="Export CSV"
            className="p-2 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
            <Download size={17} />
          </button>
          <button onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm">
            <Plus size={15} /> Add Contact
          </button>
        </div>
      </div>

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="px-6 py-2 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-700 flex items-center gap-3 shrink-0">
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{selectedIds.size} selected</span>
          <button onClick={handleBulkDelete}
            className="flex items-center gap-1.5 text-sm text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-100 border border-slate-300 px-3 py-1.5 rounded-lg transition-colors font-medium">
            <Trash2 size={13} /> Delete selected
          </button>
          <button onClick={() => setSelectedIds(new Set())} className="text-sm text-slate-400 hover:text-slate-600 ml-auto">Clear</button>
        </div>
      )}

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-left border-collapse">
          <thead className="sticky top-0 z-10">
            <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-800/90 backdrop-blur-sm">
              <th className="py-3 px-4 w-10">
                <input type="checkbox" checked={selectedIds.size === contacts.length && contacts.length > 0} onChange={toggleSelectAll} className="rounded border-slate-300 cursor-pointer" />
              </th>
              <th className="py-3 px-4 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Contact</th>
              <th className="py-3 px-4 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Source</th>
              <th className="py-3 px-4 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Labels</th>
              <th className="py-3 px-4 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Chats</th>
              <th className="py-3 px-4 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Last Contact</th>
              <th className="py-3 px-4 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Created</th>
              <th className="py-3 px-4 text-[11px] font-semibold text-slate-500 uppercase tracking-wider text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {contacts.map(contact => {
              const src = SOURCE_CONFIG[contact.platform_type] || SOURCE_CONFIG.manual
              const isSelected = selectedIds.has(contact.id)
              return (
                <tr key={contact.id}
                  className={`group transition-colors cursor-pointer ${isSelected ? 'bg-blue-50/60 dark:bg-blue-900/10' : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'}`}
                  onClick={() => setDetailContact(contact)}>

                  <td className="py-3.5 px-4 w-10" onClick={e => { e.stopPropagation(); toggleSelect(contact.id) }}>
                    <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(contact.id)} className="rounded border-slate-300 cursor-pointer" />
                  </td>

                  <td className="py-3.5 px-4">
                    <div className="flex items-center gap-3">
                      <div className={`relative w-9 h-9 rounded-full flex items-center justify-center font-semibold text-sm shrink-0 ${isSelected ? 'bg-blue-200 dark:bg-blue-800 text-blue-800' : 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300'}`}>
                        {getInitials(contact.name)}
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="text-[13px] font-medium text-slate-900 dark:text-slate-100 truncate max-w-[180px]">{contact.name || 'No name'}</span>
                        {contact.displayPhone ? (
                          <div className="flex items-center gap-1.5">
                            <span className="text-[12px] text-slate-500 font-mono truncate">{contact.displayPhone}</span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                triggerDial(contact.phone || contact.platform_id)
                              }}
                              title="Call Contact"
                              className="p-1 text-slate-400 hover:text-blue-600 hover:bg-slate-50 dark:hover:bg-slate-800 rounded transition-colors shrink-0"
                            >
                              <Phone size={11} strokeWidth={2.5} />
                            </button>
                          </div>
                        ) : contact.email ? (
                          <span className="text-[12px] text-slate-400 truncate">{contact.email}</span>
                        ) : null}
                      </div>
                    </div>
                  </td>

                  <td className="py-3.5 px-4">
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-medium border ${src.bg}`}>
                      {src.label}
                    </span>
                  </td>

                  <td className="py-3.5 px-4">
                    <div className="flex flex-wrap gap-1 max-w-[160px]">
                      {(contact.labels || []).slice(0, 2).map(l => {
                        const cfg = LABEL_OPTIONS.find(x => x.value === l)
                        return <span key={l} className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium border ${cfg?.color || 'bg-slate-100 text-slate-500 border-slate-200'}`}>{cfg?.label || l}</span>
                      })}
                      {(contact.labels || []).length > 2 && (
                        <span className="px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-500 border border-slate-200">+{contact.labels.length - 2}</span>
                      )}
                    </div>
                  </td>

                  <td className="py-3.5 px-4">
                    <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-slate-500">
                      <MessageSquare size={13} className="text-slate-400" />
                      {contact.conversation_count}
                    </span>
                  </td>

                  <td className="py-3.5 px-4">
                    <span className="text-[12px] text-slate-400">
                      {formatRelativeTime(contact.last_contacted_at)}
                    </span>
                  </td>

                  <td className="py-3.5 px-4">
                    <span className="text-[12px] text-slate-400">{new Date(contact.created_at).toLocaleDateString()}</span>
                  </td>

                  <td className="py-3.5 px-4 text-right" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1">
                      {contact.displayPhone && (
                        <button onClick={() => triggerDial(contact.phone || contact.platform_id)} title="Call via Dialer"
                          className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded opacity-0 group-hover:opacity-100 transition-all">
                          <PhoneCall size={15} />
                        </button>
                      )}
                      {contact.latest_conversation_id && (
                        <button onClick={() => router.push(`/inbox?c=${contact.latest_conversation_id}`)} title="View Chat"
                          className="p-1.5 text-blue-500 hover:text-blue-700 hover:bg-blue-50 rounded opacity-0 group-hover:opacity-100 transition-all">
                          <MessageSquare size={15} />
                        </button>
                      )}
                      <RowActions
                        contact={contact}
                        onDelete={() => handleDelete(contact.id)}
                        onOpenDetail={() => setDetailContact(contact)}
                        onViewChat={() => contact.latest_conversation_id && router.push(`/inbox?c=${contact.latest_conversation_id}`)}
                      />
                    </div>
                  </td>
                </tr>
              )
            })}

            {contacts.length === 0 && !loading && (
              <tr>
                <td colSpan={9} className="py-16 text-center text-slate-500">
                  <User className="w-10 h-10 mx-auto text-slate-300 mb-3" />
                  <p className="text-[15px] font-medium text-slate-900 dark:text-slate-100">No contacts found</p>
                  <p className="text-[13px] mt-1 text-slate-400">
                    {search ? `No results for "${search}"` : 'Contacts will appear here once they message you.'}
                  </p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="px-6 py-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0">
        <p className="text-[13px] text-slate-500">
          Showing {Math.min((page - 1) * pageSize + 1, totalCount)}-{Math.min(page * pageSize, totalCount)} of {totalCount} contacts
        </p>
        {totalPages > 1 && (
          <div className="flex items-center gap-1.5">
            <button onClick={() => handlePageChange(page - 1)} disabled={page === 1}
              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              <ChevronLeft size={16} />
            </button>
            <span className="text-[13px] text-slate-500 px-2">Page {page} of {totalPages}</span>
            <button onClick={() => handlePageChange(page + 1)} disabled={page === totalPages}
              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              <ChevronRight size={16} />
            </button>
          </div>
        )}
      </div>

      {/* Modals */}
      {showAdd && <AddContactModal onClose={() => setShowAdd(false)} onSuccess={() => loadContacts(page, search, labelFilter)} />}
      {showImport && <ImportModal onClose={() => setShowImport(false)} onSuccess={() => loadContacts(page, search, labelFilter)} />}
      {showDuplicates && <DuplicatesModal onClose={() => setShowDuplicates(false)} onRefresh={() => loadContacts(page, search, labelFilter)} />}
      {detailContact && (
        <ContactDetailDrawer
          contact={detailContact}
          onClose={() => setDetailContact(null)}
          onRefresh={() => { loadContacts(page, search, labelFilter); setDetailContact(null) }}
        />
      )}
    </div>
  )
}
