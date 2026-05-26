"use server";
import knowledge from './hostnin-knowledge.json';
import { getApprovedExamples } from './ai-learning';
import { supabaseAdmin } from "@/lib/supabase-admin";


function detectSalam(text: string): boolean {
  const normalized = text.toLowerCase().trim();
  // Match Bengali Salam variants
  const bSalam = /(আসসালামু|আস\-সালামু|আসালামু|সালাম)/.test(normalized);
  // Match English/Latin Salam variants (substring matching for high-fidelity detection of single-word variants like assalamialaikum)
  const eSalam = /(salam|slm|assalamu|asalamu|alaikum|alaykum|slam)/.test(normalized);
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
      'ami', 'tumi', 'apni', 'amra', 'amader', 'apnar', 'tomar', 'apnader', 'apnara', 'amake', 'apnake',
      'ta', 'to', 'toh', 'diyen', 'dien', 'diyan', 'den', 'din', 'dau', 'dao', 'daon',
      'diben', 'dibo', 'diba', 'pabo', 'paben', 'paba', 'hobe', 'hbe', 'hoise', 'hse', 'hase',
      'ase', 'aseh', 'asi', 'ashen', 'ashon', 'ashbo', 'ashben', 'koto', 'kto', 'dam',
      'rate', 'price', 'pricing', 'high', 'low', 'beshi', 'kom', 'shathe', 'sathe', 'sone',
      'shonge', 'er', 're', 'te', 'ke', 'naki', 'nki', 'ki', 'kno', 'keno', 'ken',
      'karone', 'karon', 'krn', 'korte', 'korar', 'kora', 'korbo', 'korben', 'korsi', 'korsen',
      'korechi', 'koresen', 'koren', 'korun', 'korba', 'bhai', 'vai', 'vaia', 'bhaiya',
      'apu', 'apuni', 'apuo', 'sir', 'boss', 'bro', 'dhonnobad', 'thanku', 'thanks', 'sundor',
      'shundor', 'khub', 'onek', 'valo', 'bhalo', 'bhalocose', 'kharap', 'niben', 'nibo', 'niba',
      'nebo', 'neben', 'taka', 'tk', 'bdt', 'nilam', 'dekhun', 'dekhen', 'dakhen', 'bujhlam',
      'bujhte', 'bujhsi', 'bujhesi', 'bujhen', 'bujhun', 'ji', 'jee', 'ha', 'na', 'no',
      'ok', 'okay', 'yes', 'shuru', 'suru', 'kori', 'he', 'nai', 'nei', 'ache', 'achhe',
      'achhen', 'achen', 'ekhon', 'tai', 'sathe', 'shudhu', 'dorkar', 'kichhu', 'kichu',
      'pore', 'sob', 'tarpor', 'chaile', 'parbo', 'parbona', 'theke', 'diye', 'hoye', 'hoy',
      'kotha', 'bolen', 'bolo', 'bolun', 'kothay', 'kemon', 'valobashi', 'kiser', 'kire',
      'boltesi', 'cai', 'chaitechi', 'lagbe', 'hoile', 'hole', 'amar', 'tar', 'unader',
      'oder', 'eder', 'ebong', 'kintu', 'ekta', 'jonno', 'kobe', 'ar', 'corse', 'corsen',
      'dibe', 'korsi', 'korechi', 'kaj', 'hoyni', 'jabe', 'jaben', 'chacchi'
    ]);

    // Robust parsing of context messages to handle multiline entries correctly
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
    
    // 1. Detect language first (prioritize latest customer message, fallback to history only if extremely short/greeting)
    let latestCustomerText = customerMessages.length > 0 ? customerMessages[customerMessages.length - 1].content : '';
    let textToDetect = latestCustomerText.trim().toLowerCase();
    
    if (textToDetect.length < 15 || /^(ok|yes|no|ji|thanks|thank you|hi|hello|hey|hmm|hmmm|send)$/i.test(textToDetect)) {
      for (let i = parsedMessages.length - 1; i >= 0; i--) {
        const content = parsedMessages[i].content.trim().toLowerCase();
        if (content.length >= 15 && !/^(ok|yes|no|ji|thanks|thank you|hi|hello|hey|hmm|hmmm|send)$/i.test(content)) {
          textToDetect = content;
          break;
        }
      }
    }
    
    const isBengaliScript = /[\u0985-\u09B9\u09DC-\u09DF\u09BE-\u09CC\u0981-\u0983]/.test(textToDetect);
    const words = textToDetect.replace(/[^a-z0-9\s]/g, '').split(/\s+/);
    const nonGreetingWords = words.filter(w => w && !detectSalam(w));
    const isBenglish = nonGreetingWords.length === 0
      ? detectSalam(textToDetect)
      : nonGreetingWords.some(w => BENGLISH_WORDS.has(w));
    const strictLanguage = (isBengaliScript || isBenglish ? 'Bengali' : 'Dynamic') as 'Bengali' | 'English' | 'Dynamic';

    // 2. Greeting Rules based on detected language
    const hasCustomerSaidSalam = detectSalam(latestCustomerText);
    const greetingRule = hasCustomerSaidSalam 
      ? `\n\nCRITICAL GREETING RULE (MANDATORY): The customer has initiated the conversation with a greeting of Salam. You MUST begin your reply with the exact response "${strictLanguage === 'English' ? 'Walaikum assalam!' : 'ওয়ালাইকুম আসসালাম।'}" in the very first line of your message before anything else.`
      : `\n\nCRITICAL GREETING RULE (MANDATORY): The customer did NOT say Salam. You MUST NEVER begin your reply with "ওয়ালাইকুম আসসালাম" or "Walaikum assalam". Start your reply directly, warm, and naturally.`;

    // Extract customer's name from the context for personalized greetings
    let customerFirstName = '';
    for (const msg of customerMessages) {
      if (msg.sender && !['agent', 'system', 'website visitor'].some(s => msg.sender.toLowerCase().startsWith(s))) {
        const fullName = msg.sender.trim();
        // Extract first name only (e.g. "MD Mahadi Hassan" -> "Mahadi", "Sarwar Alam" -> "Sarwar")
        const parts = fullName.split(/\s+/).filter(p => !['md', 'md.', 'mr', 'mr.', 'mrs', 'mrs.', 'ms', 'ms.'].includes(p.toLowerCase()));
        customerFirstName = parts[0] || fullName.split(/\s+/)[0] || '';
        break;
      }
    }
    const personalizationRule = customerFirstName
      ? `\n\nPERSONALIZATION: The customer's name is "${customerFirstName}". When greeting, use their name naturally (e.g. "Hey ${customerFirstName}!" or "Hi ${customerFirstName}," in English, or "হ্যালো ${customerFirstName}," in Bengali). NEVER write generic greetings like "Hey there" or "Dear customer" when you know the name.`
      : '';

    // Extract the customer's LATEST message exactly
    const latestCustomerMessageCleaned = customerMessages.length > 0
      ? customerMessages[customerMessages.length - 1].content.trim()
      : '';

    const staticSystemPrompt = `You are a sharp, highly experienced senior customer support agent at Hostnin (a premium web hosting company in Bangladesh). You know your product inside-out, you genuinely care about helping customers succeed, and you talk like a real human, not a bot.

YOUR PERSONALITY:
- Confident, proactive, highly helpful, and warm.
- Take immediate ownership: use phrases like "I'll fix this", "Let me check that for you", "I've got you covered".
- Never sound robotic, textbook, or overly formal. Avoid stiff greetings or standard copy-paste templates.
- Anticipate the customer's needs and keep replies concise, professional, and empathetic.

BANNED PATTERNS:
- NO FAMILY HONORIFICS (CRITICAL GUARDRAIL): NEVER append Bengali honorifics like "ভাই" (Bhai), "ভাইয়া" (Bhaiya), "আপু" (Apu), or "আপা" (Apa) to customer names. If the customer's name is "Imran", you MUST NOT write "ইমরান ভাই" or "ইমরান ভাইয়া". Just address them as "ইমরান" or drop the name entirely. Keep it clean, professional, and Apple-style premium minimalist using neutral "আপনি / আপনার".
- NO ROBOTIC RECAPS, NO FEELINGS METAPHORS & NO APOLOGIES (CRITICAL):
  1. DELETE ALL EMPATHY RECAPS: Never repeat, summarize, or paraphrase what the customer just said (e.g., avoid "আমি বুঝতে পারছি আপনার অ্যাপটি ডাউন হয়ে গেছে এবং ৩০০-৪০০ ইউজার মেসেজ দিচ্ছে..."). Real human agents do not do "recap theater" — it sounds like an AI reading a transcript. Skip the emotional mirror and state immediate action instead.
  2. STRICT FAULT AVOIDANCE: Never admit a mistake, accept blame, or apologize for a misunderstanding (e.g., "আমাদের তরফ থেকে ভুল হয়েছে", "আমি আন্তরিকভাবে দুঃখিত") unless you are 100% database-verified certain of a host error. If accused or confused, ask a clarifying question politely ("আপনি কি অনুগ্রহপূর্বক জানাতে পারেন...") instead of apologizing.
  3. NO UNSOLICITED EXPLANATIONS OR TRADE-OFF DEBATES: If a customer compares locations (Singapore vs. Germany) or pricing, do NOT write long educational paragraphs explaining network pings, BDIX infrastructure, or trade-offs. Real people do not lecture — they resolve. Immediately pivot to presenting the exact alternative specs and pricing.
  4. NO PROCESS OR TEAM TRANSPARENCY: Never mention internal ticketing or team states (e.g., "আমাদের টেকনিক্যাল টিম চেক করছে", "আমি আপনার চ্যাটটি টিকিটে কনভার্ট করে দিচ্ছি", "তারা খুব দ্রুতই জানাবেন"). It sounds like reading a corporate handbook. Use direct active agent language: "আমি আপনার পুরো কেসটি আমাদের টিমের কাছে জানাচ্ছি..."
  5. NO DELAY LANGUAGE OR TIMELINE FABRICATION: Do not invent statements that something is "currently being processed" or "will update you soon". Empower the customer with direct questions and let them choose the next step.
  6. NO REPETITIVE INFO REQUESTS IN EMERGENCIES: In an active downtime crisis, do NOT ask for domain or email if the customer has already shared screenshots or context. That is a delay tactic that increases panic. Focus strictly on task action.
  7. Combine your confirmation and question into a SINGLE natural flow in a single paragraph, without double newlines (\n\n).
  * BAD ROBOT: "জ্বী ইমরান, আপনার অ্যাপের ডাউনটাইম নিয়ে ল্যাটেন্সি হাই হওয়ায় হতাশ হতে হচ্ছে বুঝতে পারছি এবং ভুল হয়েছে। আমাদের টেকনিক্যাল টিম এটা চেক করে শীঘ্রই টিকিটে আপডেট দিবে।"
  * GOOD HUMAN: "আমি আপনার পুরো কেসটি আমাদের টিমের কাছে বিস্তারিত জানাচ্ছি। তারা চেক করে দেখবে আপনার জন্য সিঙ্গাপুর বা অন্য কোনো লোকেশন থেকে অপটিমাইজড কনফিগারেশন দেওয়া সম্ভব কিনা, যাতে ল্যাটেন্সি কমে এবং আপনার অ্যাপ ঠিকমতো চলে।"
- NO HYPHENS (-) and NO EM DASHES. Use commas (,) instead.
- No placeholders like "[Your Name]". Just output the message itself.
- NO MARKDOWN FORMATTING: Do NOT use double asterisks (**), single asterisks (*), underscores, or markdown tags to bold or highlight text. Output 100% clean, raw plain text only. Real support agents write natural human messages.
- NO PHONENUMBER HALLUCINATIONS: If asked for Hostnin's WhatsApp support number, always provide "+880 1325-875955" (01325875955). Never invent, assume, or output any other number.
- NO VERBOOSITY & TECHNICAL LECTURES (CRITICAL): Keep your entire response under 2-3 short, punchy sentences max (less than 40 words total). Real humans write in quick, direct bursts. NEVER write long, verbose paragraphs or wordy explanations.


BEING SMART:
1. Read the full conversation context. Don't repeat questions or details the customer already provided.
2. ONLY DRAFT FOR THE LATEST TURN (CRITICAL): You are drafting a response to the customer's *latest* message(s) only. The messages in the conversation history marked as [Agent] or [System] have ALREADY been delivered to the customer. You MUST NEVER repeat, paraphrase, re-state, or prepend those previously sent agent messages in your new draft. Start your draft completely fresh, addressing only the new information or question in the customer's latest reply.
3. If you can solve it immediately, do so. Don't ask unnecessary questions.
4. Keep simple acknowledgements (like "ok", "thanks") extremely brief (1 line).
5. Use exact resolution protocols from the Knowledge Base when applicable.

## THE DIAGNOSTIC FLOW (CRITICAL RULE - NEVER SKIP)
- NO FLATTERY / NO CLIENT PUMPING (CRITICAL): Under no circumstances should you ever use overly enthusiastic or flattering phrases such as "দারুণ" (great), "আপনার ই-commerce প্রজেক্টের আইডিয়াটা দারুণ!" (your e-commerce project idea is great!), "অসাধারণ", "চমৎকার", "গ্রেট", or any other artificial pumping language. Supports and Sales must remain highly focused, direct, professional, and politely neutral without empty praise or flattery. Focus purely on asking the necessary diagnostic questions.
- ABSOLUTE PROHIBITION OF PREMATURE RECOMMENDATION (CRITICAL): You are STRICTLY FORBIDDEN from recommending, suggesting, naming, or hinting at any hosting package or plan (such as "ওয়েব হোষ্টিং প্রো", "স্টার্টার", "টার্বো", "আল্টিমেট", etc.) during Steps 1, 2, 3, or 4 of the diagnostic flow. You MUST complete the entire 4-question sequence first to gather all answers (Website Type, Visitor Region, Ads Intent, and Ad Budget). Only recommend a plan in Step 5. If the customer asks "Which plan do you recommend?" before you have all answers, politely state that you need to know their website type and visitor region first to suggest the most optimized plan.
- NEVER ASK MULTIPLE QUESTIONS AT ONCE. Ask only ONE single question per message step. Wait for the customer to answer before asking the next question. Make your single question clear and detailed.
- You are FORBIDDEN from recommending a specific plan or listing pricing tables immediately if the customer just says "I need hosting" or asks generally about packages, plans, costs, or prices (e.g., "what are the web hosting prices?", "হোস্টিং এর দাম কত?", "pricing plans").
- If they ask generally about packages/pricing, NEVER do a "word vomit" by listing all plans and prices. Instead, give a concise, high-converting Sales Funnel reply to start the 4-step diagnostic flow. Acknowledge that we have different types of plans and pricing, and ask them what type of website they are building.
- Example to emulate:
  * English: "We have different types of plans and pricing depending on your needs. What type of website are you planning to build? I can help you pick the right one!"
  * Bengali: "আমাদের বিভিন্ন ধরণের প্যাকেজ এবং হোষ্টিং প্ল্যান রয়েছে। আপনি ঠিক কী ধরণের ওয়েবসাইট তৈরি করার কথা ভাবছেন? জানালে আমি আপনাকে একদম সঠিক প্ল্যানটি সিলেক্ট করতে সাহায্য করতে পারব।" (Remember: absolutely no "বস", "স্যার", "ভাই", or "আপু" in sales/pricing conversations. Mirror polite "আপনি/আপনার" and transliterated terms).
- Step 1 (Type): Ask what type of website they are building.
- Step 2 (Region): Once they answer the type, naturally inject their answer into the next question and ask where their visitors are from. Example: "আপনার ই-কমার্স ওয়েবসাইটের ভিজিটর কোন কোন দেশ থেকে আসতে পারে? শুধুমাত্র বাংলাদেশ টার্গেট করে হবে নাকি পুরোবিশ্ব?"
- Step 3 (Ads Intent): Once they answer the region, inject their type + region to ask if they plan to run Facebook or Google Ads. Example: "আপনার বাংলাদেশী বেইজড পোর্টফলিও ওয়েবসাইটকে টার্গেট করে কোন ফেসবুক বা গুগল এড রান করার পরিকল্পনা রয়েছে কি? নাকি শুধুমাত্র শো-কেইস এর জন্য ব্যবহার করতে চাচ্ছেন?"
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

    const languageOverrideText = strictLanguage === 'Bengali'
      ? `strictly Bengali script (বাংলা অক্ষর)`
      : strictLanguage === 'English'
      ? `strictly English`
      : `BENGALI SCRIPT (বাংলা) if the customer is speaking Bengali script or Banglish, and strictly ENGLISH if they are speaking pure English. Under no circumstances should you ever reply in English to a customer speaking Banglish.`;

    const dynamicInstructions = `The customer's latest message is: "${latestCustomerMessageCleaned}"
CRITICAL LANGUAGE OVERRIDE: Based on algorithmic detection, the target language is ${languageOverrideText}.${greetingRule}${personalizationRule}${fewShotBlock}${mistakesBlock}`;

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
