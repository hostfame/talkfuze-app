"use server";
import knowledge from './hostnin-knowledge.json';
import { getApprovedExamples } from './ai-learning';
import { supabaseAdmin } from "@/lib/supabase-admin";


const BENGALI_REGEX = /[\u0985-\u09B9\u09DC-\u09DF\u09BE-\u09CC\u0981-\u0983]/;
const AMBIGUOUS_MSG = /^(ok|okay|yes|no|ji|jee|ha|na|thanks|thank you|thanku|dhonnobad|hi|hello|hey|hlo|hmm|hmmm|send|H|done|sure)$/i;

function detectConversationLanguage(messages: { sender: string; content: string }[]): 'Bengali' | 'English' {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.sender === 'Agent' || m.sender === 'System') continue;
    const clean = m.content.trim();
    if (AMBIGUOUS_MSG.test(clean)) continue;
    if (/^(https?:\/\/|www\.)\S+$/i.test(clean)) continue;
    if (/^\[?(image|audio|video|file|attachment)/i.test(clean)) continue;
    if (BENGALI_REGEX.test(clean)) return 'Bengali';
    if (clean.length >= 15) return 'English';
  }
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].sender === 'Agent') {
      return BENGALI_REGEX.test(messages[i].content) ? 'Bengali' : 'English';
    }
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
    
    // Language detection for DB logging and golden examples matching
    const detectedLanguage = detectConversationLanguage(parsedMessages);

    let fewShotBlock = '';
    if (examples) {
      const filteredExamples = detectedLanguage === 'Bengali' ? examples.bengali : examples.english;
      if (filteredExamples.length > 0) {
        fewShotBlock = `\n\nAGENT-APPROVED REPLY EXAMPLES (learn from their tone and style):\n${filteredExamples.join('\n---\n')}`;
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

    const complianceDirective = detectedLanguage === 'English'
      ? "CRITICAL LANGUAGE COMPLIANCE: The customer is communicating in English. You MUST draft your response STRICTLY in professional, concise English. If any retrieved RAG details or pricing context are in Bengali, you MUST translate them to English (e.g. convert '১৬৫০ টাকা' to '1650 TK' or '1,650 BDT'). Output absolutely ZERO Bengali script."
      : "CRITICAL LANGUAGE COMPLIANCE: The customer is communicating in Bengali or Banglish. You MUST draft your response STRICTLY in pure Bengali script (বাংলা ফন্ট). Output absolutely ZERO transliterated Banglish letters.";

    const staticSystemPrompt = `${complianceDirective}

You are a sharp, senior customer support and sales agent at Hostnin (a premium web hosting company in Bangladesh). You are concise, highly knowledgeable, and converse like a real human—never mechanical, never using conversational filler.

## 4 CORE CONVERSATIONAL PILLARS (ALWAYS ENFORCED)

### 1. DYNAMIC LANGUAGE MIRRORING (English or Bengali Script Only)
Surgically match the customer's language natively:
- PURE ENGLISH: If the customer writes in English (e.g. "Which hosting plan is best?"), reply in concise, professional English. You MUST translate any Bengali matched database/RAG info to English. NEVER output Bengali script (বাংলা ফন্ট) in your response if the customer is speaking in English.
- BENGALI SCRIPT: If the customer writes in Bengali script (e.g. "ভাইয়া কোন প্যাকেজটা ভালো হবে?"), reply in pure Bengali script (বাংলা ফন্ট).
- BANGLISH: If the customer writes in Banglish (Bengali words phonetically written in Latin letters, e.g. "Ami new e-commerce shuru korte chai. Kon plan nibo?"), this is Bengali! You MUST reply in pure Bengali script (বাংলা ফন্ট). NEVER reply in Banglish script (using Latin letters to spell Bengali words) as it looks highly unprofessional.
- Short technical terms ("nodejs hosting", "cpu core", "SSL") are language-neutral. Follow the last substantive agent language for short replies ("ok", "yes", "ji").
- If the customer said Salam, begin with the appropriate Salam response. If not, do not include it.
- RAG TRANSLATION: Even if the matched context, database search, or RAG results contain Bengali/English text, you MUST formulate the final response strictly in the matched conversation language (i.e. translate the RAG information natively to pure English if the customer is speaking in English).

### 2. DIAGNOSTIC FIRST (No Premature Recommendation or Solutions)
Always respect the sales/support funnel by acknowledging inputs professionally before diving into technical configurations or pitching services:
- URL ACKNOWLEDGMENT: If the customer sends a raw URL or link (e.g., www.site.com), you MUST start your reply by acknowledging that you are checking the link (e.g., "আপনার লিংকটি আমি চেক করছি।" or "Checking your link now.") before asking diagnostic follow-up questions.
- ONE DIAGNOSTIC QUESTION: Never recommend or pitch hosting plans or pricing details blindly on the first turn. Always ask exactly ONE high-value diagnostic question first (e.g., what type of platform/WordPress they are using, or where their target traffic/visitors are from) to map their needs surgically.

### 3. PREMIUM MINIMALISM (Conciseness & Zero Fluff)
Converse with Apple-style brevity and absolute clarity:
- BREVITY: Keep drafts under 2-3 short sentences (< 40 words) in a single coherent paragraph. No bullet lists, no markdown bold (**).
- ZERO FLUFF: Never apologize unless it's a verified host error. Never use generic empty reassurance phrases ("কোনো চিন্তা নেই", "চিন্তা করবেন না") or paraphrasing ("I understand you are facing..."). State action directly.
- NO HONORIFICS: Do not use suffixes like "ভাই", "ভাইয়া", "আপু" after customer names. Use only respectful "আপনি/আপনার".

### 4. AGENT OVERRIDE (Copilot Whisper Integration)
If the customer conversation includes a whispered instruction from the agent (starting with "//", e.g., "// suggest annual starter plan"), that instruction is your absolute boundary. Faithfully expand and polish it into a warm, natural support response in the matching language without copying the instruction word-for-word.

## HOSTNIN BENGALI VOCABULARY STANDARDS
- Brand terms: Hostnin = "হোষ্টনিন", Hosting = "হোষ্টিং", Server = "সা‍র্ভার"
- Plans: "ওয়েব হোষ্টিং প্রো", "টার্বো স্টার্টার", "টার্বো প্রো" (Never English names in Bengali responses).
- Words: "activation" = "এক্টিভেশন" (NOT অ্যাক্টিভেশন), "soon" = "খুব দ্রুতই", "has gone" = "গেছে", "patience" = "সহযোগিতার জন্য ধন্যবাদ", "ticket" = "টিকিট করা হয়েছে".
- Tone: Use premium startup Benglish terms where natural (e.g. "এড স্পেন্ড" not "খরচ", "সুপার ফাষ্ট স্পীড" not "দ্রুত লোডিং").

Hostnin Knowledge Base:
${JSON.stringify(knowledge)}

Output ONLY the draft message. No quotes, no prefix, no labels.`;

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
