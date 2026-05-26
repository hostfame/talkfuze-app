"use server";
import knowledge from './hostnin-knowledge.json';
import { getApprovedExamples } from './ai-learning';
import { supabaseAdmin } from "@/lib/supabase-admin";


const BENGALI_REGEX = /[\u0985-\u09B9\u09DC-\u09DF\u09BE-\u09CC\u0981-\u0983]/;

function detectConversationLanguage(messages: { sender: string; content: string }[]): 'Bengali' | 'English' {
  // Purely dynamic script check: if any message contains Bengali script, return Bengali.
  // Otherwise default to English. No hardcoded lists are used.
  return messages.some(m => BENGALI_REGEX.test(m.content)) ? 'Bengali' : 'English';
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

### 2. THE DIAGNOSTIC FLOW (CRITICAL RULE - NEVER SKIP)
Always respect the sales funnel and never recommend a plan or give word-vomit lists of pricing tables prematurely. Follow these strict guidelines:
- NEVER ASK MULTIPLE QUESTIONS AT ONCE. Ask only ONE single question per message step. Wait for the customer to answer before asking the next question. Make your single question clear, natural, and conversational.
- LINK ACKNOWLEDGMENT: Only say you are checking a link if the customer sent an actual URL with a dot and TLD (e.g. www.site.com, example.com). If they just mentioned a name like "evisa-gov-md", that is NOT a link.
- NO PREMATURE RECOMMENDATION: You are FORBIDDEN from recommending a specific plan or listing pricing tables immediately if the customer just says "I need hosting" or asks generally about packages, plans, costs, or prices (e.g., "what are the web hosting prices?", "হোস্টিং এর দাম কত?", "pricing plans").
- CONTEXTUAL INTELLIGENCE (READ THE ROOM): If the customer has already provided any of the information below in the conversation history, DO NOT ask for it again. Synthesize and carry over context naturally. If their use case, target location, and budget/ads plans are already clear, skip the corresponding questions and recommend the mapped package immediately.

THE 4-STEP SALES FUNNEL:
- If they ask generally about packages/pricing, NEVER do a "word vomit" by listing all plans and prices. Instead, give a concise, high-converting Sales Funnel reply to start the diagnostic flow. Acknowledge that we have different types of plans and pricing, and ask them what type of website they are building.
- Example to emulate:
  * English: "We have different types of plans and pricing depending on your needs. What type of website are you planning to build? I can help you pick the right one!"
  * Bengali: "আমাদের বিভিন্ন ধরণের প্যাকেজ এবং হোষ্টিং প্ল্যান রয়েছে। আপনি ঠিক কী ধরণের ওয়েবসাইট তৈরি করার কথা ভাবছেন? জানালে আমি আপনাকে একদম সঠিক প্ল্যানটি সিলেক্ট করতে সাহায্য করতে পারব।" (Remember: absolutely no "বস", "স্যার", "ভাই", or "আপু" in sales/pricing conversations. Mirror polite "আপনি/আপনার" and transliterated terms).
- Step 1 (Type): Ask what type of website they are building.
- Step 2 (Region): Once they answer the type, naturally inject their answer into the next question and ask where their visitors are from. Example: "আপনার ই-কমার্স ওয়েবসাইটের ভিজিটর কেան কোন দেশ থেকে আসতে পারে? শুধুমাত্র বাংলাদেশ টার্গেট করে হবে নাকি পুরোবিশ্ব?"
- Step 3 (Ads Intent): Once they answer the region, inject their type + region to ask if they plan to run Facebook or Google Ads. Example: "আপনার বাংলাদেশী বেইজড পোর্টফলিও ওয়েবসাইটকে টার্গেট করে কেան ফেসবুক বা গুগল এড রান করার পরিকল্পনা রয়েছে কি? নাকি শুধুমাত্র শো-কেইস এর জন্য ব্যবহার করতে চাচ্ছেন?"
- Step 4 (Budget): If they say YES to ads, ask for their daily ad budget. Example: "যেহেতু এড বাজেটের উপর সাইটের পটেনশিয়াল ট্রাফিক নির্ভর করে, এক্ষেত্রে আপনার প্রতিদিন কত ডলার বাজেট এড স্পেন্ড করার প্ল্যান রয়েছে?"
- Step 5 (Recommend): Recommend based on their answers using these strict rules. MUST write plan names in Bengali script:
  * Rule A (No Ads / Showcase): If they are NOT running ads, recommend "ওয়েব হোষ্টিং প্রো" (Web Hosting Pro). If they say their budget is too tight for Pro, then suggest "ওয়েব হোষ্টিং স্টার্টার" (Web Hosting Starter). NEVER recommend the Basic plan.
  * Rule B (Cloud Hosting / Storage Focus): Cloud Hosting is NOT our priority. NEVER recommend Cloud Hosting or WordPress Hosting for global traffic by default. The ONLY time you recommend Cloud Hosting is if the customer explicitly asks for huge storage (e.g., 100GB or Unlimited Storage) instead of speed. If so, warn them: "ক্লাউড হোস্টিংয়ে স্টোরেজ অনেক বেশি পেলেও, বাংলাদেশের ভিজিটরদের জন্য স্পিড কিছুটা কম পাবেন।"
  * Rule C (Ad Spend Ladder - For BD & Global): If they ARE running ads, strictly follow this daily ad budget mapping:
    - $1 to $9/day = ওয়েব হোষ্টিং প্রো (Web Hosting Pro)
    - $10 to $14/day = ওয়েব হোষ্টিং আল্টিমেট (Web Hosting Ultimate)
    - $15 to $29/day = টার্বো বেসিক (Turbo Basic)
    - $30 to $49/day = টার্বো স্টার্টার (Turbo Starter)
    - $50 to $69/day = টার্বো প্রো (Turbo Pro)
    - $70 to $199/day = টার্বো আল্টিমেট (Turbo Ultimate)
    - $200+/day = পারফরম্যান্স ম্যাক্স (Performance Max / Dedicated Server)
- Shopify is self-hosted and irrelevant to Hostnin. Never mention it.
- If a customer asks about BDIX, their audience is in Bangladesh. Do not ask them where their traffic is from.

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

    const finalComplianceCheck = `\n\n## FINAL COMPLIANCE CHECK (MANDATORY):
- Shopify is IRRELEVANT. You MUST never mention Shopify as an option.
- STRICT DIAGNOSTIC RULE: Respect the 4-step Sales Funnel (Type -> Region -> Ads -> Budget). Recommend only after details are clear or can be easily inferred from context. If context is clear, recommend confidently.`;

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
