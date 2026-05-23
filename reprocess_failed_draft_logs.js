require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

async function fetchSupa(path, method = 'GET', body = null) {
  const options = {
    method,
    headers: {
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json'
    }
  };
  if (body) {
    options.body = JSON.stringify(body);
  }
  const res = await fetch(`${supabaseUrl}/rest/v1/${path}`, options);
  if (method === 'GET' || method === 'POST') {
    try {
      return await res.json();
    } catch {
      return null;
    }
  }
  return res.text();
}

async function extractLearningData(context, aiDraft, agentSent) {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return null;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5-20250929",
        max_tokens: 1000,
        system: "You are an expert AI CRM training engineer. You extract learning data from AI mistakes. Output valid JSON strictly containing three string keys: 'rule', 'question', 'answer'. You MUST return ONLY the raw JSON string. Do not wrap it in markdown code blocks.",
        messages: [
          {
            role: "user",
            content: `Compare the mistaken AI Draft with the Agent's Final Verified Message.
            
Conversation Context (Customer asked):
"${context}"

Mistaken AI Draft:
"${aiDraft}"

Agent's Final Verified Message:
"${agentSent}"

Tasks:
1. 'rule': A concise 1-sentence actionable rule (in English) describing exactly why the agent edited the draft and what mistake to avoid.
2. 'question': A standalone 1-sentence summary of the customer's intent/problem.
3. 'answer': The agent's verified final message.

Output strictly in JSON: {"rule": "...", "question": "...", "answer": "..."}`
          }
        ]
      })
    });

    if (!response.ok) return null;
    const data = await response.json();
    const textContent = data.content?.[0]?.text || "";
    const cleanJson = textContent.replace(/```json|```/g, "").trim();
    return JSON.parse(cleanJson);
  } catch (e) {
    return null;
  }
}

async function run() {
  console.log("Fetching edited drafts with null rules...");
  const logs = await fetchSupa("ai_draft_logs?was_edited=eq.true&agent_sent=not.is.null&correction_feedback=is.null&order=created_at.desc&limit=15");

  if (!logs || logs.length === 0) {
    console.log("No failed drafts found!");
    return;
  }

  console.log(`Found ${logs.length} drafts to reprocess.\n`);

  for (const log of logs) {
    console.log(`Reprocessing Log ID: ${log.id}`);
    const context = log.customer_context || "Customer support inquiry";
    const learningData = await extractLearningData(context, log.ai_draft, log.agent_sent);

    if (learningData && learningData.rule) {
      console.log(`-> Generated Rule: "${learningData.rule}"`);
      
      // Update in ai_draft_logs
      await fetchSupa(`ai_draft_logs?id=eq.${log.id}`, 'PATCH', {
        correction_feedback: learningData.rule
      });

      // Insert into ai_knowledge_base
      try {
        const embeddingRes = await fetch('https://api.openai.com/v1/embeddings', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: 'text-embedding-3-small', input: learningData.question })
        });
        const embData = await embeddingRes.json();
        if (embData.data?.[0]?.embedding) {
          await fetchSupa('ai_knowledge_base', 'POST', {
            question: learningData.question,
            answer: learningData.answer,
            embedding: embData.data[0].embedding
          });
          console.log("-> Saved to Vector Database!");
        }
      } catch (err) {
        console.error("Vector DB save failed:", err.message);
      }
    } else {
      console.log("-> Failed to generate rule");
    }
    console.log("---");
    await new Promise(r => setTimeout(r, 600)); // sleep to avoid rate limits
  }

  console.log("Reprocessing complete! All recent drafts backfilled successfully!");
}

run();
