import { getContacts } from '@/actions/contacts'
import { Search, User, MessageCircle, MoreHorizontal, Download, Upload, Plus } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function ContactsPage() {
  const contacts = await getContacts()

  function formatDate(dateStr: string) {
    if (!dateStr) return 'Never'
    const d = new Date(dateStr)
    const diff = (Date.now() - d.getTime()) / 1000
    if (diff < 3600) return `${Math.floor(diff / 60)} minutes ago`
    if (diff < 86400) return `${Math.floor(diff / 3600)} hours ago`
    return d.toLocaleDateString()
  }

  function getInitials(name: string) {
    if (!name) return '?'
    if (name.startsWith('+')) return name.substring(0, 2)
    const parts = name.trim().split(" ").filter(Boolean)
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
    return name.substring(0, 1).toUpperCase()
  }

  return (
    <div className="flex flex-col h-full w-full bg-white dark:bg-slate-900 overflow-hidden">
      {/* Header */}
      <div className="h-16 flex items-center justify-between px-6 border-b border-slate-200 dark:border-slate-800">
        <h1 className="text-xl font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
          Contacts <span className="text-sm font-normal text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full">{contacts.length}</span>
        </h1>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input 
              type="text" 
              placeholder="Search contacts..." 
              className="pl-9 pr-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm w-[250px] focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all dark:text-slate-200"
            />
          </div>
          <button className="p-2 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors" title="Import CSV">
            <Upload size={18} />
          </button>
          <button className="p-2 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors" title="Export CSV">
            <Download size={18} />
          </button>
          <button className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm">
            <Plus size={16} /> Add Contact
          </button>
        </div>
      </div>

      {/* Table Content */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50">
              <th className="py-3 px-6 text-xs font-semibold text-slate-500 uppercase tracking-wider w-12">
                <input type="checkbox" className="rounded border-slate-300 dark:border-slate-600 bg-transparent" />
              </th>
              <th className="py-3 px-6 text-xs font-semibold text-slate-500 uppercase tracking-wider">Name</th>
              <th className="py-3 px-6 text-xs font-semibold text-slate-500 uppercase tracking-wider">Source</th>
              <th className="py-3 px-6 text-xs font-semibold text-slate-500 uppercase tracking-wider">Contacts</th>
              <th className="py-3 px-6 text-xs font-semibold text-slate-500 uppercase tracking-wider">Assigned To</th>
              <th className="py-3 px-6 text-xs font-semibold text-slate-500 uppercase tracking-wider">Last Contact</th>
              <th className="py-3 px-6 text-xs font-semibold text-slate-500 uppercase tracking-wider">Created at</th>
              <th className="py-3 px-6 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {contacts.map((contact) => (
              <tr key={contact.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 group transition-colors cursor-pointer">
                <td className="py-4 px-6 w-12">
                  <input type="checkbox" className="rounded border-slate-300 dark:border-slate-600 bg-transparent" />
                </td>
                <td className="py-4 px-6">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center text-blue-600 dark:text-blue-400 font-semibold text-sm shrink-0">
                      {getInitials(contact.name || contact.platform_id.split('@')[0])}
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="text-[14px] font-medium text-slate-900 dark:text-slate-100 truncate">
                        {contact.name || 'No name'}
                      </span>
                      <span className="text-[13px] text-slate-500 font-mono truncate">
                        {contact.platform_id.split('@')[0].startsWith('+') ? contact.platform_id.split('@')[0] : `+${contact.platform_id.split('@')[0]}`}
                      </span>
                    </div>
                  </div>
                </td>
                <td className="py-4 px-6">
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 text-xs font-medium border border-emerald-100 dark:border-emerald-800/50">
                    <MessageCircle size={12} />
                    {contact.channel_type === 'whatsapp' ? 'WhatsApp' : 'Messenger'}
                  </div>
                </td>
                <td className="py-4 px-6">
                  <div className="inline-flex items-center gap-1.5 text-slate-500">
                    <MessageCircle size={14} className="text-blue-500" />
                    <span className="font-medium bg-blue-50 text-blue-600 px-1.5 rounded-md text-xs">{contact.conversation_count}</span>
                  </div>
                </td>
                <td className="py-4 px-6">
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-slate-200 dark:border-slate-700 text-slate-500 text-[12px] font-medium">
                    Not assigned
                  </div>
                </td>
                <td className="py-4 px-6">
                  <span className="text-[13px] text-slate-600 dark:text-slate-400">{formatDate(contact.last_contacted_at)}</span>
                </td>
                <td className="py-4 px-6">
                  <span className="text-[13px] text-slate-500">{new Date(contact.created_at).toLocaleDateString()}</span>
                </td>
                <td className="py-4 px-6 text-right">
                  <button className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded opacity-0 group-hover:opacity-100 transition-all">
                    <MoreHorizontal size={16} />
                  </button>
                </td>
              </tr>
            ))}
            {contacts.length === 0 && (
              <tr>
                <td colSpan={8} className="py-12 text-center text-slate-500">
                  <User className="w-12 h-12 mx-auto text-slate-300 mb-3" />
                  <p className="text-[15px] font-medium text-slate-900 dark:text-slate-100">No contacts found</p>
                  <p className="text-[13px] mt-1">Contacts will appear here once they message you.</p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
