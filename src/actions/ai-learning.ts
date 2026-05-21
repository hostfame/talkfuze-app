"use server";

import { createClient } from "@/lib/supabase/server";

/**
 * Log an AI draft for a conversation. Called right after AI generates a draft.
 * Returns the log ID so we can update it later when the agent sends.
 */
export async function logAiDraft(
  orgId: string,
  conversationId: string,
  agentId: string,
  aiDraft: string,
  language: string
): Promise<string | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("ai_draft_logs")
      .insert({
        org_id: orgId,
        conversation_id: conversationId,
        agent_id: agentId,
        ai_draft: aiDraft,
        language,
      })
      .select("id")
      .single();

    if (error) {
      console.error("Failed to log AI draft:", error);
      return null;
    }
    return data?.id || null;
  } catch (e) {
    console.error("logAiDraft error:", e);
    return null;
  }
}

/**
 * When an agent sends a message after using AI draft, update the log
 * with what they actually sent so we can compare.
 */
export async function completeAiDraftLog(
  logId: string,
  agentSent: string
): Promise<void> {
  try {
    const supabase = await createClient();
    
    // First get the original draft to compare
    const { data: log } = await supabase
      .from("ai_draft_logs")
      .select("ai_draft")
      .eq("id", logId)
      .single();

    if (!log) return;

    // Determine if agent edited the draft
    const wasEdited = log.ai_draft.trim() !== agentSent.trim();

    await supabase
      .from("ai_draft_logs")
      .update({
        agent_sent: agentSent,
        was_edited: wasEdited,
      })
      .eq("id", logId);
  } catch (e) {
    console.error("completeAiDraftLog error:", e);
  }
}

/**
 * Fetch the best unedited (agent-approved) AI drafts to use as few-shot examples.
 * These are drafts that agents sent WITHOUT editing, meaning the AI got it right.
 * Returns up to 8 examples, split by language.
 */
export async function getApprovedExamples(
  orgId: string
): Promise<{ bengali: string[]; english: string[] }> {
  try {
    const supabase = await createClient();

    // Get recent unedited drafts (agent approved as-is)
    const { data, error } = await supabase
      .from("ai_draft_logs")
      .select("ai_draft, language")
      .eq("org_id", orgId)
      .eq("was_edited", false)
      .not("agent_sent", "is", null) // Must have been actually sent
      .order("created_at", { ascending: false })
      .limit(30);

    if (error || !data) return { bengali: [], english: [] };

    const bengali: string[] = [];
    const english: string[] = [];

    for (const row of data) {
      // Skip very short drafts (acknowledgments, "ok", etc.)
      if (row.ai_draft.length < 30) continue;

      if (row.language === "en" && english.length < 4) {
        english.push(row.ai_draft);
      } else if (row.language === "bn" && bengali.length < 4) {
        bengali.push(row.ai_draft);
      }

      if (bengali.length >= 4 && english.length >= 4) break;
    }

    return { bengali, english };
  } catch (e) {
    console.error("getApprovedExamples error:", e);
    return { bengali: [], english: [] };
  }
}
