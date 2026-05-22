import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

// AI Auto-Tagging Edge Function
serve(async (req) => {
  try {
    const payload = await req.json()

    // 1. Check if it's an insert to messages from a contact
    if (payload.type !== 'INSERT' || payload.table !== 'messages' || payload.record.sender_type !== 'contact') {
      return new Response(JSON.stringify({ message: "Ignored" }), { headers: { "Content-Type": "application/json" } })
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY")

    if (!supabaseUrl || !supabaseKey || !anthropicKey) {
      return new Response(JSON.stringify({ error: "Missing environment variables" }), { status: 500 })
    }

    const supabase = createClient(supabaseUrl, supabaseKey)
    const conversationId = payload.record.conversation_id
    const messageContent = payload.record.content

    // 2. Fetch the conversation to check if it already has tags
    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .select('tags')
      .eq('id', conversationId)
      .single()

    if (convError || !conversation) {
      return new Response(JSON.stringify({ error: "Conversation not found" }), { status: 404 })
    }

    // If it already has tags, we don't auto-tag again to avoid overriding human tags
    if (conversation.tags && conversation.tags.length > 0) {
      return new Response(JSON.stringify({ message: "Already tagged" }), { headers: { "Content-Type": "application/json" } })
    }

    if (!messageContent || messageContent.trim() === '') {
      return new Response(JSON.stringify({ message: "Empty message" }), { headers: { "Content-Type": "application/json" } })
    }

    // 3. Call Anthropic AI to classify
    const aiPrompt = `You are a helpful assistant that classifies customer support messages into exactly one of the following tags:
- Sales (for pre-sales, pricing, plan comparisons, buying queries)
- Billing (for invoices, payment issues, refunds, card issues)
- Tech (for technical support, cPanel, errors, domains, hosting issues)

Read the following message from a customer and reply ONLY with the category name (Sales, Billing, or Tech). If unsure, guess the closest one.
Message: "${messageContent}"`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 10,
        messages: [{ role: "user", content: aiPrompt }]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Anthropic error:", errorText);
      return new Response(JSON.stringify({ error: "AI failed", details: errorText }), { status: 500 })
    }

    const aiData = await response.json()
    const aiText = aiData.content[0].text.trim()

    let newTag = "Tech" // Default fallback
    if (aiText.toLowerCase().includes("sales")) newTag = "Sales"
    else if (aiText.toLowerCase().includes("billing")) newTag = "Billing"
    else if (aiText.toLowerCase().includes("tech")) newTag = "Tech"

    // 4. Update the conversation with the new tag
    const { error: updateError } = await supabase
      .from('conversations')
      .update({ tags: [newTag] })
      .eq('id', conversationId)

    if (updateError) {
      return new Response(JSON.stringify({ error: "Failed to update tags" }), { status: 500 })
    }

    return new Response(JSON.stringify({ success: true, tag: newTag }), { headers: { "Content-Type": "application/json" } })
  } catch (error) {
    console.error(error)
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }
})
