"use server";

export async function generateAiDraft(contextMessages: string, contactName: string = "Customer"): Promise<{ success: boolean; text?: string; error?: string }> {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return { success: false, error: "Anthropic API key is not configured." };
    }

    // Hostnin knowledge base for the AI
    const systemPrompt = `You are a helpful customer support agent for Hostnin. 
Draft a reply to the customer based on the conversation history provided.

Rules:
1. Be polite, professional, and helpful.
2. Reply in the language the customer used (Bengali/Benglish/English).
3. Keep the reply concise and direct. Do not add fluff.
4. If you don't know the answer, acknowledge the issue and say you will check and get back to them.

Hostnin Info:
- Active Hosting Plans: Web, Cloud, BDIX, WordPress, WooCommerce, Node.js.
- Terms & Conditions: Must be followed for all services. Abuse/spam leads to termination.
- Refund Policy: 30-day money-back guarantee for new hosting plans. Domains/licenses are non-refundable.
- Affiliate Policy: 20% recurring commission on referrals. Payout minimum applies.
- Website: hostnin.com
- Support Link: hostnin.com/contact

Your only output should be the exact draft message to send. Do not include quotes around the output or conversational filler.`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 500,
        system: systemPrompt,
        messages: [
          {
            role: "user",
            content: `Customer Name: ${contactName}\n\nConversation History:\n${contextMessages}\n\nDraft a reply from the agent's perspective.`,
          },
        ],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("Anthropic API Error:", err);
      return { success: false, error: "Failed to generate AI draft. Please try again." };
    }

    const data = await response.json();
    const draftText = data.content?.[0]?.text;

    if (!draftText) {
      return { success: false, error: "AI returned an empty response." };
    }

    return { success: true, text: draftText.trim() };
  } catch (error: any) {
    console.error("AI Generation failed:", error);
    return { success: false, error: error.message || "An unexpected error occurred." };
  }
}
