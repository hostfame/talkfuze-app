"use client"

import { useState, useEffect } from "react"
import { Plus, MoreHorizontal, X, Loader2 } from "lucide-react"
import { getTeammates, addTeammate, updateTeammateRole } from "@/actions/team"
import { createClient } from "@/lib/supabase/client"
import type { UserProfile } from "@/lib/types"

export default function TeamSettingsPage() {
  const [teammates, setTeammates] = useState<UserProfile[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set())
  
  // Form State
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [role, setRole] = useState("Agent")
  const [error, setError] = useState<string | null>(null)

  const fetchTeam = async () => {
    setIsLoading(true)
    const data = await getTeammates()
    setTeammates(data)
    setIsLoading(false)
  }

  useEffect(() => {
    let isActive = true

    const loadTeam = async () => {
      const data = await getTeammates()
      if (!isActive) return
      setTeammates(data)
      setIsLoading(false)
    }

    void loadTeam()
    return () => {
      isActive = false
    }
  }, [])

  useEffect(() => {
    if (teammates.length === 0) return

    const orgId = teammates[0]?.org_id
    if (!orgId) return

    const supabase = createClient()
    let presenceChannel: any = null

    const setupPresence = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      presenceChannel = supabase.channel(`presence:${orgId}`)
      
      let lastTrackTime = 0;
      
      const trackUserPresence = async () => {
        const now = Date.now();
        // Throttle presence tracking to once every 2 minutes
        if (now - lastTrackTime < 120000) return;
        lastTrackTime = now;
        try {
          await presenceChannel.track({
            user: user.id,
            online_at: new Date().toISOString(),
            last_active_at: new Date().toISOString()
          });
        } catch (err) {
          console.error("Failed to track presence:", err);
        }
      };

      presenceChannel
        .on('presence', { event: 'sync' }, () => {
          const state = presenceChannel.presenceState()
          const currentOnline = new Set<string>()
          const now = Date.now()
          
          for (const id in state) {
            state[id].forEach((presence: any) => {
              if (presence.user) {
                // Check if presence is active:
                // 1. Visitors/customers do not have last_active_at, so they always count as online
                // 2. Agents have last_active_at. If it's older than 10 minutes, treat them as offline/idle.
                const isStale = presence.last_active_at && (now - new Date(presence.last_active_at).getTime() > 600000);
                if (!isStale) {
                  currentOnline.add(presence.user)
                }
              }
            })
          }
          setOnlineUsers(currentOnline)
        })
        .subscribe(async (status: string) => {
          if (status === 'SUBSCRIBED') {
            trackUserPresence();
          }
        })

      // Register event listeners to update last_active_at on user activity
      const handleActivity = () => {
        trackUserPresence();
      };

      window.addEventListener('mousemove', handleActivity);
      window.addEventListener('keydown', handleActivity);
      window.addEventListener('click', handleActivity);
      window.addEventListener('scroll', handleActivity);

      // Save a cleanup function on window to be called on unmount
      (window as any)._cleanupTeamPresenceActivity = () => {
        window.removeEventListener('mousemove', handleActivity);
        window.removeEventListener('keydown', handleActivity);
        window.removeEventListener('click', handleActivity);
        window.removeEventListener('scroll', handleActivity);
      };
    }

    setupPresence()

    return () => {
      if (presenceChannel) {
        supabase.removeChannel(presenceChannel)
      }
      if ((window as any)._cleanupTeamPresenceActivity) {
        (window as any)._cleanupTeamPresenceActivity();
        delete (window as any)._cleanupTeamPresenceActivity;
      }
    }
  }, [teammates])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    setError(null)
    
    const result = await addTeammate(name, email, role)
    
    if (!result.success) {
      setError(result.error || "Failed to add teammate")
      setIsSubmitting(false)
      return
    }
    
    // Success
    setIsSubmitting(false)
    setIsModalOpen(false)
    setName("")
    setEmail("")
    setRole("Agent")
    fetchTeam()
  }

  const handleRoleChange = async (userId: string, newRole: string) => {
    setOpenMenuId(null)
    const originalTeammates = [...teammates]
    
    // Optimistic UI update
    setTeammates(prev => prev.map(m => m.id === userId ? { ...m, role: newRole } : m))
    
    const result = await updateTeammateRole(userId, newRole)
    if (!result.success) {
      alert(result.error) // Fallback for admin panel errors
      setTeammates(originalTeammates)
    }
  }

  return (
    <div className="space-y-6 relative">
      <div className="flex justify-between items-center border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">Teammates</h1>
          <p className="text-sm text-slate-500 mt-1">Manage your support executives and their access.</p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-2 bg-[#0070f3] hover:bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-all shadow-sm"
        >
          <Plus size={16} strokeWidth={2.5} /> Add Teammate
        </button>
      </div>

      <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden min-h-[300px]">
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
            {isLoading ? (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center text-slate-400">
                  <Loader2 size={24} className="animate-spin mx-auto mb-2 text-blue-500" />
                  Loading teammates...
                </td>
              </tr>
            ) : teammates.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center text-slate-500">
                  No teammates found. Add one to get started.
                </td>
              </tr>
            ) : (
              teammates.map((member) => (
                <tr key={member.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-colors group">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      {member.avatar_url ? (
                        <img src={member.avatar_url} alt={member.name} className="w-8 h-8 rounded-full" />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-100 to-blue-200 dark:from-blue-900 dark:to-blue-800 flex items-center justify-center text-blue-700 dark:text-blue-300 font-medium">
                          {member.name.charAt(0)}
                        </div>
                      )}
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
                      <span className={`w-2 h-2 rounded-full ${onlineUsers.has(member.id) || member.status === 'online' ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'}`}></span>
                      {onlineUsers.has(member.id) || member.status === 'online' ? 'Online' : 'Offline'}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right relative">
                    <button 
                      onClick={() => setOpenMenuId(openMenuId === member.id ? null : member.id)}
                      className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      <MoreHorizontal size={18} />
                    </button>
                    {openMenuId === member.id && (
                      <div className="absolute right-6 top-10 w-36 bg-white dark:bg-slate-900 rounded-lg shadow-lg border border-slate-200 dark:border-slate-800 py-1 z-50 text-left animate-in fade-in zoom-in-95 duration-100">
                        <button
                          onClick={() => handleRoleChange(member.id, member.role?.toLowerCase() === 'admin' ? 'agent' : 'admin')}
                          className="w-full px-4 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-left"
                        >
                          Make {member.role?.toLowerCase() === 'admin' ? 'Agent' : 'Admin'}
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Add Teammate Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center p-4 border-b border-slate-100 dark:border-slate-800">
              <h3 className="font-semibold text-lg text-slate-900 dark:text-white">Add Teammate</h3>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6">
              {error && (
                <div className="mb-4 p-3 bg-red-50 text-red-700 border border-red-200 rounded-lg text-sm">
                  {error}
                </div>
              )}
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Full Name</label>
                  <input 
                    type="text" 
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-slate-900 dark:text-white text-sm"
                    placeholder="e.g. Asad"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Email Address</label>
                  <input 
                    type="email" 
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-slate-900 dark:text-white text-sm"
                    placeholder="asad@hostnin.com"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Role</label>
                  <select 
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-slate-900 dark:text-white text-sm"
                  >
                    <option value="Agent">Agent (Can only reply to chats)</option>
                    <option value="Admin">Admin (Full access)</option>
                  </select>
                </div>
              </div>
              
              <div className="mt-6 flex justify-end gap-3">
                <button 
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 text-sm font-medium text-white bg-[#0070f3] hover:bg-blue-600 rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
                >
                  {isSubmitting && <Loader2 size={16} className="animate-spin" />}
                  {isSubmitting ? "Adding..." : "Add Teammate"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
