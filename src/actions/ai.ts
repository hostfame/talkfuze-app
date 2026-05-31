"use server";

import { getApprovedExamples } from './ai-learning';
import { supabaseAdmin } from "@/lib/supabase-admin";

import { getSalesFunnelContent } from "@/data/sales-funnel";
import { banglaStyleContent } from "@/data/bangla-style";

// ============================================================
// SYSTEM PROMPT BUILDER
// Personality + Dynamic situational context modules
// ============================================================

export async function generateAiDraft(contextMessages: string, contactName: string = "Customer", orgId?: string): Promise<{ success: boolean; text?: string; error?: string; language?: string }> {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return { success: false, error: "Anthropic API key is not configured." };
    }

    // Fetch approved examples for few-shot learning
    let examples: { english: string[]; bengali: string[] } | null = null;
    let mistakesBlock = '';
    if (orgId) {
      try {
        examples = await getApprovedExamples(orgId);
      } catch (e) {
        // Silently fail, few-shot/corrections are optional enhancements
      }
    }

    // Robust parsing of context messages
    let currentSender = 'System';
    const parsedMessages: { sender: string; content: string }[] = [];
    
    for (const line of contextMessages.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const match = trimmed.match(/^\[([^\]]+)\]:\s*(.*)$/);
      if (match) {
        currentSender = match[1];
        parsedMessages.push({ sender: currentSender, content: match[2] });
      } else if (parsedMessages.length > 0) {
        parsedMessages[parsedMessages.length - 1].content += '\n' + trimmed;
      }
    }
    
    const customerMessages = parsedMessages.filter(m => m.sender !== 'Agent' && m.sender !== 'System');

    // Detect active conversation state to guide LLM attention
    let activeStateInstruction = "";
    const lastMsg = parsedMessages[parsedMessages.length - 1];
    if (lastMsg && (lastMsg.sender === 'Agent' || lastMsg.sender === 'System')) {
      activeStateInstruction = `[ACTIVE STATE]: The customer's latest message has ALREADY been responded to/addressed by the Agent. The last message in the thread is an Agent message. Do NOT repeat or duplicate greetings, acknowledgments, links, or diagnostic answers that the Agent has already sent. Focus strictly on generating a continuation or follow-up that builds upon the Agent's latest message.`;
    }
    
    // Language is natively detected by the LLM now. We don't guess it here.
    const detectedLanguage = 'unknown';

    let fewShotBlock = '';
    if (examples) {
      const examplesBengali = examples.bengali;
      const examplesEnglish = examples.english;
      if (examplesBengali.length > 0 || examplesEnglish.length > 0) {
        fewShotBlock = `\n\n<english_examples>
RECENT APPROVED ENGLISH REPLIES (Mimic this tone and brevity):
${examplesEnglish.join('\n---\n')}
</english_examples>

<bengali_examples>
RECENT APPROVED BENGALI REPLIES (Mimic this tone and brevity):
${examplesBengali.join('\n---\n')}
</bengali_examples>`;
      }
    }

    // Extract customer's name for personalization
    let customerFirstName = '';
    for (const msg of customerMessages) {
      if (msg.sender && !['agent', 'system', 'website visitor'].some(s => msg.sender.toLowerCase().startsWith(s))) {
        const fullName = msg.sender.trim();
        const parts = fullName.split(/\s+/).filter(p => !['md', 'md.', 'mr', 'mr.', 'mrs', 'mrs.', 'ms', 'ms.'].includes(p.toLowerCase()));
        customerFirstName = parts[0] || fullName.split(/\s+/)[0] || '';
        break;
      }
    }
    const personalizationRule = customerFirstName
      ? `\n\nPERSONALIZATION: The customer's name is "${customerFirstName}". Use it naturally in greetings.`
      : '';

    // Extract the customer's LATEST message
    const latestCustomerMessageCleaned = customerMessages.length > 0
      ? customerMessages[customerMessages.length - 1].content.trim()
      : '';

    const currentBanglaStyle = banglaStyleContent;

    // Detect sales/pricing intent in conversation context
    const salesKeywords = /price|cost|buy|order|plan|package|hosting|domain|payment|renew|taka|bdt|charge|discount|coupon|offer|টাকা|দাম|প্যাকেজ|হোস্টিং|কিনি|কিনতে|সার্ভার|রিনিউ/i;
    const hasSalesIntent = salesKeywords.test(latestCustomerMessageCleaned) || 
                          parsedMessages.some(m => salesKeywords.test(m.content));
    const salesContent = hasSalesIntent ? getSalesFunnelContent() : "";



    const staticSystemPrompt = `## IDENTITY
You are Hostnin's support agent - a premium web hosting company in Bangladesh. You are a professional coach: calm, direct, practical. Never an excited cheerleader. You converse like a real human, never mechanical.

## OUTPUT FORMAT (MANDATORY)
You MUST begin your response with exactly one classification tag on the very first line:
'[Language: Bengali]' if replying in Bengali script.
'[Language: English]' if replying in English.
Then output a blank line, then start your actual draft response.

## LANGUAGE MATCHING
Match the customer's language autonomously:
1. PURE ENGLISH: If the customer writes in English (e.g. "Which hosting plan is best?"), output '[Language: English]' and reply in English.
2. BENGALI SCRIPT: If the customer writes in Bengali script (e.g. "ভাইয়া কোন প্যাকেজটা ভালো হবে?"), output '[Language: Bengali]' and reply in pure Bengali script.
3. BANGLISH: If the customer writes in Banglish (Bengali words in Latin letters, e.g. "kaj korbe", "Ami new e-commerce shuru korte chai"), this IS Bengali. Output '[Language: Bengali]' and reply in pure Bengali script. Never reply in transliterated Banglish.
4. "BD" TRAP: If an English-speaking customer mentions "BD" or "Bangladesh", they are referring to a geographic location, NOT requesting Bengali language. Stay in English.

## REPLY STYLE
1. CONCISE & STRUCTURED: Keep responses under 2-3 sentences (< 45 words). If the response contains distinct parts (e.g., pricing/details followed by a question), split them with a blank line into 2 brief paragraphs. Keep simple one-sentence replies on a single line (no blank line). Never use bullet lists or bold (**). Go straight to the point with zero filler.
2. STATE AWARENESS: Read conversation history. NEVER repeat greetings, acknowledgments, or actions already completed. Always advance forward. If customer repeats a question already answered, reference your prior reply ("as I mentioned earlier" or "পূর্বে যেমনটি জানিয়েছিলাম").
3. AGENT OVERRIDE: If there is a whispered instruction (starting with "//"), expand and polish it. Match the conversation's language.
4. ZERO FILLER: No "great question", "excellent", "wonderful", "very nice project". No honorifics (বস, স্যার, ভাই, আপু) in sales/pricing. Use "আপনি/আপনার" when in Bengali.
5. LANGUAGE TRANSLATION: Technical terms are language-neutral. Translate RAG matches to the response language.

## ESCALATION
If a technical issue is not resolved after 2-3 exchanges of basic guidance, offer ticket conversion.

${salesContent ? `\n\n${salesContent}` : ""}
${currentBanglaStyle ? `\n\n${currentBanglaStyle}` : ""}

Output ONLY the tag and the draft message.`;

    const dynamicInstructions = `${activeStateInstruction ? `${activeStateInstruction}\n\n` : ''}The customer's latest message is: "${latestCustomerMessageCleaned}"
 
## CONVERSATIONAL CONTINUITY (MANDATORY):
If the customer's latest message is short or vague ("send", "share", "details"), synthesize intent from the preceding Agent message. Carry over context variables (budget, locations, domains).${personalizationRule}${fewShotBlock}${mistakesBlock}`;

    const finalComplianceCheck = `\n\n## FINAL COMPLIANCE CHECK (MANDATORY):
- Shopify is IRRELEVANT. You MUST never mention Shopify as an option.
- STRICT DIAGNOSTIC RULE: Respect the 4-step Sales Funnel (Type -> Region -> Ads -> Budget). Recommend only after details are clear or can be easily inferred from context. If context is clear, recommend confidently.
- PARAGRAPH BREAKING: If your reply contains multiple sentences or distinct ideas (such as pricing details AND a follow-up question), you MUST split them into exactly two paragraphs using a double line break (\\n\\n). Never output a single dense paragraph for a multi-part message.`;

    let draftText = "";
    let useClaudeBackup = false;
    const deepseekKey = process.env.DEEPSEEK_API_KEY;

    if (deepseekKey) {
      try {
        console.log('[generateAiDraft] Attempting DeepSeek-chat with 1.5s timeout...');
        const abortController = new AbortController();
        const timeoutId = setTimeout(() => abortController.abort(), 1500);

        try {
          const dsResponse = await fetch("https://api.deepseek.com/chat/completions", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${deepseekKey}`,
              "Content-Type": "application/json",
            },
            signal: abortController.signal,
            body: JSON.stringify({
              model: "deepseek-chat",
              max_tokens: 600,
              temperature: 0.2,
              messages: [
                {
                  role: "system",
                  content: staticSystemPrompt
                },
                {
                  role: "user",
                  content: `${dynamicInstructions}\n\nCustomer Name: ${contactName}\n\nConversation Context:\n${contextMessages}\n\nDraft a smart, helpful reply as the support agent.${finalComplianceCheck}`
                }
              ]
            })
          });

          clearTimeout(timeoutId);

          if (dsResponse.ok) {
            const data = await dsResponse.json();
            draftText = data.choices?.[0]?.message?.content || "";
            console.log('[generateAiDraft] Success with DeepSeek-chat');
          } else {
            const errText = await dsResponse.text();
            console.error('[generateAiDraft] DeepSeek API error:', dsResponse.status, errText);
            useClaudeBackup = true;
          }
        } catch (fetchErr: any) {
          clearTimeout(timeoutId);
          console.warn('[generateAiDraft] DeepSeek fetch aborted or failed:', fetchErr.message);
          useClaudeBackup = true;
        }
      } catch (dsErr: any) {
        console.error('[generateAiDraft] DeepSeek connection exception:', dsErr.message);
        useClaudeBackup = true;
      }
    } else {
      useClaudeBackup = true;
    }

    if (useClaudeBackup || !draftText) {
      console.log('[generateAiDraft] Falling back to Claude Haiku...');
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-3-haiku-20240307",
          max_tokens: 600,
          system: staticSystemPrompt,
          messages: [
            {
              role: "user",
              content: `${dynamicInstructions}\n\nCustomer Name: ${contactName}\n\nConversation Context:\n${contextMessages}\n\nDraft a smart, helpful reply as the support agent.${finalComplianceCheck}`,
            },
          ],
        }),
      });

      if (!response.ok) {
        const err = await response.text();
        console.error("Anthropic API Error:", err);
        let parsedErr = err;
        try {
          parsedErr = JSON.parse(err).error?.message || err;
        } catch(e) {}
        return { success: false, error: `Both DeepSeek and Claude failed. Claude error: ${parsedErr}` };
      }

      const data = await response.json();
      console.log("Anthropic Response Usage:", data.usage);
      draftText = data.content?.[0]?.text || "";
    }

    if (!draftText) {
      return { success: false, error: "AI returned an empty response." };
    }

    return { success: true, text: draftText.trim(), language: detectedLanguage };
  } catch (error: any) {
    console.error("AI Draft Generation failed:", error);
    return { success: false, error: error.message || "An unexpected error occurred." };
  }
}

/**
 * Validates a learning rule in real-time by generating a new draft under active rules,
 * then uses Claude 4.5 Sonnet to score and critique the improvement.
 */
export async function validateRuleEffectiveness(logId: string): Promise<{
  success: boolean;
  newDraft?: string;
  score?: number;
  verdict?: string;
  error?: string;
}> {
  try {
    const { data: log, error: fetchErr } = await supabaseAdmin
      .from("ai_draft_logs")
      .select("ai_draft, agent_sent, customer_context, org_id, correction_feedback")
      .eq("id", logId)
      .single();

    if (fetchErr || !log) {
      return { success: false, error: "Log not found." };
    }

    if (!log.customer_context) {
      return { success: false, error: "Context messages are missing from this log." };
    }

    // 1. Generate a NEW draft under the current rules (includes the newly vector-embedded rules!)
    const draftRes = await generateAiDraft(log.customer_context, "Customer", log.org_id);
    if (!draftRes.success || !draftRes.text) {
      return { success: false, error: draftRes.error || "Failed to generate new draft." };
    }

    const newDraft = draftRes.text;

    // 2. Grade the new draft using Claude 4.5 Sonnet
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return { success: false, error: "Anthropic key is not configured." };
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 1000,
        system: "You are an expert AI CRM QA engineer. You evaluate how successfully a new AI draft resolved a past mistake by following a specific learning rule. You output valid JSON strictly containing two keys: 'score' (an integer from 0 to 100 representing how closely it adhered to the rule and matched/improved the agent's goal) and 'verdict' (a concise 1-sentence explanation of why the new draft successfully avoided the mistake and followed the rule, or how it failed). You MUST return ONLY the raw JSON string. Do not wrap it in markdown code blocks.",
        messages: [
          {
            role: "user",
            content: `Compare the Old Mistaken AI Draft, the Learning Rule, the Agent's Final Verified Target, and the New AI Draft.

Customer Asked:
"${log.customer_context}"

Old Mistaken AI Draft:
"${log.ai_draft}"

Learning Rule:
"${log.correction_feedback || 'Avoid generic templates and match target response'}"

Agent's Target Reply:
"${log.agent_sent}"

New Live AI Draft (to validate):
"${newDraft}"

Evaluate if the New AI Draft successfully:
1. Followed the Learning Rule.
2. Avoided the Old Mistaken Draft's exact failure.
3. Aligned with the Agent's Target tone/style.

Output strictly in JSON: {"score": 95, "verdict": "..."}`
          }
        ]
      })
    });

    if (!response.ok) {
      return { success: false, error: "Failed to grade draft validation." };
    }

    const resData = await response.json();
    const textContent = resData.content?.[0]?.text || "";
    const cleanJson = textContent.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleanJson);

    const score = typeof parsed.score === 'number' ? parsed.score : 0;
    const verdict = parsed.verdict || "Successfully validated.";

    // 3. Save validation metrics to database
    await supabaseAdmin
      .from("ai_draft_logs")
      .update({
        validation_draft: newDraft,
        validation_score: score,
        validation_verdict: verdict
      })
      .eq("id", logId);

    return {
      success: true,
      newDraft,
      score,
      verdict
    };
  } catch (err: any) {
    console.error("validateRuleEffectiveness error:", err);
    return { success: false, error: err.message || "Unexpected validation error." };
  }
}
