"use client";

import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

function getDraftCostInBDT(model: string, tokens: number): number {
  if (!tokens || tokens <= 0) return 0;
  
  const m = model.toLowerCase();
  let costPer1KTokensInCents = 0.16; // default to haiku
  
  if (m.includes("sonnet") || m.includes("claude-3-5-sonnet")) {
    costPer1KTokensInCents = 0.60;
  } else if (m.includes("haiku") || m.includes("claude-3-5-haiku")) {
    costPer1KTokensInCents = 0.16;
  } else if (m.includes("flash") || m.includes("gemini")) {
    costPer1KTokensInCents = 0.015;
  } else if (m.includes("gpt-4o")) {
    costPer1KTokensInCents = 0.50;
  } else if (m.includes("gpt-4")) {
    costPer1KTokensInCents = 3.00;
  }
  
  const costInCents = (tokens / 1000) * costPer1KTokensInCents;
  return costInCents * 1.25; // 1 USD = 125 BDT -> (Cents/100) * 125 = Cents * 1.25
}

function getDraftCost(model: string, tokens: number): string {
  const bdt = getDraftCostInBDT(model, tokens);
  if (bdt === 0) return "৳0.00";
  if (bdt < 0.01) return `৳${bdt.toFixed(4)}`;
  return `৳${bdt.toFixed(2)}`;
}

function getTrainingCostInBDT(): number {
  // 1,000 tokens of Claude 3.5 Sonnet comparison & rule generation: 0.54 cents
  // 0.54 cents * 1.25 = 0.68 BDT
  return 0.68;
}

function getTrainingCost(): string {
  return `৳${getTrainingCostInBDT().toFixed(2)}`;
}

function getTotalCost(model: string, tokens: number, wasEdited: boolean): string {
  let bdt = getDraftCostInBDT(model, tokens);
  if (wasEdited) {
    bdt += getTrainingCostInBDT();
  }
  if (bdt === 0) return "৳0.00";
  if (bdt < 0.01) return `৳${bdt.toFixed(4)}`;
  return `৳${bdt.toFixed(2)}`;
}

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
      const finalVal = ruleText.trim() === "" ? null : ruleText.trim();
      await supabase.from("ai_draft_logs").update({ correction_feedback: finalVal }).eq("id", log.id);
      log.correction_feedback = finalVal;
      setIsEditingRule(false);
    } catch (e) {
      console.error(e);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="bg-white dark:bg-[#111b21] p-3 md:p-4 rounded-xl border border-slate-200 dark:border-[#222e35] shadow-sm mb-3 flex flex-col gap-3">
      
      {/* Header */}
      <div className="flex justify-between items-center pb-2 border-b border-slate-100 dark:border-[#222e35]">
         <div className="flex items-center gap-2">
           <span className="font-semibold text-sm text-slate-800 dark:text-slate-100">{customerName}</span>
           <span className="text-slate-400 text-[11px]">· {formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}</span>
           <div className="ml-2">
             {log.was_edited ? (
               <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400">
                 Edited
               </span>
             ) : log.agent_sent ? (
               <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400">
                 Sent As-Is
               </span>
             ) : (
               <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-500 dark:bg-[#202c33] dark:text-slate-400">
                 Not Sent
               </span>
             )}
           </div>
         </div>
         <div className="flex items-center gap-2">
           <button
             onClick={() => {
               const code = log.id.slice(0, 8);
               navigator.clipboard.writeText(code);
               const btn = document.getElementById(`copy-${log.id}`);
               if (btn) { btn.textContent = 'Copied!'; setTimeout(() => { btn.textContent = code; }, 1500); }
             }}
             id={`copy-${log.id}`}
             title="Click to copy Log ID for quality override"
             className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-100 dark:bg-[#202c33] text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-[#2a3942] hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-blue-900/20 dark:hover:text-blue-400 transition-colors cursor-pointer"
           >
             {log.id.slice(0, 8)}
           </button>
           <Link href={`/inbox?c=${log.conversation_id}`} target="_blank" title="View Full Chat" className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:underline">
             View Chat
           </Link>
         </div>
      </div>

      {/* Main Content Area (Full Width) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Customer Asked */}
        {log.customer_context && (
          <div className="flex flex-col">
            <div className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-1 ml-1">
              Customer
            </div>
            <div className="flex-1 text-slate-600 dark:text-slate-400 whitespace-pre-wrap leading-relaxed text-[11px] bg-slate-50 dark:bg-[#1a2329] p-2.5 rounded-lg border border-slate-200/60 dark:border-[#2a363d]">
              {customerContextClean}
            </div>
          </div>
        )}

        {/* AI Draft */}
        <div className="flex flex-col">
          <div className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-1 ml-1">
            AI Draft
          </div>
          <div className="flex-1 text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed text-[11px] bg-white dark:bg-[#111b21] p-2.5 rounded-lg border border-slate-100 dark:border-[#222e35] shadow-sm">
            {log.ai_draft}
          </div>
        </div>
      </div>

      {/* Final Sent */}
      {log.agent_sent && (
        <div className="flex flex-col">
          <div className="text-[10px] uppercase tracking-wider font-bold text-blue-600 dark:text-blue-400 mb-1 ml-1">
            Final Sent
          </div>
          <div className="text-slate-600 dark:text-slate-400 whitespace-pre-wrap leading-relaxed text-[11px] bg-blue-50/50 dark:bg-blue-900/10 p-2.5 rounded-lg border border-blue-100/50 dark:border-blue-900/30">
            {log.agent_sent}
          </div>
        </div>
      )}

      {/* Footer Area: Rules & Metrics */}
      <div className="mt-1 pt-3 border-t border-slate-100 dark:border-[#222e35] flex flex-col lg:flex-row gap-4 items-start">
        
        {/* Learned Rule Section */}
        <div className="flex-1 w-full bg-slate-50 dark:bg-[#1a2329] p-2.5 rounded-lg border border-slate-200/60 dark:border-[#2a363d]">
          <div className="flex justify-between items-center mb-1">
             <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
               {log.correction_feedback ? "AI Training Rule" : "Train AI Rule"}
             </span>
             {!isEditingRule && (
               <button 
                 onClick={() => setIsEditingRule(true)} 
                 className="text-[10px] text-blue-600 dark:text-blue-400 hover:underline font-semibold"
               >
                 {log.correction_feedback ? "Edit" : "Add Rule"}
               </button>
             )}
          </div>
          
          {isEditingRule ? (
            <div className="space-y-2 mt-1.5">
              <textarea 
                value={ruleText}
                onChange={(e) => setRuleText(e.target.value)}
                placeholder="E.g., Always use formal greetings..."
                className="w-full text-[11px] bg-white dark:bg-[#111b21] text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-[#2a363d] rounded p-1.5 min-h-[40px] focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <div className="flex gap-2 justify-end">
                <button 
                  onClick={() => setIsEditingRule(false)} 
                  className="text-[10px] px-2 py-1 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleSaveRule} 
                  disabled={isSaving} 
                  className="text-[10px] px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 font-semibold"
                >
                  {isSaving ? "Saving..." : ruleText.trim() === "" ? "Delete" : "Save"}
                </button>
              </div>
            </div>
          ) : (
            <p className="text-[11px] text-slate-600 dark:text-slate-400 italic leading-snug">
              {log.correction_feedback ? `"${log.correction_feedback}"` : "No specific rule active. Click Add Rule to teach the AI."}
            </p>
          )}
        </div>

        {/* Technical Metrics (Horizontal Array) */}
        <div className="flex flex-wrap lg:flex-nowrap items-center gap-4 lg:gap-6 text-[11px] bg-slate-50 dark:bg-[#1a2329] p-2.5 rounded-lg border border-slate-200/60 dark:border-[#2a363d] whitespace-nowrap">
          <div className="flex flex-col">
            <span className="text-slate-400">Model</span>
            <span className="font-semibold text-slate-700 dark:text-slate-300">{log.model_used || "claude-3-5-haiku"}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-slate-400">Tokens</span>
            <span className="font-semibold text-slate-700 dark:text-slate-300">{log.tokens_used ? log.tokens_used.toLocaleString() : "0"}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-slate-400">Cost</span>
            <span className="font-semibold text-blue-600 dark:text-blue-400">{getTotalCost(log.model_used || "claude-3-5-haiku", log.tokens_used || 0, log.was_edited)}</span>
          </div>
        </div>

      </div>
    </div>
  );
}
