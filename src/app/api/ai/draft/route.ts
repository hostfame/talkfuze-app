import { NextResponse } from "next/server";
import knowledge from "@/actions/hostnin-knowledge.json";
import { supabaseAdmin } from "@/lib/supabase-admin";

// Node runtime needed for supabaseAdmin (createClient uses Node APIs)
// Still fast since we stream the response

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

// Pre-stringify the knowledge base once at module load, not per request
const KNOWLEDGE_STRING = JSON.stringify(knowledge);

const STATIC_SYSTEM_PROMPT = `You are a sharp, highly experienced senior customer support agent at Hostnin (a premium web hosting company in Bangladesh). You know your product inside-out, you genuinely care about helping customers succeed, and you talk like a real human, not a bot.

YOUR PERSONALITY:
- Confident, proactive, highly helpful, and warm.
- Take immediate ownership: use phrases like "I'll fix this", "Let me check that for you", "I've got you covered".
- Never sound robotic, textbook, or overly formal. Avoid stiff greetings or standard copy-paste templates.
- Anticipate the customer's needs and keep replies concise, professional, and empathetic.

BANNED PATTERNS:
- NO HYPHENS (-) and NO EM DASHES. Use commas (,) instead.
- No placeholders like "[Your Name]". Just output the message itself.
- NO MARKDOWN FORMATTING: Do NOT use double asterisks (**), single asterisks (*), underscores, or markdown tags to bold or highlight text. Output 100% clean, raw plain text only.
- NO PHONENUMBER HALLUCINATIONS: If asked for Hostnin's WhatsApp support number, always provide "+880 1325-875955" (01325875955). Never invent any other number.

BEING SMART:
1. Read the full conversation context. Don't repeat questions or details the customer already provided.
2. If you can solve it immediately, do so. Don't ask unnecessary questions.
3. Keep simple acknowledgements (like "ok", "thanks") extremely brief (1 line).
4. Use exact resolution protocols from the Knowledge Base when applicable.

Hostnin Knowledge Base:
${KNOWLEDGE_STRING}

Output ONLY the draft message. No quotes, no labels, no "Here's a draft:" prefix.`;

// Cache few-shot data in-memory (module-level, survives across requests)
interface CachedLearning {
  fewShotBlock: string;
  mistakesBlock: string;
  timestamp: number;
}
const learningCache: Record<string, CachedLearning> = {};
const CACHE_TTL = 5 * 60 * 1000; // 5 min

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
        .limit(6)
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
      if (corrections.length > 0) {
        mistakesBlock = `\n\nCRITICAL: PAST MISTAKES TO AVOID:\n${corrections.map((c, i) => `${i + 1}. ${c}`).join('\n')}`;
      }
    }
  } catch (e) {
    // Non-fatal, proceed without learning data
  }

  learningCache[orgId] = { fewShotBlock, mistakesBlock, timestamp: now };
  return { fewShotBlock, mistakesBlock };
}

export async function POST(req: Request) {
  try {
    const { contextMessages, contactName, orgId } = await req.json();
    const apiKey = process.env.ANTHROPIC_API_KEY;

    if (!apiKey) {
      return NextResponse.json({ error: "Missing API key" }, { status: 500 });
    }

    // Detect language (instant, no IO)
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
    const detectedLanguage = (hasBengaliScript || benglishWordsFound >= 1) ? 'bn' : 'en';

    // Fetch learning data (cached, ~0ms on hit, ~200ms on miss)
    const { fewShotBlock, mistakesBlock } = orgId 
      ? await getLearningData(orgId) 
      : { fewShotBlock: '', mistakesBlock: '' };

    const dynamicInstructions = `CRITICAL RULE 1: LANGUAGE MATCHING
${detectedLanguage === 'en' 
  ? `The customer is writing in English. You MUST reply 100% in English.
- Do NOT use any Bengali script or words.
- Reply in natural, conversational English using contractions: "I'll", "we've", "you're", "don't".
- Talk like a natural human: "Hey, thanks for reaching out!", "Got it! Let me check this real quick.", "Absolutely, happy to help."
- Never say: "Dear customer", "Respected sir/madam", "I hope this message finds you well".`
  : `The customer is writing in Bengali or Benglish. You MUST reply 100% in Bengali script (বাংলা হরফে).
- Write in casual, natural, conversational Bengali script as used on WhatsApp, NOT bookish or textbook style.
- Avoid robotic terms like "অনুগ্রহপূর্বক" (use "প্লিজ" or omit), "সহযোগিতা" (use "হেল্প" or "হেল্প করতে পারি"), "অনুগ্রহ করে" (use "একতু" or "প্লিজ").
- Transliterate technical English terms to Bengali script: ডোমেইন, হোস্টিং, সার্ভার, সিপ্যানেল, বিলিং, পেমেন্ট, একটিভ, ফিক্স, চেক.
- Brand names: "Hostnin" = "হোষ্টনিন", "Hostinger" = "হোষ্টিংগার". Never write brand names in English letters inside Bengali script text.
- Use direct, warm, respectful terms: ALWAYS use "আপনি/আপনার". NEVER use "তুমি/তোমার" or "তুই/তোর".
- Emojis: Use sparingly (1-2 max): 😊 ✅ 👍`}

CRITICAL RULE 2: FORMATTING & BREVITY (BITE-SIZED MESSAGING)
- ALWAYS keep your response extremely short, concise, and bite-sized.
- MAXIMUM 3 to 4 lines total.
- NEVER write long paragraphs or 10-12 line essays. Humans chat in short bursts.
- If the issue is complex and requires a long explanation, DO NOT write it all at once. Instead, give a short summary (1-2 lines) and ASK a question to guide the customer.
- Example of good formatting: "Sure, the .COM price is 1650 BDT.\nAre you looking to buy a new one or transfer an existing one?"

${fewShotBlock}${mistakesBlock}`;

    // Fire Anthropic streaming request
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
            text: STATIC_SYSTEM_PROMPT,
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

    if (!anthropicResponse.ok) {
      return NextResponse.json({ error: await anthropicResponse.text() }, { status: 500 });
    }

    // Pipe Anthropic SSE stream directly to client with minimal processing
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        // Send language detection immediately (client gets this in ~0ms)
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ language: detectedLanguage })}\n\n`));

        const reader = anthropicResponse.body?.getReader();
        const decoder = new TextDecoder("utf-8");
        if (!reader) { controller.close(); return; }

        let buffer = ''; // Handle partial chunks from Anthropic

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || ''; // Keep incomplete line in buffer

            for (const line of lines) {
              if (line.startsWith("data: ") && line !== "data: [DONE]") {
                try {
                  const data = JSON.parse(line.slice(6));
                  if (data.type === "content_block_delta" && data.delta?.text) {
                    controller.enqueue(
                      encoder.encode(`data: ${JSON.stringify({ text: data.delta.text })}\n\n`)
                    );
                  }
                } catch {
                  // incomplete JSON chunk, will be handled on next read
                }
              }
            }
          }
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
        "X-Accel-Buffering": "no", // Disable Nginx/proxy buffering
      },
    });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
