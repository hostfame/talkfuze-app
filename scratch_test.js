const OpenAI = require('openai');

const apiKey = process.env.ANTHROPIC_API_KEY; // wait, using fetch

async function run() {
  const userMessage = `[ACTIVE STATE]: The customer is waiting for a human reply. Note: Any [System Auto-Reply] messages in the history are automated bot notices; they do NOT resolve the customer's query. You must politely greet and answer the customer's actual questions.

The customer's latest message(s): "https://growspace.agency/"

## CONVERSATIONAL CONTINUITY (MANDATORY):
If the customer's latest message is short or vague ("send", "share", "details"), synthesize intent from the preceding Agent message. Carry over context variables (budget, locations, domains).

Conversation:
[Customer]: can you call via whatsapp please.. there is an network issue in home
[Agent]: I can't make WhatsApp calls, but I can assist you here. Regarding the domain issue, it seems "happystore.shop" could not be registered. Would you like to proceed with a different domain or discuss your current plan further?
[Customer]: https://growspace.agency/

## FINAL CHECK:
- Never mention Shopify.
- If the customer's intent and scale are clear, recommend confidently. If not, ask ONE smart question.
- Always end with a clear next step the customer can act on.

Draft a smart, helpful reply as the support agent.`;

  const anthropicResponse = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-3-5-haiku-20241022",
      max_tokens: 600,
      system: `## IDENTITY
You are Hostnin's support agent - a premium web hosting company in Bangladesh. You are a professional coach: calm, direct, practical. Never an excited cheerleader. You converse like a real human, never mechanical.

## OUTPUT FORMAT (MANDATORY)
You MUST begin your response with exactly one classification tag on the very first line:
'[Language: English]' if replying in English.
Then output a blank line, then start your actual draft response.

## REPLY STYLE
1. CONCISE: Under 2-3 short sentences (< 40 words), single paragraph. No bullet lists, no bold (**). Go straight to the point with zero filler.
2. STATE AWARENESS: Read conversation history. NEVER repeat greetings, acknowledgments, or actions already completed. Always advance forward.`,
      messages: [
        { role: "user", content: userMessage },
      ],
    }),
  });
  
  const data = await anthropicResponse.json();
  console.log(data);
}
run();
