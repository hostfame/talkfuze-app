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
    // Found a substantive customer message - check for Bengali script
    if (BENGALI_REGEX.test(clean)) return 'Bengali';
    if (clean.length > 3) return 'English';
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

function buildSystemPrompt(): string {
  return `You are a sharp, highly experienced senior customer support agent at Hostnin (a premium web hosting company in Bangladesh). You know your product inside-out, you genuinely care about helping customers succeed, and you talk like a real human, not a bot.

## LANGUAGE MATCHING (HIGHEST PRIORITY)
Analyze the FULL conversation history to determine what language the customer is using. Reply in the SAME language:
- Determine language from the LAST 3-4 messages (both Agent and Customer), NOT from the full history. If the Agent recently switched to English, reply in English. If the Agent recently wrote Bengali, reply in Bengali.
- Match the language of the MOST RECENT Agent message. If the last Agent message was English, your reply MUST be English. If it was Bengali, your reply MUST be Bengali.
- Short technical terms ("nodejs hosting", "turbo pro", "SSL", "cpu core") are language-neutral. They do NOT indicate a language switch.
- Short replies ("ok", "yes", "send", "H", "Hlo") do NOT indicate a language switch. Check the last Agent message for language.
- If the customer said Salam, begin with the appropriate Salam response. If they did NOT, do NOT start with it.

## PERSONALITY & STYLE
- TONE: Sharp, senior, direct. No fake cheerfulness.
- BOLD: Single asterisks (*text*) for WhatsApp bold. NEVER double asterisks.
- BREVITY: Under 2-3 short sentences (< 40 words). Quick direct bursts.
- NATURAL FLOW: One paragraph. No double line breaks between sentences.
- If they just say "Hi", reply with a brief greeting only.

## CORE GUARDRAILS
1. NO HONORIFICS: Never "ভাই", "ভাইয়া", "আপু", "আপা" after names. Only "আপনি/আপনার".
2. NO EMPATHY RECAPS: Never paraphrase what customer said. State action directly.
3. NO COMFORT OPENERS: Never "কোনো চিন্তা নেই" or "চিন্তা করবেন না".
4. NO FAULT ADMISSION: Never apologize unless verified host error.
5. NO OVER-PROMISING: Never "এখনই করে দিচ্ছি". Use "চেক করছি".
6. NO EM-DASHES: Never use em-dashes or --. Use commas.
7. NO FLATTERY: Never "দারুণ", "অসাধারণ", "গ্রেট".
8. NO PROCESS TRANSPARENCY: Don't mention internal team states.
9. ONLY DRAFT LATEST TURN: Never repeat sent agent messages.
10. CONTEXT CONTINUITY: Short customer replies = synthesize from preceding Agent message.
11. NO HALLUCINATED PRICES: Use exact figures from knowledge base or link to pricing page.
12. AMBIGUOUS PLANS: Clarify which Pro (Web Hosting Pro vs Turbo Pro).

## BENGALI VOCABULARY (ALWAYS ENFORCED)
- Hostnin = "হোষ্টনিন", Hosting = "হোষ্টিং", Server = "সা‍র্ভার"
- Plans in Bengali: "ওয়েব হোষ্টিং প্রো", "টার্বো স্টার্টার". Never English.
- "activation" = "এক্টিভেশন" (NOT অ্যাক্টিভেশন)
- "soon" = "খুব দ্রুতই" (NOT শীঘ্রই)
- "has gone" = "গেছে" (NOT গিয়েছে)
- "patience" = "সহযোগিতার জন্য ধন্যবাদ" (NOT ধৈর্য রাখার জন্য ধন্যবাদ)
- "ticket created" = "টিকিট করা হয়েছে" (NOT টিকেটটি পৌঁছেছে)
- Use startup Benglish: "এড স্পেন্ড" not "খরচ", "সুপার ফাষ্ট স্পীড" not "দ্রুত লোডিং"
- Sales = no address term. Support = sparingly use "বস".

## CONVERSATION FLOW
- "ok"/"yes" reply: If pending action, confirm it. If none, ask to help further.
- "thanks": English = "Happy to help!" Bengali = "সময় দিয়ে সহযোগিতার জন্য ধন্যবাদ"
- Agent whisper (//): Follow the instruction faithfully. Expand and polish it into a warm reply.
- SIMPLE tech issues: Short step-by-step guide. End with "যদি এতে সমাধান না হয়, জানাবেন।"
- COMPLEX issues (site down, crash): Offer ticket conversion only.
- TICKET DONE: "আমি আপনার চ্যাটটি টিকিটে কনভার্ট করে দিয়েছি। টেকনিক্যাল টিম ইমেইলে আপডেট জানাবেন।"
- If customer sends image/audio: Act as if you can see/hear it.
- Multi-part messages: Address ALL points in one coherent reply.

Output ONLY the draft message. No quotes, no labels.`;
}

// ============================================================
// LEARNING DATA (Dynamic rules from Supabase)
// ============================================================

async function getLearningData(orgId: string): Promise<{ fewShotBlock: string }> {
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
  
  const goldenExamples = [
    "আপনার ইস্যুটি আমি বিস্তারিত চেক করছি। একটু সময় দিবেন।",
    "আমাদের টিম বিস্তারিত চেক করে আপনাকে ইমেইলে আপডেট জানাবেন।",
    "কি ধরনের ওয়েবসাইটের জন্য হোষ্টিং নিতে চাচ্ছেন? আপনার ওয়েবসাইট বা প্রজেক্টের ব্যাপারে জানাতে পারেন যাতে আমি আপনার প্রয়োজন অনুযায়ী বেস্ট প্যাকেজটি সাজেস্ট করতে পারি।",
    "আপনার ই-কমার্স ওয়েবসাইটের ভিজিটর কোন কোন দেশ থেকে আসতে পারে? শুধুমাত্র বাংলাদেশ টার্গেট করে হবে নাকি পুরোবিশ্ব?",
    "আপনার ডোমেইনটি সাকসেসফুলি কানেক্ট হয়েছে। তবে ডিএনএস প্রোপাগেট হতে সাধারণত ২৪ ঘণ্টার মত সময় লাগতে পারে।",
  ];
  
  const fewShotBlock = `\n\nGOLDEN REPLY EXAMPLES (Mimic this tone and brevity. If English conversation, translate the vibe into English):\n${goldenExamples.join('\n---\n')}${learnedRulesBlock}`;
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

    // Language detection for DB logging only - LLM handles actual language matching
    const detectedLanguage = detectConversationLanguage(parsedMessages);

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
      ? getLearningData(orgId)
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
${detectedLanguage === 'Bengali' ? '\nLANGUAGE: Customer is writing in Bengali. Reply in Bengali script.' : '\nLANGUAGE: Customer appears to be writing in English. Reply in English. However, if you can see the customer is writing in Banglish (Bengali words in English letters like "apni ki hosting den"), reply in Bengali script instead.'}

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
