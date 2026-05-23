"use client";

import { useState } from "react";
import { Info, Edit2, Cpu, Coins, Thermometer, CheckCircle2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function DraftLogItem({ log }: { log: any }) {
  const [isEditingRule, setIsEditingRule] = useState(false);
  const [ruleText, setRuleText] = useState(log.correction_feedback || "");
  const [isSaving, setIsSaving] = useState(false);

  let customerName = "Customer";
  let customerContextClean = log.customer_context || "";
  
  if (log.customer_context) {
    const lines = log.customer_context.split('\n');
    const lastLine = lines[lines.length - 1];
    const match = lastLine.match(/^\[(.*?)\]:\s(.*)$/);
    if (match && match[1] !== 'Agent' && match[1] !== 'System') {
      customerName = match[1];
    }
    // We can just show the last 3 lines for context
    customerContextClean = lines.slice(-3).join('\n');
  }

  const handleSaveRule = async () => {
    setIsSaving(true);
    try {
      const supabase = createClient();
      await supabase.from("ai_draft_logs").update({ correction_feedback: ruleText }).eq("id", log.id);
      log.correction_feedback = ruleText;
      setIsEditingRule(false);
    } catch (e) {
      console.error(e);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="bg-white dark:bg-[#111b21] p-5 rounded-2xl border border-slate-200 dark:border-[#222e35] shadow-sm mb-6 flex flex-col xl:flex-row gap-6">
      
      {/* Left Column: Chat Context */}
      <div className="flex-1 space-y-5">
        
        {/* Header */}
        <div className="flex justify-between items-center pb-2 border-b border-slate-100 dark:border-[#222e35]">
           <div className="flex items-center gap-2">
             <span className="font-semibold text-slate-800 dark:text-slate-100">{customerName}</span>
             <span className="text-slate-400 text-xs">· {formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}</span>
           </div>
           <Link href={`/inbox?c=${log.conversation_id}`} target="_blank" title="View Full Chat" className="p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-[#1a2329] hover:text-slate-600 dark:hover:text-slate-300 rounded-lg transition-colors flex items-center gap-1.5 text-xs font-medium">
             <Info className="w-4 h-4" />
             View Chat
           </Link>
        </div>

        {/* Customer Asked */}
        {log.customer_context && (
          <div className="relative pt-3">
            <div className="absolute -top-1 left-3 bg-white dark:bg-[#111b21] px-2 text-[10px] font-semibold text-slate-500 dark:text-slate-400 border border-slate-200/60 dark:border-[#2a363d] rounded-full">
              Customer Asked
            </div>
            <div className="text-slate-600 dark:text-slate-400 whitespace-pre-wrap leading-relaxed text-[13px] bg-slate-50 dark:bg-[#1a2329] p-4 rounded-xl border border-slate-200/60 dark:border-[#2a363d]">
              {customerContextClean}
            </div>
          </div>
        )}

        {/* AI Draft */}
        <div className="relative pt-3">
          <div className="absolute -top-1 left-3 bg-white dark:bg-[#111b21] px-2 text-[10px] font-semibold text-slate-500 dark:text-slate-400 border border-slate-100 dark:border-[#222e35] rounded-full">
            AI Draft
          </div>
          <div className="text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed text-[13px] bg-white dark:bg-[#111b21] p-4 rounded-xl border border-slate-100 dark:border-[#222e35] shadow-sm">
            {log.ai_draft}
          </div>
        </div>

        {/* Final Sent */}
        {log.agent_sent && (
          <div className="relative pt-3">
            <div className="absolute -top-1 left-3 bg-blue-50 dark:bg-[#111b21] px-2 text-[10px] font-semibold text-blue-600 dark:text-blue-400 border border-blue-100/50 dark:border-blue-900/30 rounded-full">
              ↳ Final Sent Message
            </div>
            <div className="text-slate-600 dark:text-slate-400 whitespace-pre-wrap leading-relaxed text-[13px] bg-blue-50/50 dark:bg-blue-900/10 p-4 rounded-xl border border-blue-100/50 dark:border-blue-900/30">
              {log.agent_sent}
            </div>
          </div>
        )}

      </div>

      {/* Right Column: AI Metrics & Learned Rule */}
      <div className="xl:w-72 flex flex-col gap-4 xl:border-l xl:pl-6 border-t xl:border-t-0 pt-4 xl:pt-0 border-slate-100 dark:border-[#222e35]">
        
        <div className="flex items-center gap-2 mb-1">
           {log.was_edited ? (
             <span className="inline-flex items-center px-2 py-1 rounded-md text-[11px] font-medium bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400">
               Manually Edited
             </span>
           ) : log.agent_sent ? (
             <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400">
               <CheckCircle2 className="w-3 h-3" />
               Sent As-Is
             </span>
           ) : (
             <span className="inline-flex items-center px-2 py-1 rounded-md text-[11px] font-medium bg-slate-100 text-slate-500 dark:bg-[#202c33] dark:text-slate-400">
               Not Sent
             </span>
           )}
        </div>

        {/* Extracted Rule */}
        {log.was_edited && (
          <div className="bg-slate-50 dark:bg-[#1a2329] p-4 rounded-xl border border-slate-200/60 dark:border-[#2a363d]">
            <div className="flex justify-between items-center mb-2">
               <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">Learned Rule</span>
               {!isEditingRule && (
                 <button onClick={() => setIsEditingRule(true)} className="p-1 text-slate-400 hover:text-blue-500 transition-colors" title="Edit Rule">
                   <Edit2 className="w-3.5 h-3.5" />
                 </button>
               )}
            </div>
            
            {isEditingRule ? (
              <div className="space-y-2">
                <textarea 
                  value={ruleText}
                  onChange={(e) => setRuleText(e.target.value)}
                  className="w-full text-[12px] bg-white dark:bg-[#111b21] text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-[#2a363d] rounded-lg p-2 min-h-[80px] focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <div className="flex gap-2 justify-end">
                  <button onClick={() => setIsEditingRule(false)} className="text-[11px] px-2 py-1 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300">Cancel</button>
                  <button onClick={handleSaveRule} disabled={isSaving} className="text-[11px] px-2 py-1 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50">
                    {isSaving ? "Saving..." : "Save Rule"}
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-[12px] text-slate-600 dark:text-slate-400 italic">
                "{log.correction_feedback || "No rule extracted"}"
              </p>
            )}
          </div>
        )}

        {/* Technical Metrics */}
        <div className="space-y-2 pt-2">
           <div className="flex items-center justify-between text-[11px]">
             <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1.5"><Cpu className="w-3.5 h-3.5" /> Model</span>
             <span className="font-medium text-slate-700 dark:text-slate-300">{log.model_used || "claude-3.5-haiku"}</span>
           </div>
           <div className="flex items-center justify-between text-[11px]">
             <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1.5"><Coins className="w-3.5 h-3.5" /> Tokens</span>
             <span className="font-medium text-slate-700 dark:text-slate-300">{log.tokens_used ? log.tokens_used.toLocaleString() : "Unknown"}</span>
           </div>
           <div className="flex items-center justify-between text-[11px]">
             <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1.5"><Thermometer className="w-3.5 h-3.5" /> Temp</span>
             <span className="font-medium text-slate-700 dark:text-slate-300">{log.temperature || "0.7"}</span>
           </div>
        </div>

      </div>
    </div>
  );
}
