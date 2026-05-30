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
  temperature?: number,
  matchedRuleIds?: string[],
  agentInstruction?: string
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
        matched_rules: matchedRuleIds,
        agent_instruction: agentInstruction,
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
async function extractLearningData(context: string, aiDraft: string, agentSent: string): Promise<{ rule: string, style_corrections: string, question: string, answer: string, rule_short?: string } | null> {
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

Output valid JSON strictly containing these keys: 'rule', 'style_corrections', 'question', 'answer', 'rule_short'.
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

5. 'rule_short': A max-30-word single-sentence actionable instruction (in English) that the AI can follow immediately. This should be a direct "Do this" or "Never do this" statement. Examples:
   - "Never list VPS prices manually. Share the pricing page link instead."
   - "Match the conversation's language. If agent switched to English, reply in English."
   - "Answer direct questions first, then ask follow-ups. Do not skip the answer."
   If the correction is purely a minor style change, write the most important vocabulary or tone fix.

Output strictly as JSON: {"rule": "...", "style_corrections": "...", "question": "...", "answer": "...", "rule_short": "..."}`
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
    
    // First get the original draft and instruction to compare
    const { data: log } = await supabaseAdmin
      .from("ai_draft_logs")
      .select("ai_draft, org_id, agent_instruction")
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
      
      // Basic length ratio
      const minLen = Math.min(draft.length, sent.length);
      const lengthRatio = maxLen > 0 ? minLen / maxLen : 1;
      
      // Basic similarity (character position match)
      let matchCount = 0;
      const shorter = draft.length <= sent.length ? draft : sent;
      const longer = draft.length > sent.length ? draft : sent;
      for (let i = 0; i < shorter.length; i++) {
        if (shorter[i] === longer[i]) matchCount++;
      }
      const positionSimilarity = maxLen > 0 ? matchCount / maxLen : 1;
      
      // Lower threshold to 0.70 to capture more meaningful rewrites/reorders
      if (positionSimilarity > 0.70 && lengthRatio > 0.80) {
        // Minor edit (typo/spacing/small tweak), skip expensive Sonnet call
        console.log(`Minor edit detected (PosSim: ${(positionSimilarity * 100).toFixed(0)}%, LenRat: ${(lengthRatio * 100).toFixed(0)}%), skipping learning extraction.`);
      } else {
        // QUALITY GATE: Skip if the agent's sent message is just a generic greeting/placeholder
        // Removed the strict < 40 char limit because short corrections (e.g. "ঈদ মুবারক!") are valid learning points
        const isPlaceholder = /^(hlw|hello|hi|j|ji|yes|no|ok|okay|thanks|thank you|checking|let me check|wait|1 min|hold on|give me a minute|one minute|please wait|sure)[.\s]*$/i.test(sent);
        const isTooShortToLearn = sent.length < 10 && !/[\u0985-\u09B9\u09DC-\u09DF\u09BE-\u09CC\u0981-\u0983]/.test(sent);
        
        if (isPlaceholder || isTooShortToLearn) {
          console.log(`Agent sent a placeholder or extremely short non-Bengali message ("${sent}"). Skipping learning extraction.`);
        } else {
          // Significant rewrite, extract learning via Sonnet
          // If the AI was given a specific instruction, include it in the context so the learning pipeline understands why the AI drafted it that way
          const contextForLearning = log.agent_instruction 
            ? `${context}\n\n[Agent Instruction Given to AI]: "${log.agent_instruction}"` 
            : context;
            
          const learningData = await extractLearningData(contextForLearning, log.ai_draft, agentSent);
      
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
              const enrichedAnswer = `[CRITICAL RULE]: ${learningData.rule}\n[STYLE CORRECTION]: ${learningData.style_corrections}\n\n[VERIFIED REPLY]: ${learningData.answer}`;

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
                    answer: enrichedAnswer,
                    embedding: newEmbedding,
                    rule_short: learningData.rule_short || null,
                    verified_reply_text: learningData.answer || null
                  })
                  .eq('id', similarEntries[0].id);
                console.log("Updated stale knowledge entry with fresh agent answer and rules.");
              } else {
                // Genuinely new question, INSERT
                await supabaseAdmin.from('ai_knowledge_base').insert({
                  question: learningData.question,
                  answer: enrichedAnswer,
                  embedding: newEmbedding,
                  rule_short: learningData.rule_short || null,
                  verified_reply_text: learningData.answer || null
                });
                console.log("Inserted new knowledge entry with compounding rules.");
              }
            }
          } catch (err) {
            console.error("Vector insert error:", err);
          }
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
 * Automagically extract AI training rules from internal agent notes.
 * Triggered when an agent sends an internal message discussing AI behavior.
 */
export async function processInternalAiFeedback(conversationId: string, internalNote: string): Promise<void> {
  try {
    const trimmedNote = internalNote.trim();
    // Deterministic trigger: Only process if the note explicitly starts with '///'
    if (!trimmedNote.startsWith('///')) {
      return;
    }
    
    // Strip the '///' prefix to analyze the actual instruction content
    const cleanInstruction = trimmedNote.substring(3).trim();
    if (!cleanInstruction) return;

    // Fetch the last few messages for context
    const { data: messages } = await supabaseAdmin
      .from("messages")
      .select("content, sender_type, is_internal")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(10);
      
    if (!messages) return;
    
    // Reverse to chronological
    const contextLines = messages.reverse().map(m => `[${m.is_internal ? 'Internal Note' : m.sender_type === 'agent' ? 'Agent' : 'Customer'}]: ${m.content}`).join('\n');

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return;

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
        system: `You are an AI support trainer for a Bengali hosting company. An agent just left an internal note instructing you or other agents on how to improve the AI's responses.
        
Read the conversation context and the internal note. If the internal note contains a valid rule or correction for the AI's conversational style or logic, extract it.

Output valid JSON strictly containing:
'is_ai_rule': boolean (true if the note contains a rule for the AI, false otherwise)
'extracted_rule': A concise 1-2 sentence actionable rule for the AI based on the internal note.
'question': A 1-sentence summary of what kind of customer queries this rule applies to.
'answer': A fictional ideal response demonstrating this rule.`,
        messages: [
          {
            role: "user",
            content: `Conversation Context:\n${contextLines}\n\nInternal Note (Feedback):\n"${cleanInstruction}"\n\nOutput strictly as JSON: {"is_ai_rule": boolean, "extracted_rule": "...", "question": "...", "answer": "..."}`
          }
        ]
      })
    });

    if (!response.ok) return;
    const data = await response.json();
    const textContent = data.content?.[0]?.text || "";
    const cleanJson = textContent.replace(/```json|```/g, "").trim();
    const result = JSON.parse(cleanJson);

    if (result.is_ai_rule && result.extracted_rule && result.question && result.answer) {
      // Vectorize and save
      const embeddingRes = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'text-embedding-3-small', input: result.question })
      });
      const embData = await embeddingRes.json();
      const newEmbedding = embData.data?.[0]?.embedding;

      if (newEmbedding) {
        const enrichedAnswer = `[MANUAL TEACHING RULE]: ${result.extracted_rule}\n\n[IDEAL REPLY]: ${result.answer}`;
        
        await supabaseAdmin.from('ai_knowledge_base').insert({
          question: result.question,
          answer: enrichedAnswer,
          embedding: newEmbedding
        });
        console.log("Successfully extracted and injected manual AI rule from internal note.");
      }
    }
  } catch (e) {
    console.error("processInternalAiFeedback error:", e);
  }
}

/**
 * LAYER 3: Conversation Completion Learning
 * 
 * Analyzes a completed conversation to extract workflow patterns.
 * Unlike edit-based learning (Layer 2) which captures single-turn corrections,
 * this captures HOW the agent navigated the full conversation:
 * - What was the issue?
 * - What info did the agent collect?
 * - How was it resolved?
 * - What was the best agent reply?
 * 
 * Triggered when a conversation has been idle for 1+ hour.
 */
export async function learnFromResolvedConversation(conversationId: string): Promise<void> {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    const openaiKey = process.env.OPENAI_API_KEY;
    if (!apiKey || !openaiKey) return;

    // Deduplication: check if already analyzed and mark immediately to prevent race conditions
    const { data: conv } = await supabaseAdmin
      .from('conversations')
      .select('tags')
      .eq('id', conversationId)
      .single();
    
    if (!conv) return;
    const existingTags = conv.tags || [];
    if (existingTags.includes('ai_learned')) return; // Already processed

    // Mark as analyzed immediately (before Sonnet call) to prevent double-processing
    await supabaseAdmin
      .from('conversations')
      .update({ tags: [...existingTags, 'ai_learned'] })
      .eq('id', conversationId);

    // Fetch all messages from the conversation
    const { data: messages, error: msgError } = await supabaseAdmin
      .from("messages")
      .select("content, sender_type, content_type, is_internal, created_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })
      .limit(50);

    if (msgError || !messages || messages.length < 3) return;

    // Filter out internal notes and non-text messages for analysis
    const relevantMessages = messages.filter(
      m => !m.is_internal && m.content && (m.content_type === 'text' || m.content_type === 'system')
    );
    if (relevantMessages.length < 3) return;

    // Skip if mostly system messages (auto-replies, joins, etc.)
    const humanMessages = relevantMessages.filter(m => m.sender_type === 'contact' || m.sender_type === 'agent');
    if (humanMessages.length < 2) return;

    // Build conversation transcript
    const transcript = relevantMessages.map(m => {
      const role = m.sender_type === 'contact' ? 'Customer' 
        : m.sender_type === 'agent' ? 'Agent' 
        : 'System';
      return `[${role}]: ${m.content}`;
    }).join('\n');

    // Send to Sonnet for analysis
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5-20250929",
        max_tokens: 500,
        system: `You are analyzing a completed customer support conversation for a Bangladeshi hosting company (Hostnin). Extract the resolution pattern so the AI can learn how to handle similar conversations in the future.

Output valid JSON with these keys:
- issue_type: one of "website_down", "slow_site", "nameserver", "domain_transfer", "domain_replace", "ssl", "email", "wordpress", "cpanel_access", "billing", "renewal", "sales_inquiry", "greeting_only", "other"
- issue_summary: 1-sentence summary of the customer's problem (in English)
- info_collected: array of strings listing what info the agent gathered (e.g., ["domain: example.com", "issue: SSL not showing"])
- resolution: one of "ticket_created", "resolved_in_chat", "info_provided", "sale_completed", "no_resolution", "greeting_only"
- agent_workflow: 1-sentence summary of the agent's steps (in English). Example: "Greeted, asked for domain, confirmed SSL issue, created ticket"
- key_reply: The single most useful agent reply from this conversation (verbatim, in original language)
- quality_score: 1-5 rating of how well the agent handled this. 5=perfect, 1=poor/wrong info

You MUST return ONLY the raw JSON string. No markdown.`,
        messages: [
          {
            role: "user",
            content: `Analyze this completed conversation:\n\n${transcript}\n\nOutput strictly as JSON.`
          }
        ]
      })
    });

    if (!response.ok) {
      console.error("[ConversationLearning] Sonnet analysis failed:", response.status);
      return;
    }

    const data = await response.json();
    const textContent = data.content?.[0]?.text || "";
    const cleanJson = textContent.replace(/```json|```/g, "").trim();
    const result = JSON.parse(cleanJson);

    // Quality gates
    if (!result.issue_type || !result.issue_summary || !result.agent_workflow) return;
    if (result.quality_score && result.quality_score < 3) {
      console.log(`[ConversationLearning] Skipping low-quality conversation (score: ${result.quality_score})`);
      return;
    }
    if (result.issue_type === 'greeting_only' || result.resolution === 'greeting_only') return;

    // Build the knowledge entry
    const question = `Support: ${result.issue_summary}`;
    const infoList = (result.info_collected || []).join(', ');
    const answer = `[RESOLUTION PATTERN]: ${result.agent_workflow}\n[INFO COLLECTED]: ${infoList}\n[RESOLUTION]: ${result.resolution}\n[KEY REPLY]: ${result.key_reply || 'N/A'}`;
    const ruleShort = result.agent_workflow;
    const verifiedReply = result.key_reply || null;

    // Generate embedding
    const embeddingRes = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'text-embedding-3-small', input: question })
    });
    const embData = await embeddingRes.json();
    const newEmbedding = embData.data?.[0]?.embedding;

    if (!newEmbedding) return;

    // Deduplication: check for similar existing patterns (0.88 threshold)
    const { data: similarEntries } = await supabaseAdmin.rpc('match_knowledge', {
      query_embedding: newEmbedding,
      match_threshold: 0.88,
      match_count: 1
    });

    if (similarEntries && similarEntries.length > 0) {
      // Similar pattern exists - only update if this is a high-quality pattern
      const existingAnswer = similarEntries[0].answer || '';
      const existingIsPattern = existingAnswer.includes('[RESOLUTION PATTERN]');
      
      if (!existingIsPattern || (result.quality_score && result.quality_score >= 4)) {
        await supabaseAdmin
          .from('ai_knowledge_base')
          .update({
            answer,
            embedding: newEmbedding,
            rule_short: ruleShort,
            verified_reply_text: verifiedReply
          })
          .eq('id', similarEntries[0].id);
        console.log(`[ConversationLearning] Updated existing pattern for: ${result.issue_type}`);
      }
    } else {
      // New pattern - insert
      await supabaseAdmin.from('ai_knowledge_base').insert({
        question,
        answer,
        embedding: newEmbedding,
        rule_short: ruleShort,
        verified_reply_text: verifiedReply
      });
      console.log(`[ConversationLearning] New resolution pattern: ${result.issue_type} - ${result.issue_summary}`);
    }
  } catch (e) {
    console.error("[ConversationLearning] Error:", e);
  }
}

/**
 * Batch process idle conversations for learning.
 * Finds conversations idle for 1+ hour with 3+ messages that haven't been analyzed yet.
 * Called via API route (can be triggered by cron or manually).
 */
export async function processIdleConversationsForLearning(): Promise<{ processed: number; errors: number }> {
  let processed = 0;
  let errors = 0;

  try {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    // Find conversations that:
    // 1. Have last_message_at older than 1 hour
    // 2. Have not been analyzed yet (no 'ai_learned' tag)
    const { data: conversations, error } = await supabaseAdmin
      .from('conversations')
      .select('id, tags')
      .lt('last_message_at', oneHourAgo)
      .not('tags', 'cs', '{"ai_learned"}')
      .in('status', ['open', 'resolved', 'closed'])
      .order('last_message_at', { ascending: false })
      .limit(20); // Process max 20 per batch to control costs

    if (error || !conversations) return { processed: 0, errors: 0 };

    for (const conv of conversations) {
      try {
        // Check message count before processing
        const { count } = await supabaseAdmin
          .from('messages')
          .select('id', { count: 'exact', head: true })
          .eq('conversation_id', conv.id)
          .eq('is_internal', false);

        if (count && count >= 3) {
          // learnFromResolvedConversation handles tagging internally
          await learnFromResolvedConversation(conv.id);
          processed++;
        } else {
          // Mark conversations with < 3 messages as analyzed to prevent re-checking
          const existingTags = conv.tags || [];
          if (!existingTags.includes('ai_learned')) {
            await supabaseAdmin
              .from('conversations')
              .update({ tags: [...existingTags, 'ai_learned'] })
              .eq('id', conv.id);
          }
        }

      } catch (e) {
        console.error(`[ConversationLearning] Error processing ${conv.id}:`, e);
        errors++;
      }
    }
  } catch (e) {
    console.error("[ConversationLearning] Batch processing error:", e);
  }

  console.log(`[ConversationLearning] Batch complete: ${processed} processed, ${errors} errors`);
  return { processed, errors };
}
