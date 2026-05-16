"use client"

import { useState, useEffect } from "react"
import { Zap, Plus, Search, Trash2, Edit2, Loader2, Save, X } from "lucide-react"
import { supabase } from "@/lib/supabase"

const ORG_ID = "ec2f8436-05dc-4621-8a7f-57202f865b8e" // MVP Hardcoded

type QuickReply = {
  id: string;
  shortcut: string;
  message: string;
}

export default function QuickRepliesSettingsPage() {
  const [replies, setReplies] = useState<QuickReply[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")

  // DB Record ID for the quick replies json
  const [recordId, setRecordId] = useState<string | null>(null)

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [shortcutInput, setShortcutInput] = useState("")
  const [messageInput, setMessageInput] = useState("")
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    fetchReplies()
  }, [])

  const fetchReplies = async () => {
    setIsLoading(true)
    const { data } = await supabase
      .from('channels') // Reusing channels table for MVP settings storage
      .select('id, config')
      .eq('org_id', ORG_ID)
      .eq('type', 'settings_quick_replies')
      .single()
    
    if (data && data.config?.items) {
      setReplies(data.config.items)
      setRecordId(data.id)
    } else if (data) {
      setRecordId(data.id)
      setReplies([])
    }
    setIsLoading(false)
  }

  const handleOpenModal = (reply?: QuickReply) => {
    if (reply) {
      setEditingId(reply.id)
      setShortcutInput(reply.shortcut)
      setMessageInput(reply.message)
    } else {
      setEditingId(null)
      setShortcutInput("")
      setMessageInput("")
    }
    setIsModalOpen(true)
  }

  const handleSave = async () => {
    if (!shortcutInput || !messageInput) return
    setIsSaving(true)

    let updatedReplies = [...replies]

    if (editingId) {
      updatedReplies = updatedReplies.map(r => 
        r.id === editingId ? { ...r, shortcut: shortcutInput, message: messageInput } : r
      )
    } else {
      updatedReplies.push({
        id: Math.random().toString(36).substr(2, 9),
        shortcut: shortcutInput,
        message: messageInput
      })
    }

    if (recordId) {
      await supabase
        .from('channels')
        .update({ config: { items: updatedReplies } })
        .eq('id', recordId)
    } else {
      const { data } = await supabase
        .from('channels')
        .insert({
          org_id: ORG_ID,
          type: 'settings_quick_replies',
          config: { items: updatedReplies }
        })
        .select('id')
        .single()
      
      if (data) setRecordId(data.id)
    }

    setReplies(updatedReplies)
    setIsSaving(false)
    setIsModalOpen(false)
  }

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this quick reply?")) return
    
    const updatedReplies = replies.filter(r => r.id !== id)
    
    if (recordId) {
      await supabase
        .from('channels')
        .update({ config: { items: updatedReplies } })
        .eq('id', recordId)
    }

    setReplies(updatedReplies)
  }

  const filteredReplies = replies.filter(r => 
    r.shortcut.toLowerCase().includes(searchQuery.toLowerCase()) || 
    r.message.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div className="space-y-6 relative animate-in fade-in duration-300">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            <Zap className="text-amber-500 fill-amber-500" /> Quick Replies
          </h1>
          <p className="text-sm text-slate-500 mt-1">Create predefined responses to answer common questions faster.</p>
        </div>
        <button 
          onClick={() => handleOpenModal()}
          className="flex items-center gap-2 bg-[#0070f3] hover:bg-blue-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors shadow-sm"
        >
          <Plus size={16} /> New Reply
        </button>
      </div>

      <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm overflow-hidden flex flex-col min-h-[400px]">
        {/* Search Bar */}
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input 
              type="text" 
              placeholder="Search shortcuts or messages..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0070f3]/20 focus:border-[#0070f3] transition-all"
            />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-auto">
          {isLoading ? (
            <div className="flex justify-center items-center h-full min-h-[300px]">
              <Loader2 className="animate-spin text-slate-400" />
            </div>
          ) : filteredReplies.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full min-h-[300px] text-center p-8">
              <div className="w-16 h-16 bg-slate-100 dark:bg-slate-900 rounded-full flex items-center justify-center mb-4">
                <Zap className="text-slate-400" size={32} />
              </div>
              <h3 className="text-lg font-medium text-slate-900 dark:text-white mb-1">No quick replies found</h3>
              <p className="text-slate-500 text-sm max-w-sm mb-6">
                {searchQuery ? "Try adjusting your search terms." : "Create your first quick reply to help your team answer faster."}
              </p>
              {!searchQuery && (
                <button 
                  onClick={() => handleOpenModal()}
                  className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 text-slate-700 dark:text-slate-300 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                >
                  Create Quick Reply
                </button>
              )}
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800/50">
              {filteredReplies.map((reply) => (
                <div key={reply.id} className="p-4 hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-colors flex items-start justify-between gap-4 group">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="inline-flex items-center text-xs font-mono font-semibold text-[#0070f3] bg-blue-50 dark:bg-blue-900/20 px-2 py-0.5 rounded border border-blue-100 dark:border-blue-900/50">
                        /{reply.shortcut}
                      </span>
                    </div>
                    <p className="text-sm text-slate-600 dark:text-slate-400 line-clamp-2">
                      {reply.message}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <button 
                      onClick={() => handleOpenModal(reply)}
                      className="p-1.5 text-slate-400 hover:text-[#0070f3] hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-md transition-colors"
                    >
                      <Edit2 size={16} />
                    </button>
                    <button 
                      onClick={() => handleDelete(reply.id)}
                      className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Editor Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center p-4 border-b border-slate-100 dark:border-slate-800">
              <h3 className="font-semibold text-lg text-slate-900 dark:text-white">
                {editingId ? "Edit Quick Reply" : "New Quick Reply"}
              </h3>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 space-y-5">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Shortcut
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-mono font-medium">/</span>
                  <input 
                    type="text" 
                    value={shortcutInput}
                    onChange={(e) => setShortcutInput(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ''))}
                    placeholder="greeting"
                    className="w-full pl-7 pr-4 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-sm text-slate-900 dark:text-white font-mono focus:outline-none focus:ring-2 focus:ring-[#0070f3]/20 focus:border-[#0070f3] transition-all"
                  />
                </div>
                <p className="text-[11px] text-slate-500 mt-1.5">
                  Only letters, numbers, dashes, and underscores. No spaces.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Message Content
                </label>
                <textarea 
                  value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                  placeholder="Hello! How can I help you today?"
                  rows={5}
                  className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#0070f3]/20 focus:border-[#0070f3] transition-all resize-none"
                />
              </div>
            </div>

            <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 flex justify-end gap-3">
              <button 
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-sm font-medium transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={handleSave}
                disabled={isSaving || !shortcutInput || !messageInput}
                className="flex items-center gap-2 px-6 py-2 bg-[#0070f3] hover:bg-blue-600 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 shadow-sm"
              >
                {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
