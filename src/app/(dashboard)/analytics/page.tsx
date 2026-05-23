import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Bot, CheckCircle2, FileEdit, Zap, BrainCircuit, Activity } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export const metadata = {
  title: "AI Analytics - TalkFuze",
};

export default async function AnalyticsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Get user profile to check org_id and role
  const { data: profile } = await supabase
    .from("users")
    .select("org_id, role")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role === 'agent') {
    redirect("/inbox"); // Agents don't have access to analytics
  }

  // Fetch overall counts for accurate metrics
  const [
    { count: totalDrafts },
    { count: totalSent },
    { count: sentAsIs },
    { count: edited }
  ] = await Promise.all([
    supabase.from("ai_draft_logs").select("*", { count: "exact", head: true }).eq("org_id", profile.org_id),
    supabase.from("ai_draft_logs").select("*", { count: "exact", head: true }).eq("org_id", profile.org_id).not("agent_sent", "is", null),
    supabase.from("ai_draft_logs").select("*", { count: "exact", head: true }).eq("org_id", profile.org_id).not("agent_sent", "is", null).eq("was_edited", false),
    supabase.from("ai_draft_logs").select("*", { count: "exact", head: true }).eq("org_id", profile.org_id).not("agent_sent", "is", null).eq("was_edited", true)
  ]);

  const accuracy = (totalSent && totalSent > 0) ? Math.round(((sentAsIs || 0) / totalSent) * 100) : 0;

  // Fetch recent AI Draft Logs for the table (latest 100)
  const { data: logs } = await supabase
    .from("ai_draft_logs")
    .select("id, ai_draft, agent_sent, was_edited, correction_feedback, created_at, language")
    .eq("org_id", profile.org_id)
    .order("created_at", { ascending: false })
    .limit(100);

  const safeLogs = logs || [];
  
  // Fetch Learned Rules separately so they don't disappear if they fall outside the last 100 drafts
  const { data: rulesData } = await supabase
    .from("ai_draft_logs")
    .select("id, correction_feedback, created_at")
    .eq("org_id", profile.org_id)
    .eq("was_edited", true)
    .not("correction_feedback", "is", null)
    .order("created_at", { ascending: false })
    .limit(50);

  const rulesLearned = rulesData || [];

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50 dark:bg-[#0b141a]">
      <div className="max-w-6xl mx-auto p-6 space-y-8">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <Bot className="w-7 h-7 text-blue-600 dark:text-blue-500" />
              AI Performance Analytics
            </h1>
            <p className="text-slate-500 dark:text-slate-400 mt-1">
              Tracking Knowledge Engine accuracy and agent interactions.
            </p>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-[#111b21] p-5 rounded-2xl border border-slate-200 dark:border-[#222e35] shadow-sm">
            <div className="flex items-center gap-3 text-slate-500 dark:text-slate-400 mb-2">
              <div className="p-2 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-lg">
                <Activity className="w-5 h-5" />
              </div>
              <span className="font-medium">Total Drafts</span>
            </div>
            <div className="text-3xl font-bold text-slate-800 dark:text-slate-100">{totalDrafts || 0}</div>
            <p className="text-xs text-slate-500 mt-2">All-time generated drafts</p>
          </div>

          <div className="bg-white dark:bg-[#111b21] p-5 rounded-2xl border border-slate-200 dark:border-[#222e35] shadow-sm">
            <div className="flex items-center gap-3 text-slate-500 dark:text-slate-400 mb-2">
              <div className="p-2 bg-slate-100 dark:bg-[#202c33] text-slate-600 dark:text-slate-300 rounded-lg">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <span className="font-medium">Sent As-Is</span>
            </div>
            <div className="text-3xl font-bold text-slate-800 dark:text-slate-100">{sentAsIs || 0}</div>
            <p className="text-xs text-slate-500 mt-2">All-time approved without edits</p>
          </div>

          <div className="bg-white dark:bg-[#111b21] p-5 rounded-2xl border border-slate-200 dark:border-[#222e35] shadow-sm">
            <div className="flex items-center gap-3 text-slate-500 dark:text-slate-400 mb-2">
              <div className="p-2 bg-slate-100 dark:bg-[#202c33] text-slate-500 dark:text-slate-400 rounded-lg">
                <FileEdit className="w-5 h-5" />
              </div>
              <span className="font-medium">Edited by Agent</span>
            </div>
            <div className="text-3xl font-bold text-slate-800 dark:text-slate-100">{edited || 0}</div>
            <p className="text-xs text-slate-500 mt-2">All-time required manual correction</p>
          </div>

          <div className="bg-white dark:bg-[#111b21] p-5 rounded-2xl border border-slate-200 dark:border-[#222e35] shadow-sm">
            <div className="flex items-center gap-3 text-slate-500 dark:text-slate-400 mb-2">
              <div className="p-2 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-lg">
                <Zap className="w-5 h-5" />
              </div>
              <span className="font-medium">AI Accuracy</span>
            </div>
            <div className="flex items-end gap-2">
              <div className="text-3xl font-bold text-slate-800 dark:text-slate-100">{accuracy}%</div>
            </div>
            <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-1.5 mt-3 overflow-hidden">
              <div 
                className="bg-blue-600 h-1.5 rounded-full" 
                style={{ width: `${accuracy}%` }}
              />
            </div>
          </div>
        </div>

        {/* Two Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Active Learning Rules */}
          <div className="lg:col-span-1 space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <BrainCircuit className="w-5 h-5 text-slate-600 dark:text-slate-400" />
              <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Self-Learned Rules</h2>
            </div>
            <div className="bg-white dark:bg-[#111b21] border border-slate-200 dark:border-[#222e35] rounded-2xl shadow-sm overflow-hidden max-h-[800px] flex flex-col">
              {rulesLearned.length === 0 ? (
                <div className="p-6 text-center text-slate-500 text-sm">
                  No correction rules generated yet.
                </div>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-[#222e35] overflow-y-auto custom-scrollbar flex-1">
                  {rulesLearned.map((log) => (
                    <div key={log.id} className="p-5 hover:bg-slate-50 dark:hover:bg-[#1a2329] transition-colors">
                      <p className="text-[13px] leading-relaxed text-slate-700 dark:text-slate-300 font-medium bg-slate-50 dark:bg-[#202c33] p-3 rounded-lg border border-slate-100 dark:border-[#2a363d]">
                        "{log.correction_feedback}"
                      </p>
                      <p className="text-[11px] text-slate-400 mt-3 flex items-center gap-1.5">
                        <Activity className="w-3.5 h-3.5" />
                        Learned {formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Recent Drafts Log */}
          <div className="lg:col-span-2 space-y-4">
            <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-2">Recent AI Drafts ({safeLogs.length})</h2>
            <div className="bg-white dark:bg-[#111b21] border border-slate-200 dark:border-[#222e35] rounded-2xl shadow-sm overflow-hidden max-h-[800px] flex flex-col">
              <div className="overflow-y-auto custom-scrollbar flex-1">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 dark:bg-[#1a2329] text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-[#222e35]">
                    <tr>
                      <th className="px-4 py-3 font-medium">Status</th>
                      <th className="px-4 py-3 font-medium">AI Draft</th>
                      <th className="px-4 py-3 font-medium">Time</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-[#222e35]">
                    {safeLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-50 dark:hover:bg-[#1a2329] transition-colors align-top">
                        <td className="px-4 py-3 whitespace-nowrap">
                          {!log.agent_sent ? (
                            <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-slate-100 text-slate-600 dark:bg-[#202c33] dark:text-slate-400">
                              Not Sent
                            </span>
                          ) : log.was_edited ? (
                            <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-slate-100 text-slate-600 dark:bg-[#202c33] dark:text-slate-400">
                              Edited
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400">
                              Sent As-Is
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-4 min-w-[300px]">
                          <div className="text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed text-[13px] bg-white dark:bg-[#111b21] p-3 rounded-lg border border-slate-100 dark:border-[#222e35] shadow-sm">
                            {log.ai_draft}
                          </div>
                          {log.agent_sent && (
                            <div className="text-slate-600 dark:text-slate-400 mt-4 whitespace-pre-wrap leading-relaxed text-[13px] bg-blue-50/50 dark:bg-blue-900/10 p-3 rounded-lg border border-blue-100/50 dark:border-blue-900/30 shadow-sm relative">
                              <div className="absolute -top-3 left-3 bg-blue-50 dark:bg-[#111b21] px-2 py-0.5 text-[10px] font-semibold text-blue-600 dark:text-blue-400 border border-blue-100/50 dark:border-blue-900/30 rounded-full">
                                ↳ Final Sent Message
                              </div>
                              <div className="mt-1">
                                {log.agent_sent}
                              </div>
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-slate-500 text-xs">
                          {formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}
                        </td>
                      </tr>
                    ))}
                    {safeLogs.length === 0 && (
                      <tr>
                        <td colSpan={3} className="px-4 py-8 text-center text-slate-500">
                          No AI drafts logged yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
