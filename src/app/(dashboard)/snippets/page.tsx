"use client"

import { useState, useEffect } from "react"
import { useAuth } from "@/lib/auth-context"
import { getCannedReplies, createCannedReply, updateCannedReply, deleteCannedReply } from "@/actions/snippets"
import { Plus, Search, Trash2, Edit2, X, Library, Loader2, CheckCircle2 } from "lucide-react"

export default function SnippetsPage() {
  const user = useAuth()
  const [snippets, setSnippets] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedCategory, setSelectedCategory] = useState<string>("all")
  
  // Modal states
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingSnippet, setEditingSnippet] = useState<any | null>(null)
  
  // Form states
  const [shortcut, setShortcut] = useState("")
  const [content, setContent] = useState("")
  const [category, setCategory] = useState("general")
  const [formError, setFormError] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    async function loadSnippets() {
      if (!user?.org_id) return
      setLoading(true)
      try {
        const data = await getCannedReplies(user.org_id)
        setSnippets(data)
      } catch (e) {
        console.error(e)
      } finally {
        setLoading(false)
      }
    }
    loadSnippets()
  }, [user?.org_id])

  const categories = ["all", ...Array.from(new Set(snippets.map(s => s.category || "general")))]

  const filteredSnippets = snippets.filter(s => {
    const matchesSearch = s.shortcut.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          s.content.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesCategory = selectedCategory === "all" || s.category === selectedCategory
    return matchesSearch && matchesCategory
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user?.org_id || !shortcut || !content) return
    
    setFormError("")
    setIsSubmitting(true)
    try {
      if (editingSnippet) {
        const updated = await updateCannedReply(editingSnippet.id, shortcut, content, category)
        setSnippets(prev => prev.map(s => s.id === editingSnippet.id ? updated : s))
      } else {
        const created = await createCannedReply(user.org_id, shortcut, content, category)
        setSnippets(prev => [created, ...prev])
      }
      closeModal()
    } catch (err: any) {
      setFormError(err.message || "Failed to save snippet. Shortcut must be unique.")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this reply snippet?")) return
    try {
      await deleteCannedReply(id)
      setSnippets(prev => prev.filter(s => s.id !== id))
    } catch (e) {
      alert("Failed to delete snippet")
    }
  }

  const openAddModal = () => {
    setShortcut("")
    setContent("")
    setCategory("general")
    setEditingSnippet(null)
    setFormError("")
    setShowAddModal(true)
  }

  const openEditModal = (snippet: any) => {
    setShortcut(snippet.shortcut)
    setContent(snippet.content)
    setCategory(snippet.category || "general")
    setEditingSnippet(snippet)
    setFormError("")
    setShowAddModal(true)
  }

  const closeModal = () => {
    setShowAddModal(false)
    setEditingSnippet(null)
    setShortcut("")
    setContent("")
    setCategory("general")
    setFormError("")
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-[#f8fafc] dark:bg-[#0b141a]">
      {/* Header */}
      <div className="flex items-center justify-between p-6 bg-white dark:bg-[#111b21] border-b border-slate-200 dark:border-[#222e35]">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-[#e9edef]">Canned Snippets</h1>
          <p className="text-sm text-slate-500 dark:text-[#8696a0]">Manage quick support templates and keyboard shortcuts</p>
        </div>
        
        <button 
          onClick={openAddModal}
          className="flex items-center gap-1.5 px-4 py-2 bg-[#0070f3] text-white rounded-xl text-[13px] font-semibold hover:bg-blue-600 transition-colors shadow-sm active:scale-95 duration-150"
        >
          <Plus size={16} /> New Snippet
        </button>
      </div>

      {/* Toolbar & Filters */}
      <div className="p-6 pb-3 flex flex-col md:flex-row gap-4 justify-between items-center bg-white/50 dark:bg-transparent">
        {/* Search */}
        <div className="relative w-full md:w-80">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
            <Search size={15} />
          </div>
          <input
            type="text"
            className="block w-full pl-9 pr-3 py-2 border border-slate-200 dark:border-[#2a3942] rounded-xl text-[13px] text-slate-900 dark:text-[#d1d7db] placeholder-slate-400 dark:placeholder-[#8696a0] focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white dark:bg-[#202c33] transition-all"
            placeholder="Search shortcut or content..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {/* Category Filter */}
        <div className="flex gap-2 overflow-x-auto w-full md:w-auto pb-1 md:pb-0">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3.5 py-1.5 rounded-full text-[12px] font-semibold border capitalize transition-all shrink-0 ${
                selectedCategory === cat
                  ? 'bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-900/30 dark:border-blue-800 dark:text-blue-400'
                  : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50 dark:bg-[#111b21] dark:border-[#2a3942] dark:text-[#8696a0]'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Grid Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
        <div className="w-full max-w-[1300px] mx-auto">
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {[1, 2, 3, 4, 5, 6].map(i => (
                <div key={i} className="h-44 bg-white dark:bg-[#111b21] rounded-2xl border border-slate-200 dark:border-[#222e35] animate-pulse" />
              ))}
            </div>
          ) : filteredSnippets.length === 0 ? (
            <div className="text-center py-20 bg-white dark:bg-[#111b21] border border-slate-200 dark:border-[#222e35] rounded-2xl">
              <div className="w-14 h-14 bg-slate-50 dark:bg-[#182229] border border-slate-200 dark:border-[#2a3942] rounded-full flex items-center justify-center mx-auto mb-4 text-slate-400">
                <Library size={22} />
              </div>
              <h3 className="text-sm font-bold text-slate-700 dark:text-[#e9edef]">No snippets found</h3>
              <p className="text-xs text-slate-500 dark:text-[#8696a0] mt-1">Create your first canned reply template to streamline support.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {filteredSnippets.map(snippet => (
                <div 
                  key={snippet.id}
                  className="bg-white dark:bg-[#111b21] rounded-2xl border border-slate-200 dark:border-[#222e35] p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between group relative overflow-hidden"
                >
                  <div className="space-y-3">
                    {/* Top Row: Shortcut & Category */}
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/20 px-2.5 py-1 rounded-lg">
                        {snippet.shortcut}
                      </span>
                      <span className="text-[11px] font-semibold text-slate-400 dark:text-[#8696a0] bg-slate-50 dark:bg-[#182229] border border-slate-100 dark:border-[#2a3942] px-2 py-0.5 rounded capitalize">
                        {snippet.category || "general"}
                      </span>
                    </div>

                    {/* Content Preview */}
                    <p className="text-[13px] text-slate-600 dark:text-[#d1d7db] leading-relaxed line-clamp-4 whitespace-pre-wrap">
                      {snippet.content}
                    </p>
                  </div>

                  {/* Actions Row */}
                  <div className="flex justify-end items-center gap-2 mt-5 pt-3 border-t border-slate-100 dark:border-[#222e35]">
                    <button
                      onClick={() => openEditModal(snippet)}
                      className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded-lg hover:bg-slate-50 dark:hover:bg-[#182229] transition-colors"
                      title="Edit"
                    >
                      <Edit2 size={14} />
                    </button>
                    <button
                      onClick={() => handleDelete(snippet.id)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/20 transition-colors"
                      title="Delete"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Add / Edit Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 dark:bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-[#111b21] rounded-3xl border border-slate-200 dark:border-[#222e35] shadow-2xl w-full max-w-lg overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-100 dark:border-[#222e35] flex items-center justify-between">
              <h3 className="font-bold text-slate-800 dark:text-[#e9edef]">
                {editingSnippet ? "Edit Canned Snippet" : "Add Canned Snippet"}
              </h3>
              <button 
                onClick={closeModal}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-[#d1d7db] p-1 rounded-full hover:bg-slate-50 dark:hover:bg-[#202c33]"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              {formError && (
                <div className="p-3 bg-rose-50/50 dark:bg-rose-950/10 border border-rose-100 dark:border-rose-900/20 rounded-xl text-xs font-semibold text-rose-600 dark:text-rose-400">
                  {formError}
                </div>
              )}

              {/* Shortcut Input */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 dark:text-[#8696a0] uppercase">Shortcut Command</label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400 dark:text-[#8696a0] font-bold text-[14px]">/</span>
                  <input
                    type="text"
                    required
                    className="block w-full pl-7 pr-3 py-2 border border-slate-200 dark:border-[#2a3942] rounded-xl text-[13px] text-slate-900 dark:text-[#d1d7db] placeholder-slate-400 dark:placeholder-[#8696a0] focus:outline-none focus:ring-1 focus:ring-blue-500 bg-slate-50 dark:bg-[#202c33]"
                    placeholder="dns-details"
                    value={shortcut.startsWith("/") ? shortcut.substring(1) : shortcut}
                    onChange={(e) => setShortcut(e.target.value.replace(/[^a-zA-Z0-9-_]/g, ""))} // alphanumeric and dashes only
                  />
                </div>
                <p className="text-[10px] text-slate-400">Short trigger code used in chat composer (e.g. typing <code className="font-mono bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded">/dns</code>).</p>
              </div>

              {/* Category Input */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 dark:text-[#8696a0] uppercase">Category</label>
                <input
                  type="text"
                  required
                  className="block w-full px-3.5 py-2 border border-slate-200 dark:border-[#2a3942] rounded-xl text-[13px] text-slate-900 dark:text-[#d1d7db] placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-slate-50 dark:bg-[#202c33]"
                  placeholder="general, billing, technical..."
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                />
              </div>

              {/* Content Input */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 dark:text-[#8696a0] uppercase">Canned Template Response</label>
                <textarea
                  required
                  rows={5}
                  className="block w-full px-3.5 py-2 border border-slate-200 dark:border-[#2a3942] rounded-xl text-[13px] text-slate-900 dark:text-[#d1d7db] placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-slate-50 dark:bg-[#202c33] resize-none"
                  placeholder="Enter standard template reply..."
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                />
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100 dark:border-[#222e35]">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 border border-slate-200 dark:border-[#2a3942] text-slate-600 dark:text-[#d1d7db] rounded-xl text-[13px] font-semibold hover:bg-slate-50 dark:hover:bg-[#202c33]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex items-center gap-1.5 px-4 py-2 bg-[#0070f3] text-white rounded-xl text-[13px] font-semibold hover:bg-blue-600 transition-colors shadow-sm disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 size={14} className="animate-spin" /> Saving...
                    </>
                  ) : (
                    "Save Snippet"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
