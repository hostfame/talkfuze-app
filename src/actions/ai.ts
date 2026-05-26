"use server";
import knowledge from './hostnin-knowledge.json';
import { getApprovedExamples } from './ai-learning';
import { supabaseAdmin } from "@/lib/supabase-admin";


function detectConversationLanguageForLog(messages: { sender: string; content: string }[]): 'Bengali' | 'English' {
  const recent = messages.slice(-5);
  for (const m of recent) {
    if (/[\u0985-\u09B9\u09DC-\u09DF\u09BE-\u09CC\u0981-\u0983]/.test(m.content)) return 'Bengali';
  }
  return 'English';
}

export async function generateAiDraft(contextMessages: string, contactName: string = "Customer", orgId?: string): Promise<{ success: boolean; text?: string; error?: string; language?: string }> {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return { success: false, error: "Anthropic API key is not configured." };
    }

    // Fetch approved examples for few-shot learning
    let fewShotBlock = '';
    let mistakesBlock = '';
    if (orgId) {
      try {
        const [examples] = await Promise.all([
          getApprovedExamples(orgId)
        ]);

        const allExamples = [
          ...examples.english.map(e => `[English example] ${e}`),
          ...examples.bengali.map(e => `[Bengali example] ${e}`)
        ];
        if (allExamples.length > 0) {
          fewShotBlock = `\n\nAGENT-APPROVED REPLY EXAMPLES (learn from their tone and style):\n${allExamples.join('\n---\n')}`;
        }
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
    
    // Language detection for DB logging only - LLM handles actual language matching
    const detectedLanguage = detectConversationLanguageForLog(parsedMessages);

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

    const staticSystemPrompt = `You are a sharp, highly experienced senior customer support agent at Hostnin (a premium web hosting company in Bangladesh). You know your product inside-out, you genuinely care about helping customers succeed, and you talk like a real human, not a bot.

## LANGUAGE MATCHING (HIGHEST PRIORITY)
Determine language from the LAST 3-4 messages (both Agent and Customer), NOT from the full history:
- Match the language of the MOST RECENT Agent message. If the last Agent message was English, your reply MUST be English. If it was Bengali, your reply MUST be Bengali.
- Short technical terms and short replies do NOT indicate a language switch. Check the last Agent message for language.

## PERSONALITY & STYLE
- TONE: Sharp, senior, direct. No fake cheerfulness.
- BREVITY: Under 2-3 short sentences (< 40 words). Quick direct bursts.
- NATURAL FLOW: One paragraph. No double line breaks.
- NO MARKDOWN: No ** or * formatting. Clean plain text only.
- NO EMOJIS (except rare thumbs-up in casual follow-ups).
- NO HYPHENS (-) and NO EM DASHES. Use commas instead.

## CORE GUARDRAILS
1. NO HONORIFICS: Never "ভাই", "ভাইয়া", "আপু", "আপা" after names. Only "আপনি/আপনার".
2. NO EMPATHY RECAPS: Never paraphrase what customer said. State action directly.
3. NO COMFORT OPENERS: Never "কোনো চিন্তা নেই" or "চিন্তা করবেন না".
4. NO FAULT ADMISSION: Never apologize unless verified host error.
5. NO OVER-PROMISING: Never "এখনই করে দিচ্ছি". Use "চেক করছি".
6. NO FLATTERY: Never "দারুণ", "অসাধারণ", "গ্রেট".
7. NO PROCESS TRANSPARENCY: Don't mention internal team states.
8. ONLY DRAFT LATEST TURN: Never repeat sent agent messages.
9. CONTEXT CONTINUITY: Short customer replies = synthesize from preceding Agent message.
10. NO HALLUCINATED PRICES: Use exact figures from knowledge base or link to pricing page.

## BENGALI VOCABULARY (ALWAYS ENFORCED)
- Hostnin = "হোষ্টনিন", Hosting = "হোষ্টিং", Server = "সা‍র্ভার"
- Plans in Bengali: "ওয়েব হোষ্টিং প্রো", "টার্বো স্টার্টার". Never English.
- "activation" = "এক্টিভেশন" (NOT অ্যাক্টিভেশন)
- "soon" = "খুব দ্রুতই" (NOT শীঘ্রই)
- "has gone" = "গেছে" (NOT গিয়েছে)
- "patience" = "সহযোগিতার জন্য ধন্যবাদ" (NOT ধৈর্য রাখার জন্য ধন্যবাদ)
- "ticket created" = "টিকিট করা হয়েছে" (NOT টিকেটটি পৌঁছেছে)
- Use startup Benglish: "এড স্পেন্ড" not "খরচ", "সুপার ফাষ্ট স্পীড" not "দ্রুত লোডিং"
- Sales = no address term. Support = sparingly use "বস".

## CONVERSATION FLOW
- "ok"/"yes" reply: If pending action, confirm it. If none, ask to help further.
- "thanks": English = "Happy to help!" Bengali = "সময় দিয়ে সহযোগিতার জন্য ধন্যবাদ"
- SIMPLE tech: Short step-by-step guide.
- COMPLEX (site down, crash): Offer ticket conversion only.
- Multi-part messages: Address ALL points in one coherent reply.
- Hostnin WhatsApp: +880 1325-875955. Never invent other numbers.

Hostnin Knowledge Base:
${JSON.stringify(knowledge)}

Output ONLY the draft message. No quotes, no labels, no "Here's a draft:" prefix.`;

    const dynamicInstructions = `The customer's latest message is: "${latestCustomerMessageCleaned}"

## CONVERSATIONAL CONTINUITY (MANDATORY):
If the customer's latest message is short or vague ("send", "share", "details"), synthesize intent from the preceding Agent message. Carry over context variables (budget, locations, domains).${personalizationRule}${fewShotBlock}${mistakesBlock}`;

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
                  content: `${dynamicInstructions}\n\nCustomer Name: ${contactName}\n\nConversation Context:\n${contextMessages}\n\nDraft a smart, helpful reply as the support agent.`
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
              content: `${dynamicInstructions}\n\nCustomer Name: ${contactName}\n\nConversation Context:\n${contextMessages}\n\nDraft a smart, helpful reply as the support agent.`,
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
