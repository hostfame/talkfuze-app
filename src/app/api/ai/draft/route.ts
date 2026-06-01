export const runtime = 'edge';
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { buildKnowledgeContext, getGlobalBrain, SUB_BRAINS, getSubBrain } from "@/actions/knowledge-engine";
import OpenAI from "openai";
import { getSalesFunnelContent } from "@/data/sales-funnel";
import { getSupportTriageContent } from "@/data/support-triage";
import { banglaStyleContent } from "@/data/bangla-style";
import intentVectors from "@/actions/intent-vectors.json";

// ============================================================
// SEMANTIC ROUTING HELPERS
// ============================================================
function cosineSimilarity(vecA: number[], vecB: number[]): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// ============================================================
// LANGUAGE & INTENT CONSTANTS
// ============================================================

const BENGALI_REGEX = /[\u0985-\u09B9\u09DC-\u09DF\u09BE-\u09CC\u0981-\u0983]/;
const BANGLISH_REGEX = /\b(ami|tumi|apni|amra|amader|tomar|apnar|ki|kobe|kothay|keno|kemon|koyta|valo|bhalo|kharap|ache|achi|nai|na|ha|ji|haan|kore|korbo|korte|koro|korun|hobe|hoiche|hoy|hoite|jabe|jai|jacche|somossa|somosya|kaj|kotha|bhai|vai|bhaiya|vaiya|apu|tk|taka|din|den|daw|debo|dibo|dicchi|nibo|nibe|niben|nile|lagbe|eita|oita|ekhon|pore|kalke|ajke|eta|ota)\b/i;
const AMBIGUOUS_MSG = /^(done|ok|yes|no|send|check|update|hi|hello|please|thx|thanks|okey|yep|sure|ji|ha|hallo)$/i;

// ============================================================
// SYSTEM PROMPT BUILDER
// Personality + Dynamic situational context modules
// ============================================================

function buildSystemPrompt(hasSalesIntent: boolean, hasSupportIntent: boolean, activeSubBrain: string, lang: 'en' | 'bn' = 'bn'): string {
  // Gate Bangla style guide - only inject for Bengali conversations
  // For English conversations this removes ~400 tokens of Bengali content that biases the model
  const currentBanglaStyle = lang === 'bn' ? banglaStyleContent : '';
  const salesContent = hasSalesIntent ? getSalesFunnelContent() : "";
  // Support triage is injected when support intent is detected AND sales intent is NOT
  // This prevents both workflows from competing in the same prompt
  const supportTriageContent = (!hasSalesIntent && hasSupportIntent) ? getSupportTriageContent() : "";
  const globalBrain = getGlobalBrain();

  const langMatchingSection = `## LANGUAGE DETECTION RULES (CRITICAL)
Match the customer's language autonomously:
1. PURE ENGLISH: If the customer writes in English (e.g. "Which hosting plan is best?"), output '[Language: English]' and reply in English.
2. BENGALI SCRIPT: If the customer writes in Bengali script (e.g. "ভাইয়া কোন প্যাকেজটা ভালো হবে?"), output '[Language: Bengali]' and reply in pure Bengali script.
3. BANGLISH: If the customer writes in Banglish (Bengali words in Latin letters, e.g. "kaj korbe", "Ami new e-commerce shuru korte chai"), this IS Bengali. Output '[Language: Bengali]' and reply in pure Bengali script. Never reply in transliterated Banglish.
4. "BD" TRAP: If an English-speaking customer mentions "BD" or "Bangladesh", they are referring to a geographic location, NOT requesting Bengali language. Stay in English.`;

  // Removed hardcoded Bengali phrases from stateAwareness and zeroFiller.
  // Bengali script in the system prompt biases the model toward Bengali even for English conversations.
  const stateAwareness = `2. STATE AWARENESS: Read conversation history. NEVER repeat greetings, acknowledgments, or actions already completed. Always advance forward. If customer repeats a question already answered, reference your prior reply (e.g. "as I mentioned earlier" or the equivalent in the reply language).`;

  const zeroFiller = `4. ZERO FILLER: No "great question", "excellent", "wonderful", "very nice project". No honorifics (boss, sir, bhai, apu) in sales/pricing. Use formal "you" pronouns in Bengali.`;

  const escalationSection = `## ESCALATION
Whenever you provide ANY technical guidance, troubleshooting steps, or solutions, you MUST always append this exact sentence at the end of your reply (match the language):
- English: "If the issue is still not resolved, I will convert this chat into a support ticket so our technical team can check the details and solve it."
- Bengali: "এরপরেও যদি সমাধান না হয় তবে আমি এই চ্যাটটি একটি সাপোর্ট টিকিটে কনভার্ট করে দিচ্ছি যাতে আমাদের টেকনিক্যাল টিম বিস্তারিত চেক করে সমাধান করতে পারেন"`;

  return `## IDENTITY
You are Hostnin's support agent - a premium web hosting company in Bangladesh. You are a professional coach: calm, direct, practical. Never an excited cheerleader. You converse like a real human, never mechanical.

## OUTPUT FORMAT (MANDATORY)
You MUST begin your response with exactly one classification tag on the very first line:
'[Language: Bengali]' if replying in Bengali script.
'[Language: English]' if replying in English.
Then output a blank line, then start your actual draft response.


${langMatchingSection}

## REPLY STYLE
1. CONCISE & STRUCTURED: Keep responses under 2-3 sentences (< 45 words). If the response contains distinct parts (e.g., pricing/details followed by a question), split them with a blank line into 2 brief paragraphs. Keep simple one-sentence replies on a single line (no blank line). Never use bullet lists or bold (**). Go straight to the point with zero filler.
${stateAwareness}
3. AGENT OVERRIDE: If there is a whispered instruction (starting with "//"), expand and polish it. Match the conversation's language.
${zeroFiller}
5. LANGUAGE TRANSLATION: Technical terms are language-neutral. Translate RAG matches to the response language.

${escalationSection}

${salesContent ? `\n\n${salesContent}` : ""}
${supportTriageContent ? `\n\n${supportTriageContent}` : ""}
${currentBanglaStyle ? `\n\n${currentBanglaStyle}` : ""}

${globalBrain}

${activeSubBrain ? `\n\n${activeSubBrain}` : ""}

Output ONLY the tag and the draft message.`;
}

// ============================================================
// LEARNING DATA (Dynamic rules from Supabase)
// ============================================================

async function getLearningData(orgId: string, lang: 'en' | 'bn' = 'bn'): Promise<{ fewShotBlock: string, masterBlueprint: string }> {
  let learnedRulesBlock = "";
  let masterBlueprint = "";
  try {
    const { data: blueprintData } = await supabaseAdmin
      .from('ai_permanent_rules')
      .select('rule_text')
      .eq('org_id', orgId)
      .eq('category', 'master_blueprint')
      .eq('is_active', true)
      .single();

    if (blueprintData && blueprintData.rule_text) {
      masterBlueprint = `\n\n## MASTER STYLE BLUEPRINT (CRITICAL)\nFollow these universal tone and style constraints strictly:\n${blueprintData.rule_text}`;
    }
  } catch (err: any) {
    console.warn('[getLearningData] Failed to fetch master blueprint:', err.message);
  }

  const goldenBengali = [
    "আপনার ইস্যুটি আমি বিস্তারিত চেক করছি। একটু সময় দিবেন।",
    "আমাদের টিম বিস্তারিত চেক করে আপনাকে ইমেইলে আপডেট জানাবেন।",
    "জি, আমাদের এডভান্সড হোস্টিং প্যাকেজের মূল্য ৫৪৯ টাকা/মাস।\n\nপ্যাকেজটি সিলেক্ট করতে কি আমি আপনাকে সাহায্য করতে পারি?",
    "আপনার ই-কমার্স ওয়েবসাইটের কাস্টমার বা অডিয়েন্স কোন কোন দেশ থেকে আসতে পারে? শুধুমাত্র বাংলাদেশ টার্গেট করে হবে নাকি পুরোবিশ্ব?",
    "আপনার ডোমেইনটি সাকসেসফুলি কানেক্ট হয়েছে। তবে ডিএনএস প্রোপাগেট হতে সাধারণত ২৪ ঘণ্টার মত সময় লাগতে পারে।"
  ];
  
  const goldenEnglish = [
    "I am looking into this details for you. Please give me a moment.",
    "Our technical team will investigate and follow up with you via email shortly.",
    "Yes, our Advanced hosting plan is ৳549/month.\n\nWould you like me to help you choose a package?",
    "Where is your target audience located? Are you targeting Bangladesh only, or is it global?",
    "Your domain has been successfully connected. Please note it can take up to 24 hours for DNS propagation."
  ];

  // Try to get dynamic approved examples (real drafts agents approved without editing)
  let dynamicExamplesBengali: string[] = [];
  let dynamicExamplesEnglish: string[] = [];
  try {
    const { getApprovedExamples } = await import("@/actions/ai-learning");
    const approved = await getApprovedExamples(orgId);
    dynamicExamplesBengali = approved.bengali;
    dynamicExamplesEnglish = approved.english;
  } catch (e) {
    // Silently fall back to static examples
  }

  const examplesBengali = dynamicExamplesBengali.length >= 3 
    ? dynamicExamplesBengali 
    : [...dynamicExamplesBengali, ...goldenBengali.slice(0, 5 - dynamicExamplesBengali.length)];

  const examplesEnglish = dynamicExamplesEnglish.length >= 3 
    ? dynamicExamplesEnglish 
    : [...dynamicExamplesEnglish, ...goldenEnglish.slice(0, 5 - dynamicExamplesEnglish.length)];

  // Only inject examples for the detected language.
  // Sending both English and Bengali examples in the same prompt creates ambiguity -
  // the model sees Bengali examples and may choose to output Bengali even for English conversations.
  const fewShotBlock = lang === 'en'
    ? `<english_examples>\nRECENT APPROVED ENGLISH REPLIES (Mimic this tone and brevity):\n${examplesEnglish.join('\n---\n')}\n</english_examples>`
    : `<bengali_examples>\nRECENT APPROVED BENGALI REPLIES (Mimic this tone and brevity):\n${examplesBengali.join('\n---\n')}\n</bengali_examples>`;
  return { fewShotBlock, masterBlueprint };
}

// ============================================================
// MAIN ROUTE
// ============================================================

export async function POST(req: Request) {
  try {
    const { contextMessages, contactName, orgId, instruction, isTranslation, imageUrl, imageDistance, crmContext } = await req.json();
    
    if (crmContext && crmContext.services && Array.isArray(crmContext.services)) {
      const SERVER_NS_MAP: Record<string, string> = {
        "Titan": "draco.balancedserver.com, luna.balancedserver.com",
        "Nebula": "nova.balancedserver.com, zara.balancedserver.com",
        "Advance": "aster.balancedserver.com, hazel.balancedserver.com",
        "Apollo": "apone.balancedserver.com, aptwo.balancedserver.com",
        "Aurora": "orion.balancedserver.com, vega.balancedserver.com",
        "Velocity": "echo.balancedserver.com, pulse.balancedserver.com",
        "Ignite": "orbit.balancedserver.com, lumen.balancedserver.com",
        "Rise": "risealpha.balancedserver.com, risebeta.balancedserver.com",
        "Flux": "fluxone.balancedserver.com, fluxtwo.balancedserver.com",
        "Spark": "sparkone.balancedserver.com, sparktwo.balancedserver.com",
        "Secure": "mushi.balancedserver.com, enaya.balancedserver.com",
        "Cloud": "ns1.stackdns.com, ns2.stackdns.com, ns3.stackdns.com, ns4.stackdns.com"
      };

      crmContext.services = crmContext.services.map((s: any) => {
        if (s.servername && SERVER_NS_MAP[s.servername.trim()]) {
          return { ...s, nameservers: SERVER_NS_MAP[s.servername.trim()] };
        }
        return s;
      });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;

    if (!apiKey) {
      return NextResponse.json({ error: "Missing API key" }, { status: 500 });
    }

    // Fetch and encode image if present - wrapped in a Promise to run in PARALLEL
    // OPTIMIZATION: If the agent provided an instruction (Copilot Assisted), they have already seen the image. 
    // We skip image processing to save latency and allow the ultra-fast DeepSeek text model to handle it.
    const imagePromise = (async () => {
      if (!imageUrl || isTranslation || instruction) return null;
      try {
        const imgRes = await fetch(imageUrl);
        if (imgRes.ok) {
          const buffer = await imgRes.arrayBuffer();
          const bufferNode = Buffer.from(buffer);
          
          let mediaType = "image/jpeg";
          
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

    // Robust parsing of context messages
    let currentSender = 'System';
    const parsedMessages: { sender: string; content: string }[] = [];
    
    for (const line of contextMessages.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const match = trimmed.match(/^\[([^\]]+)\]:\s*(.*)$/);
      if (match) {
        currentSender = match[1];
        if (currentSender === 'System') currentSender = 'System Auto-Reply';
        parsedMessages.push({ sender: currentSender, content: match[2] });
      } else if (parsedMessages.length > 0) {
        parsedMessages[parsedMessages.length - 1].content += '\n' + trimmed;
      }
    }
    
    const customerMessages = parsedMessages.filter(m => m.sender !== 'Agent' && m.sender !== 'System Auto-Reply');
    
    // Extract all consecutive customer messages at the end
    const latestCustomerMessages: string[] = [];
    for (let i = parsedMessages.length - 1; i >= 0; i--) {
      const m = parsedMessages[i];
      if (m.sender === 'Agent' || m.sender === 'System Auto-Reply') break;
      latestCustomerMessages.unshift(m.content);
    }
    if (latestCustomerMessages.length === 0 && customerMessages.length > 0) {
      latestCustomerMessages.push(customerMessages[customerMessages.length - 1].content);
    }
    const latestCustomerMessageCleaned = latestCustomerMessages.join('\n');

    // Detect sales/pricing intent in conversation context
    const salesKeywords = /price|cost|buy|order|plan|package|hosting|domain|payment|renew|taka|bdt|charge|discount|coupon|offer|টাকা|দাম|প্যাকেজ|হোস্টিং|কিনি|কিনতে|সার্ভার|রিনিউ/i;
    const hasSalesIntent = salesKeywords.test(latestCustomerMessageCleaned) || 
                          parsedMessages.some(m => salesKeywords.test(m.content));

    // Detect support/technical intent - triggers support triage workflow
    const supportKeywords = /error|down|slow|not working|problem|issue|broken|fix|help|ssl|dns|nameserver|cpanel|email|wordpress|wp|backup|migrate|transfer|login|password|reset|ticket|check|দেখেন|সমস্যা|কাজ করছে না|ডাউন|স্লো|এরর|লগইন|পাসওয়ার্ড|চেক|নেমসার্ভার|ইমেইল|সিপ্যানেল|ব্যাকআপ|মাইগ্রেশন/i;
    const hasSupportIntent = supportKeywords.test(latestCustomerMessageCleaned) ||
                            parsedMessages.slice(-5).some(m => supportKeywords.test(m.content));

    // Detect active conversation state to guide LLM attention
    let activeStateInstruction = "";
    const lastMsg = parsedMessages[parsedMessages.length - 1];
    
    const hasAgentRepliedBefore = parsedMessages.some(m => m.sender === 'Agent');
    
    if (instruction) {
      activeStateInstruction = `[ACTIVE STATE]: The agent has provided a direct instruction for the reply. Do NOT add any conversational fluff, greetings (like As-salamu alaykum/Hello), or filler words. Output exactly what the agent instructed, expanded professionally.`;
    } else if (lastMsg && lastMsg.sender === 'Agent') {
      activeStateInstruction = `[ACTIVE STATE]: The customer's latest message has ALREADY been responded to/addressed by a human Agent. The last message in the thread is an Agent message. Do NOT repeat greetings or answers the Agent has already sent. Focus strictly on generating a continuation.`;
    } else if (hasAgentRepliedBefore) {
      activeStateInstruction = `[ACTIVE STATE]: The customer is waiting for a human reply in an ONGOING conversation. Do NOT use introductory greetings (like Hello or As-salamu alaykum) because the conversation is already in progress. Just answer the query directly.`;
    } else {
      activeStateInstruction = `[ACTIVE STATE]: The customer is waiting for a human reply. Note: Any [System Auto-Reply] messages in the history are automated bot notices; they do NOT resolve the customer's query. You must politely greet and answer the customer's actual questions.`;
    }

    // Server-side language detection: check latest customer messages for Bengali/Banglish
    // This is the source of truth - not the LLM's guess from a prompt full of Bengali text.
    let detectedLanguage: 'en' | 'bn' = 'en';
    const last3CustomerMessages = customerMessages.slice(-3).map(m => m.content).join(' ');
    
    if (BENGALI_REGEX.test(last3CustomerMessages)) {
      // 1. Bengali script detected anywhere in last 3 messages -> Bengali
      detectedLanguage = 'bn';
    } else if (BANGLISH_REGEX.test(latestCustomerMessageCleaned)) {
      // 2. Banglish word detected in the latest message -> Bengali
      detectedLanguage = 'bn';
    } else if (latestCustomerMessageCleaned.length <= 15) {
      // 3. Ambiguous short message -> check last 3 customer messages for Banglish too
      if (BANGLISH_REGEX.test(last3CustomerMessages)) {
        detectedLanguage = 'bn';
      } else {
        detectedLanguage = 'bn'; // Default to 'bn' as safe fallback for local customers
      }
    }

    const conversationLines = contextMessages.split('\n').map((l: string) => l.trim()).filter(Boolean);
    const cappedContextMessages = conversationLines.slice(-20).join('\n');



    // Build dynamic knowledge context
    let { context: knowledgeContext, sources: knowledgeSources } = buildKnowledgeContext(cappedContextMessages);
    let matchedRuleIds: string[] = [];

    let highPrioritySemanticRules = "";

    // Vector DB RAG Search + Learning Data - run in PARALLEL
    const vectorSearchPromise = (async () => {
      try {
        if (!process.env.OPENAI_API_KEY) return;
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        const cleanLatest = latestCustomerMessageCleaned.toLowerCase();
        const hasDiagnosticOrSalesIntent = /error|down|ssl|dns|ip|fail|not working|price|cost|buy|order|how|what|where|why|plan|package|hosting|domain/i.test(cleanLatest);
        const isUrl = /(https?:\/\/[^\s]+)|([a-z0-9-]+\.[a-z]{2,})/i.test(cleanLatest);
        if (cleanLatest.length < 20 && !hasDiagnosticOrSalesIntent && !isUrl) return;

        // Formulate search intent: Use the latest customer message.
        // Only prepend context if the message is ambiguous or extremely short.
        let searchIntent = latestCustomerMessageCleaned;
        const isAmbiguous = AMBIGUOUS_MSG.test(searchIntent.trim()) || searchIntent.trim().length < 10;
        if (isAmbiguous) {
          const agentMessages = parsedMessages.filter(m => m.sender === 'Agent');
          if (agentMessages.length > 0) {
            searchIntent = `Agent: ${agentMessages[agentMessages.length - 1].content}\nCustomer: ${searchIntent}`;
          }
        }
        const lastQuery = searchIntent;

        if (lastQuery.length > 10) {
          const embeddingRes = await openai.embeddings.create({
            model: 'text-embedding-3-small',
            input: lastQuery.substring(0, 1500),
            dimensions: 1536
          });
          const query_embedding = embeddingRes.data[0].embedding;
          
          let activeSubBrain = "";
          let bestScore = -1;
          const intentMap: Record<string, string> = { technical: 'tech', sales: 'sales', billing: 'billing' };
          
          for (const [intent, vector] of Object.entries(intentVectors)) {
            const score = cosineSimilarity(query_embedding, vector as number[]);
            if (score > bestScore && score >= 0.25) {
              bestScore = score;
              activeSubBrain = getSubBrain(intentMap[intent]);
            }
          }
          
          const { data: vectorDocs } = await supabaseAdmin.rpc('match_knowledge', {
            query_embedding,
            match_threshold: 0.40,
            match_count: 6
          });
          
          if (vectorDocs && vectorDocs.length > 0) {
            const cleanVectorDocs = [];
            const goldenExamples: { question: string; reply: string }[] = [];
            
            matchedRuleIds = vectorDocs.map((d: any) => d.id);
            
            for (const d of vectorDocs) {
              const isLearnedRule = d.answer.includes('[CRITICAL RULE]') || d.answer.includes('[STYLE CORRECTION]');
              if (isLearnedRule) {
                // Use compact rule_short if available, otherwise fall back to parsing the full answer
                const shortRule = d.rule_short && d.rule_short.length > 10 ? d.rule_short : null;
                const verifiedReply = d.verified_reply_text || null;

                if (shortRule) {
                  // Compact format: just the actionable instruction (~30 words vs ~640 tokens)
                  highPrioritySemanticRules += `\n- ${shortRule}`;
                } else {
                  // Fallback: parse the critical rule line from the full answer
                  const critMatch = d.answer.match(/\[CRITICAL RULE\]:\s*(.+?)(?:\n|$)/);
                  if (critMatch) highPrioritySemanticRules += `\n- ${critMatch[1].trim()}`;
                }

                // Collect verified agent replies as golden examples (max 2)
                if (verifiedReply && verifiedReply.length > 15 && goldenExamples.length < 2) {
                  goldenExamples.push({ question: d.question, reply: verifiedReply });
                }
              } else {
                cleanVectorDocs.push(d);
              }
            }

            // Inject golden examples as few-shot demonstrations
            if (goldenExamples.length > 0) {
              knowledgeContext += '\n\n## How Our Agents Reply (Follow This Style)\n';
              knowledgeContext += goldenExamples.map(ex => `Customer: ${ex.question}\nAgent: ${ex.reply}`).join('\n\n');
              goldenExamples.forEach(() => knowledgeSources.push('Golden Example'));
            }

            if (cleanVectorDocs.length > 0) {
              knowledgeContext += '\n\n## Knowledge Base & Reference Answers\n';
              knowledgeContext += 'Personalize to match the customer\'s exact situation.\n\n';
              knowledgeContext += cleanVectorDocs.map((d: any) => `Q: ${d.question}\nA: ${d.answer}`).join('\n\n---\n\n');
              cleanVectorDocs.forEach(() => knowledgeSources.push('Vector Match'));
            }
          }
          console.log('[Semantic Router] Active Sub-Brain:', activeSubBrain ? activeSubBrain.substring(0, 50) + '...' : 'None');
          return { activeSubBrain };
        }
      } catch (e) {
        console.error('Vector DB search failed:', e);
      }
      return { activeSubBrain: "" };
    })();

    const learningPromise = (orgId && !isTranslation)
      ? getLearningData(orgId, detectedLanguage)
      : Promise.resolve({ fewShotBlock: '', masterBlueprint: '' });

    const orgSettingsPromise = supabaseAdmin.from('organizations').select('settings').eq('id', orgId).single();

    const [imageBlock, vectorSearchRes, { fewShotBlock: rawFewShotBlock, masterBlueprint }, { data: orgData }] = await Promise.all([imagePromise, vectorSearchPromise, learningPromise, orgSettingsPromise]);
    const activeSubBrain = vectorSearchRes?.activeSubBrain || "";

    const fewShotBlock = rawFewShotBlock;

    const holidaySettings = orgData?.settings || {};
    const isHolidayMode = !!holidaySettings.holiday_mode_enabled;
    const holidayMessage = holidaySettings.holiday_mode_message || "Support is currently limited due to holiday. Expect delayed responses.";

    // Build user message
    let userMessage = '';
    
    if (isTranslation) {
      userMessage = `You are a highly accurate translation API. Your only job is to translate the provided text exactly as instructed, without adding any conversational filler, quotes, or support agent persona.
      
Instruction: ${instruction}

Output ONLY the translation in raw plain text.`;
    } else {
      userMessage = `${activeStateInstruction ? `${activeStateInstruction}\n\n` : ''}${isHolidayMode ? `[HOLIDAY/VACATION MODE ACTIVE]: ${holidayMessage}\nIMPORTANT: Keep this constraint in mind. If the customer asks for immediate remote support (like AnyDesk) or complains about delays, politely mention this limitation in your response.\n\n` : ''}The customer's latest message(s): "${latestCustomerMessageCleaned}"

## CONVERSATIONAL CONTINUITY (MANDATORY):
If the customer's latest message is short or vague ("send", "share", "details", or just a link), synthesize intent from the preceding Agent message. Carry over context variables, BUT NEVER simply repeat the Agent's previous question. Acknowledge the new information and move the conversation forward.

${masterBlueprint}

${fewShotBlock}
${highPrioritySemanticRules ? `\nSITUATIONAL RULES MATCHED:\n${highPrioritySemanticRules}\n` : ''}
${instruction ? `\nAGENT INSTRUCTION (COPILOT MODE):
The human agent has provided a shorthand directive: >>> "${instruction}" <<<

## DIRECTIVE LANGUAGE ROUTING (CRITICAL):
Assess the language of this Agent Instruction:
1. If the instruction is written in English (e.g., "tell them we are checking", "explain cPanel limit"), draft the response in ENGLISH.
2. If the instruction is written in Bengali script or Banglish (Bengali words in Latin letters, e.g., "bhalo kore check koro" or "wait korte bolo" or "dukhito wait koren"), draft the response in BENGALI SCRIPT.
3. If the instruction is a short ambiguous command (e.g., "ok", "done", "yes"), draft the response in the language the customer used.

You MUST output the corresponding tag ('[Language: Bengali]' or '[Language: English]') on the very first line of your response.

Your goal is to expand the directive into a complete, polite, and professional reply.
- OBEY the agent's core intent.
- USE CONTEXT: Look at the customer's CRM profile (WHMCS data) and conversation history to enrich the reply with specific details (e.g., invoice numbers, amounts, dates, or plan names) that are relevant to the directive.
- DO NOT COPY verbatim. Polish it into natural language.` : ''}

## Hostnin Knowledge (use ONLY if relevant)
${knowledgeContext}

${crmContext ? `## Customer CRM Profile (WHMCS Data)
- Active Services: ${crmContext.services?.length ? JSON.stringify(crmContext.services) : 'None found'}
- Invoices: ${crmContext.invoices?.length ? JSON.stringify(crmContext.invoices) : 'None found'}

${instruction ? 'NOTE: Use this CRM profile to find facts (invoices, services, status) that support the Agent\'s shorthand instruction.' : 'If customer has unpaid invoices and is NOT reporting an emergency, politely mention it at the end.'}` : ''}

Customer Name: ${contactName}

Conversation:
${cappedContextMessages}

## FINAL CHECK:
- Never mention Shopify.
- If the customer's intent and scale are clear, recommend confidently. If not, ask ONE smart question.
- Always end with a clear next step the customer can act on.
- PARAGRAPH BREAKING: If your reply contains multiple sentences or distinct ideas (such as pricing details AND a follow-up question), you MUST split them into exactly two paragraphs using a double line break (\n\n). Never output a single dense paragraph for a multi-part message.


${imageBlock ? `\nIMAGE ATTACHED: The customer sent an image ${imageDistance ?? 0} messages ago.
${(imageDistance !== null && imageDistance >= 2) ? 'This is a HISTORICAL image. Only reference if current discussion relates to it.' : 'This is a RECENT image. Analyze and address it.'}
Explain the image in the conversation\'s language.` : ''}

${instruction 
  ? `Draft by synthesizing the Agent Instruction with conversation history.` 
  : `Draft a smart, helpful reply as the support agent.`}

${detectedLanguage === 'en' && !instruction ? `Reply language: English. The customer's message is in English - output '[Language: English]' and reply in English only.` : ''}${detectedLanguage === 'bn' && !instruction ? `Reply language: Bengali. The customer's message is in Bengali or Banglish - output '[Language: Bengali]' and reply in Bengali script only.` : ''}`;
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
          console.log('[AI Draft] Attempting DeepSeek-V4-Pro as primary with 800ms timeout...');
          const abortController = new AbortController();
          const timeoutId = setTimeout(() => abortController.abort(), 800);

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
                    content: buildSystemPrompt(hasSalesIntent, hasSupportIntent, activeSubBrain, detectedLanguage)
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

    let firstDeepSeekChunk: any = null;
    let deepSeekReader: any = null;

    if (!useClaudeBackup && deepseekResponse && deepseekResponse.body) {
      console.log('[AI Draft] DeepSeek connected. Waiting for first token (5s timeout)...');
      deepSeekReader = deepseekResponse.body.getReader();
      
      try {
        const peekPromise = deepSeekReader.read();
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("DeepSeek first chunk timeout")), 5000));
        
        firstDeepSeekChunk = await Promise.race([peekPromise, timeoutPromise]);
        console.log('[AI Draft] DeepSeek first token received. Proceeding with stream.');
      } catch (e: any) {
        console.warn('[AI Draft] DeepSeek first token timeout or read error:', e.message);
        deepSeekReader.cancel();
        useClaudeBackup = true;
      }
    }

    if (!useClaudeBackup && deepseekResponse) {
      // Re-create the stream to include the peeked first chunk
      const newStream = new ReadableStream({
        start(controller) {
          if (firstDeepSeekChunk && firstDeepSeekChunk.value) {
            controller.enqueue(firstDeepSeekChunk.value);
          }
        },
        async pull(controller) {
          if (!deepSeekReader) return controller.close();
          const { done, value } = await deepSeekReader.read();
          if (done) {
            controller.close();
          } else {
            controller.enqueue(value);
          }
        },
        cancel() {
          if (deepSeekReader) deepSeekReader.cancel();
        }
      });
      
      activeResponse = new Response(newStream, {
        headers: deepseekResponse.headers,
        status: deepseekResponse.status
      });
      isDeepseek = true;
      console.log('[AI Draft] Streaming from DeepSeek-V3...');
    } else {
      console.log('[AI Draft] Streaming from OpenAI backup...');
      const openAiKey = process.env.OPENAI_API_KEY;
      const backupResponse = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${openAiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          max_tokens: 600,
          temperature: 0.2,
          stream: true,
          stream_options: { include_usage: true },
          messages: [
            {
              role: "system",
              content: buildSystemPrompt(hasSalesIntent, hasSupportIntent, activeSubBrain, detectedLanguage)
            },
            {
              role: "user",
              content: imageBlock 
                ? [
                    {
                      type: "text",
                      text: userMessage
                    },
                    {
                      type: "image_url",
                      image_url: {
                        url: `data:${imageBlock.mediaType};base64,${imageBlock.base64Data}`
                      }
                    }
                  ]
                : userMessage
            }
          ]
        })
      });

      if (!backupResponse.ok) {
        const errorText = await backupResponse.text();
        console.error('[AI Draft Backup] OpenAI backup failed:', backupResponse.status, errorText);
        const encoder = new TextEncoder();
        const errorStream = new ReadableStream({
          start(controller) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: `AI Draft failed: Both primary and backup AI returned errors.` })}\n\n`));
            controller.close();
          }
        });
        return new Response(errorStream, {
          headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" }
        });
      }

      activeResponse = backupResponse;
      isDeepseek = true; // Use DeepSeek parser since OpenAI SSE format is identical
    }

    // Pipe the active SSE stream directly to client
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const reader = activeResponse.body?.getReader();
        const decoder = new TextDecoder("utf-8");
        if (!reader) { controller.close(); return; }

        let buffer = '';
        let inputTokens = 0;
        let outputTokens = 0;

        let responseBuffer = '';
        let languageSent = false;
        let finalDetectedLang = 'en';
        let hasStartedEmittingText = false;

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
                  let text = '';
                  if (isDeepseek) {
                    // Parse DeepSeek OpenAI-compatible SSE format
                    if (data.usage) {
                      inputTokens = data.usage.prompt_tokens || 0;
                      outputTokens = data.usage.completion_tokens || 0;
                    }
                    text = data.choices?.[0]?.delta?.content || '';
                  } else {
                    // Parse Anthropic SSE format
                    if (data.type === "message_start" && data.message?.usage?.input_tokens) {
                      inputTokens = data.message.usage.input_tokens;
                    }
                    if (data.type === "message_delta" && data.usage?.output_tokens) {
                      outputTokens = data.usage.output_tokens;
                    }
                    if (data.type === "content_block_delta" && data.delta?.text) {
                      text = data.delta.text;
                    }
                  }

                  if (text) {
                    if (!languageSent) {
                      responseBuffer += text;
                      const tagMatch = responseBuffer.match(/\[Language:\s*(Bengali|English|bn|en)\]/i);
                      if (tagMatch) {
                        const matchedTag = tagMatch[1].toLowerCase();
                        finalDetectedLang = (matchedTag === 'bengali' || matchedTag === 'bn') ? 'bn' : 'en';
                        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ language: finalDetectedLang, sources: knowledgeSources })}\n\n`));
                        languageSent = true;
                        
                        const tagIndex = responseBuffer.indexOf(tagMatch[0]);
                        let remainingText = responseBuffer.substring(tagIndex + tagMatch[0].length);
                        remainingText = remainingText.replace(/^\s+/, '');
                        if (remainingText) {
                          hasStartedEmittingText = true;
                          const cleanText = remainingText.replace(/—/g, ", ").replace(/--/g, ", ").replace(/\*\*/g, "*");
                          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: cleanText })}\n\n`));
                        }
                      } else if (responseBuffer.length > 80) {
                        finalDetectedLang = BENGALI_REGEX.test(responseBuffer) ? 'bn' : 'en';
                        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ language: finalDetectedLang, sources: knowledgeSources })}\n\n`));
                        languageSent = true;
                        
                        let cleanText = responseBuffer.replace(/^\s+/, '');
                        if (cleanText) {
                          hasStartedEmittingText = true;
                          cleanText = cleanText.replace(/—/g, ", ").replace(/--/g, ", ").replace(/\*\*/g, "*");
                          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: cleanText })}\n\n`));
                        }
                      }
                    } else {
                      let cleanText = text.replace(/—/g, ", ").replace(/--/g, ", ").replace(/\*\*/g, "*");
                      
                      if (!hasStartedEmittingText) {
                        cleanText = cleanText.replace(/^\s+/, '');
                        if (cleanText) {
                          hasStartedEmittingText = true;
                        }
                      }

                      if (cleanText || hasStartedEmittingText) {
                        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: cleanText })}\n\n`));
                      }
                    }
                  }
                } catch {
                  // Incomplete JSON chunk
                }
              }
            }
          }

          if (!languageSent) {
            finalDetectedLang = BENGALI_REGEX.test(responseBuffer) ? 'bn' : 'en';
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ language: finalDetectedLang, sources: knowledgeSources, matched_rule_ids: matchedRuleIds })}\n\n`));
            if (responseBuffer) {
              const cleanText = responseBuffer.replace(/—/g, ", ").replace(/--/g, ", ").replace(/\*\*/g, "*");
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: cleanText })}\n\n`));
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
