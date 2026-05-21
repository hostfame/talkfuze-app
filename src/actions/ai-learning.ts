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
 * Helper to generate a 1-sentence correction insight from Claude by comparing AI draft with Agent sent.
 */
async function generateCorrectionFeedback(aiDraft: string, agentSent: string): Promise<string | null> {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return null;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 150,
        messages: [
          {
            role: "user",
            content: `You are an AI learning coordinator. Compare the following AI-generated support draft with the human agent's corrected message. 
Identify exactly why the human agent edited the draft. 
Write a concise, 1-sentence, highly actionable rule/insight (in English) describing the correction, to help the AI avoid repeating this mistake next time.

Format example:
"Avoid formal textbook words like 'অনুগ্রহপূর্বক'; the agent prefers casual terms like 'প্লিজ' or omitting them."
"The agent corrected the suspension status to active; verify account status before claiming it is suspended."

AI Draft:
"${aiDraft}"

Agent's Message:
"${agentSent}"

Output ONLY the 1-sentence actionable rule/insight. No labels, no prefixes.`
          }
        ]
      })
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("Correction feedback API error:", err);
      return null;
    }
    
    const data = await response.json();
    return data.content?.[0]?.text?.trim() || null;
  } catch (e) {
    console.error("generateCorrectionFeedback error:", e);
    return null;
  }
}

/**
 * When an agent sends a message after using AI draft, update the log
 * with what they actually sent so we can compare and learn.
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
    let correctionFeedback: string | null = null;

    if (wasEdited) {
      // Generate self-correction insight in background/context
      correctionFeedback = await generateCorrectionFeedback(log.ai_draft, agentSent);
    }

    await supabase
      .from("ai_draft_logs")
      .update({
        agent_sent: agentSent,
        was_edited: wasEdited,
        correction_feedback: correctionFeedback
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

/**
 * Fetch the latest 5-8 correction insights where the agent edited the draft.
 */
export async function getRecentCorrections(orgId: string): Promise<string[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("ai_draft_logs")
      .select("correction_feedback")
      .eq("org_id", orgId)
      .eq("was_edited", true)
      .not("correction_feedback", "is", null)
      .order("created_at", { ascending: false })
      .limit(6);

    if (error || !data) return [];
    return data.map(row => row.correction_feedback).filter((c): c is string => !!c);
  } catch (e) {
    console.error("getRecentCorrections error:", e);
    return [];
  }
}
