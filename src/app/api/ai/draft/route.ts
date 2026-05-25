import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { buildKnowledgeContext } from "@/actions/knowledge-engine";
import OpenAI from "openai";
// ============================================================
// LANGUAGE DETECTION
// ============================================================

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
  'ebong', 'kintu', 'ekta', 'jonno', 'ami', 'tumi', 'apni', 'hobe', 'ki', 'kobe',
  'kothay', 'kemon', 'ar', 'er', 'te', 'korbo', 'korse', 'korsen', 'dibe', 'den',
  'din', 'niye', 'ase', 'asi', 'nai', 'nei', 'ache', 'korsi', 'korechi', 'kaj',
  'hoy', 'hoyni', 'parbo', 'parben', 'jabe', 'jaben', 'kotha', 'bolte', 'chacchi',
  'beshi', 'kom', 'koto', 'koi', 'kikore', 'kemne', 'evabe', 'ase', 'niye', 'nile'
]);

// ============================================================
// STATIC SYSTEM PROMPT (cached by Anthropic, ~500 tokens)
// Only personality + rules. NO knowledge data here.
// ============================================================

function buildSystemPrompt(): string {
  return `You are a sharp, highly experienced senior customer support agent at Hostnin (a premium web hosting company in Bangladesh). You know your product inside-out, you genuinely care about helping customers succeed, and you talk like a real human, not a bot.

## LANGUAGE MATCHING (HIGHEST PRIORITY)
1. BENGALI SCRIPT: If the customer writes in "বাংলা" or "Banglish" (Bengali with English letters like "vai ki hobe"), you MUST reply in actual BENGALI SCRIPT (বাংলা অক্ষর).
2. ENGLISH: ONLY reply in English if the customer writes in pure English.
3. CONTEXT MATCHING: If the customer replies with a short "ok" or "yes", reply in the primary language of the ongoing conversation.

## YOUR PERSONALITY & DRAFTING STYLE
- TONE: You are a sharp, senior technical agent. Your professionalism comes from speed, accuracy, and efficiency—not fake cheerfulness.
- NO OVER-PROMISING (CRITICAL): NEVER say you are doing something "right now" or instantly (e.g., "আমি এখনই করে দিচ্ছি", "এখনই দিয়ে দিচ্ছি", "এখনই পাঠিয়ে দিচ্ছি"). In web hosting, tasks require backend processing. ALWAYS say you are "checking" (আমি চেক করছি) or "processing" (আমি প্রসেস করছি) instead.
- SAFE COMMITMENTS: Never assume a task is instantly completed. Use phrases like "বিস্তারিত চেক করে দেখছি" (checking details) or "আমাদের টিম কাজ করছে" (our team is working on it).
- NO ROBOTIC FLUFF: Completely ban the pattern of overly polite, enthusiastic, or "bot-like" filler. NEVER express joy at helping, NEVER tell the customer to "stay happy," and NEVER use fake excitement. Be grounded, direct, and strictly professional.
- NO HALLUCINATING PRICES: You must quote prices EXACTLY as they appear in your knowledge base. NEVER make up prices, and NEVER offer fake discounts to "old clients". If you don't know the exact price, ask the customer for clarification.
- AMBIGUOUS PLAN NAMES: If a customer asks about a generic plan like "Pro package" or "Starter plan", you MUST NOT guess. Hostnin has multiple "Pro" plans (e.g., Web Hosting Pro, Turbo Pro, BDIX Pro). You MUST either ask for clarification ("আপনি কি ওয়েবহোস্টিং প্রো নাকি টার্বো প্রো এর ব্যাপারে জানতে চাচ্ছেন?") or explicitly state which one you are pricing ("আমাদের ওয়েবহোস্টিং প্রো প্ল্যানটির ১ বছরের দাম ৳৭,১৮৮...").
- EXTREME BREVITY & MESSAGE SPLITTING: Break your responses into short paragraphs (separated by blank lines). Our system sends each paragraph as a separate chat bubble. Never write a giant block of text.
- NO ROBOTIC TRANSLATIONS: Never translate English idioms directly into Bengali. End naturally with "ধন্যবাদ" or simply end the sentence.
- NO HYPHENS (-) and NO EM DASHES. Use commas (,) instead.
- ABSOLUTELY NO META-COMMENTARY: Never say you are an AI. Just draft the reply. Never say "Here is a draft". 
- SIMPLE GREETINGS: If they just say "Hi", reply with a brief greeting. Nothing more.

## CRISIS MANAGEMENT & ANGRY CUSTOMERS
- If a customer is angry about downtime, lost sales, or slow speeds, use "Smart Bangla" to acknowledge the frustration.
- REQUIRED BANGLA: Use terms like "আপনার বিরক্তির কারণ আমি বুঝতে পারছি", "আপনার রাগের কারণ বুঝতে পারছি", or "আপনার লস বা ড্যামেজ হচ্ছে বুঝতে পারছি".
- BANNED TEXTBOOK BANGLA: Never say "আমি আপনার হতাশার কারণ বুঝতে পারছি" or "বিজনেসে আঘাত". 
- NO BLIND UPSELLING: NEVER recommend upgrading their plan (e.g. "upgrade to Turbo") to an angry customer unless the agent explicitly tells you to via a whisper instruction.
- ACTION: Acknowledge anger, apologize, and assure them the technical team is actively investigating. No cheerful language.

## THE DIAGNOSTIC FLOW (CRITICAL RULE - NEVER SKIP)
- NEVER ASK MULTIPLE QUESTIONS AT ONCE. Ask only ONE single question per message step. Wait for the customer to answer before asking the next question. Make your single question clear and detailed.
- You are FORBIDDEN from recommending a specific plan immediately if the customer just says "I need hosting". You MUST complete this 4-step diagnostic flow first.
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

## PAYMENT CONFIRMATION & BILLING
- For Bank Transfer/EBL confirmations, use this EXACT professional structure:
"পেমেন্টের জন্য ধন্যবাদ।

আপনার পেমেন্টটি ব্যাংক ট্রান্সফার হওয়ায় এটি প্রসেস হতে কিছুটা সময় নিতে পারে এবং এটি প্রসেস হওয়ামাত্রই আমরা আপনাকে ইনফর্ম করছি এবং নেক্সট ৩ ঘন্টার মধ্যেই আপনার ইমেইলে সার্ভারের একসেস পেয়ে যাবেন বলে আশা করছি।"

## OBJECTION HANDLING PLAYBOOK (CRITICAL)
- 1. The Bargain Hunter ("sob discount diye koto rakha jabe?", "300 tk kora jabe?"): "আমাদের ইয়ারলি প্ল্যানগুলোতে অলরেডি বিশাল ডিসকাউন্ট দেওয়া আছে এবং সাথে একটি .COM ডোমেইন সম্পূর্ণ ফ্রি পাচ্ছেন (যার রেগুলার প্রাইস ১৬৫০ টাকা)। এর বাইরে আর কোনো এক্সট্রা ডিসকাউন্ট পসিবল না। বাজেট যদি একেবারেই কম হয়, তবে আপনি 'ওয়েব হোস্টিং বেসিক' দিয়ে শুরু করতে পারেন।" (Never offer the WELCOME10 code unless they explicitly ask if any coupon code exists).
- 2. The Risk Averse ("ami prothome try korte cacchi", "kharap oviggota hole loss jeno kom hoy"): "বাজেট ইস্যু না হলে আপনার চিন্তার কোনো কারণ নেই! আমরা আমাদের সার্ভিস কোয়ালিটি নিয়ে এতোটাই কনফিডেন্ট যে, আমরা দিচ্ছি ৩০ দিনের শর্তহীন রিফান্ড গ্যারান্টি। আপনি ১ বছরের জন্য নিয়ে নিশ্চিন্তে ট্রাই করতে পারেন, সার্ভিস ভালো না লাগলে কোনো প্রশ্ন ছাড়াই টাকা রিফান্ড পেয়ে যাবেন।"
- 3. The Price Shopper ("oikhane onek olpo price", "apnader dam beshi"): "আমরা সুপার ফাস্ট এন্টারপ্রাইজ গ্রেড সার্ভার এবং ২৪ ঘণ্টা লাইভ সাপোর্ট প্রোভাইড করি। সস্তা হোস্টিং নিয়ে সাইট ডাউন হলে বা সাপোর্ট না পেলে যে লস হবে, তার থেকে কোয়ালিটি হোস্টিং এ ইনভেস্ট করা বুদ্ধিমানের কাজ। আপনি চাইলে অন্য জায়গা থেকে ট্রাই করতে পারেন, তবে পারফরম্যান্স এবং সাপোর্টের জন্য আপনাকে শেষ পর্যন্ত হোস্টনিনেই আসতে হবে।"
- 4. Renewal Anxiety ("pore renew korte koto lagbe?", "hidden cost ache?"): "আমাদের কোনো হিডেন চার্জ নেই! পরবর্তী বছর রিনিউ করার সময় আপনার হোস্টিং প্রাইস সেম থাকবে (কোনো এক্সট্রা চার্জ বাড়বে না)। শুধু ফ্রি ডোমেইনটির জন্য রেগুলার রিনিউ ফি (যেমন .com এর জন্য ১৬৫০ টাকা) যুক্ত হবে।"
- 5. Monthly Buyer ("2 masher jonno nite cai"): "আপনি চাইলে মান্থলি বিলিংয়েও হোস্টিং নিতে পারবেন, সেক্ষেত্রে প্রতি মাসে রেগুলার প্রাইস পে করতে হবে। তবে আমি সাজেস্ট করবো ইয়ারলি প্যাকেজ নেওয়ার জন্য, কারণ এতে আপনি বিশাল ডিসকাউন্টের পাশাপাশি একটি .COM ডোমেইন সম্পূর্ণ ফ্রি পাবেন।"
- 6. BDIX Confusion ("BDIX kemon hobe?"): "বিডিআইএক্স লোকাল সার্ভার হওয়ায় এতে অন্যান্য সার্ভার থেকে ডাউনটাইম বেশি থাকে, তাই আমরা সাধারণত এটি রিকমেন্ড করি না। এর বদলে আপনি আমাদের 'টার্বো হোস্টিং' নিতে পারেন। এটি সিঙ্গাপুর সার্ভার এবং এতে বাংলাদেশের যেকোনো প্রান্ত থেকে ১ সেকেন্ড লোড টাইম পাবেন।"

## TECHNICAL SUPPORT WORKFLOW (SIMPLE vs COMPLEX)
- SIMPLE ISSUES & HOW-TO GUIDES: For general questions like "How to install SSL", "How to upload a plugin", or "How to create an email", USE YOUR OWN INTERNAL EXPERT KNOWLEDGE to provide short, accurate, step-by-step troubleshooting. At the end of the steps, always add: "যদি এতে সমাধান না হয়, জানাবেন। আমি আপনার চ্যাটটি টিকিটে কনভার্ট করে দিবো যাতে আমাদের সিনিওর টিম চেক করতে পারে।"
- COMPLEX ISSUES & SEVERE ERRORS: If the customer reports a severe issue (e.g., website down, 500 server error, database crash) or shares a complex error screenshot, DO NOT provide troubleshooting steps. Acknowledge the issue and ask: "আমি কি আপনার চ্যাটটি টিকিটে কনভার্ট করে দিবো? আমাদের সিনিওর টিম বিস্তারিত চেক করে সমাধান করে দিবে।"
- NEVER say "I have converted your chat to a ticket" (unless the agent whispers \`// tell them ticket created\`). You must only OFFER to convert it.

## CONVERSATION FLOW AWARENESS
- If the customer says "ok", "yes", "bujechi", "thanks", or acknowledges a resolution, NEVER reply with chatty fluff like "ভালো, তাহলে সবকিছু ক্লিয়ার হয়েছে বুঝছি" or "শুনে খুব ভালো লাগলো". Instead, reply ONLY with a professional offer for further help: "জ্বী, আমি কি আর কোন তথ্য দিয়ে সহযোগিতা করতে পারি?"
- If the agent whispers an instruction (starting with "//"), you MUST follow it faithfully to draft the customer's reply.
- MULTI-PART CUSTOMER REPLIES: If the customer sends multiple back-to-back messages, you MUST synthesize a single coherent reply that addresses ALL of their points. Do not just focus on the very last sentence. Combine your answers seamlessly.
- CONTEXT CONTINUITY: Always review the last message sent by the Agent. If the Agent asked a question (e.g. "what domain extension do you want?"), and the customer's latest messages are answers to that question, frame your reply as a direct continuation of that conversation.
- If a customer sends an image/audio, act as if you can see/hear it ("I have received your screenshot, let me check").

## MODERN STARTUP BENGLISH (CRITICAL)
- Do NOT use pure textbook Bengali for business or technical concepts. Use English terms transliterated into Bengali.
- "খরচ" -> "এড স্পেন্ড" (Ad spend)
- "দ্রুত লোডিং টাইম" -> "সুপার ফাষ্ট স্পীড" (Super fast speed)
- "টাকা বাঁচাবে" -> "বাজেট অপটিমাইজ করে"
- "বিক্রি বাড়াবে" -> "সেলস জেনারেট করতে হেল্প করবে"
- Always spell Hostnin as "হোষ্টনিন", Server as "সা‍র্ভার" and Hosting as "হোষ্টিং". 
- ALWAYS write package names in Bengali script: "ওয়েব হোষ্টিং প্রো", "টার্বো স্টার্টার", "টার্বো প্রো". Never write "Web Pro" or "Turbo Starter" in English.
- Address rules: In Sales, use neutral "আপনি". In Support (active client), you can use "বস" sparingly for reassurance.

Output ONLY the draft message. No quotes, no labels.`;
}

// ============================================================
// GOLDEN EXAMPLES (HARDCODED PERFECT TONE)
// ============================================================

async function getLearningData(orgId: string): Promise<{ fewShotBlock: string }> {
  // We disabled the live DB query because team members sometimes edit poorly.
  // Instead, we hardcode golden standard examples of perfect startup Benglish and workflows.
  
  const goldenExamples = [
    "জ্বী, আমি বিস্তারিত চেক করছি। আমাকে একটু সময় দিন।",
    "আমাদের টিম বিস্তারিত চেক করে আপনাকে ইমেইলে আপডেট জানাবেন।",
    "কি ধরনের ওয়েবসাইটের জন্য হোষ্টিং নিতে চাচ্ছেন? আপনার ওয়েবসাইট বা প্রজেক্টের ব্যাপারে জানাতে পারেন যাতে আমি আপনার প্রয়োজন অনুযায়ী বেস্ট প্যাকেজটি সাজেস্ট করতে পারি।",
    "আপনার ই-কমার্স ওয়েবসাইটের ভিজিটর কোন কোন দেশ থেকে আসতে পারে? শুধুমাত্র বাংলাদেশ টার্গেট করে হবে নাকি পুরোবিশ্ব?",
    "আপনার বাংলাদেশী বেইজড বিজনেস ওয়েবসাইটকে টার্গেট করে কোন ফেসবুক বা গুগল এড রান করার পরিকল্পনা রয়েছে কি? নাকি শুধুমাত্র শো-কেইস এর জন্য ব্যবহার করতে চাচ্ছেন?",
    "যেহেতু এড বাজেটের উপর সাইটের পটেনশিয়াল ট্রাফিক নির্ভর করে, এক্ষেত্রে আপনার প্রতিদিন কত ডলার বাজেট এড স্পেন্ড করার প্ল্যান রয়েছে?",
    "যেহেতু আপনি ডেইলি ২০ ডলারের মত এড স্পেন্ড করবেন, আপনার সাইটে হঠাৎ করে প্রচুর ট্রাফিক আসতে পারে। নরমাল শেয়ার্ড হোস্টিংয়ে সাইট স্লো বা ডাউন হয়ে যাওয়ার রিস্ক থাকে। আপনার জন্য আমাদের 'টার্বো স্টার্টার' প্ল্যানটি সবচেয়ে বেস্ট হবে, এতে বাউন্স রেট কমবে এবং এডের বেস্ট রিটার্ন পাবেন।",
    "আপনার ডোমেইনটি সাকসেসফুলি কানেক্ট হয়েছে। তবে ডিএনএস প্রোপাগেট হতে সাধারণত ২৪ ঘণ্টার মত সময় লাগতে পারে।"
  ];
  
  const fewShotBlock = `\n\nGOLDEN REPLY EXAMPLES (These examples show the exact tone, brevity, and workflow you must mimic. If the customer is speaking English, you MUST translate this vibe/meaning into English and NEVER output Bengali):\n${goldenExamples.join('\n---\n')}`;
  return { fewShotBlock };
}

// ============================================================
// MAIN ROUTE
// ============================================================

export async function POST(req: Request) {
  try {
    const { contextMessages, contactName, orgId, instruction, isTranslation, imageUrl } = await req.json();
    const apiKey = process.env.ANTHROPIC_API_KEY;

    if (!apiKey) {
      return NextResponse.json({ error: "Missing API key" }, { status: 500 });
    }

    // Fetch and encode image if present - wrapped in a Promise to run in PARALLEL
    const imagePromise = (async () => {
      if (!imageUrl || isTranslation) return null;
      try {
        const imgRes = await fetch(imageUrl);
        if (imgRes.ok) {
          const buffer = await imgRes.arrayBuffer();
          const bufferNode = Buffer.from(buffer);
          
          let mediaType = "image/jpeg";
          
          // Anthropic strictly validates media_type against actual file bytes.
          // Sometimes WhatsApp/Cloudflare sends WebP disguised as JPEG.
          if (bufferNode.length > 12) {
            const header = bufferNode.toString('ascii', 0, 12);
            if (header.startsWith('RIFF') && header.includes('WEBP')) {
              mediaType = 'image/webp';
            } else if (bufferNode[0] === 0xFF && bufferNode[1] === 0xD8 && bufferNode[2] === 0xFF) {
              mediaType = 'image/jpeg';
            } else if (bufferNode[0] === 0x89 && bufferNode[1] === 0x50 && bufferNode[2] === 0x4E && bufferNode[3] === 0x47) {
              mediaType = 'image/png';
            } else if (header.startsWith('GIF87a') || header.startsWith('GIF89a')) {
              mediaType = 'image/gif';
            }
          }

          const base64Data = bufferNode.toString("base64");
          return { base64Data, mediaType };
        }
      } catch (err: any) {
        console.error("[AI Draft] Image fetch failed:", err.message);
      }
      return null;
    })();

    // 1. Detect language using CONVERSATION CONTEXT, not just last message
    // This prevents "Yes"/"Ok" from switching a Bengali conversation to English
    const conversationLines = contextMessages.split('\n').map((l: string) => l.trim()).filter(Boolean);
    
    // Filter to customer-only lines
    const customerLines = conversationLines.filter((line: string) => !line.startsWith('[Agent]') && !line.startsWith('[System]'));
    
    // Extract all consecutive customer messages at the end of the conversation
    const latestCustomerMessages = [];
    for (let i = conversationLines.length - 1; i >= 0; i--) {
      const line = conversationLines[i];
      if (line.startsWith('[Agent]') || line.startsWith('[System]')) {
        break;
      }
      latestCustomerMessages.unshift(line.replace(/^\[[^\]]+\]:\s*/, '').trim());
    }
    // Fallback if empty (e.g., agent generating draft after their own message)
    if (latestCustomerMessages.length === 0 && customerLines.length > 0) {
      const lastLine = customerLines[customerLines.length - 1];
      latestCustomerMessages.push(lastLine.replace(/^\[[^\]]+\]:\s*/, '').trim());
    }
    const latestCustomerMessageCleaned = latestCustomerMessages.join('\n');

    const customerFullText = customerLines.slice(-10).join(' ').toLowerCase();
    const isBengaliScript = /[\u0985-\u09B9\u09DC-\u09DF\u09BE-\u09CC\u0981-\u0983]/.test(customerFullText);
    const words = customerFullText.replace(/[^a-z0-9\s]/g, '').split(/\s+/);
    const isBenglish = words.some((w: string) => BENGLISH_WORDS.has(w));
    const strictLanguage = isBengaliScript || isBenglish ? 'Bengali' : 'English';
    const languageOverride = strictLanguage === 'Bengali' 
      ? '\nCRITICAL LANGUAGE OVERRIDE: Based on algorithmic detection of their recent messages, the customer\'s language is strictly Bengali. You MUST reply ONLY in Bengali script (বাংলা অক্ষর). Do not use English.' 
      : '\nCRITICAL LANGUAGE OVERRIDE: Based on algorithmic detection, the customer\'s language is strictly ENGLISH. You MUST reply ONLY in English. Do NOT write any Bengali whatsoever.';

    // Cap context to last 20 messages for faster/cheaper Haiku generation
    const cappedContextMessages = conversationLines.slice(-20).join('\n');

    // 2. Build dynamic knowledge context (intent-based, ~1-3k tokens vs old 26k)
    let { context: knowledgeContext, sources: knowledgeSources } = buildKnowledgeContext(cappedContextMessages);

    // 2.5 Vector DB RAG Search + 3. Learning Data - run in PARALLEL for speed
    const vectorSearchPromise = (async () => {
      try {
        if (!process.env.OPENAI_API_KEY) return;
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        const lines = cappedContextMessages.split('\n')
          .map((line: string) => line.trim())
          .filter((line: string) => line && !line.startsWith('[Agent]'));
        const lastQuery = lines.slice(-3).join(' ');
        
        // Fast-path bypass: If latest message is short and has no technical or sales query keywords, skip costly OpenAI embeddings & Supabase vector RPC
        const cleanLatest = latestCustomerMessageCleaned.toLowerCase();
        const hasDiagnosticOrSalesIntent = /error|down|ssl|dns|ip|fail|not working|price|cost|buy|order|how|what|where|why|plan|package|hosting|domain/i.test(cleanLatest);
        if (cleanLatest.length < 25 && !hasDiagnosticOrSalesIntent) {
          return;
        }

        if (lastQuery.length > 10) {
          const embeddingRes = await openai.embeddings.create({
            model: 'text-embedding-3-small',
            input: lastQuery.substring(0, 1500),
            dimensions: 1536
          });
          const query_embedding = embeddingRes.data[0].embedding;
          
          const { data: vectorDocs } = await supabaseAdmin.rpc('match_knowledge', {
            query_embedding,
            match_threshold: 0.45,
            match_count: 3
          });
          
          if (vectorDocs && vectorDocs.length > 0) {
            knowledgeContext += '\n\n## Knowledge Base & Reference Answers (Use this information to draft your reply)\n';
            knowledgeContext += 'CRITICAL INSTRUCTION: The answers below contain general Hostnin policies. DO NOT copy them blindly. You MUST personalize the final response to perfectly match the exact numbers, metrics (e.g., specific RAM or visitor limits), and situation mentioned by the CUSTOMER in the current chat.\n\n';
            knowledgeContext += vectorDocs.map((d: any) => `User Question / Context: ${d.question}\nRelevant Answer / Info: ${d.answer}`).join('\n\n---\n\n');
            vectorDocs.forEach((d: any) => knowledgeSources.push('Vector Match'));
          }
        }
      } catch (e) {
        console.error('Vector DB search failed:', e);
      }
    })();

    const learningPromise = (orgId && !isTranslation)
      ? getLearningData(orgId)
      : Promise.resolve({ fewShotBlock: '', mistakesBlock: '' });

    // Wait for all three heavy operations in parallel (saves ~500-1500ms vs sequential)
    const [imageBlock, , { fewShotBlock }] = await Promise.all([imagePromise, vectorSearchPromise, learningPromise]);

    // 4. Build user message with language rules + knowledge + context
    let userMessage = '';
    
    if (isTranslation) {
      userMessage = `You are a highly accurate translation API. Your only job is to translate the provided text exactly as instructed, without adding any conversational filler, quotes, or support agent persona.
      
Instruction: ${instruction}

Output ONLY the translation in raw plain text.`;
    } else {
    userMessage = `The customer's latest message(s): "${latestCustomerMessageCleaned}"${languageOverride}
    
FORMATTING & BREVITY:
- CRITICAL: Every single sentence or logical thought MUST be separated by a double line break (\\n\\n).
- NEVER combine multiple sentences into a single paragraph, even for very short messages. ALWAYS add breathing space.
- Example for a short reply: [Greeting] \\n\\n [Main Answer] \\n\\n [Next Step/Question]
- Keep response 3-4 short sentences max. Short bursts, not essays.
${fewShotBlock}
${instruction ? `\nCRITICAL AGENT INSTRUCTION (COPILOT MODE):
The agent has explicitly requested you to write a message conveying the following exact meaning:
>>> "${instruction}" <<<

RULES FOR THIS INSTRUCTION:
1. FOCUS ONLY ON THE INSTRUCTION. Do NOT bring up past topics from the conversation unless directly required.
2. If the instruction is short (like "done", "fixed", "check now"), just write a brief, professional 1-2 sentence message (e.g., "I've completed this for you. Please check."). Do NOT hallucinate long explanations or repeat previous steps.
3. CRITICAL: ALWAYS format the response in the language determined by the CUSTOMER's original messages (see CRITICAL LANGUAGE RULES), regardless of the language the instruction is written in. The instruction is just for you to know what to say, but you MUST translate that intent into the customer's language.` : ''}

## Hostnin Knowledge (use ONLY if relevant to the question)
${knowledgeContext}

Customer Name: ${contactName}

Conversation:
${cappedContextMessages}

${imageBlock ? `\nCRITICAL MULTIMODAL/VISION INSTRUCTION:
The customer has uploaded an image/screenshot (attached to this message). 
You MUST analyze the contents of this image carefully. 
- If it is a pricing table, plan comparison, or website screenshot: Answer their query based on the visible plans, features, and prices.
- If it is an error log, CPGuard notification, or cPanel screenshot: Explain the technical issue shown and how it will be resolved.
- If it is a payment receipt: Analyze the SPECIFIC image uploaded right now. Do not assume it is the same payment method used earlier in the chat. Acknowledge the exact payment method (e.g., bKash, SSLCommerz, Bank Transfer) and amount visibly shown IN THIS IMAGE. DO NOT assume or state it is a 'Bank Transfer' unless explicitly written on this new receipt.
ALWAYS base your response strictly on what is visibly present in the image. DO NOT invent or hallucinate tickets, bookings, or unrelated scenarios.` : ''}

Draft a smart, helpful reply as the support agent.`;
    }

    // 5. Fire AI request (Gemini for Translation, Anthropic for Support Drafts)
    if (isTranslation) {
      let useFallback = false;
      let geminiResponse: Response | null = null;

      try {
        if (!process.env.GEMINI_API_KEY) {
          throw new Error("Missing Gemini API key");
        }

        geminiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse&key=${process.env.GEMINI_API_KEY}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            contents: [{ parts: [{ text: userMessage }] }],
            generationConfig: { temperature: 0.1 }
          }),
        });

        if (!geminiResponse.ok) {
          const errorText = await geminiResponse.text();
          console.error('[AI Translation] Gemini error:', geminiResponse.status, errorText);
          useFallback = true;
        }
      } catch (geminiErr: any) {
        console.error('[AI Translation] Gemini exception:', geminiErr.message);
        useFallback = true;
      }

      if (useFallback || !geminiResponse) {
        console.log('[AI Translation] Falling back to Anthropic for translation...');
        
        const anthropicResponse = await fetch("https://api.anthropic.com/v1/messages", {
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
            stream: true,
            system: [
              {
                type: "text",
                text: "You are a highly accurate translation API. Your only job is to translate the provided text exactly as instructed, without adding any conversational filler, quotes, or support agent persona. Output ONLY the translation in raw plain text.",
              }
            ],
            messages: [
              { role: "user", content: userMessage },
            ],
          }),
        });

        if (!anthropicResponse.ok) {
          const errorText = await anthropicResponse.text();
          console.error('[AI Translation Fallback] Anthropic error:', anthropicResponse.status, errorText);
          return NextResponse.json({ error: "Translation Failed (Both Gemini and Anthropic failed)" }, { status: 500 });
        }

        const encoder = new TextEncoder();
        const stream = new ReadableStream({
          async start(controller) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ language: 'en', sources: [] })}\n\n`));

            const reader = anthropicResponse.body?.getReader();
            const decoder = new TextDecoder("utf-8");
            if (!reader) { controller.close(); return; }

            let buffer = '';
            try {
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split("\n");
                buffer = lines.pop() || '';

                for (const line of lines) {
                  if (line.startsWith("data: ") && line !== "data: [DONE]") {
                    try {
                      const data = JSON.parse(line.slice(6));
                      if (data.type === "content_block_delta" && data.delta?.text) {
                        controller.enqueue(
                          encoder.encode(`data: ${JSON.stringify({ text: data.delta.text })}\n\n`)
                        );
                      }
                    } catch { }
                  }
                }
              }
            } catch (streamErr: any) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: 'Stream error: ' + streamErr.message })}\n\n`));
            } finally {
              reader.releaseLock();
              controller.close();
            }
          }
        });

        return new Response(stream, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
          },
        });
      }

      // Succeeded with Gemini
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ language: 'en', sources: [] })}\n\n`));

          const reader = geminiResponse!.body?.getReader();
          const decoder = new TextDecoder("utf-8");
          if (!reader) { controller.close(); return; }

          let buffer = '';
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split("\n");
              buffer = lines.pop() || '';

              for (const line of lines) {
                if (line.startsWith("data: ") && line !== "data: [DONE]") {
                  try {
                    const data = JSON.parse(line.slice(6));
                    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
                    if (text) {
                      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`));
                    }
                  } catch { }
                }
              }
            }
          } catch (streamErr: any) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: 'Stream error: ' + streamErr.message })}\n\n`));
          } finally {
            reader.releaseLock();
            controller.close();
          }
        }
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache, no-transform",
          "Connection": "keep-alive",
          "X-Accel-Buffering": "no",
        },
      });
    }

    const anthropicResponse = await fetch("https://api.anthropic.com/v1/messages", {
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
        temperature: 0.1,
        stream: true,
        system: [
          {
            type: "text",
            text: buildSystemPrompt(),
            cache_control: { type: "ephemeral" }
          }
        ],
        messages: [
          {
            role: "user",
            content: imageBlock 
              ? [
                  {
                    type: "image",
                    source: {
                      type: "base64",
                      media_type: imageBlock.mediaType,
                      data: imageBlock.base64Data
                    }
                  },
                  {
                    type: "text",
                    text: userMessage
                  }
                ]
              : userMessage
          },
        ],
      }),
    });

    if (!anthropicResponse.ok) {
      const errorText = await anthropicResponse.text();
      console.error('[AI Draft] Anthropic error:', anthropicResponse.status, errorText);
      const encoder = new TextEncoder();
      const errorStream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: `Anthropic ${anthropicResponse.status}: ${errorText.substring(0, 200)}` })}\n\n`));
          controller.close();
        }
      });
      return new Response(errorStream, {
        headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" }
      });
    }

    // 6. Pipe Anthropic SSE stream directly to client
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ language: strictLanguage, sources: knowledgeSources })}\n\n`));

        const reader = anthropicResponse.body?.getReader();
        const decoder = new TextDecoder("utf-8");
        if (!reader) { controller.close(); return; }

        let buffer = '';

          let inputTokens = 0;
          let outputTokens = 0;

          try {
            let firstChunk = true;
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split("\n");
              buffer = lines.pop() || '';

              for (const line of lines) {
                if (firstChunk && line.startsWith("data: ")) {
                  // Detect Anthropic stream-level errors
                  const parsed = JSON.parse(line.slice(6));
                  if (parsed.type === 'error') {
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: parsed.error?.message || 'Unknown Anthropic error' })}\n\n`));
                  }
                  firstChunk = false;
                }
                if (line.startsWith("data: ") && line !== "data: [DONE]") {
                  try {
                    const data = JSON.parse(line.slice(6));
                    if (data.type === "message_start" && data.message?.usage?.input_tokens) {
                      inputTokens = data.message.usage.input_tokens;
                    }
                    if (data.type === "message_delta" && data.usage?.output_tokens) {
                      outputTokens = data.usage.output_tokens;
                    }
                    if (data.type === "content_block_delta" && data.delta?.text) {
                      controller.enqueue(
                        encoder.encode(`data: ${JSON.stringify({ text: data.delta.text })}\n\n`)
                      );
                    }
                  } catch {
                    // incomplete JSON chunk
                  }
                }
              }
            }
            
            // Send final usage metrics
            const totalTokens = inputTokens + outputTokens;
            if (totalTokens > 0) {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ usage: { total: totalTokens }, model: "claude-3-5-haiku", temperature: 0.7 })}\n\n`)
              );
            }
          } catch (streamErr: any) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: 'Stream error: ' + (streamErr?.message || 'unknown') })}\n\n`));
        } finally {
          reader.releaseLock();
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
