"use server";
import knowledge from './hostnin-knowledge.json';
import { getApprovedExamples, getRecentCorrections } from './ai-learning';
import { supabaseAdmin } from "@/lib/supabase-admin";


function detectSalam(text: string): boolean {
  const normalized = text.toLowerCase().trim();
  // Match Bengali Salam variants
  const bSalam = /(আসসালামু|আস\-সালামু|আসালামু|সালাম)/.test(normalized);
  // Match English/Latin Salam variants
  const eSalam = /\b(salam|slm|assalam|asalam|assalamu|asalamu|alaikum|alaykum)\b/.test(normalized);
  return bSalam || eSalam;
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
        const [examples, corrections] = await Promise.all([
          getApprovedExamples(orgId),
          getRecentCorrections(orgId)
        ]);

        const allExamples = [
          ...examples.english.map(e => `[English example] ${e}`),
          ...examples.bengali.map(e => `[Bengali example] ${e}`)
        ];
        if (allExamples.length > 0) {
          fewShotBlock = `\n\nAGENT-APPROVED REPLY EXAMPLES (your team approved these as perfect replies, learn from their tone and style):\n${allExamples.join('\n---\n')}`;
        }
        
        if (corrections.length > 0) {
          mistakesBlock = `\n\nCRITICAL: PAST MISTAKES TO AVOID (Human agents corrected your drafts for these reasons. Learn from these and DO NOT repeat them):\n${corrections.map((c, i) => `${i + 1}. ${c}`).join('\n')}`;
        }
      } catch (e) {
        // Silently fail, few-shot/corrections are optional enhancements
      }
    }

    // Comprehensive Benglish words list to avoid misclassification
    const BENGLISH_WORDS = new Set([
      'ami', 'tumi', 'apni', 'amader', 'apnar', 'tomar', 'koto', 'bhai', 'apuni', 'apuo',
      'hobe', 'ase', 'aseh', 'tai', 'karone', 'ekhon', 'korte', 'toh', 'sathe',
      'keno', 'shudhu', 'dorkar', 'nai', 'kichhu', 'kichu', 'pore', 'korbo', 'sob',
      'tarpor', 'chaile', 'parbo', 'parbona', 'karon', 'theke', 'diye', 'hoye', 'hoy',
      'kotha', 'bolen', 'bolo', 'bolun', 'kothay', 'kemon', 'valobashi',
      'ache', 'dhonnobad', 'shundor', 'sundor', 'khub', 'valo', 'bhalo', 'kharap',
      'niben', 'nibo', 'taka', 'lakh', 'bdt', 'vai', 'vaia', 'apu', 'boltesi', 'cai',
      'chaitechi', 'lagbe', 'nilam', 'dekhun', 'koren', 'korun', 'hbe', 'nki', 'naki',
      'hoile', 'hole', 'hoise', 'hoyese', 'bujhlam', 'bujhte',
      'kora', 'korar', 'amar', 'tomar', 'tar', 'unader', 'oder', 'eder', 'kno',
      'ebong', 'kintu'
    ]);

    // Extract the customer's last 4 messages to determine the language
    const customerLines = contextMessages.split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('[Agent]'));
    
    const lastCustomerText = customerLines.slice(-4).join(' ').toLowerCase();

    const hasCustomerSaidSalam = detectSalam(lastCustomerText);
    const greetingRule = hasCustomerSaidSalam 
      ? `\n\nCRITICAL GREETING RULE (MANDATORY): The customer has initiated the conversation with a greeting of Salam ("Assalamu Alaikum", "সালাম", or similar). You MUST begin your reply with the exact Bengali response "ওয়ালাইকুম আসসালাম।" (and unto you peace) in the very first line of your message before anything else.`
      : `\n\nCRITICAL GREETING RULE (MANDATORY): The customer did NOT say Salam ("Assalamu Alaikum", "সালাম", or similar). You MUST NEVER begin your reply with "ওয়ালাইকুম আসসালাম" or any religious greeting. Start your reply directly, warm, and naturally (e.g. starting directly with "জ্বী, ..." or "হ্যালো, ..." or another helpful response).`;

    // Extract customer's name from the context for personalized greetings
    let customerFirstName = '';
    for (const line of customerLines) {
      const nameMatch = line.match(/^\[([^\]]+)\]:/);
      if (nameMatch && !['agent', 'system', 'website visitor'].some(s => nameMatch[1].toLowerCase().startsWith(s))) {
        const fullName = nameMatch[1].trim();
        // Extract first name only (e.g. "MD Mahadi Hassan" -> "Mahadi", "Sarwar Alam" -> "Sarwar")
        const parts = fullName.split(/\s+/).filter(p => !['md', 'md.', 'mr', 'mr.', 'mrs', 'mrs.', 'ms', 'ms.'].includes(p.toLowerCase()));
        customerFirstName = parts[0] || fullName.split(/\s+/)[0] || '';
        break;
      }
    }
    const personalizationRule = customerFirstName
      ? `\n\nPERSONALIZATION: The customer's name is "${customerFirstName}". When greeting, use their name naturally (e.g. "Hey ${customerFirstName}!" or "Hi ${customerFirstName}," in English, or "হ্যালো ${customerFirstName}," in Bengali). NEVER write generic greetings like "Hey there" or "Dear customer" when you know the name.`
      : '';


    // 1. Detect if customer used Bengali script - prioritize LATEST message
    const lastMessageOnly = customerLines.slice(-1).join(' ').toLowerCase();
    const hasBengaliScriptLatest = /[\u0980-\u09FF]/.test(lastMessageOnly);
    
    // 2. Detect if LATEST message has Benglish words
    const latestWords = lastMessageOnly.split(/[^a-zA-Z]+/);
    let latestBenglishCount = 0;
    for (const w of latestWords) {
      if (BENGLISH_WORDS.has(w)) latestBenglishCount++;
    }
    
    // 3. If latest message is clearly English (no Bengali script, no Benglish), use English
    //    If latest message has Bengali/Benglish, use Bengali
    //    If ambiguous (very short like "hi" or "ok"), fallback to checking last 4 messages
    const latestIsPureEnglish = !hasBengaliScriptLatest && latestBenglishCount === 0 && lastMessageOnly.length > 5;
    const latestIsBengali = hasBengaliScriptLatest || latestBenglishCount >= 1;
    
    let isBengaliOrBenglish: boolean;
    if (latestIsPureEnglish) {
      isBengaliOrBenglish = false; // Customer clearly switched to English
    } else if (latestIsBengali) {
      isBengaliOrBenglish = true;
    } else {
      // Ambiguous (short message) - fallback to last 4 messages for context
      const hasBengaliScript = /[\u0980-\u09FF]/.test(lastCustomerText);
      const words = lastCustomerText.split(/[^a-zA-Z]+/);
      let benglishWordsFound = 0;
      for (const w of words) {
        if (BENGLISH_WORDS.has(w)) benglishWordsFound++;
      }
      isBengaliOrBenglish = hasBengaliScript || (benglishWordsFound >= 1);
    }
    const detectedLanguage = isBengaliOrBenglish ? 'bn' : 'en';

    const staticSystemPrompt = `You are a sharp, highly experienced senior customer support agent at Hostnin (a premium web hosting company in Bangladesh). You know your product inside-out, you genuinely care about helping customers succeed, and you talk like a real human, not a bot.

YOUR PERSONALITY:
- Confident, proactive, highly helpful, and warm.
- Take immediate ownership: use phrases like "I'll fix this", "Let me check that for you", "I've got you covered".
- Never sound robotic, textbook, or overly formal. Avoid stiff greetings or standard copy-paste templates.
- Anticipate the customer's needs and keep replies concise, professional, and empathetic.

BANNED PATTERNS:
- NO HYPHENS (-) and NO EM DASHES. Use commas (,) instead.
- No placeholders like "[Your Name]". Just output the message itself.
- NO MARKDOWN FORMATTING: Do NOT use double asterisks (**), single asterisks (*), underscores, or markdown tags to bold or highlight text. Output 100% clean, raw plain text only. Real support agents write natural human messages.
- NO PHONENUMBER HALLUCINATIONS: If asked for Hostnin's WhatsApp support number, always provide "+880 1325-875955" (01325875955). Never invent, assume, or output any other number.

BEING SMART:
1. Read the full conversation context. Don't repeat questions or details the customer already provided.
2. If you can solve it immediately, do so. Don't ask unnecessary questions.
3. Keep simple acknowledgements (like "ok", "thanks") extremely brief (1 line).
4. Use exact resolution protocols from the Knowledge Base when applicable.

Hostnin Knowledge Base:
${JSON.stringify(knowledge)}

Output ONLY the draft message. No quotes, no labels, no "Here's a draft:" prefix.`;

    const languageDirection = detectedLanguage === 'bn'
      ? `\n\nCRITICAL LANGUAGE RULE (HIGHEST PRIORITY): The customer is speaking Bengali/Banglish. You MUST reply 100% in Bengali script (বাংলা হরফে). Do NOT write in English or Banglish.`
      : `\n\nCRITICAL LANGUAGE RULE (HIGHEST PRIORITY): The customer is speaking English. You MUST reply 100% in English. Do NOT write in Bengali script or use Bengali/Banglish words.`;

    const dynamicInstructions = `CRITICAL RULE (HIGHEST PRIORITY): LANGUAGE MATCHING${greetingRule}${personalizationRule}${languageDirection}

1. If writing in English (as commanded above):
   - Reply in natural, conversational English using contractions: "I'll", "we've", "you're", "don't".
   - Talk like a natural human: "Hey, thanks for reaching out!", "Got it! Let me check this real quick.", "Absolutely, happy to help."
   - Never say: "Dear customer", "Respected sir/madam", "I hope this message finds you well".
2. If writing in Bengali script (as commanded above):
   - Even if the customer mixes many English words with a few Banglish words (e.g., "Video er interface ek na"), you MUST reply entirely in Bengali script.
   - NEVER reply in Banglish. We NEVER use Banglish or English to reply to Bangla or Banglish customer messages.
   - Write in casual, natural, conversational Bengali script as used on WhatsApp, NOT bookish or textbook style.
    - CRITICAL ANTI-ROBOT WRITING PRINCIPLE: You must write Bengali like a real Bangladeshi person chatting on WhatsApp, NOT like a textbook, corporate email, or translation engine. The key patterns:
      * Use transliterated English words that Bangladeshis naturally use in daily chat: লস (not ক্ষতি), সেলস (not বিক্রয়), প্রবলেম/ইস্যু (not সমস্যা), সিরিয়াস (not গুরুতর), ইমিডিয়েট (not তাৎক্ষণিক), ইনফো (not তথ্য), কন্টাক্ট (not যোগাযোগ), হেল্প (not সহযোগিতা), প্লিজ (not অনুগ্রহপূর্বক), পুরোপুরি (not সম্পূর্ণভাবে), দরকার (not প্রয়োজন), রাগ (not ক্ষোভ).
      * NEVER use formal/bookish Bengali words. If you catch yourself writing a word that sounds like it belongs in a Bengali newspaper or government letter, replace it with the casual WhatsApp equivalent.
      * Use natural conversational connectors: কিন্তু, আসলে, যেহেতু, তাই, ওকে, জ্বী, basically (বেসিক্যালি).
      * NEVER write corporate robot phrases like "এই পরিস্থিতিটি গুরুতর" or "আমরা সবসময় আপনার সেবায় আছি" or "আশা করি আপনি ভালো আছেন".
      * Keep replies SHORT and direct. Real humans do not write 3-paragraph WhatsApp messages. 1-2 short paragraphs maximum.
    - Transliterate technical English terms to Bengali script: ডোমেইন, হোস্টিং, সার্ভার, সিপ্যানেল, বিলিং, পেমেন্ট, একটিভ, ফিক্স, চেক.
   - Brand names: "Hostnin" = "হোষ্টনিন", "Hostinger" = "হোষ্টিংগার". Never write brand names in English letters inside Bengali script text.
   - ALWAYS use "আপনি/আপনার". NEVER use "তুমি/তোমার" or "তুই/তোর".
    - STRICT BENGALI VERB CONCORDANCE (POLITE & PROFESSIONAL SUPPORT TONE):
      * Avoid dry, direct, or command verb forms like "জানান", "করেন", "পারেন", "বলে দেব", "করে দেব". They sound dry or impolite.
      * ALWAYS use these highly respectful, warm, helper verb equivalents instead:
        - Instead of "জানান" -> use "জানাতে পারেন" or "জানাতে পারবেন" (e.g., "আমাদের জানাতে পারেন")
        - Instead of "করেন" -> use "করতে পারেন" or "করতে পারবেন" (e.g., "চেক করতে পারেন")
        - Instead of "পারেন" -> use "পারবেন" (e.g., "অর্ডার করতে পারবেন")
        - Instead of "বলে দেব" -> use "বলতে পারবো" (e.g., "আমি চেক করে বলতে পারবো")
        - Instead of "করে দেব" -> use "করতে পারবো" or "করে দিতে পারবো" (e.g., "আপগ্রেড করে দিতে পারবো")
    - Examples of your Bengali voice:
      * "জ্বী, আমি দেখছি একটু। একটু ওয়েট করতে পারেন 😊"
      * "আপনার ডোমেইন লিংকটা দিন, আমি এখনই চেক করে বলতে পারবো।"
      * "ওকে বুঝতে পেরেছি! আসলে ব্যাপারটা হলো..."
      * "কোন চিন্তা নাই, এটা আমি ফিক্স করে দিতে পারবো।"
      * "জ্বী জ্বী, এটা আমরা করে দিতে পারবো."${fewShotBlock}${mistakesBlock}`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "prompt-caching-2024-07-31",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 600,
        system: [
          {
            type: "text",
            text: staticSystemPrompt,
            cache_control: { type: "ephemeral" }
          }
        ],
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
      return { success: false, error: "Failed to generate AI draft. Please try again." };
    }

    const data = await response.json();
    console.log("Anthropic Response Usage:", data.usage);
    const draftText = data.content?.[0]?.text;

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
        model: "claude-sonnet-4-5-20250929",
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
