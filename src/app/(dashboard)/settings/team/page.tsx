import { Users, Plus, MoreHorizontal } from "lucide-react"

export default function TeamSettingsPage() {
  // Hardcoded for now. Phase 3 will wire this up to Supabase Auth.
  const teammates = [
    { id: 1, name: "Imran Mahmud", email: "imran@hostnin.com", role: "Admin", status: "Active" },
    { id: 2, name: "Asad", email: "asad@hostnin.com", role: "Executive", status: "Active" },
    { id: 3, name: "Aisha", email: "aisha@hostnin.com", role: "Executive", status: "Pending" }
  ]

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">Teammates</h1>
          <p className="text-sm text-slate-500 mt-1">Manage your support executives and their access.</p>
        </div>
        <button className="flex items-center gap-2 bg-[#0070f3] hover:bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-all shadow-sm">
          <Plus size={16} strokeWidth={2.5} /> Add Teammate
        </button>
      </div>

      <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <table className="w-full text-sm text-left">
          <thead className="bg-slate-50 dark:bg-slate-900/50 text-slate-500 dark:text-slate-400 font-medium border-b border-slate-200 dark:border-slate-800">
            <tr>
              <th className="px-6 py-4 font-medium">Name</th>
              <th className="px-6 py-4 font-medium">Email</th>
              <th className="px-6 py-4 font-medium">Role</th>
              <th className="px-6 py-4 font-medium">Status</th>
              <th className="px-6 py-4 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {teammates.map((member) => (
              <tr key={member.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-colors group">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-100 to-blue-200 dark:from-blue-900 dark:to-blue-800 flex items-center justify-center text-blue-700 dark:text-blue-300 font-medium">
                      {member.name.charAt(0)}
                    </div>
                    <span className="font-medium text-slate-900 dark:text-slate-100">{member.name}</span>
                  </div>
                </td>
                <td className="px-6 py-4 text-slate-500 dark:text-slate-400">{member.email}</td>
                <td className="px-6 py-4">
                  <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-md ${
                    member.role === 'Admin' 
                      ? 'bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300' 
                      : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                  }`}>
                    {member.role}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                    <span className={`w-2 h-2 rounded-full ${member.status === 'Active' ? 'bg-green-500' : 'bg-amber-400'}`}></span>
                    {member.status}
                  </div>
                </td>
                <td className="px-6 py-4 text-right">
                  <button className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 opacity-0 group-hover:opacity-100 transition-opacity">
                    <MoreHorizontal size={18} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
