import { BookOpen, Globe, FileText, FileUp, Plus, Database, Sparkles, Trash2, Edit2 } from "lucide-react"
import { createClient } from "@/lib/supabase/server"

export default async function KnowledgeBaseSettingsPage() {
  const supabase = await createClient();
  
  // Fetch knowledge base stats
  const { count, data } = await supabase
    .from('ai_knowledge_base')
    .select('id, question, answer, created_at, is_active', { count: 'exact' })
    .order('created_at', { ascending: false });
    
  const facts = data || [];
  
  // Calculate total characters trained
  const trainedChars = facts.reduce((acc, curr) => acc + curr.question.length + curr.answer.length, 0);

  return (
    <div className="space-y-6 relative animate-in fade-in duration-300">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            <BookOpen className="text-indigo-500 fill-indigo-500/20" /> Knowledge Base
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Provide context for your AI Assistants to answer customer queries automatically.
          </p>
        </div>
        <button 
          className="flex items-center gap-2 bg-[#0070f3] hover:bg-blue-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors shadow-sm"
        >
          <Plus size={16} /> Add Data Source
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm">
          <div className="flex items-center gap-3 text-slate-500 dark:text-slate-400 mb-2">
            <Database size={16} />
            <h3 className="text-sm font-medium">Total Sources</h3>
          </div>
          <p className="text-2xl font-semibold text-slate-900 dark:text-white">{count || 0}</p>
        </div>
        <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm">
          <div className="flex items-center gap-3 text-slate-500 dark:text-slate-400 mb-2">
            <Sparkles size={16} />
            <h3 className="text-sm font-medium">Trained Characters</h3>
          </div>
          <p className="text-2xl font-semibold text-slate-900 dark:text-white">{trainedChars.toLocaleString()}</p>
        </div>
        <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm">
          <div className="flex items-center gap-3 text-slate-500 dark:text-slate-400 mb-2">
            <Globe size={16} />
            <h3 className="text-sm font-medium">Synced Links</h3>
          </div>
          <p className="text-2xl font-semibold text-slate-900 dark:text-white">0</p>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm overflow-hidden flex flex-col min-h-[350px]">
        {facts.length === 0 ? (
          <div className="flex flex-col items-center justify-center flex-1 p-10 text-center">
            <div className="relative">
              <div className="w-20 h-20 bg-indigo-50 dark:bg-indigo-900/20 rounded-full flex items-center justify-center mb-6">
                <BookOpen className="text-indigo-500" size={32} />
              </div>
              {/* Decorative icons */}
              <div className="absolute -top-2 -right-4 w-8 h-8 bg-blue-50 dark:bg-blue-900/20 rounded-full flex items-center justify-center border border-white dark:border-slate-950 shadow-sm">
                <Globe className="text-blue-500" size={14} />
              </div>
              <div className="absolute top-10 -left-6 w-10 h-10 bg-amber-50 dark:bg-amber-900/20 rounded-full flex items-center justify-center border border-white dark:border-slate-950 shadow-sm">
                <FileText className="text-amber-500" size={18} />
              </div>
            </div>
            
            <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">No data sources yet</h3>
            <p className="text-slate-500 text-sm max-w-md mb-8 leading-relaxed">
              Train your AI Assistant by adding website links, uploading PDFs, or pasting raw text. The AI will use this knowledge to resolve customer tickets accurately.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full max-w-2xl">
              <button className="flex flex-col items-center p-4 bg-slate-50 hover:bg-slate-100 dark:bg-slate-900 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl transition-colors group">
                <Globe className="text-slate-400 group-hover:text-blue-500 mb-2 transition-colors" size={24} />
                <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Crawl Website</span>
                <span className="text-[11px] text-slate-500 mt-1">Sync your docs or blog</span>
              </button>
              <button className="flex flex-col items-center p-4 bg-slate-50 hover:bg-slate-100 dark:bg-slate-900 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl transition-colors group">
                <FileUp className="text-slate-400 group-hover:text-amber-500 mb-2 transition-colors" size={24} />
                <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Upload File</span>
                <span className="text-[11px] text-slate-500 mt-1">PDF, DOCX, CSV</span>
              </button>
              <button className="flex flex-col items-center p-4 bg-slate-50 hover:bg-slate-100 dark:bg-slate-900 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl transition-colors group">
                <FileText className="text-slate-400 group-hover:text-emerald-500 mb-2 transition-colors" size={24} />
                <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Raw Text</span>
                <span className="text-[11px] text-slate-500 mt-1">Paste Q&A snippets</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-auto max-h-[600px]">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-500 uppercase tracking-wider sticky top-0 z-10">
                  <th className="px-6 py-4 w-1/3">Question / Intent</th>
                  <th className="px-6 py-4 w-1/2">AI Response</th>
                  <th className="px-6 py-4 w-24">Status</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800 bg-white dark:bg-slate-950">
                {facts.map((fact) => (
                  <tr key={fact.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-colors">
                    <td className="px-6 py-4">
                      <p className="text-sm font-medium text-slate-900 dark:text-slate-100 line-clamp-2">
                        {fact.question}
                      </p>
                      <p className="text-xs text-slate-500 mt-1">Imported from AnyChat</p>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-sm text-slate-600 dark:text-slate-400 line-clamp-3">
                        {fact.answer}
                      </p>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${fact.is_active ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-400'}`}>
                        {fact.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button className="p-1.5 text-slate-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-md transition-colors">
                          <Edit2 size={16} />
                        </button>
                        <button className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
