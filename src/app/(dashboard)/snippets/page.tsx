"use client"

import { useState, useEffect } from "react"
import { useAuth } from "@/lib/auth-context"
import { getCannedReplies, createCannedReply, updateCannedReply, deleteCannedReply } from "@/actions/snippets"
import { 
  Plus, 
  Search, 
  Trash2, 
  Edit2, 
  X, 
  Library, 
  Loader2, 
  MessageSquare, 
  Sparkles, 
  CreditCard, 
  Terminal, 
  AlertOctagon 
} from "lucide-react"

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
  const [semanticQuestion, setSemanticQuestion] = useState("")
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

  // Helper to map DB categories to curated Hostnin categories dynamically
  const getStandardCategory = (cat: string): string => {
    const c = (cat || "general").toLowerCase().trim()
    if (["sales", "ads", "adsen", "adspend", "adrun", "marketing", "promo", "discount", "domain", "freedomain"].some(k => c.includes(k))) return "sales"
    if (["billing", "invoice", "bkash", "bank-transfer", "payment", "refund", "bkash/nagad", "bkash-personal"].some(k => c.includes(k))) return "billing"
    if (["ssl", "activessl", "addon", "cpanel", "nameserver", "dns", "technical", "migration", "email", "server", "ip", "whm"].some(k => c.includes(k))) return "tech"
    if (["abuse", "suspension", "suspended", "terms", "spam"].some(k => c.includes(k))) return "abuse"
    return "general"
  }

  // Apple-style premium minimalist grey-scale palette tokens
  const categoryMetadata: { [key: string]: { label: string, color: string, border: string, bg: string } } = {
    general: { label: "General", color: "text-slate-600 dark:text-slate-400", border: "border-slate-200 dark:border-[#2a3942]", bg: "bg-slate-50 dark:bg-[#182229]" },
    sales: { label: "Sales & Promos", color: "text-slate-600 dark:text-slate-400", border: "border-slate-200 dark:border-[#2a3942]", bg: "bg-slate-50 dark:bg-[#182229]" },
    billing: { label: "Billing & bkash", color: "text-slate-600 dark:text-slate-400", border: "border-slate-200 dark:border-[#2a3942]", bg: "bg-slate-50 dark:bg-[#182229]" },
    tech: { label: "Technical", color: "text-slate-600 dark:text-slate-400", border: "border-slate-200 dark:border-[#2a3942]", bg: "bg-slate-50 dark:bg-[#182229]" },
    abuse: { label: "Abuse & Terms", color: "text-slate-600 dark:text-slate-400", border: "border-slate-200 dark:border-[#2a3942]", bg: "bg-slate-50 dark:bg-[#182229]" },
  }

  const categories = [
    { id: "all", label: "All Templates", icon: Library },
    { id: "general", label: "General & Help", icon: MessageSquare },
    { id: "sales", label: "Sales & Promos", icon: Sparkles },
    { id: "billing", label: "Billing & bkash", icon: CreditCard },
    { id: "tech", label: "Technical Support", icon: Terminal },
    { id: "abuse", label: "Abuse & Terms", icon: AlertOctagon },
  ]

  const getCategoryCount = (catId: string) => {
    if (catId === "all") return snippets.length
    return snippets.filter(s => getStandardCategory(s.category) === catId).length
  }

  const filteredSnippets = snippets.filter(s => {
    const shortcut = s.shortcut || ""
    const content = s.content || ""
    const matchesSearch = shortcut.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          content.toLowerCase().includes(searchQuery.toLowerCase())
    const snippetCategory = getStandardCategory(s.category)
    const matchesCategory = selectedCategory === "all" || snippetCategory === selectedCategory
    return matchesSearch && matchesCategory
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user?.org_id || !shortcut || !content) return
    
    setFormError("")
    setIsSubmitting(true)
    try {
      if (editingSnippet) {
        const updated = await updateCannedReply(editingSnippet.id, shortcut, content, category, semanticQuestion)
        setSnippets(prev => prev.map(s => s.id === editingSnippet.id ? updated : s))
      } else {
        const created = await createCannedReply(user.org_id, shortcut, content, category, semanticQuestion)
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
    setSemanticQuestion("")
    setEditingSnippet(null)
    setFormError("")
    setShowAddModal(true)
  }

  const openEditModal = (snippet: any) => {
    setShortcut(snippet.shortcut)
    setContent(snippet.content)
    setCategory(snippet.category || "general")
    setSemanticQuestion(snippet.semantic_question || "")
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
    setSemanticQuestion("")
    setFormError("")
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-[#f8fafc] dark:bg-[#0b141a] pb-16 md:pb-0">
      {/* Header */}
      <div className="flex items-center justify-between p-6 bg-white dark:bg-[#111b21] border-b border-slate-200/60 dark:border-[#222e35]">
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

      {/* Dual Panel Body Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar Pane: Categories */}
        <aside className="w-[260px] bg-white dark:bg-[#111b21] border-r border-slate-200/60 dark:border-[#222e35] flex flex-col p-4 shrink-0 overflow-y-auto custom-scrollbar">
          <div className="mb-3 px-2">
            <span className="text-[11px] font-bold text-slate-400 dark:text-[#8696a0] tracking-wider uppercase">Departments</span>
          </div>

          <nav className="space-y-1">
            {categories.map(cat => {
              const Icon = cat.icon
              const count = getCategoryCount(cat.id)
              const isSelected = selectedCategory === cat.id

              return (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-[13px] font-medium transition-all ${
                    isSelected 
                      ? 'bg-slate-100 text-slate-900 dark:bg-slate-800/60 dark:text-slate-100 font-semibold shadow-sm border-l-2 border-[#0070f3] pl-2.5 rounded-l-none' 
                      : 'text-slate-600 dark:text-[#8696a0] hover:bg-slate-50/60 dark:hover:bg-[#202c33]/50 hover:text-slate-900 dark:hover:text-[#e9edef]'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Icon size={16} className={isSelected ? 'text-slate-900 dark:text-white' : 'text-slate-400 dark:text-[#8696a0]'} />
                    <span>{cat.label}</span>
                  </div>
                  <span className={`text-[11px] px-2 py-0.5 rounded-full ${
                    isSelected
                      ? 'bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-200 font-bold'
                      : 'bg-slate-100 text-slate-500 dark:bg-[#202c33] dark:text-[#8696a0]'
                  }`}>
                    {count}
                  </span>
                </button>
              )
            })}
          </nav>
        </aside>

        {/* Right Main Grid Area */}
        <main className="flex-1 flex flex-col overflow-hidden">
          {/* Toolbar */}
          <div className="p-6 pb-4 bg-white/40 dark:bg-transparent border-b border-slate-100 dark:border-[#222e35] flex items-center justify-between">
            {/* Search */}
            <div className="relative w-full max-w-md">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <Search size={15} />
              </div>
              <input
                type="text"
                className="block w-full pl-9 pr-3 py-2 border border-slate-200 dark:border-[#2a3942] rounded-xl text-[13px] text-slate-900 dark:text-[#d1d7db] placeholder-slate-400 dark:placeholder-[#8696a0] focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white dark:bg-[#202c33] transition-all"
                placeholder="Search shortcut or reply content..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <div className="text-[12px] text-slate-400 dark:text-[#8696a0] font-medium">
              Showing {filteredSnippets.length} of {snippets.length} templates
            </div>
          </div>

          {/* Grid Container */}
          <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
            {loading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {[1, 2, 3, 4, 5, 6].map(i => (
                  <div key={i} className="h-44 bg-white dark:bg-[#111b21] rounded-2xl border border-slate-200/60 dark:border-[#222e35] animate-pulse" />
                ))}
              </div>
            ) : filteredSnippets.length === 0 ? (
              <div className="text-center py-20 bg-white dark:bg-[#111b21] border border-slate-200/60 dark:border-[#222e35] rounded-2xl">
                <div className="w-14 h-14 bg-slate-50 dark:bg-[#182229] border border-slate-200 dark:border-[#2a3942] rounded-full flex items-center justify-center mx-auto mb-4 text-slate-400">
                  <Library size={22} />
                </div>
                <h3 className="text-sm font-bold text-slate-700 dark:text-[#e9edef]">No snippets found</h3>
                <p className="text-xs text-slate-500 dark:text-[#8696a0] mt-1">
                  {searchQuery ? "Try adjusting your search terms." : "Create your first canned reply snippet to start typing /shortcut."}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {filteredSnippets.map(snippet => {
                  const stdCat = getStandardCategory(snippet.category)
                  const meta = categoryMetadata[stdCat] || categoryMetadata.general

                  return (
                    <div 
                      key={snippet.id}
                      className="bg-white dark:bg-[#111b21] rounded-2xl border border-slate-200/60 dark:border-[#222e35] p-5 shadow-sm hover:shadow-md hover:border-slate-300 dark:hover:border-slate-700 transition-all flex flex-col justify-between group relative overflow-hidden"
                    >
                      <div className="space-y-3">
                        {/* Top Row: Shortcut & Curated Category */}
                        <div className="flex justify-between items-start gap-2">
                          <span className="text-[12px] font-semibold text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-[#1c272f] border border-slate-200/60 dark:border-[#2a3942]/60 px-2.5 py-0.5 rounded-lg font-mono">
                            {snippet.shortcut}
                          </span>
                          <div className="flex flex-col items-end gap-1 shrink-0">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${meta.color} ${meta.border} ${meta.bg}`}>
                              {meta.label}
                            </span>
                            {snippet.category && snippet.category !== stdCat && (
                              <span className="text-[10px] font-medium text-slate-400 dark:text-[#8696a0] px-1 bg-slate-50 dark:bg-[#182229] border border-slate-100 dark:border-[#2a3942] rounded">
                                {snippet.category}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Content Preview */}
                        <p className="text-[13px] text-slate-600 dark:text-[#d1d7db] leading-relaxed line-clamp-5 whitespace-pre-wrap">
                          {snippet.content}
                        </p>
                        {snippet.semantic_question && (
                          <div className="mt-2 pt-2 border-t border-slate-100 dark:border-[#2a3942] flex items-start gap-1.5">
                             <Search size={12} className="text-[#0070f3]/70 mt-0.5 shrink-0" />
                             <p className="text-xs text-slate-400 dark:text-slate-500 line-clamp-2">
                               {snippet.semantic_question}
                             </p>
                          </div>
                        )}
                      </div>

                      {/* Actions Row */}
                      <div className="flex justify-end items-center gap-2 mt-5 pt-3 border-t border-slate-100 dark:border-[#222e35]">
                        <button
                          onClick={() => openEditModal(snippet)}
                          className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 rounded-lg hover:bg-slate-50 dark:hover:bg-[#182229] transition-colors"
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
                  )
                })}
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Add / Edit Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 dark:bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-[#111b21] rounded-3xl border border-slate-200/60 dark:border-[#222e35] shadow-2xl w-full max-w-lg overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
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

              {/* Category Dropdown */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 dark:text-[#8696a0] uppercase">Category Department</label>
                <select
                  required
                  className="block w-full px-3.5 py-2.5 border border-slate-200 dark:border-[#2a3942] rounded-xl text-[13px] text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500 bg-slate-50 dark:bg-[#202c33]"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  <option value="general">General & Help</option>
                  <option value="sales">Sales & Promos</option>
                  <option value="billing">Billing & bkash</option>
                  <option value="tech">Technical Support</option>
                  <option value="abuse">Abuse & Terms</option>
                </select>
              </div>

              {/* Semantic Question Input */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 dark:text-[#8696a0] uppercase flex items-center gap-1.5">
                  Semantic Question <span className="text-[10px] bg-[#0070f3]/10 text-[#0070f3] px-1.5 py-0.5 rounded">AI Vector Search</span>
                </label>
                <input
                  type="text"
                  className="block w-full px-3.5 py-2 border border-slate-200 dark:border-[#2a3942] rounded-xl text-[13px] text-slate-900 dark:text-[#d1d7db] placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-slate-50 dark:bg-[#202c33]"
                  placeholder="e.g., How do I manage DNS?"
                  value={semanticQuestion}
                  onChange={(e) => setSemanticQuestion(e.target.value)}
                />
              </div>

              {/* Content Input */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 dark:text-[#8696a0] uppercase">Canned Template Response</label>
                <textarea
                  required
                  rows={6}
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
