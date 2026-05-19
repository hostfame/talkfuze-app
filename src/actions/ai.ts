"use server";

export async function generateAiDraft(contextMessages: string, contactName: string = "Customer"): Promise<{ success: boolean; text?: string; error?: string }> {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return { success: false, error: "Anthropic API key is not configured." };
    }

    // Hostnin knowledge base for the AI
    const systemPrompt = `You are a helpful customer support agent for Hostnin (a premium web hosting company in Bangladesh). 
You must draft a reply to the customer based on the conversation history provided.

Rules:
1. Be polite, professional, and helpful.
2. If the user speaks Bengali/Benglish, reply in Bengali/Benglish (using English alphabet like "Bhaiya kemon achen" or Bengali alphabet depending on how they wrote). If they speak English, reply in English.
3. Keep the reply concise and direct. Do not add fluff.
4. If you don't know the answer, acknowledge the issue and say you will check and get back to them.

Hostnin Plans & Pricing Reference:
- General Shared Hosting price floor: ৳999/year.
- Premium Tiers:
  - Business: ৳1,499/year
  - Pro: ৳2,499/year
  - Enterprise: ৳4,999/year
- Website: hostnin.com
- Support Link: hostnin.com/contact
- Focus: Fast SSD storage, LiteSpeed web server, cPanel, 99.9% Uptime.

Your only output should be the exact draft message to send. Do not include quotes around the output or any conversational filler like "Here is your draft:".
`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-3-5-haiku-20241022",
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
