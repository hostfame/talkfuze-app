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
async function extractLearningData(context: string, aiDraft: string, agentSent: string): Promise<{ rule: string, style_corrections: string, question: string, answer: string } | null> {
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
        max_tokens: 2000,
        system: `You are an expert AI CRM linguist and tone analyst for a Bangladeshi hosting company (Hostnin). You perform DEEP line-by-line analysis of how a human agent corrected an AI draft. You extract BOTH factual mistakes AND stylistic/tonal corrections.

Your outputs are used to permanently train the AI to write like a natural, warm, WhatsApp-style human support agent, NOT a corporate robot.

Output valid JSON strictly containing these keys: 'rule', 'style_corrections', 'question', 'answer'.
You MUST return ONLY the raw JSON string. Do not wrap it in markdown code blocks.`,
        messages: [
          {
            role: "user",
            content: `Perform a DEEP line-by-line comparison between the AI Draft and the Agent's Final Message.

Conversation Context (Customer asked):
"${context}"

Mistaken AI Draft:
"${aiDraft}"

Agent's Final Verified Message:
"${agentSent}"

ANALYSIS TASKS:

1. 'rule': A concise 1-2 sentence actionable rule (in English) about the FACTUAL mistake.
   - If the AI over-promised (timelines, compensation, features), state what to avoid.
   - If the language was wrong (Bengali vs English mismatch), state the correct language rule.
   - If no factual mistake exists (only style changes), write "Style-only correction, no factual error."

2. 'style_corrections': A detailed multi-line string (in English) analyzing EVERY stylistic change the agent made. This is the MOST IMPORTANT field. Analyze:
   a) VOCABULARY SHIFTS: List every word the agent replaced and why.
      Example: "Replaced bookish 'ক্ষোভ' (formal frustration) with natural 'রাগ' (anger). Replaced textbook 'বিক্রয়' with transliterated 'সেলস'. Replaced 'ক্ষতি' with 'লস'."
   b) VERB FORM CHANGES: Did the agent change verb structures?
      Example: "Changed 'বুঝছি' (direct) to 'বুঝতে পারছি' (polite auxiliary). Changed 'করুন' (command) to 'করতে পারেন' (suggestion)."
   c) DELETED LINES: What entire sentences/phrases did the agent remove and WHY?
      Example: "Deleted 'এই পরিস্থিতিটি গুরুতর' because it sounds like corporate robot speak. Deleted follow-up question 'What kind of website?' because the customer did not ask for recommendations."
   d) ADDED CONNECTORS: Did the agent add natural flow words?
      Example: "Added 'কিন্তু' (but) as a conversational connector instead of starting abruptly."
   e) TONE SHIFT: Did the agent make it warmer, shorter, more direct, less formal?
      Example: "Shortened 3-paragraph response to 1 paragraph. Removed unnecessary assurances like 'আমরা সবসময় আপনার সেবায় আছি'."
   f) ROBOTIC PATTERNS REMOVED: What patterns sound like a bot vs a human?
      Example: "Removed 'সম্পূর্ণভাবে' (completely) which sounds over-formal. Agents use 'পুরোপুরি' or omit entirely."

   If the messages are in English, analyze English style shifts similarly.
   If there are NO style changes (only factual), write "No significant style changes."

3. 'question': A clean, standalone 1-sentence summary of the customer's specific problem.

4. 'answer': The agent's verified final message (exactly as written).

Output strictly as JSON: {"rule": "...", "style_corrections": "...", "question": "...", "answer": "..."}`
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
      // Skip learning extraction for minor edits (typos, spacing)
      // Measure how different the texts are using character-level similarity
      const draft = log.ai_draft.trim();
      const sent = agentSent.trim();
      const maxLen = Math.max(draft.length, sent.length);
      let matchCount = 0;
      const shorter = draft.length <= sent.length ? draft : sent;
      const longer = draft.length > sent.length ? draft : sent;
      for (let i = 0; i < shorter.length; i++) {
        if (shorter[i] === longer[i]) matchCount++;
      }
      const similarity = maxLen > 0 ? matchCount / maxLen : 1;

      if (similarity > 0.85) {
        // Minor edit (typo/spacing/small tweak), skip expensive Sonnet call
        console.log(`Minor edit detected (${(similarity * 100).toFixed(0)}% similar), skipping learning extraction.`);
      } else {
        // Significant rewrite, extract learning via Sonnet
        const learningData = await extractLearningData(context, log.ai_draft, agentSent);
      
        if (learningData) {
          // Combine factual rule + style corrections into a single rich feedback
          const stylePart = learningData.style_corrections && learningData.style_corrections !== 'No significant style changes.'
            ? ` | STYLE: ${learningData.style_corrections}`
            : '';
          correctionFeedback = `${learningData.rule}${stylePart}`;

          // Insert into permanent vector database (RAG) with smart deduplication
          // Uses vector similarity to find semantically similar questions, then UPDATES stale answers
          try {
            const embeddingRes = await fetch('https://api.openai.com/v1/embeddings', {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ model: 'text-embedding-3-small', input: learningData.question })
            });
            const embData = await embeddingRes.json();
            const newEmbedding = embData.data?.[0]?.embedding;

            if (newEmbedding) {
              // Vector similarity check: find existing entries with >0.85 similarity
              const { data: similarEntries } = await supabaseAdmin.rpc('match_knowledge', {
                query_embedding: newEmbedding,
                match_threshold: 0.85,
                match_count: 1
              });

              if (similarEntries && similarEntries.length > 0) {
                // Semantically similar question exists, UPDATE with fresh answer (self-heal stale data)
                await supabaseAdmin
                  .from('ai_knowledge_base')
                  .update({ 
                    answer: learningData.answer,
                    embedding: newEmbedding
                  })
                  .eq('id', similarEntries[0].id);
                console.log("Updated stale knowledge entry with fresh agent answer.");
              } else {
                // Genuinely new question, INSERT
                await supabaseAdmin.from('ai_knowledge_base').insert({
                  question: learningData.question,
                  answer: learningData.answer,
                  embedding: newEmbedding
                });
                console.log("Inserted new knowledge entry.");
              }
            }
          } catch (err) {
            console.error("Vector insert error:", err);
          }
        }
      } // end else (significant edit)
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
      .limit(1000); // Deep historical scan for permanent learning

    if (error || !data) return [];
    
    // Frequency-based distillation: instead of sliding off the cache,
    // rules that agents had to correct multiple times become permanent core rules.
    const ruleCounts: Record<string, { count: number, original: string, lastSeen: number }> = {};
    let idx = 0;
    
    for (const row of data) {
      if (!row.correction_feedback) continue;
      // Extract just the factual/stylistic rule, ignoring the deep analysis block
      const ruleOnly = row.correction_feedback.split(' | STYLE:')[0].trim();
      if (ruleOnly === "Style-only correction, no factual error.") continue; // Skip unhelpful rules
      
      const normalized = ruleOnly.toLowerCase();
      if (!ruleCounts[normalized]) {
        ruleCounts[normalized] = { count: 0, original: ruleOnly, lastSeen: idx };
      }
      ruleCounts[normalized].count++;
      idx++;
    }

    // Sort by frequency (descending) so repeated mistakes become permanent memory.
    // If tied, prioritize the more recently seen mistake.
    const sortedRules = Object.values(ruleCounts).sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.lastSeen - b.lastSeen;
    });

    const topRules = sortedRules.slice(0, 15).map(r => r.original);

    recentCorrectionsCache[orgId] = { data: topRules, timestamp: now };
    return topRules;
  } catch (e) {
    console.error("getRecentCorrections error:", e);
    return [];
  }
}
