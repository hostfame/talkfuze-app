const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { realtime: { transport: require('ws') } }
);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

// Process batch sizes
const BATCH_SIZE = 50;

async function extractWorkflow(messages) {
  // Format conversation for the AI
  const formattedChat = messages.map(m => {
    let role = m.sender_type === 'customer' ? 'Customer' : 'Agent';
    let content = m.content_type === 'text' ? m.content : `[${m.content_type}] ${m.content || ''}`;
    return `[${role}]: ${content}`;
  }).join('\n');

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5-20250929",
        max_tokens: 1500,
        system: `You are an expert AI Support Data Distiller. Your job is to take a completed customer support chat and extract the core 'Workflow' into a clean, reusable Q&A format.
        
CRITICAL RULES:
1. 'question': Summarize the customer's core intent/problem in 1 clear sentence.
2. 'answer': Write out the exact step-by-step workflow the agent used to resolve it, OR the final definitive answer given. Format it professionally.
3. If the chat is just spam, a simple "ok", or has no actual resolution/value, return null for both fields.
4. Output strictly valid JSON.`,
        messages: [
          {
            role: "user",
            content: `Analyze this resolved conversation and extract the workflow:\n\n${formattedChat}\n\nOutput JSON format:\n{\n  "question": "Core intent...",\n  "answer": "Step-by-step resolution..."\n}`
          }
        ]
      })
    });

    if (!response.ok) {
      console.error("Anthropic Error:", response.status, await response.text());
      return null;
    }

    const data = await response.json();
    const textContent = data.content?.[0]?.text || "";
    const cleanJson = textContent.replace(/```json|```/g, "").trim();
    return JSON.parse(cleanJson);
  } catch (err) {
    console.error("Workflow extraction failed:", err);
    return null;
  }
}

async function run() {
  console.log("🚀 Starting 1-Hour Auto-Resolver & Distiller...");
  
  // 1. Find Open conversations older than 1 hour
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  
  const { data: convos, error: fetchErr } = await supabase
    .from('conversations')
    .select('id, last_message_at')
    .eq('status', 'open')
    .lt('last_message_at', oneHourAgo)
    .limit(BATCH_SIZE);

  if (fetchErr) {
    console.error("Failed to fetch conversations:", fetchErr);
    return;
  }

  if (!convos || convos.length === 0) {
    console.log("✅ No idle conversations found.");
    return;
  }

  console.log(`Found ${convos.length} idle conversations to process.`);

  for (const convo of convos) {
    console.log(`\nProcessing Conversation: ${convo.id}`);
    
    // 2. Fetch messages
    const { data: messages } = await supabase
      .from('messages')
      .select('content, content_type, sender_type, created_at')
      .eq('conversation_id', convo.id)
      .order('created_at', { ascending: true });

    if (!messages || messages.length < 2) {
      console.log(`Skipping: Too few messages to learn from.`);
      await closeConversation(convo.id);
      continue;
    }

    // 3. Extract Workflow
    console.log("Distilling workflow...");
    const workflow = await extractWorkflow(messages);

    if (workflow && workflow.question && workflow.answer) {
      // 4. Generate Embedding for the Vector DB
      try {
        const embeddingRes = await openai.embeddings.create({
          model: 'text-embedding-3-small',
          input: workflow.question.substring(0, 1500),
          dimensions: 1536
        });
        const embedding = embeddingRes.data[0].embedding;

        // 5. Inject into ai_knowledge_base
        await supabase.from('ai_knowledge_base').insert({
          question: workflow.question,
          answer: workflow.answer,
          embedding: embedding
        });
        console.log(`✅ Learned & Injected: "${workflow.question}"`);
      } catch (err) {
        console.error("Failed to vectorize/inject:", err.message);
      }
    } else {
      console.log(`Skipped learning (No valuable workflow detected).`);
    }

    // 6. Close the conversation
    await closeConversation(convo.id);
  }
  
  console.log("\n🎉 Auto-Resolver run completed.");
}

async function closeConversation(id) {
  await supabase
    .from('conversations')
    .update({ status: 'closed' })
    .eq('id', id);
  console.log(`🔒 Marked conversation as closed.`);
}

run().catch(console.error);
