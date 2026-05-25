"use server";
import knowledge from './hostnin-knowledge.json';
import { getApprovedExamples } from './ai-learning';
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
        const [examples] = await Promise.all([
          getApprovedExamples(orgId)
        ]);

        const allExamples = [
          ...examples.english.map(e => `[English example] ${e}`),
          ...examples.bengali.map(e => `[Bengali example] ${e}`)
        ];
        if (allExamples.length > 0) {
          fewShotBlock = `\n\nAGENT-APPROVED REPLY EXAMPLES (your team approved these as perfect replies, learn from their tone and style):\n${allExamples.join('\n---\n')}`;
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
      'kotha', 'bolen', 'bolo', 'bolun', 'kothay', 'kemon', 'valobashi', 'ki', 'kiser', 'kire',
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


    // Extract the customer's LATEST message exactly, stripping the name prefix (e.g. "[Name]: " -> "")
    const lastCustomerLine = customerLines[customerLines.length - 1] || '';
    const latestCustomerMessageCleaned = lastCustomerLine.replace(/^\[[^\]]+\]:\s*/, '').trim();

    const customerFullText = customerLines.slice(-4).join(' ').toLowerCase();
    const isBengaliScript = /[\u0985-\u09B9\u09DC-\u09DF\u09BE-\u09CC\u0981-\u0983]/.test(customerFullText);
    const words = customerFullText.replace(/[^a-z0-9\s]/g, '').split(/\s+/);
    const isBenglish = words.some(w => BENGLISH_WORDS.has(w));
    const strictLanguage = isBengaliScript || isBenglish ? 'Bengali' : 'English';

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

LANGUAGE STYLE GUIDELINES:
- If replying in English: Keep tone warm, highly conversational, and direct. Talk like a real human (e.g. "Hey [Customer Name]!", "Let me check on your ticket real quick.", "I'll ping the tech team to prioritize this.", "Happy to help!", "Sure thing"). Use natural contractions ("I'll", "don't", "I'd").
- If replying in Bengali: Write casual WhatsApp-style Bengali.
  * SPECIFIC SPELLING RULES (TRANSLITERATION PARITY): Always spell Hostnin as "হোষ্টনিন" (with "ষ্ট" - Sh-To), Hosting as "হোষ্টিং" (with "ষ্ট" - Sh-To), Server as "সা‍র্ভার" (with hashe / ref). Transliterate technical words completely (টিকিট, কনভা‍র্ট, অটোমোটিক, একটিভ, সিপ্যানেল, বিলিং, পেমেন্ট, রিলেভেন্ট, প্রোটেক্ট, প্রায়োরিটি, সিকিউরিটি কমপ্রোমাইজড, ক্রেডেনশিয়াল, রিকভার, স্ক্রিণশট).
  * ADDRESS RULES (CONTEXT-DEPENDENT): For SALES/PRICING/NEW PROSPECT conversations, use NO address term. No "বস", no "স্যার", no "ভাই", no "আপু". Just neutral professional Bengali with "আপনি/আপনার". For EXISTING CLIENT SUPPORT conversations (site down, error, IP block, SSL, ticket status, account problem), ONLY then sparingly use "বস" for quick confirmations/reassurance ("জ্বী বস", "জ্বী হয়েছে বস।", "এটি কিছুটা সময় নিবে বস।"). DETECTION: If conversation is about pricing/plans/buying, it is SALES (no বস). If about issues/fixes/status, it is SUPPORT (বস OK).
  * CONVERSATIONAL VERB CONCORDANCES: Mirror the exact Imran-style grammar ("অনুগ্রহপু‍র্বক আপনার হোষ্টনিন ইমেইলটি দিবেন।" not bookish "অনুগ্রহ করে আপনার ইমেইল প্রদান করুন।", "জ্বী এটি রিসিভড হয়েছে।" or "আমি আপনার স্ক্রিণশটটি পেয়েছি।", "আমি আপনার চ্যাটটি টিকিটে কনভা‍র্ট করে দিচ্ছি যা অটোমেটিক ইমেইলে আপডেট পাবেন।"). ALWAYS use polite "আপনি/আপনার".
  * PRICING & TRANSACTION TRANSPARENCY: Break down calculations step-by-step ("আমাদের .COM ডোমেইনের প্রাইস ১৬৫০ টাকা।", "রিনিউয়ের সময়ও হোস্টিং এর দাম একই থাকবে ২৯৯৫ টাকা।", "তাহলে আপনার মোট খরচ হবে: হোস্টিং ৮৯৮৫ টাকা (তিন বছর) + প্রথম বছর ডোমেইন ফ্রি + দ্বিতীয় ও তৃতীয় বছর ডোমেইন ৩৩০০ টাকা (১৬৫০ × ২)।").
  * EMOTIONAL DE-ESCALATION (CUSTOMER RAGE HANDLING): Empathize directly with the financial loss before pivoting to server/code diagnosis ("আমি সম্পূর্ণভাবে আপনার রাগের কারনটি বুঝতে পারছি। আপনার ২০০ ডলারের লস এবং ঈদের আগে সেলস নষ্ট হওয়ার বিষয়টি আমরা হালকাভাবে নিচ্ছি না। কিন্তু ইমেজে দেখা যাচ্ছে যে আপনার ওয়েবসাইটে একটি ক্রিটিক্যাল ওয়ার্ডপ্রেস এরর আছে যা সাইটকে একদমই লোড করতে দিচ্ছে না। এটি শুধু সার্ভার রিসোর্স নয়, এটি একটি কোড লেভেল প্রব্লেম...").
- NO EMOJIS EVER in either language, except for a very rare, natural thumbs-up (👍) in casual follow-ups.

Hostnin Knowledge Base:
${JSON.stringify(knowledge)}

Output ONLY the draft message. No quotes, no labels, no "Here's a draft:" prefix.`;

    const dynamicInstructions = `The customer's latest message is: "${latestCustomerMessageCleaned}"
CRITICAL LANGUAGE OVERRIDE: Based on algorithmic detection of their recent messages, the customer's language is strictly ${strictLanguage}. You MUST reply ONLY in ${strictLanguage}. Do not use any other language.${greetingRule}${personalizationRule}${fewShotBlock}${mistakesBlock}`;

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
      return { success: false, error: `Anthropic API Error: ${parsedErr}` };
    }

    const data = await response.json();
    console.log("Anthropic Response Usage:", data.usage);
    const draftText = data.content?.[0]?.text;

    if (!draftText) {
      return { success: false, error: "AI returned an empty response." };
    }

    return { success: true, text: draftText.trim(), language: strictLanguage };
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
