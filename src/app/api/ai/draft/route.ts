import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { buildKnowledgeContext } from "@/actions/knowledge-engine";
import OpenAI from "openai";
// ============================================================
// LANGUAGE DETECTION
// Follows the LATEST customer message language. If customer
// switches language mid-conversation, AI follows the switch.
// ============================================================

const BENGALI_REGEX = /[\u0985-\u09B9\u09DC-\u09DF\u09BE-\u09CC\u0981-\u0983]/;
const AMBIGUOUS_MSG = /^(ok|okay|yes|no|ji|jee|ha|na|thanks|thank you|thanku|dhonnobad|hi|hello|hey|hlo|hmm|hmmm|send|H|done|sure)$/i;

function detectConversationLanguage(messages: { sender: string; content: string }[]): 'Bengali' | 'English' {
  // 1. Find the latest SUBSTANTIVE customer message (skip short ambiguous ones)
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.sender === 'Agent' || m.sender === 'System') continue;
    const clean = m.content.trim();
    if (AMBIGUOUS_MSG.test(clean)) continue;
    // Skip URLs, links, file names - they're language-neutral
    if (/^(https?:\/\/|www\.)\S+$/i.test(clean)) continue;
    // Skip image/audio attachments
    if (/^\[?(image|audio|video|file|attachment)/i.test(clean)) continue;
    // Bengali script found = definitive Bengali
    if (BENGALI_REGEX.test(clean)) return 'Bengali';
    // Only treat as definitive English if 15+ chars (short msgs like "cpu core?" could be in either language)
    if (clean.length >= 15) return 'English';
  }
  
  // 2. All customer messages were ambiguous - follow the last Agent message
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].sender === 'Agent') {
      return BENGALI_REGEX.test(messages[i].content) ? 'Bengali' : 'English';
    }
  }
  
  return 'English';
}

// ============================================================
// STATIC SYSTEM PROMPT (Lean Core - ~2000 tokens)
// Personality + guardrails + Bengali vocab. Situational rules via RAG.
// ============================================================

function buildSystemPrompt(language: 'Bengali' | 'English'): string {
  const complianceDirective = language === 'English'
    ? "CRITICAL LANGUAGE COMPLIANCE: The customer is communicating in English. You MUST draft your response STRICTLY in professional, concise English. If any retrieved RAG details or pricing context are in Bengali, you MUST translate them to English (e.g. convert '১৬৫০ টাকা' to '1650 TK' or '1,650 BDT'). Output absolutely ZERO Bengali script."
    : "CRITICAL LANGUAGE COMPLIANCE: The customer is communicating in Bengali or Banglish. You MUST draft your response STRICTLY in pure Bengali script (বাংলা ফন্ট). Output absolutely ZERO transliterated Banglish letters.";

  return `${complianceDirective}

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
- CRITICAL 4-QUESTION DIAGNOSTIC RULE: You MUST retrieve exactly 4 key pieces of information from the customer before you are allowed to recommend any plan:
  1. Platform / CMS (WordPress, custom Laravel, Node.js, raw HTML)
  2. Traffic scale / Target concurrent visitors
  3. Heavy requirements (any complex theme, large database, e-commerce dynamic cart, or custom mailboxes)
  4. Budget limits or launch timeline.
  If the customer has not explicitly provided all 4 details in the chat history, you MUST ask ONE diagnostic question targeting a missing detail. NEVER pitch, suggest, or recommend any specific plan (e.g. Web Hosting Pro, Turbo Starter, Turbo Pro) until all 4 details are known. Even if the customer directly asks "Which plan is best?" or "Budget friendly konta hobe?", you MUST reply by saying you want to check their requirements first, and ask one of the missing details.
- SHOPIFY IS IRRELEVANT: Shopify is a fully self-hosted platform. People using Shopify do NOT need our web hosting services. Shopify users are NOT our customers and they are NOT in our target segment. Therefore, NEVER ask or mention if the customer is using Shopify. Instead, only suggest relevant hosting platform options: WordPress, WooCommerce, custom PHP/Laravel, Node.js/React, or raw HTML.
- BDIX TARGET AUDIENCE: If the customer specifically asks about BDIX server/connectivity (e.g. "আপনাদের কি বিডিআইএক্স সার্ভার আছে?"), we already know their target audience is in Bangladesh. DO NOT ask where their target traffic/audience is from. Instead, immediately ask other diagnostic questions, such as what platform/framework they are using (WordPress, Laravel, Node.js, etc.) or their resource/performance needs.

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

Output ONLY the draft message. No quotes, no prefix, no labels.`;
}

// ============================================================
// LEARNING DATA (Dynamic rules from Supabase)
// ============================================================

async function getLearningData(orgId: string, language: 'Bengali' | 'English'): Promise<{ fewShotBlock: string }> {
  let learnedRulesBlock = "";
  try {
    const { data: dbRules } = await supabaseAdmin
      .from('ai_knowledge_base')
      .select('question, answer')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(5);

    if (dbRules && dbRules.length > 0) {
      learnedRulesBlock = `\n\nDYNAMIC STYLE RULES LEARNED FROM AGENT EDITS (CRITICAL: Prioritize these adjustments):\n` +
        dbRules.map((rule, idx) => `[Rule ${idx + 1}] Context/Mistake: ${rule.question}\nCorrection/Instruction: ${rule.answer}`).join('\n---\n');
    }
  } catch (err: any) {
    console.warn('[getLearningData] Failed to fetch dynamic rules:', err.message);
  }
  
  const goldenExamples = language === 'Bengali'
    ? [
        "আপনার ইস্যুটি আমি বিস্তারিত চেক করছি। একটু সময় দিবেন।",
        "আমাদের টিম বিস্তারিত চেক করে আপনাকে ইমেইলে আপডেট জানাবেন।",
        "কি ধরনের ওয়েবসাইটের জন্য হোষ্টিং নিতে চাচ্ছেন? আপনার ওয়েবসাইট বা প্রজেক্টের ব্যাপারে জানাতে পারেন যাতে আমি আপনার প্রয়োজন অনুযায়ী বেস্ট প্যাকেজটি সাজেস্ট করতে পারি।",
        "আপনার ই-কমার্স ওয়েবসাইটের ভিজিটর কোন কোন দেশ থেকে আসতে পারে? শুধুমাত্র বাংলাদেশ টার্গেট করে হবে নাকি পুরোবিশ্ব?",
        "আপনার ডোমেইনটি সাকসেসফুলি কানেক্ট হয়েছে। তবে ডিএনএস প্রোপাগেট হতে সাধারণত ২৪ ঘণ্টার মত সময় লাগতে পারে।"
      ]
    : [
        "I am looking into this details for you. Please give me a moment.",
        "Our technical team will investigate and follow up with you via email shortly.",
        "What kind of website are you building? Please share your platform or project details so I can recommend the best plan for you.",
        "Where is your target audience or visitors located? Are you targeting Bangladesh only, or is it global?",
        "Your domain has been successfully connected. Please note it can take up to 24 hours for DNS propagation."
      ];
  
  const fewShotBlock = `\n\nGOLDEN REPLY EXAMPLES (Mimic this tone and brevity):\n${goldenExamples.join('\n---\n')}${learnedRulesBlock}`;
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
        parsedMessages.push({ sender: currentSender, content: match[2] });
      } else if (parsedMessages.length > 0) {
        parsedMessages[parsedMessages.length - 1].content += '\n' + trimmed;
      }
    }
    
    const customerMessages = parsedMessages.filter(m => m.sender !== 'Agent' && m.sender !== 'System');
    
    // Extract all consecutive customer messages at the end
    const latestCustomerMessages: string[] = [];
    for (let i = parsedMessages.length - 1; i >= 0; i--) {
      const m = parsedMessages[i];
      if (m.sender === 'Agent' || m.sender === 'System') break;
      latestCustomerMessages.unshift(m.content);
    }
    if (latestCustomerMessages.length === 0 && customerMessages.length > 0) {
      latestCustomerMessages.push(customerMessages[customerMessages.length - 1].content);
    }
    const latestCustomerMessageCleaned = latestCustomerMessages.join('\n');

    // Language detection: TWO modes
    // Auto-draft (no instruction): follow customer's latest message language
    // AI Assist (instruction present): follow AGENT's instruction language (agent controls)
    let detectedLanguage: 'Bengali' | 'English';
    
    if (instruction && instruction.replace(/^\/\/\s*/, '').trim().length > 0) {
      const cleanInstruction = instruction.replace(/^\/\/\s*/, '').trim();
      // Check if instruction has Bengali script → Bengali
      if (BENGALI_REGEX.test(cleanInstruction)) {
        detectedLanguage = 'Bengali';
      } else if (AMBIGUOUS_MSG.test(cleanInstruction) || cleanInstruction.length < 15) {
        // Short/ambiguous instruction ("done", "ok", "send ticket") → follow conversation
        detectedLanguage = detectConversationLanguage(parsedMessages);
      } else {
        // Long English instruction (15+ chars) → agent wants English
        detectedLanguage = 'English';
      }
    } else {
      // Auto-draft: follow customer's latest message
      detectedLanguage = detectConversationLanguage(parsedMessages);
    }

    // Cap context to last 20 messages
    const conversationLines = contextMessages.split('\n').map((l: string) => l.trim()).filter(Boolean);
    const cappedContextMessages = conversationLines.slice(-20).join('\n');

    // Build dynamic knowledge context
    let { context: knowledgeContext, sources: knowledgeSources } = buildKnowledgeContext(cappedContextMessages);

    let highPrioritySemanticRules = "";

    // Vector DB RAG Search + Learning Data - run in PARALLEL
    const vectorSearchPromise = (async () => {
      try {
        if (!process.env.OPENAI_API_KEY) return;
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        const lines = cappedContextMessages.split('\n')
          .map((line: string) => line.trim())
          .filter((line: string) => line && !line.startsWith('[Agent]') && !line.startsWith('[System]'));
        const lastQuery = lines.slice(-3).join(' ');
        
        const cleanLatest = latestCustomerMessageCleaned.toLowerCase();
        const hasDiagnosticOrSalesIntent = /error|down|ssl|dns|ip|fail|not working|price|cost|buy|order|how|what|where|why|plan|package|hosting|domain/i.test(cleanLatest);
        if (cleanLatest.length < 25 && !hasDiagnosticOrSalesIntent) return;

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
                const critMatch = d.answer.match(/\[CRITICAL RULE\]:\s*([\s\S]*?)(?=\n\[STYLE CORRECTION\]|\n\n\[VERIFIED REPLY\]|$)/i);
                const styleMatch = d.answer.match(/\[STYLE CORRECTION\]:\s*([\s\S]*?)(?=\n\n\[VERIFIED REPLY\]|$)/i);
                const replyMatch = d.answer.match(/\[VERIFIED REPLY\]:\s*([\s\S]*?)$/i);

                const rule = critMatch ? critMatch[1].trim() : "";
                const style = styleMatch ? styleMatch[1].trim() : "";
                const reply = replyMatch ? replyMatch[1].trim() : "";

                highPrioritySemanticRules += `\n---\n[MATCHED RULE]\n- Issue: ${d.question}\n`;
                if (rule) highPrioritySemanticRules += `- Rule: ${rule}\n`;
                if (style) highPrioritySemanticRules += `- Style: ${style}\n`;
                if (reply) highPrioritySemanticRules += `- Ideal Reply: ${reply}\n`;

                if (reply) cleanVectorDocs.push({ question: d.question, answer: reply });
              } else {
                cleanVectorDocs.push(d);
              }
            }

            if (cleanVectorDocs.length > 0) {
              knowledgeContext += '\n\n## Knowledge Base & Reference Answers\n';
              knowledgeContext += 'CRITICAL: DO NOT copy answers blindly. Personalize to match the customer\'s exact situation.\n\n';
              knowledgeContext += cleanVectorDocs.map((d: any) => `Q: ${d.question}\nA: ${d.answer}`).join('\n\n---\n\n');
              cleanVectorDocs.forEach(() => knowledgeSources.push('Vector Match'));
            }
          }
        }
      } catch (e) {
        console.error('Vector DB search failed:', e);
      }
    })();

    const learningPromise = (orgId && !isTranslation)
      ? getLearningData(orgId, detectedLanguage)
      : Promise.resolve({ fewShotBlock: '' });

    const [imageBlock, , { fewShotBlock }] = await Promise.all([imagePromise, vectorSearchPromise, learningPromise]);

    // Build user message
    let userMessage = '';
    
    if (isTranslation) {
      userMessage = `You are a highly accurate translation API. Your only job is to translate the provided text exactly as instructed, without adding any conversational filler, quotes, or support agent persona.
      
Instruction: ${instruction}

Output ONLY the translation in raw plain text.`;
    } else {
      userMessage = `The customer's latest message(s): "${latestCustomerMessageCleaned}"

## CONVERSATIONAL CONTINUITY (MANDATORY):
If the customer's latest message is short or vague ("send", "share", "details"), synthesize intent from the preceding Agent message. Carry over context variables (budget, locations, domains).

${fewShotBlock}
${highPrioritySemanticRules ? `\nSITUATIONAL RULES MATCHED:\n${highPrioritySemanticRules}\n` : ''}
${instruction ? `\nAGENT INSTRUCTION (COPILOT MODE):
The human agent whispered: >>> "${instruction}" <<<
Expand and polish this into a warm, complete reply. Do NOT copy verbatim. Do NOT diagnose independently unless told to. Match the conversation's language.` : ''}

## Hostnin Knowledge (use ONLY if relevant)
${knowledgeContext}

${crmContext ? `## Customer CRM Profile (WHMCS Data)
- Active Services: ${crmContext.services?.length ? JSON.stringify(crmContext.services) : 'None found'}
- Invoices: ${crmContext.invoices?.length ? JSON.stringify(crmContext.invoices) : 'None found'}

If customer has unpaid invoices and is NOT reporting an emergency, politely mention it at the end.` : ''}

Customer Name: ${contactName}

Conversation:
${cappedContextMessages}

## FINAL COMPLIANCE CHECK (MANDATORY):
- Shopify is IRRELEVANT. You MUST never mention Shopify as an option.
- STRICT DIAGNOSTIC RULE: If ANY of the 4 details (Platform, Traffic scale, Heavy Plugins/Themes, and Budget/Launch Stage) are missing in the chat history, you are ABSOLUTELY FORBIDDEN from naming, proposing, suggesting, recommending, or even mentioning any specific Hostnin package names (e.g., "ওয়েব হোষ্টিং প্রো", "Web Hosting Pro", "টার্বো স্টার্টার", "Turbo Pro", etc.) in your response. Instead, you MUST strictly reply by asking exactly ONE high-value diagnostic question to gather the missing detail, without mentioning any plan names at all!

${imageBlock ? `\nIMAGE ATTACHED: The customer sent an image ${imageDistance ?? 0} messages ago.
${(imageDistance !== null && imageDistance >= 2) ? 'This is a HISTORICAL image. Only reference if current discussion relates to it.' : 'This is a RECENT image. Analyze and address it.'}
Explain the image in the conversation\'s language.` : ''}

${instruction 
  ? `Draft by synthesizing the Agent Instruction with conversation history.` 
  : `Draft a smart, helpful reply as the support agent.`}`;
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
                    content: buildSystemPrompt(detectedLanguage)
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
              text: buildSystemPrompt(detectedLanguage),
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
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ language: detectedLanguage, sources: knowledgeSources })}\n\n`));

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
