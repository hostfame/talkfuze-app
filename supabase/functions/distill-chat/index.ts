import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.0"

// This function acts as the "Observer" distillation layer.
// Triggered when ai_training_logs has a new "pending" row.

serve(async (req) => {
  try {
    const payload = await req.json()
    const logRecord = payload.record // Triggered by INSERT on ai_training_logs

    if (!logRecord || logRecord.status !== 'pending') {
      return new Response(JSON.stringify({ message: "Not a pending log" }), { status: 200 })
    }

    // Init Supabase admin client
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // 1. Mark as processing
    await supabaseAdmin
      .from('ai_training_logs')
      .update({ status: 'processing' })
      .eq('id', logRecord.id)

    // 2. Fetch all messages for this conversation
    const { data: messages, error: msgError } = await supabaseAdmin
      .from('messages')
      .select('sender_type, content, created_at')
      .eq('conversation_id', logRecord.conversation_id)
      .order('created_at', { ascending: true })

    if (msgError || !messages || messages.length === 0) {
      throw new Error("No messages found to distill")
    }

    // Format chat for LLM
    const chatTranscript = messages.map(m => `${m.sender_type.toUpperCase()}: ${m.content}`).join('\n')

    // 3. Call gpt-4o-mini for Distillation
    const openAiKey = Deno.env.get('OPENAI_API_KEY')
    if (!openAiKey) throw new Error("Missing OPENAI_API_KEY")

    const distillRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openAiKey}`
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `You are an expert AI data extraction assistant. You are reviewing a finished customer support chat.
Task: Extract the core problem and the final successful solution/upsell provided by the agent. 

CRITICAL RULE AGAINST FALSE POSITIVES:
If the transcript consists only of greetings (e.g. "hlw", "hi"), intermediate status updates ("I am checking", "let me see"), simple one-liners without context, or lacks a clear technical/sales resolution, you MUST flag it to be skipped. Do NOT pollute the learning database with fluff.

Output JSON strictly:
{
  "skip": boolean, // true if this is a false positive/meaningless chat
  "skip_reason": "Brief reason why it's skipped, if skip is true",
  "question": "The core problem or question from the customer (empty if skipped)",
  "answer": "The exact solution/upsell strategy used by the agent (empty if skipped)",
  "tags": ["technical_fix", "billing", "sales_upsell", "ssl", "nameserver"]
}`
          },
          { role: "user", content: `Transcript:\n${chatTranscript}` }
        ],
        response_format: { type: "json_object" }
      })
    })

    if (!distillRes.ok) throw new Error("OpenAI Distillation Failed")
    const distillData = await distillRes.json()
    const extracted = JSON.parse(distillData.choices[0].message.content)

    if (extracted.skip) {
      throw new Error(`Skipped: ${extracted.skip_reason || "No meaningful resolution found (False Positive)"}`)
    }

    if (!extracted.question || !extracted.answer) {
      throw new Error("Failed to parse extracted JSON")
    }

    // 4. Generate Embeddings using text-embedding-3-small
    const embedRes = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openAiKey}`
      },
      body: JSON.stringify({
        model: "text-embedding-3-small",
        input: `Question: ${extracted.question}\nAnswer: ${extracted.answer}`
      })
    })

    if (!embedRes.ok) throw new Error("OpenAI Embeddings Failed")
    const embedData = await embedRes.json()
    const embedding = embedData.data[0].embedding

    // 5. Store in ai_knowledge_base
    const { error: kbError } = await supabaseAdmin
      .from('ai_knowledge_base')
      .insert({
        question: extracted.question,
        answer: extracted.answer,
        embedding: embedding,
        is_active: true
      })

    if (kbError) throw new Error(`KB Insert Error: ${kbError.message}`)

    // 6. Update ai_training_logs to completed
    await supabaseAdmin
      .from('ai_training_logs')
      .update({
        status: 'completed',
        raw_messages_count: messages.length,
        distilled_summary: `Q: ${extracted.question}\nA: ${extracted.answer}`,
        learned_tags: extracted.tags,
        completed_at: new Date().toISOString()
      })
      .eq('id', logRecord.id)

    return new Response(JSON.stringify({ success: true }), { status: 200 })

  } catch (error: any) {
    // If we fail, try to log the error
    try {
      const payload = await req.json().catch(() => null)
      if (payload && payload.record) {
        const supabaseAdmin = createClient(
          Deno.env.get('SUPABASE_URL') ?? '',
          Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )
        await supabaseAdmin
          .from('ai_training_logs')
          .update({
            status: 'failed',
            error_message: error.message
          })
          .eq('id', payload.record.id)
      }
    } catch (e) {}

    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }
})
