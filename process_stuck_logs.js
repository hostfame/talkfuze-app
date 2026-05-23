require('dotenv').config({ path: '.env.local' });

async function fetchSupa(path, method = 'GET', body = null) {
  const options = {
    method,
    headers: {
      'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json'
    }
  };
  if (body) options.body = JSON.stringify(body);
  const res = await globalThis.fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${path}`, options);
  if (!res.ok) throw new Error(await res.text());
  if (res.status === 204) return null;
  return res.json();
}

async function run() {
  const stuckLogs = await fetchSupa('ai_training_logs?status=eq.processing&select=id,conversation_id');
  console.log(`Found ${stuckLogs.length} stuck logs.`);

  for (const log of stuckLogs) {
    try {
      console.log(`Processing log ${log.id}...`);
      
      const messages = await fetchSupa(`messages?conversation_id=eq.${log.conversation_id}&select=sender_type,content&order=created_at.asc`);
      if (!messages || messages.length === 0) {
        console.log("No messages, marking failed...");
        await fetchSupa(`ai_training_logs?id=eq.${log.id}`, 'PATCH', { status: 'failed', error_message: 'No messages found to distill' });
        continue;
      }

      const transcript = messages.map(m => `${m.sender_type.toUpperCase()}: ${m.content}`).join('\\n');

      const distillRes = await globalThis.fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content: `You are an expert AI data extraction assistant. You are reviewing a finished customer support chat.\\nTask: Extract the core problem and the final successful solution/upsell provided by the agent. \\nRemove all greetings, delays, and fluff. Keep it dense and actionable.\\nOutput JSON strictly:\\n{\\n  "question": "The core problem or question from the customer",\\n  "answer": "The exact solution/upsell strategy used by the agent, preserving their tone and specific phrases.",\\n  "tags": ["technical_fix", "billing", "sales_upsell", "ssl", "nameserver"]\\n}`
            },
            { role: "user", content: `Transcript:\\n${transcript}` }
          ],
          response_format: { type: "json_object" }
        })
      });

      if (!distillRes.ok) throw new Error("OpenAI Distillation Failed");
      const distillData = await distillRes.json();
      const extracted = JSON.parse(distillData.choices[0].message.content);

      if (!extracted.question || !extracted.answer) {
        throw new Error("Failed to parse extracted JSON");
      }

      const embedRes = await globalThis.fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
        },
        body: JSON.stringify({
          model: "text-embedding-3-small",
          input: `Question: ${extracted.question}\\nAnswer: ${extracted.answer}`
        })
      });

      if (!embedRes.ok) throw new Error("OpenAI Embeddings Failed");
      const embedData = await embedRes.json();
      const embedding = embedData.data[0].embedding;

      await fetchSupa('ai_knowledge_base', 'POST', {
        question: extracted.question,
        answer: extracted.answer,
        embedding: embedding,
        is_active: true
      });

      await fetchSupa(`ai_training_logs?id=eq.${log.id}`, 'PATCH', {
        status: 'completed',
        raw_messages_count: messages.length,
        distilled_summary: `Q: ${extracted.question}\\nA: ${extracted.answer}`,
        learned_tags: extracted.tags || [],
        completed_at: new Date().toISOString()
      });

      console.log(`✅ Finished log ${log.id}`);
    } catch (e) {
      console.error(`❌ Failed log ${log.id}:`, e.message);
      await fetchSupa(`ai_training_logs?id=eq.${log.id}`, 'PATCH', {
        status: 'failed',
        error_message: e.message
      }).catch(console.error);
    }
  }
}
run();
