import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { buildKnowledgeContext } from "@/actions/knowledge-engine";
import OpenAI from "openai";
// ============================================================
// LANGUAGE DETECTION
// ============================================================

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

function detectSalam(text: string): boolean {
  const normalized = text.toLowerCase().trim();
  const bSalam = /(আসসালামু|আস\-সালামু|আসালামু|সালাম)/.test(normalized);
  const eSalam = /(salam|slm|assalamu|asalamu|alaikum|alaykum|slam)/.test(normalized);
  return bSalam || eSalam;
}

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
- BOLD FORMATTING (CRITICAL): Always use single asterisks (*text*) for bolding key headers, steps, or labels (WhatsApp standard bold). NEVER use double asterisks (**text**).
- TONE: You are a sharp, senior technical agent. Your professionalism comes from speed, accuracy, and efficiency, not fake cheerfulness.
- BANNED PUNCTUATION (CRITICAL NEGATIVE CONSTRAINT): NEVER use em-dashes (—) or multiple hyphens (--) in any of your responses. They look too formal or bookish for WhatsApp chats. Always use standard commas (,) or single hyphens (-) instead.
- NO FAMILY HONORIFICS (CRITICAL GUARDRAIL): NEVER append Bengali honorifics like "ভাই" (Bhai), "ভাইয়া" (Bhaiya), "আপু" (Apu), or "আপা" (Apa) to customer names. If the customer's name is "Imran", you MUST NOT write "ইমরান ভাই" or "ইমরান ভাইয়া". Just address them as "ইমরান" or drop the name entirely. Address them in a clean, professional, Apple-style minimalist way using only neutral "আপনি / আপনার".
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
- NO COMFORT OPENERS (CRITICAL): NEVER start your responses with generic comfort openings like "কোনো চিন্তা নেই" (no worries), "জ্বী, কোনো চিন্তা নেই", "চিন্তা করবেন না" (do not worry), or "জ্বী, কোনো সমস্যা নেই" (yes, no problem). These automated reassurance phrases make the draft sound highly robotic, automated, and insincere. Address their technical issue directly without hollow reassurance.
- NO OVER-PROMISING (CRITICAL): NEVER say you are doing something "right now" or instantly (e.g., "আমি এখনই করে দিচ্ছি", "এখনই দিয়ে দিচ্ছি", "এখনই পাঠিয়ে দিচ্ছি"). In web hosting, tasks require backend processing. ALWAYS say you are "checking" (আমি চেক করছি) or "processing" (আমি প্রসেস করছি) instead.
- SAFE COMMITMENTS: Never assume a task is instantly completed. Use phrases like "আপনার ইস্যুটি আমি বিস্তারিত চেক করছি।" (checking details) or "আমাদের টিম কাজ করছে" (our team is working on it).
- TERMINOLOGY & VOCABULARY GUARDRAILS (CRITICAL):
  1. TICKET CONFIRMATIONS: When informing a customer that a support ticket has been created, NEVER use delivery/mail metaphors like "পৌঁছেছে" (reached/arrived) or say "টিকেটটি পৌঁছেছে". It sounds bookish, formal, and robotic. ALWAYS use natural, procedural, active terms like "টিকিট করা হয়েছে" (ticket has been created) or "টিকেট ক্রিয়েট করা হয়েছে". E.g. "টিকেটটি ইতিমধ্যেই আমাদের টেকনিক্যাল টিমের কাছে টিকিট করা হয়েছে।"
  2. PATIENCE & COOPERATION: NEVER say "ধৈর্য রাখার জন্য ধন্যবাদ" (thank you for keeping patience). It sounds like an automated, robotic corporate machine. ALWAYS use warmer, premium Bengali support vocabulary like "সহযোগিতার জন্য আপনাকে ধন্যবাদ" (thank you for your cooperation) or "আমাদের সাথে থাকার জন্য ধন্যবাদ" (thank you for staying with us).
  3. ACTIVATION TRANSLITERATION: NEVER spell the word "activation" as "অ্যাক্টিভেশন" (using অ্যা). ALWAYS spell it as "এক্টিভেশন" (using এ) to match Hostnin's clean branding and UI transliteration standards.
  4. BANNED FORMAL VERB ENDINGS: NEVER use Sadhu Bhasha or overly literary/textbook verb endings like "গিয়েছে" (has gone), "গিয়াছে", or "করিয়াছে". ALWAYS use the warm, standard conversational Bengali forms "গেছে" (has gone) and "করেছে" (has done).
  5. SOON & TIMING: NEVER use the textbook Bengali word "শীঘ্রই" (soon). It sounds highly robotic and formal. ALWAYS write the warmer, conversational and faster support term "খুব দ্রুতই" (very quickly/shortly). E.g. "আমাদের টেকনিক্যাল টিম এটি চেক করে খুব দ্রুতই ইমেইলে আপডেট জানাবেন।"
- AMBIGUOUS PLAN NAMES: If a customer asks about a generic plan like "Pro package" or "Starter plan", you MUST NOT guess. Hostnin has multiple "Pro" plans (e.g., Web Hosting Pro, Turbo Pro, BDIX Pro). You MUST either ask for clarification ("আপনি কি ওয়েবহোস্টিং প্রো নাকি টার্বো প্রো এর ব্যাপারে জানতে চাচ্ছেন?") or explicitly state which one you are pricing ("আমাদের ওয়েবহোস্টিং প্রো প্ল্যানটির ১ বছরের দাম ৳৭,১৮৮...").
- SIMPLE GREETINGS: If they just say "Hi", reply with a brief greeting. Nothing more.

## CRISIS MANAGEMENT & ANGRY CUSTOMERS
- If a customer is angry about downtime, lost sales, or slow speeds, use "Smart Bangla" to acknowledge the frustration.
- REQUIRED BANGLA: Use terms like "আপনার ইস্যুটি আমি বিস্তারিত চেক করছি।" or "অসুবিধার জন্য আমরা আন্তরিকভাবে দুঃখিত".
- BANNED TEXTBOOK BANGLA: Never say "আমি আপনার হতাশার কারণ বুঝতে পারছি" or "বিজনেসে আঘাত". 
- NO BLIND UPSELLING: NEVER recommend upgrading their plan (e.g. "upgrade to Turbo") to an angry customer unless the agent explicitly tells you to via a whisper instruction.
- ACTION: Apologize briefly and assure them the technical team is investigating. No cheerful language.

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

## IRRELEVANT TOPICS & FOLLOW-UP INQUIRIES (CRITICAL)
- If the customer asks about irrelevant topics (e.g. buying a cow/livestock, personal life, non-technical/non-hosting topics):
  1. Politely but firmly decline to answer or state that you cannot help with that specific topic, because we specialize strictly in Hostnin web hosting and domain registration.
  2. NEVER use static, repetitive, or boring canned responses if they follow up on the irrelevant topic. Generate natural, fresh, and friendly variations each time.
  3. Proactively steer the topic back to Hostnin's business. Suggest that if they ever decide to build a website or launch an online portal for their farm, livestock business, or other projects, we would love to provide the best hosting and domain services for them.
  - GOOD VARIATION 1: "আমি বুঝতে পারছি আপনি গরু কিনতে চাচ্ছেন, কিন্তু আমরা মূলত ওয়েব হোস্টিং এবং ডোমেইন সার্ভিস নিয়ে কাজ করি। তবে আপনার ফার্ম বা ডেইরি বিজনেসের জন্য যদি কখনো ওয়েবসাইট বানানোর প্ল্যান থাকে, সেক্ষেত্রে হোস্টিং দিয়ে আমি অবশ্যই হেল্প করতে পারবো।"
  - GOOD VARIATION 2: "দুঃখিত, গরু কেনাবেচা বা চয়েস করার ব্যাপারে হেল্প করা আমাদের পক্ষে সম্ভব না, কারণ আমরা শুধুমাত্র হোস্টিং ও ডোমেইন সার্ভিস প্রোভাইড করে থাকি। তবে আপনার গরুর খামারের জন্য ওয়েবসাইট তৈরি করার কথা ভাবলে আমাদের সাথে যোগাযোগ করতে পারেন!"

## TECHNICAL SUPPORT WORKFLOW (SIMPLE vs COMPLEX)
- SIMPLE ISSUES & HOW-TO GUIDES: For general questions like "How to install SSL", "How to upload a plugin", or "How to create an email", USE YOUR OWN INTERNAL EXPERT KNOWLEDGE to provide short, accurate, step-by-step troubleshooting. At the end of the steps, always add: "যদি এতে সমাধান না হয়, জানাবেন। আমি আপনার চ্যাটটি টিকিটে কনভার্ট করে দিবো যাতে আমাদের সিনিওর টিম চেক করতে পারে।"
- COMPLEX ISSUES & SEVERE ERRORS: If the customer reports a severe issue (e.g., website down, 500 server error, database crash) or shares a complex error screenshot, DO NOT provide troubleshooting steps. You must OFFER to convert the chat to a ticket so the technical team can check it.
- TICKET CONVERSION (WHEN INSTRUCTED): If the agent whispers an instruction like \`// tell them ticket created\` or \`// ticket done\`, you MUST use these EXACT phrases:
  * If Bengali: "আমি আপনার এই চ্যাটটি টিকিটে কনভার্ট করে দিয়েছি যাতে আমাদের টেকনিক্যাল টিম এটি নিয়ে বিস্তারিত চেক করতে পারেন। টেকনিক্যাল টিম বিস্তারিত আপডেট ইমেইলে জানাবেন।"
  * If English: "I have converted your chat to a ticket so that our technical team can check it in detail. The technical team will provide detailed updates via email."

## CONVERSATION FLOW, SCOPE & SHORT ACKNOWLEDGMENTS
- **ONLY DRAFT FOR THE LATEST TURN (CRITICAL)**: You are drafting a response to the customer's *latest* message(s) only. The messages in the conversation history marked as '[Agent]' or '[System]' have ALREADY been delivered to the customer. You MUST NEVER repeat, paraphrase, re-state, or prepend those previously sent agent messages in your new draft. Start your draft completely fresh, addressing only the new information or question in the customer's latest reply.
- If the customer says "ok", "yes", "ji", or "thik ache":
  1. Look at the Agent's previous message. If the Agent asked a question or offered to do something (e.g. "Should I open a ticket?", "Want me to renew?"), you MUST confirm the action (e.g. "আমি আপনার জন্য টিকিট ওপেন করে দিচ্ছি।" or "আমি রিনিউ করে দিচ্ছি।").
  2. If there is no pending action, just politely close: "জ্বী, আমি কি আর কোন তথ্য দিয়ে সহযোগিতা করতে পারি?"
- If the customer says "thanks", "dhonnobad", or acknowledges a resolution:
  1. If the language context is English, reply: "Happy to help! Let me know if you need anything else."
  2. If the language context is Bengali, reply: "সময় দিয়ে সহযোগিতার জন্য আপনাকেও ধন্যবাদ"
- NEVER reply with chatty fluff like "ভালো, তাহলে সবকিছু ক্লিয়ার হয়েছে বুঝছি" or "শুনে খুব ভালো লাগলো".
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

Output ONLY the draft message. No quotes, no labels.`;
}

// ============================================================
// GOLDEN EXAMPLES (HARDCODED PERFECT TONE)
// ============================================================

async function getLearningData(orgId: string): Promise<{ fewShotBlock: string }> {
  // 2. Fetch the latest high-value learned dynamic style rules from Supabase (up to 5)
  let learnedRulesBlock = "";
  try {
    const { data: dbRules } = await supabaseAdmin
      .from('ai_knowledge_base')
      .select('question, answer')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(5);

    if (dbRules && dbRules.length > 0) {
      learnedRulesBlock = `\n\nDYNAMIC STYLE RULES LEARNED FROM AGENT EDITS (CRITICAL: Prioritize these adjustments and constraints when formatting your response):\n` +
        dbRules.map((rule, idx) => `[Rule ${idx + 1}] Context/Mistake: ${rule.question}\nCorrection/Instruction: ${rule.answer}`).join('\n---\n');
    }
  } catch (err: any) {
    console.warn('[getLearningData] Failed to fetch dynamic rules:', err.message);
  }
  
  const goldenExamples = [
    "আপনার ইস্যুটি আমি বিস্তারিত চেক করছি। একটু সময় দিবেন।",
    "আমাদের টিম বিস্তারিত চেক করে আপনাকে ইমেইলে আপডেট জানাবেন।",
    "কি ধরনের ওয়েবসাইটের জন্য হোষ্টিং নিতে চাচ্ছেন? আপনার ওয়েবসাইট বা প্রজেক্টের ব্যাপারে জানাতে পারেন যাতে আমি আপনার প্রয়োজন অনুযায়ী বেস্ট প্যাকেজটি সাজেস্ট করতে পারি।",
    "আপনার ই-কমার্স ওয়েবসাইটের ভিজিটর কোন কোন দেশ থেকে আসতে পারে? শুধুমাত্র বাংলাদেশ টার্গেট করে হবে নাকি পুরোবিশ্ব?",
    "আপনার বাংলাদেশী বেইজড বিজনেস ওয়েবসাইটকে টার্গেট করে কোন ফেসবুক বা গুগল এড রান করার পরিকল্পনা রয়েছে কি? নাকি শুধুমাত্র শো-কেইস এর জন্য ব্যবহার করতে চাচ্ছেন?",
    "যেহেতু এড বাজেটের উপর সাইটের পটেনশিয়াল ট্রাফিক নির্ভর করে, এক্ষেত্রে আপনার প্রতিদিন কত ডলার বাজেট এড স্পেন্ড করার প্ল্যান রয়েছে?",
    "যেহেতু আপনি ডেইলি ২০ ডলারের মত এড স্পেন্ড করবেন, আপনার সাইটে হঠাৎ করে প্রচুর ট্রাফিক আসতে পারে। নরমাল শেয়ার্ড হোস্টিংয়ে সাইট স্লো বা ডাউন হয়ে যাওয়ার রিস্ক থাকে। আপনার জন্য আমাদের 'টার্বো স্টার্টার' প্ল্যানটি সবচেয়ে বেস্ট হবে, এতে বাউন্স রেট কমবে এবং এডের বেস্ট রিটার্ন পাবেন।",
    "আপনার ডোমেইনটি সাকসেসফুলি কানেক্ট হয়েছে। তবে ডিএনএস প্রোপাগেট হতে সাধারণত ২৪ ঘণ্টার মত সময় লাগতে পারে।",
    "জ্বী, গিটহাব কানেক্ট করা যাবে। কিন্তু ড্যাশবোর্ডে সরাসরি অপশন নেই।\n\nSSH দিয়ে গিট ক্লোন করে নিতে হয়, প্রসেসটা একটু টেকনিক্যাল।\n\nআমি কি আপনাকে গাইড করবো যাতে আপনি নিজে করে নিতে পারেন নাকি আমাদের টিমকে দিয়ে সেটআপ করিয়ে নিবেন?"
  ];
  
  const fewShotBlock = `\n\nGOLDEN REPLY EXAMPLES (These examples show the exact tone, brevity, and workflow you must mimic. If the customer is speaking English, you MUST translate this vibe/meaning into English and NEVER output Bengali):\n${goldenExamples.join('\n---\n')}${learnedRulesBlock}
  
NEGATIVE CONSTRAINTS (FORBIDDEN PHRASES & ACTIONS):
- NEVER use the words "Bhaiya", "Bhai", "Apu", "Sir", or "Madam". It is strictly against company policy. Address them directly or use "জ্বী".
- NEVER start your response with generic robotic comfort phrases like "কোনো চিন্তা নেই" (no worries), "জ্বী, কোনো চিন্তা নেই", "চিন্তা করবেন না" (do not worry), or "জ্বী, কোনো সমস্যা নেই" (yes, no problem).
- NEVER use delivery metaphors like "পৌঁছেছে" (reached/arrived) or say "টিকেটটি পৌঁছেছে" when confirming support ticket creation. ALWAYS use procedurally active, casual support vocabulary like "টিকিট করা হয়েছে" (ticket has been created).
- NEVER use the phrase "ধৈর্য রাখার জন্য ধন্যবাদ" (thank you for keeping patience). ALWAYS write "সহযোগিতার জন্য আপনাকে ধন্যবাদ" (thank you for your cooperation).
- NEVER spell the word "activation" as "অ্যাক্টিভেশন". ALWAYS write "এক্টিভেশন".
- NEVER use formal Sadhu verb endings like "গিয়েছে" (has gone) or "করিয়াছে". ALWAYS write conversational Bengali forms "গেছে" and "করেছে".
- NEVER use the textbook Bengali word "শীঘ্রই" (soon). ALWAYS write "খুব দ্রুতই" (very quickly/shortly).
- NEVER use overly formal/robotic Bengali transitions like "তবে এটি". Write exactly like the casual, punchy Golden Examples above.
- NEVER express joy at helping, NEVER tell the customer to "stay happy," and NEVER use fake excitement. Be grounded, direct, and strictly professional.
- NEVER use hyphens (-) or em dashes (—). Use commas (,) instead.
- NEVER say you are an AI, and NEVER say "Here is a draft".
- NEVER hallucinate or make up prices. Quote exact prices from the knowledge base.
- NEVER use robotic empathy recaps (e.g., "আমি বুঝতে পারছি আপনার..." or repeating/paraphrasing what the customer just said). Real human agents skip empty recaps and show understanding by taking immediate task action.
- NEVER admit a mistake or apologize for a misunderstanding (e.g., "আমাদের ভুল হয়েছে") unless you are 100% database-verified certain of a host error. If accused or confused, ask polite clarifying questions instead.
- NEVER write long unsolicited educational paragraphs comparing locations or debating technical trade-offs. Present the requested alternative specs and prices directly.
- NEVER use internal process delay language or vague team promises (e.g., "আমাদের টেকনিক্যাল টিম টিকিটে আপডেট দিবে"). Always talk in active agent language.
- NEVER ask for redundant details (e.g., domain, email) during active downtime emergencies if the customer already sent screenshots or context.`;
  return { fewShotBlock };
}

// ============================================================
// MAIN ROUTE
// ============================================================

export async function POST(req: Request) {
  try {
    const { contextMessages, contactName, orgId, instruction, isTranslation, imageUrl, imageDistance, crmContext } = await req.json();
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
    
    // Extract all consecutive customer messages at the end of the conversation
    const latestCustomerMessages = [];
    for (let i = parsedMessages.length - 1; i >= 0; i--) {
      const m = parsedMessages[i];
      if (m.sender === 'Agent' || m.sender === 'System') {
        break;
      }
      latestCustomerMessages.unshift(m.content);
    }
    // Fallback if empty (e.g., agent generating draft after their own message)
    if (latestCustomerMessages.length === 0 && customerMessages.length > 0) {
      latestCustomerMessages.push(customerMessages[customerMessages.length - 1].content);
    }
    const latestCustomerMessageCleaned = latestCustomerMessages.join('\n');

    let strictLanguage: 'Bengali' | 'English' | 'Dynamic' = 'English';
    
    if (instruction) {
      // Instruction mode: The language of the AI should strictly match the language of the agent's instruction
      const instructionText = instruction.toLowerCase();
      const instructionIsBengali = /[\u0985-\u09B9\u09DC-\u09DF\u09BE-\u09CC\u0981-\u0983]/.test(instructionText);
      const instructionWords = instructionText.replace(/[^a-z0-9\s]/g, '').split(/\s+/);
      const instructionIsBenglish = instructionWords.some((w: string) => BENGLISH_WORDS.has(w));
      strictLanguage = instructionIsBengali || instructionIsBenglish ? 'Bengali' : 'English';
    } else {
      // Auto mode: Fall back to detecting the customer's conversation language
      let textToDetect = latestCustomerMessageCleaned.trim().toLowerCase();
      // If the latest message is too short or just an acknowledgement/greeting, scan the recent conversation history in reverse order (both agent and contact) to detect the active active context
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
      const nonGreetingWords = words.filter((w: string) => w && !detectSalam(w));
      const isBenglish = nonGreetingWords.length === 0
        ? detectSalam(textToDetect)
        : nonGreetingWords.some((w: string) => BENGLISH_WORDS.has(w));
      strictLanguage = isBengaliScript || isBenglish ? 'Bengali' : 'English';
    }
    const languageOverride = strictLanguage === 'Bengali' 
      ? '\nCRITICAL LANGUAGE OVERRIDE: The target language is strictly BENGALI. You MUST reply ONLY in Bengali script (বাংলা অক্ষর). Do not use English.' 
      : '\nCRITICAL LANGUAGE OVERRIDE: The target language is strictly ENGLISH. You MUST reply ONLY in English. Do NOT write any Bengali whatsoever.';

    // Cap context to last 20 messages for faster/cheaper Haiku generation
    const conversationLines = contextMessages.split('\n').map((l: string) => l.trim()).filter(Boolean);
    const cappedContextMessages = conversationLines.slice(-20).join('\n');

    // 2. Build dynamic knowledge context (intent-based, ~1-3k tokens vs old 26k)
    let { context: knowledgeContext, sources: knowledgeSources } = buildKnowledgeContext(cappedContextMessages);

    let highPrioritySemanticRules = "";

    // 2.5 Vector DB RAG Search + 3. Learning Data - run in PARALLEL for speed
    const vectorSearchPromise = (async () => {
      try {
        if (!process.env.OPENAI_API_KEY) return;
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        const lines = cappedContextMessages.split('\n')
          .map((line: string) => line.trim())
          .filter((line: string) => line && !line.startsWith('[Agent]') && !line.startsWith('[System]'));
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
            const cleanVectorDocs = [];
            
            for (const d of vectorDocs) {
              const isLearnedRule = d.answer.includes('[CRITICAL RULE]') || d.answer.includes('[STYLE CORRECTION]');
              if (isLearnedRule) {
                // Parse dynamic rule
                const critMatch = d.answer.match(/\[CRITICAL RULE\]:\s*([\s\S]*?)(?=\n\[STYLE CORRECTION\]|\n\n\[VERIFIED REPLY\]|$)/i);
                const styleMatch = d.answer.match(/\[STYLE CORRECTION\]:\s*([\s\S]*?)(?=\n\n\[VERIFIED REPLY\]|$)/i);
                const replyMatch = d.answer.match(/\[VERIFIED REPLY\]:\s*([\s\S]*?)$/i);

                const rule = critMatch ? critMatch[1].trim() : "";
                const style = styleMatch ? styleMatch[1].trim() : "";
                const reply = replyMatch ? replyMatch[1].trim() : "";

                highPrioritySemanticRules += `\n---\n[MATCHED MISTAKE/CORRECTION RULE FOR THIS SCENARIO]\n- Customer Issue: ${d.question}\n`;
                if (rule) highPrioritySemanticRules += `- Core Rule: ${rule}\n`;
                if (style) highPrioritySemanticRules += `- Style Correction: ${style}\n`;
                if (reply) highPrioritySemanticRules += `- Verified Ideal Reply (Mimic this structure): ${reply}\n`;

                if (reply) {
                  cleanVectorDocs.push({
                    question: d.question,
                    answer: reply
                  });
                }
              } else {
                cleanVectorDocs.push(d);
              }
            }

            if (cleanVectorDocs.length > 0) {
              knowledgeContext += '\n\n## Knowledge Base & Reference Answers (Use this information to draft your reply)\n';
              knowledgeContext += 'CRITICAL INSTRUCTION: The answers below contain general Hostnin policies. DO NOT copy them blindly. You MUST personalize the final response to perfectly match the exact numbers, metrics, and situation mentioned by the CUSTOMER in the current chat.\n\n';
              knowledgeContext += cleanVectorDocs.map((d: any) => `User Question / Context: ${d.question}\nRelevant Answer / Info: ${d.answer}`).join('\n\n---\n\n');
              cleanVectorDocs.forEach(() => knowledgeSources.push('Vector Match'));
            }
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
      const hasCustomerSaidSalam = detectSalam(latestCustomerMessageCleaned);
      const greetingRule = hasCustomerSaidSalam
        ? `\n\nCRITICAL GREETING RULE (MANDATORY): The customer has initiated the conversation with a greeting of Salam. You MUST begin your reply with the exact response "${strictLanguage === 'Bengali' ? 'ওয়ালাইকুম আসসালাম।' : 'Walaikum assalam!'}" in the very first line of your message before anything else.`
        : `\n\nCRITICAL GREETING RULE (MANDATORY): The customer did NOT say Salam. You MUST NEVER begin your reply with "ওয়ালাইকুম আসসালাম" or "Walaikum assalam". Start your reply directly, warm, and naturally.`;

      userMessage = `The customer's latest message(s): "${latestCustomerMessageCleaned}"${languageOverride}${greetingRule}
    
## CONVERSATIONAL CONTINUITY & COHERENCE (MANDATORY):
1. Carefully analyze the last 2-3 messages in the chat history (what the Agent said, and what the customer just said in reply).
2. If the customer's latest message is extremely short or vague (e.g. "send", "share", "tell me", "details", "check"), you MUST NOT treat it in isolation.
3. Synthesize their intent in direct relation to the immediately preceding Agent message:
   - Example: If the Agent recently asked for a maximum budget, server configuration, or domain names, and the customer just says "send" or "share", they are instructing you to send the pricing or configurations for the options discussed. Acknowledge this contextually (e.g. "যেহেতু আপনি সিঙ্গাপুর বা অন্য লোকেশনের কনফিগারেশন জানতে চেয়েছেন...", "Since you asked for the server pricing details...").
4. Maintain a highly coherent, smart thread of thought. Carry over key context variables (like the budget discussed, specific locations like Singapore, or domain details) from the previous agent message to completely and logically address their short instruction.

FORMATTING & CONCISENESS (CRITICAL):
- EXTREME BREVITY: Keep your entire response under 2-3 short, punchy sentences max (less than 40 words total). Real humans write in quick, direct bursts. NEVER write long, verbose paragraphs or multi-sentence technical lectures.
- NATURAL FLOW: Combine your confirmation/acknowledgement and next step/question into a single natural paragraph. Do NOT use double line breaks (\n\n) between every sentence—it looks artificial and robotic. 
- Paragraph Limit: Limit the entire response to a maximum of 1 or 2 brief paragraphs. Only use a double line break if you need to separate a short greeting/apology from the main answer.

${fewShotBlock}
${highPrioritySemanticRules ? `\n\nHIGH-PRIORITY SITUATIONAL STYLE RULES MATCHED FOR THIS CHAT:\n${highPrioritySemanticRules}\n` : ''}
${instruction ? `\nCRITICAL AGENT INSTRUCTION (COPILOT MODE):
The human support agent has provided a DIRECT INSTRUCTION/WHISPER for what the reply must contain.
>>> "${instruction}" <<<

RULES FOR THIS INSTRUCTION (MANDATORY):
1. COPILOT ROLE (PRIMARY): You are an assistant to the human support agent. The agent's whisper/instruction is the absolute core intent you must refine, expand, and polish. You MUST write a complete, beautiful, warm, and professional reply representing that intent. Do NOT just copy, repeat, or output the whisper command verbatim.
2. NO INDEPENDENT DIAGNOSIS: Do NOT perform any independent technical troubleshooting, and do NOT ask new technical questions, unless the agent's whisper explicitly tells you to do so. Only state and execute the agent's intent.
3. EXTREME BREVITY: Keep the draft short, warm, and direct. Combine greetings, confirmation, and the core message into a single natural paragraph without unnecessary fluff.
4. LANGUAGE COMPLIANCE & SCRIPT (CRITICAL): Always draft the response strictly in the language specified by the "CRITICAL LANGUAGE OVERRIDE" above. If the target language is Bengali, you MUST write exclusively in beautiful, proper Bengali script (বাংলা অক্ষর). Under no circumstances should you ever write or output in Banglish/Benglish (Bengali words written in English letters like "bolen", "amra"). Comply with the target language script 100%.` : ''}

## Hostnin Knowledge (use ONLY if relevant to the question)
${knowledgeContext}

${crmContext ? `## Customer CRM Profile (WHMCS Data)
- Active Services: ${crmContext.services?.length ? JSON.stringify(crmContext.services) : 'None found'}
- Invoices: ${crmContext.invoices?.length ? JSON.stringify(crmContext.invoices) : 'None found'}

CRITICAL PROACTIVE RULES FOR CRM DATA:
1. **ACTIVE SERVICE MAPPING:** If the customer is discussing a hosting, speed, or setup issue, check the 'Active Services' list. Explicitly mention their active plan name and domain (e.g. 'I see you are using our Turbo NVMe Starter plan on domain elzzone.com...') to make the reply feel custom-tailored.
2. **PROACTIVE BILLING ALERT:** Check the 'Invoices' list. If there are any unpaid or overdue invoices:
   - Do NOT mention this if the customer is reporting a critical emergency (e.g., website completely down or server crash).
   - If their technical query is answered, or if they are discussing invoices/payments, politely append a natural, friendly billing reminder at the very end of your reply.
     *Format:* 'By the way, I noticed invoice #[invoicenum] of [total] is currently outstanding. To ensure your service remains active, you can clear it here: https://my.hostnin.com/viewinvoice.php?id=[id]'
     *Language:* If replying in Bengali, translate currency figures into Bengali script (e.g., ৳১,২০০ instead of 1200 BDT) to keep it perfectly warm and conversational.` : ''}

Customer Name: ${contactName}

Conversation:
${cappedContextMessages}

${imageBlock ? `\nCRITICAL MULTIMODAL/VISION INSTRUCTION:
The customer has uploaded an image/screenshot (attached to this message). 
This image was sent exactly ${imageDistance ?? 0} messages ago in the chat history.

${(imageDistance !== null && imageDistance >= 2) ? `
IMPORTANT CONTEXT: This is a HISTORICAL image sent earlier in the conversation (not the immediate last message). 
- Do NOT start your reply by reviewing or acknowledging this image unless the customer's latest message or the agent's instructions directly ask about it.
- Focus primarily on answering the customer's LATEST text messages. Use the image ONLY as supportive reference/background context if the current discussion is still related to it.
- If the conversation has moved on to a different topic, completely ignore the image.` : `
IMPORTANT CONTEXT: This is a RECENT image that the customer just sent. 
- You MUST analyze the contents of this image carefully and prioritize addressing it in your response.
`}
- If it is a pricing table, plan comparison, or website screenshot: Answer their query based on the visible plans, features, and prices.
- If it is an error log, CPGuard notification, or cPanel screenshot: Explain the technical issue shown and how it will be resolved.
- If it is a payment receipt: Analyze the SPECIFIC image uploaded right now. Do not assume it is the same payment method used earlier in the chat. Acknowledge the exact payment method (e.g., bKash, SSLCommerz, Bank Transfer) and amount visibly shown IN THIS IMAGE. DO NOT assume or state it is a 'Bank Transfer' unless explicitly written on this new receipt.
Integrate the details from the image with the latest text messages/instructions in the conversation. DO NOT ignore the current conversation flow or the agent's instructions, but combine both context sources naturally. DO NOT invent or hallucinate tickets, bookings, or unrelated scenarios.
CRITICAL REMINDER: You MUST explain the image in ${strictLanguage === 'Bengali' ? 'BENGALI SCRIPT (বাংলা)' : 'strictly ENGLISH'} as per the language override.` : ''}

${instruction 
  ? `Draft the final reply by synthesizing the Agent Instruction with the conversation history and customer's latest message. Expand and polish the instruction's intent into a warm, natural, complete response. DO NOT ignore the historical conversation details (like pricing discussed, specific servers, or customer names) - use them to enrich the final response.` 
  : `Draft a smart, helpful reply as the support agent.`}
FINAL WARNING: You MUST write your reply in ${strictLanguage === 'Bengali' ? 'BENGALI SCRIPT (বাংলা)' : 'ENGLISH'} ONLY.`;
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

    let activeResponse: Response;
    let isDeepseek = false;
    let useClaudeBackup = false;
    let deepseekResponse;
    const deepseekKey = process.env.DEEPSEEK_API_KEY;

    if (deepseekKey) {
      try {
        if (imageBlock) {
          console.log('[AI Draft] Image block present, bypassing DeepSeek and using Claude Haiku directly.');
          useClaudeBackup = true;
        } else {
          console.log('[AI Draft] Attempting DeepSeek-V4-Pro as primary with 1.5s timeout...');
          const abortController = new AbortController();
          const timeoutId = setTimeout(() => abortController.abort(), 1500);

          try {
            deepseekResponse = await fetch("https://api.deepseek.com/chat/completions", {
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
                stream: true,
                stream_options: {
                  include_usage: true
                },
                messages: [
                  {
                    role: "system",
                    content: buildSystemPrompt()
                  },
                  {
                    role: "user",
                    content: userMessage
                  }
                ]
              })
            });

            clearTimeout(timeoutId);

            if (!deepseekResponse.ok) {
              const errText = await deepseekResponse.text();
              console.error('[AI Draft] DeepSeek API error:', deepseekResponse.status, errText);
              useClaudeBackup = true;
            }
          } catch (fetchErr: any) {
            clearTimeout(timeoutId);
            console.warn('[AI Draft] DeepSeek fetch aborted or failed:', fetchErr.message);
            useClaudeBackup = true;
          }
        }
      } catch (dsErr: any) {
        console.error('[AI Draft] DeepSeek connection exception:', dsErr.message);
        useClaudeBackup = true;
      }
    } else {
      console.log('[AI Draft] DEEPSEEK_API_KEY not found. Using Claude as primary.');
      useClaudeBackup = true;
    }

    if (!useClaudeBackup && deepseekResponse) {
      activeResponse = deepseekResponse;
      isDeepseek = true;
      console.log('[AI Draft] Streaming from DeepSeek-V3...');
    } else {
      console.log('[AI Draft] Streaming from Claude backup...');
      const backupResponse = await fetch("https://api.anthropic.com/v1/messages", {
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

      if (!backupResponse.ok) {
        const errorText = await backupResponse.text();
        console.error('[AI Draft Backup] Claude backup failed:', backupResponse.status, errorText);
        const encoder = new TextEncoder();
        const errorStream = new ReadableStream({
          start(controller) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: `AI Draft failed: Both DeepSeek and Claude returned errors.` })}\n\n`));
            controller.close();
          }
        });
        return new Response(errorStream, {
          headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" }
        });
      }

      activeResponse = backupResponse;
    }

    // Pipe the active SSE stream directly to client
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ language: strictLanguage, sources: knowledgeSources })}\n\n`));

        const reader = activeResponse.body?.getReader();
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
                try {
                  const parsed = JSON.parse(line.slice(6));
                  if (parsed.type === 'error') {
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: parsed.error?.message || 'Unknown stream error' })}\n\n`));
                  }
                } catch { }
                firstChunk = false;
              }
              if (line.startsWith("data: ") && line !== "data: [DONE]") {
                try {
                  const data = JSON.parse(line.slice(6));
                  if (isDeepseek) {
                    // Parse DeepSeek OpenAI-compatible SSE format
                    if (data.usage) {
                      inputTokens = data.usage.prompt_tokens || 0;
                      outputTokens = data.usage.completion_tokens || 0;
                    }
                    const text = data.choices?.[0]?.delta?.content;
                    if (text) {
                      const cleanText = text.replace(/—/g, ", ").replace(/--/g, ", ").replace(/\*\*/g, "*");
                      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: cleanText })}\n\n`));
                    }
                  } else {
                    // Parse Anthropic SSE format
                    if (data.type === "message_start" && data.message?.usage?.input_tokens) {
                      inputTokens = data.message.usage.input_tokens;
                    }
                    if (data.type === "message_delta" && data.usage?.output_tokens) {
                      outputTokens = data.usage.output_tokens;
                    }
                    if (data.type === "content_block_delta" && data.delta?.text) {
                      const text = data.delta.text;
                      const cleanText = text.replace(/—/g, ", ").replace(/--/g, ", ").replace(/\*\*/g, "*");
                      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: cleanText })}\n\n`));
                    }
                  }
                } catch {
                  // Incomplete JSON chunk
                }
              }
            }
          }

          // Send final usage metrics
          const totalTokens = inputTokens + outputTokens;
          if (totalTokens > 0) {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ usage: { total: totalTokens }, model: isDeepseek ? "deepseek-chat" : "claude-3-5-haiku", temperature: 0.2 })}\n\n`)
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
