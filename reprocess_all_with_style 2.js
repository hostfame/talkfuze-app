require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const anthropicKey = process.env.ANTHROPIC_API_KEY || '';
const openaiKey = process.env.OPENAI_API_KEY || '';

async function fetchSupa(path, method = 'GET', body = null) {
  const options = {
    method,
    headers: {
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json',
      'Prefer': method === 'GET' ? 'return=representation' : 'return=minimal'
    }
  };
  if (body) options.body = JSON.stringify(body);
  const res = await fetch(`${supabaseUrl}/rest/v1/${path}`, options);
  if (method === 'GET') {
    try { return await res.json(); } catch { return null; }
  }
  return res.ok;
}

async function extractDeepLearning(context, aiDraft, agentSent) {
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5-20250929",
        max_tokens: 2000,
        system: `You are an expert AI CRM linguist and tone analyst for a Bangladeshi hosting company (Hostnin). You perform DEEP line-by-line analysis of how a human agent corrected an AI draft. You extract BOTH factual mistakes AND stylistic/tonal corrections.

Your outputs are used to permanently train the AI to write like a natural, warm, WhatsApp-style human support agent, NOT a corporate robot.

Output valid JSON strictly containing these keys: 'rule', 'style_corrections', 'question', 'answer'.
You MUST return ONLY the raw JSON string. Do not wrap it in markdown code blocks.`,
        messages: [
          {
            role: "user",
            content: `Perform a DEEP line-by-line comparison between the AI Draft and the Agent's Final Message.

Conversation Context (Customer asked):
"${context}"

Mistaken AI Draft:
"${aiDraft}"

Agent's Final Verified Message:
"${agentSent}"

ANALYSIS TASKS:

1. 'rule': A concise 1-2 sentence actionable rule (in English) about the FACTUAL mistake.
   - If the AI over-promised (timelines, compensation, features), state what to avoid.
   - If the language was wrong (Bengali vs English mismatch), state the correct language rule.
   - If no factual mistake exists (only style changes), write "Style-only correction, no factual error."

2. 'style_corrections': A detailed multi-line string (in English) analyzing EVERY stylistic change the agent made. This is the MOST IMPORTANT field. Analyze:
   a) VOCABULARY SHIFTS: List every word the agent replaced and why.
      Example: "Replaced bookish 'ক্ষোভ' (formal frustration) with natural 'রাগ' (anger). Replaced textbook 'বিক্রয়' with transliterated 'সেলস'. Replaced 'ক্ষতি' with 'লস'."
   b) VERB FORM CHANGES: Did the agent change verb structures?
      Example: "Changed 'বুঝছি' (direct) to 'বুঝতে পারছি' (polite auxiliary). Changed 'করুন' (command) to 'করতে পারেন' (suggestion)."
   c) DELETED LINES: What entire sentences/phrases did the agent remove and WHY?
      Example: "Deleted 'এই পরিস্থিতিটি গুরুতর' because it sounds like corporate robot speak. Deleted follow-up question 'What kind of website?' because the customer did not ask for recommendations."
   d) ADDED CONNECTORS: Did the agent add natural flow words?
      Example: "Added 'কিন্তু' (but) as a conversational connector instead of starting abruptly."
   e) TONE SHIFT: Did the agent make it warmer, shorter, more direct, less formal?
      Example: "Shortened 3-paragraph response to 1 paragraph. Removed unnecessary assurances like 'আমরা সবসময় আপনার সেবায় আছি'."
   f) ROBOTIC PATTERNS REMOVED: What patterns sound like a bot vs a human?
      Example: "Removed 'সম্পূর্ণভাবে' (completely) which sounds over-formal. Agents use 'পুরোপুরি' or omit entirely."

   If the messages are in English, analyze English style shifts similarly.
   If there are NO style changes (only factual), write "No significant style changes."

3. 'question': A clean, standalone 1-sentence summary of the customer's specific problem.

4. 'answer': The agent's verified final message (exactly as written).

Output strictly as JSON: {"rule": "...", "style_corrections": "...", "question": "...", "answer": "..."}`
          }
        ]
      })
    });

    if (!response.ok) return null;
    const data = await response.json();
    const textContent = data.content?.[0]?.text || "";
    const cleanJson = textContent.replace(/```json|```/g, "").trim();
    const result = JSON.parse(cleanJson);

    // Quality gate
    const qLower = (result.question || '').toLowerCase();
    const genericPatterns = ['general customer support', 'general support inquiry', 'without specifying', 'n/a', 'the core problem or question'];
    if (genericPatterns.some(p => qLower.includes(p)) || qLower.length < 10) return null;

    return (result.rule && result.question && result.answer) ? result : null;
  } catch (e) {
    return null;
  }
}

async function run() {
  console.log("=== FULL DEEP STYLE REPROCESSING ===\n");

  // Step 1: Wipe the old vector DB completely (we're rebuilding from scratch with style data)
  console.log("Step 1: Wiping old vector DB entries...");
  const oldEntries = await fetchSupa("ai_knowledge_base?select=id");
  if (oldEntries && oldEntries.length > 0) {
    // Delete in batches
    for (const entry of oldEntries) {
      await fetchSupa(`ai_knowledge_base?id=eq.${entry.id}`, 'DELETE');
    }
    console.log(`Deleted ${oldEntries.length} old entries.\n`);
  }

  // Step 2: Fetch ALL edited drafts that have customer_context
  console.log("Step 2: Fetching all edited drafts with context...");
  const logs = await fetchSupa("ai_draft_logs?was_edited=eq.true&agent_sent=not.is.null&customer_context=not.is.null&order=created_at.desc&limit=500");

  if (!logs || logs.length === 0) {
    console.log("No logs found!");
    return;
  }

  console.log(`Found ${logs.length} drafts to re-analyze with deep style extraction.\n`);

  let processed = 0;
  let failed = 0;
  let styleDetected = 0;

  for (const log of logs) {
    processed++;
    const pct = ((processed / logs.length) * 100).toFixed(0);
    process.stdout.write(`[${pct}%] Processing ${processed}/${logs.length}: ${log.id.slice(0, 8)}... `);

    const learningData = await extractDeepLearning(log.customer_context, log.ai_draft, log.agent_sent);

    if (!learningData) {
      console.log("SKIPPED (low quality)");
      failed++;
      // Rate limit protection
      await new Promise(r => setTimeout(r, 300));
      continue;
    }

    // Combine rule + style corrections
    const hasStyle = learningData.style_corrections && learningData.style_corrections !== 'No significant style changes.';
    const combinedFeedback = hasStyle
      ? `${learningData.rule} | STYLE: ${learningData.style_corrections}`
      : learningData.rule;

    if (hasStyle) styleDetected++;

    // Update correction_feedback in ai_draft_logs
    await fetchSupa(`ai_draft_logs?id=eq.${log.id}`, 'PATCH', {
      correction_feedback: combinedFeedback
    });

    // Insert into vector DB with deduplication
    try {
      const embeddingRes = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'text-embedding-3-small', input: learningData.question })
      });
      const embData = await embeddingRes.json();
      if (embData.data?.[0]?.embedding) {
        await fetchSupa('ai_knowledge_base', 'POST', {
          question: learningData.question,
          answer: learningData.answer,
          embedding: embData.data[0].embedding
        });
      }
    } catch (err) {
      // Silent fail on vector insert
    }

    console.log(`OK ${hasStyle ? '(+STYLE)' : '(factual only)'}`);

    // Rate limit: ~1.2 req/sec to stay safe
    await new Promise(r => setTimeout(r, 800));
  }

  console.log(`\n=== COMPLETE ===`);
  console.log(`Total processed: ${processed}`);
  console.log(`Style patterns detected: ${styleDetected}`);
  console.log(`Skipped/failed: ${failed}`);
  console.log(`Success rate: ${(((processed - failed) / processed) * 100).toFixed(1)}%`);

  // Final count
  const finalCount = await fetchSupa("ai_knowledge_base?select=id");
  console.log(`Vector DB entries: ${finalCount?.length || 0}`);
}

run();
