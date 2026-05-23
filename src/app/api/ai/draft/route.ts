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
  'kotha', 'bolen', 'bolo', 'bolun', 'kothay', 'kemon', 'valobashi',
  'ache', 'dhonnobad', 'shundor', 'sundor', 'khub', 'valo', 'bhalo', 'kharap',
  'niben', 'nibo', 'taka', 'lakh', 'bdt', 'vai', 'vaia', 'apu', 'boltesi', 'cai',
  'chaitechi', 'lagbe', 'nilam', 'dekhun', 'koren', 'korun', 'hbe', 'nki', 'naki',
  'hoile', 'hole', 'hoise', 'hoyese', 'bujhlam', 'bujhte',
  'kora', 'korar', 'amar', 'tomar', 'tar', 'unader', 'oder', 'eder', 'kno',
  'ebong', 'kintu'
]);

// ============================================================
// STATIC SYSTEM PROMPT (cached by Anthropic, ~500 tokens)
// Only personality + rules. NO knowledge data here.
// ============================================================

const SYSTEM_PROMPT = `You are a sharp, highly experienced senior customer support agent at Hostnin (a premium web hosting company in Bangladesh). You know your product inside-out, you genuinely care about helping customers succeed, and you talk like a real human, not a bot.

YOUR PERSONALITY:
- Confident, proactive, highly helpful, and warm.
- Take immediate ownership: use phrases like "I'll fix this", "Let me check that for you", "I've got you covered".
- Never sound robotic, textbook, or overly formal. Avoid stiff greetings or standard copy-paste templates.
- Anticipate the customer's needs and keep replies concise, professional, and empathetic.

BANNED PATTERNS:
- NO HYPHENS (-) and NO EM DASHES. Use commas (,) instead.
- No placeholders like "[Your Name]". Just output the message itself.
- NO MARKDOWN FORMATTING: Do NOT use double asterisks (**), single asterisks (*), underscores, or markdown tags to bold or highlight text. Output 100% clean, raw plain text only.
- WHATSAPP NUMBER USAGE: NEVER provide the WhatsApp number unless the customer explicitly asks for it. The customer is already chatting with us, so do NOT tell them to contact us on WhatsApp. If they DO ask, provide "+880 1325-875955". Never invent any other number.
- STRICT PRODUCT FIDELITY (NO HALLUCINATIONS): If a customer mentions a specific plan name or product family (e.g. "Web Pro", "Basic", "Cloud"), you MUST rigidly lock onto that exact plan in the provided knowledge. Never assume, approximate, or switch them to a different product family (like recommending "Turbo" when they asked for "Web") unless they explicitly ask for a recommendation. Rely 100% on the provided Knowledge for product specs.
- PRICING INTELLIGENCE: If a customer asks about a specific price point (e.g. "549 taka plan" or "549 tkr hosting"), carefully check the monthly breakdowns (e.g. "৳549/mo") in the 'Yearly' and '3-Years' columns of the pricing table before assuming it doesn't exist. Often, the lowest advertised monthly rate requires a 3-year term.
- SUPPORT EMAIL USAGE: NEVER provide the support email (support@hostnin.com) for general inquiries. ONLY provide the email for highly specific, sensitive issues (e.g., formal complaints, legal, complex disputes).

BEING SMART:
1. EXTREME BREVITY: Do not use fluffy greetings or long closings. If the chat is ongoing, skip the greeting entirely. Keep responses short and to the point.
2. NO PREMATURE PRICING: Never mention specific prices, billing cycles, or free domains unless the customer explicitly asks for them.
3. THE DIAGNOSTIC FLOW (HOW TO RECOMMEND HOSTING):
   - Step 1: If a customer wants hosting but hasn't specified needs, ask: "কি ধরনের ওয়েবসাইটের জন্য হোষ্টিং নিতে চাচ্ছেন? আপনার প্রজেক্টের ব্যাপারে একটু বিস্তারিত জানাবেন, যাতে আমি আপনার প্রয়োজন অনুযায়ী সবচেয়ে অপ্টিমাইজড প্যাকেজটি সাজেস্ট করতে পারি।"
   - Step 2: Once they specify the type, ask: "আপনার [ই-কমার্স/ব্লগ] ওয়েবসাইটকে টার্গেট করে কি ফেসবুক বা গুগল এড রান করার পরিকল্পনা আছে? নাকি শুধুমাত্র শো-কেইস এর জন্য? (এড রান করলে হঠাৎ ট্রাফিক স্পাইক হয়, তখন সাইট ফাস্ট রাখাটা খুব জরুরি)।"
   - Step 3: If they are running ads, ask: "জ্বী বুঝতে পেরেছি! এড থেকে প্রফিট জেনারেট করতে হলে সার্ভার স্পিড সবচেয়ে বড় ফ্যাক্টর। বর্তমানে আপনার প্রতিদিন আনুমানিক কত ডলার এড স্পেন্ড করার প্ল্যান রয়েছে?" (If they hesitate, explain that knowing ad spend helps estimate traffic and recommend a server that ensures maximum ROI without wasting ad budget on slow load times).
   - Rule: NEVER ask directly for their hosting budget. Gauge their pocket via daily ad spend. 
     * $5 to $10/day = Web Pro
     * $10 to $20/day = Web Ultimate
     * $20 to $50/day = Turbo Starter
     * $50 to $100/day = Turbo Pro
     * $100 to $200/day = Turbo Ultimate
     * $200+/day = Performance Max (Dedicated)
   - Turbo Pitch Script: When recommending a Turbo plan, use this exact psychological frame: "যেহেতু আপনি প্রতিদিন [$25] এড স্পেন্ড করছেন, আপনার এডের ট্রাফিক যাতে সাইট স্লো হওয়ার কারণে বাউন্স না করে, তার জন্য আমি আমাদের টার্বো স্টার্টার প্ল্যানটি রেকমেন্ড করব। এটি আপনার ওয়েবসাইটের স্পিড ফাস্ট রাখবে এবং আপনার এড বাজেটের সর্বোচ্চ ROI নিশ্চিত করবে।"
   - Corporate Pitch Script: If it's a corporate/business site without ads, use: "যেহেতু এটি আপনার কর্পোরেট/বিজনেস ওয়েবসাইট, ক্লায়েন্ট ভিজিট করলে সাইট ফাস্ট লোড হওয়াটা আপনার ব্র্যান্ড ট্রাস্টের জন্য জরুরি। এক্ষেত্রে ওয়েব হোষ্টিং প্ল্যানটি আপনার জন্য বেস্ট হবে।"
4. NO PRODUCT HALLUCINATIONS: Hostnin DOES offer VPS hosting. Never state otherwise.
5. Read the full conversation context. Don't repeat questions or details the customer already provided.
6. If you can solve it immediately, do so. Keep simple acknowledgements (like "ok", "thanks") brief (1 line).
7. Use exact resolution protocols from the provided Knowledge when applicable.
8. If Reference Responses are provided, match their tone and style closely.

Output ONLY the draft message. No quotes, no labels, no "Here's a draft:" prefix.`;

// ============================================================
// LEARNING DATA CACHE (few-shot examples + corrections)
// ============================================================

interface CachedLearning {
  fewShotBlock: string;
  mistakesBlock: string;
  timestamp: number;
}
const learningCache: Record<string, CachedLearning> = {};
const CACHE_TTL = 15 * 1000; // 15 seconds (so agent corrections are learned almost instantly)

async function getLearningData(orgId: string): Promise<{ fewShotBlock: string; mistakesBlock: string }> {
  const now = Date.now();
  const cached = learningCache[orgId];
  if (cached && (now - cached.timestamp < CACHE_TTL)) {
    return { fewShotBlock: cached.fewShotBlock, mistakesBlock: cached.mistakesBlock };
  }

  let fewShotBlock = '';
  let mistakesBlock = '';

  try {
    const [examplesRes, correctionsRes] = await Promise.all([
      supabaseAdmin
        .from("ai_draft_logs")
        .select("ai_draft, language")
        .eq("org_id", orgId)
        .eq("was_edited", false)
        .not("agent_sent", "is", null)
        .order("created_at", { ascending: false })
        .limit(30),
      supabaseAdmin
        .from("ai_draft_logs")
        .select("correction_feedback")
        .eq("org_id", orgId)
        .eq("was_edited", true)
        .not("correction_feedback", "is", null)
        .order("created_at", { ascending: false })
        .limit(1000)
    ]);

    if (examplesRes.data) {
      const allExamples: string[] = [];
      let enCount = 0, bnCount = 0;
      for (const row of examplesRes.data) {
        if (row.ai_draft.length < 30) continue;
        if (row.language === "en" && enCount < 4) { allExamples.push(`[English example] ${row.ai_draft}`); enCount++; }
        else if (row.language === "bn" && bnCount < 4) { allExamples.push(`[Bengali example] ${row.ai_draft}`); bnCount++; }
        if (enCount >= 4 && bnCount >= 4) break;
      }
      if (allExamples.length > 0) {
        fewShotBlock = `\n\nAGENT-APPROVED REPLY EXAMPLES:\n${allExamples.join('\n---\n')}`;
      }
    }

    if (correctionsRes.data) {
      const corrections = correctionsRes.data.map(r => r.correction_feedback).filter(Boolean);
      const uniqueCorrections = Array.from(new Set(corrections)); // Deduplicate to create a summary of rules
      if (uniqueCorrections.length > 0) {
        mistakesBlock = `\n\nCRITICAL KNOWLEDGE (LEARNED FROM PAST MISTAKES):\n${uniqueCorrections.map((c) => `- ${c}`).join('\n')}`;
      }
    }
  } catch (e) {
    // Non-fatal, proceed without learning data
  }

  learningCache[orgId] = { fewShotBlock, mistakesBlock, timestamp: now };
  return { fewShotBlock, mistakesBlock };
}

// ============================================================
// MAIN ROUTE
// ============================================================

export async function POST(req: Request) {
  try {
    const { contextMessages, contactName, orgId, instruction, isTranslation } = await req.json();
    const apiKey = process.env.ANTHROPIC_API_KEY;

    if (!apiKey) {
      return NextResponse.json({ error: "Missing API key" }, { status: 500 });
    }

    // 1. Detect language (instant, no IO)
    let detectedLanguage = 'en';
    
    // Fallback: detect language from the customer's recent messages
    const customerLines = contextMessages.split('\n')
      .map((line: string) => line.trim())
      .filter((line: string) => line && !line.startsWith('[Agent]'));

    const lastCustomerText = customerLines.slice(-4).join(' ').toLowerCase();
    const hasBengaliScript = /[\u0980-\u09FF]/.test(lastCustomerText);
    const words = lastCustomerText.split(/[^a-zA-Z]+/);
    let benglishWordsFound = 0;
    for (const w of words) {
      if (BENGLISH_WORDS.has(w)) benglishWordsFound++;
    }
    detectedLanguage = (hasBengaliScript || benglishWordsFound >= 1) ? 'bn' : 'en';

    // 2. Build dynamic knowledge context (intent-based, ~1-3k tokens vs old 26k)
    let { context: knowledgeContext, sources: knowledgeSources } = buildKnowledgeContext(contextMessages);

    // 2.5 Vector DB RAG Search
    try {
      if (process.env.OPENAI_API_KEY) {
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        const lines = contextMessages.split('\n')
          .map((line: string) => line.trim())
          .filter((line: string) => line && !line.startsWith('[Agent]'));
        const lastQuery = lines.slice(-3).join(' ');
        
        if (lastQuery.length > 10) {
          const embeddingRes = await openai.embeddings.create({
            model: 'text-embedding-3-small',
            input: lastQuery,
            dimensions: 1536
          });
          const query_embedding = embeddingRes.data[0].embedding;
          
          const { data: vectorDocs } = await supabaseAdmin.rpc('match_knowledge', {
            query_embedding,
            match_threshold: 0.3,
            match_count: 3
          });
          
          if (vectorDocs && vectorDocs.length > 0) {
            knowledgeContext += '\n\n## Past Solved Tickets (Use these to exactly mimic past solutions)\n' + 
              vectorDocs.map((d: any) => `User: ${d.question}\nPast Solution: ${d.answer}`).join('\n\n---\n\n');
            vectorDocs.forEach((d: any) => knowledgeSources.push('Vector Match'));
          }
        }
      }
    } catch (e) {
      console.error('Vector DB search failed:', e);
    }

    // 3. Fetch learning data (cached, ~0ms on hit)
    const { fewShotBlock, mistakesBlock } = (orgId && !isTranslation)
      ? await getLearningData(orgId)
      : { fewShotBlock: '', mistakesBlock: '' };

    // 4. Build user message with language rules + knowledge + context
    let userMessage = '';
    
    if (isTranslation) {
      userMessage = `You are a highly accurate translation API. Your only job is to translate the provided text exactly as instructed, without adding any conversational filler, quotes, or support agent persona.
      
Instruction: ${instruction}

Output ONLY the translation in raw plain text.`;
    } else {
      const languageRule = `CRITICAL LANGUAGE RULES:
1. DETECT THE CUSTOMER's LANGUAGE from the conversation.
2. If the customer wrote in English: Reply 100% in English.
   - ONLY use English if there are NO Bengali or Banglish words in the conversation.
   - Use contractions: "I'll", "we've", "you're", "don't".
   - Talk naturally: "Hey, thanks for reaching out!", "Got it!", "Happy to help."
   - Never say: "Dear customer", "Respected sir/madam", "I hope this message finds you well".
   - NO EMOJIS EVER. Do not use a single emoji.
   - NEVER use words like "Bhai", "Bhaiya", "Bon", "Bro", or similar relational terms.
3. If the customer's message contains ANY Bengali script (বাংলা) OR ANY clear Banglish words (e.g., 'na', 'er', 'ek', 'kori', 'kemon', 'bhai', 'ki', 'ache', 'hoise', 'korbo', 'kore', 'naki', etc.): Treat the conversation as Banglish and Reply 100% in Bengali script (বাংলা হরফে).
   - Even if the customer mixes many English words with a few Banglish words (e.g., "Video er interface ek na"), you MUST reply entirely in Bengali script.
   - NEVER reply in Banglish. We NEVER use Banglish or English to reply to Bangla or Banglish customer messages.
   - MODERN BENGALI PATTERN (CRITICAL): Write in modern, conversational Bengali as spoken by tech-savvy users on WhatsApp. Absolutely NO Sadhu Bhasha, Sanskrit-heavy, formal, or archaic Bengali words (e.g., never use 'তুরন্ত', 'তাত্ক্ষণিক', 'অনুগ্রহপূর্বক', 'সহযোগিতা').
   - EMBRACE MODERN LOAN WORDS: Use natural everyday vocabulary and seamlessly incorporate common English tech terms. Instead of archaic Bengali words, use their modern English or casual equivalents (e.g., use 'ইন্সট্যান্ট', 'সাথে সাথে', 'প্লিজ', 'হেল্প', 'চেক').
   - THE BENGALI FONT PATTERN (CRITICAL): When replying in Bengali, the ENTIRE message must be written using the Bengali alphabet. Do NOT use any English letters (A-Z).
     * If you need to use an English word (e.g., "support", "good", "payment", "basic hosting", "starter"), DO NOT translate it into a Bengali word. Instead, write the English word using the Bengali alphabet (Transliteration). 
     * Example pattern: write "সাপোর্ট" (not "support"), write "গুড" (not "good"), write "ব্যাসিক হোস্টিং" (not "Basic Hosting").
     * The ONLY exception to this rule is URLs/Links.
   - ALWAYS use "আপনি/আপনার". NEVER use "তুমি/তোমার".
   - NO EMOJIS EVER. Do not use a single emoji.
   - NEVER address the customer as "Bhai", "Bhaiya", "Bon", "ভাই", "আপু", "বোন".`;

    userMessage = `${languageRule}

FORMATTING & BREVITY:
- CRITICAL: Every single sentence or logical thought MUST be separated by a double line break (\\n\\n).
- NEVER combine multiple sentences into a single paragraph, even for very short messages. ALWAYS add breathing space.
- Example for a short reply: [Greeting] \\n\\n [Main Answer] \\n\\n [Next Step/Question]
- Keep response 3-4 short sentences max. Short bursts, not essays.
${fewShotBlock}${mistakesBlock}
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
${contextMessages}

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
        stream: true,
        system: [
          {
            type: "text",
            text: SYSTEM_PROMPT,
            cache_control: { type: "ephemeral" }
          }
        ],
        messages: [
          { role: "user", content: userMessage },
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
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ language: detectedLanguage, sources: knowledgeSources })}\n\n`));

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
