"use server";

import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

// In-memory cache for approved examples and recent corrections to make AI draft generation super fast
interface CacheEntry<T> {
  data: T;
  timestamp: number;
}
const approvedExamplesCache: Record<string, CacheEntry<{ bengali: string[]; english: string[] }>> = {};
const recentCorrectionsCache: Record<string, CacheEntry<string[]>> = {};
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes TTL

/**
 * Log an AI draft for a conversation. Called right after AI generates a draft.
 * Returns the log ID so we can update it later when the agent sends.
 */
export async function logAiDraft(
  orgId: string,
  conversationId: string,
  agentId: string,
  aiDraft: string,
  language: string,
  tokensUsed?: number,
  modelUsed?: string,
  temperature?: number
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
        tokens_used: tokensUsed,
        model_used: modelUsed,
        temperature,
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
async function extractLearningData(context: string, aiDraft: string, agentSent: string): Promise<{ rule: string, question: string, answer: string } | null> {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return null;

    // QUALITY GATE 1: Skip if context is missing or generic placeholder
    const contextLower = context.toLowerCase().trim();
    if (!context || contextLower === 'customer support inquiry' || contextLower.length < 15) {
      console.log("Skipping learning extraction: insufficient customer context.");
      return null;
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5-20250929",
        max_tokens: 1000,
        system: "You are an expert AI CRM training engineer. You extract learning data from AI mistakes. Output valid JSON strictly containing three string keys: 'rule', 'question', 'answer'. You MUST return ONLY the raw JSON string. Do not wrap it in markdown code blocks.",
        messages: [
          {
            role: "user",
            content: `Compare the mistaken AI Draft with the Agent's Final Verified Message.
            
Conversation Context (Customer asked):
"${context}"

Mistaken AI Draft:
"${aiDraft}"

Agent's Final Verified Message:
"${agentSent}"

Tasks:
1. 'rule': A concise 1-sentence actionable rule (in English) describing exactly why the agent edited the draft and what mistake to avoid.
   - CRITICAL: If the AI Draft was written in Bengali (বাংলা) but the Agent changed the reply entirely to English (or vice versa), the rule MUST explicitly instruct to respect and match the active conversational language (e.g., "Draft strictly in English when the agent/conversation has shifted to English").
2. 'question': A clean, standalone 1-sentence summary of the customer's intent/problem.
3. 'answer': The agent's verified final message (exactly as written, but remove specific personal greetings).

Output strictly in JSON: {"rule": "...", "question": "...", "answer": "..."}`
          }
        ]
      })
    });

    if (!response.ok) {
      console.error("Anthropic learning extraction failed:", response.status, await response.text());
      return null;
    }
    const data = await response.json();
    const textContent = data.content?.[0]?.text || "";
    const cleanJson = textContent.replace(/```json|```/g, "").trim();
    const result = JSON.parse(cleanJson);

    // QUALITY GATE 2: Reject generic/low-quality extractions
    const qLower = (result.question || '').toLowerCase();
    const genericPatterns = ['general customer support', 'general support inquiry', 'without specifying', 'n/a', 'the core problem or question'];
    if (genericPatterns.some(p => qLower.includes(p)) || qLower.length < 10) {
      console.log("Skipping low-quality extraction: generic question detected.");
      return null;
    }

    return (result.rule && result.question && result.answer) ? result : null;
  } catch (e) {
    console.error("extractLearningData error:", e);
    return null;
  }
}

/**
 * When an agent sends a message after using AI draft, update the log
 * with what they actually sent so we can compare and learn.
 */
export async function completeAiDraftLog(
  logId: string,
  agentSent: string,
  context: string
): Promise<void> {
  try {
    // Use supabaseAdmin to bypass RLS limits in background Server Actions
    
    // First get the original draft to compare
    const { data: log } = await supabaseAdmin
      .from("ai_draft_logs")
      .select("ai_draft, org_id")
      .eq("id", logId)
      .single();

    if (!log) return;

    // Determine if agent edited the draft
    const wasEdited = log.ai_draft.trim() !== agentSent.trim();
    let correctionFeedback: string | null = null;

    if (wasEdited) {
      // Generate both short-term rule and permanent Q&A pair
      const learningData = await extractLearningData(context, log.ai_draft, agentSent);
      
      if (learningData) {
        correctionFeedback = learningData.rule;

        // Insert into permanent vector database (RAG) with deduplication
        try {
          // QUALITY GATE 3: Check for duplicate questions before inserting
          const { data: existing } = await supabaseAdmin
            .from('ai_knowledge_base')
            .select('id')
            .ilike('question', learningData.question.trim())
            .limit(1);

          if (existing && existing.length > 0) {
            console.log("Skipping vector insert: duplicate question already exists.");
          } else {
            const embeddingRes = await fetch('https://api.openai.com/v1/embeddings', {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ model: 'text-embedding-3-small', input: learningData.question })
            });
            const embData = await embeddingRes.json();
            if (embData.data?.[0]?.embedding) {
              await supabaseAdmin.from('ai_knowledge_base').insert({
                question: learningData.question,
                answer: learningData.answer,
                embedding: embData.data[0].embedding
              });
            }
          }
        } catch (err) {
          console.error("Vector insert error:", err);
        }
      }
    }

    const updatePayload = {
      agent_sent: agentSent,
      was_edited: wasEdited,
      correction_feedback: correctionFeedback
    };

    // Try to save customer context as well for the analytics dashboard
    const { error: updateError } = await supabaseAdmin
      .from("ai_draft_logs")
      .update({ ...updatePayload, customer_context: context })
      .eq("id", logId);

    // If column doesn't exist yet (42703), fallback to normal payload
    if (updateError && updateError.code === '42703') {
      await supabaseAdmin
        .from("ai_draft_logs")
        .update(updatePayload)
        .eq("id", logId);
    } else if (updateError) {
      console.error("completeAiDraftLog update error:", updateError);
    }

    // Invalidate cache since database was updated
    if (log.org_id) {
      delete approvedExamplesCache[log.org_id];
      delete recentCorrectionsCache[log.org_id];
    }
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
    const now = Date.now();
    const cached = approvedExamplesCache[orgId];
    if (cached && (now - cached.timestamp < CACHE_TTL_MS)) {
      return cached.data;
    }

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

    const result = { bengali, english };
    approvedExamplesCache[orgId] = { data: result, timestamp: now };
    return result;
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
    const now = Date.now();
    const cached = recentCorrectionsCache[orgId];
    if (cached && (now - cached.timestamp < CACHE_TTL_MS)) {
      return cached.data;
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("ai_draft_logs")
      .select("correction_feedback")
      .eq("org_id", orgId)
      .eq("was_edited", true)
      .not("correction_feedback", "is", null)
      .order("created_at", { ascending: false })
      .limit(30);

    if (error || !data) return [];
    
    // Deduplicate similar rules (naively by exact match after lowercasing)
    const uniqueCorrections: string[] = [];
    const seenNormalized = new Set<string>();

    for (const row of data) {
      if (!row.correction_feedback) continue;
      const normalized = row.correction_feedback.toLowerCase().trim();
      if (!seenNormalized.has(normalized)) {
        seenNormalized.add(normalized);
        uniqueCorrections.push(row.correction_feedback);
        if (uniqueCorrections.length >= 6) break;
      }
    }

    recentCorrectionsCache[orgId] = { data: uniqueCorrections, timestamp: now };
    return uniqueCorrections;
  } catch (e) {
    console.error("getRecentCorrections error:", e);
    return [];
  }
}
