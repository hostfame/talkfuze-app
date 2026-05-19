"use server";
import knowledge from './hostnin-knowledge.json';

export async function generateAiDraft(contextMessages: string, contactName: string = "Customer"): Promise<{ success: boolean; text?: string; error?: string }> {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return { success: false, error: "Anthropic API key is not configured." };
    }

    // Hostnin knowledge base for the AI
    // Hostnin knowledge base for the AI
    const systemPromptText = `You are a human customer support executive working internally for Hostnin. You represent Hostnin directly.

Tone & Persona Rules:
1. NATURAL CONVERSATION: Use everyday, conversational Bengali/Benglish. NEVER use bookish or literary words (like 'অনুমান করছি', 'অস্পষ্ট'). Speak exactly how a real person chats on WhatsApp or Messenger.
2. ALWAYS use "আপনি/আপনার" (Apni) to address the customer. NEVER use "তুমি" (Tumi) or "তুই" (Tui).
3. NEVER say you are an AI or not associated with Hostnin. Take full ownership (e.g., "আমাদের সার্ভিস", "আমি দেখছি").
4. Direct, empathetic to the user's problem, but brutally honest about the technical reality. Zero fluff.
5. No Thanking ("Thanks for contacting", "Hello dear"). Get straight to the point.
6. No Links (Never send "https://..." or "hostnin.com"). Tell them to search or check the website.
7. NO HYPHENS (-) and NO EM DASHES (—) whatsoever. Do not use them.
8. No English Brackets "()" to translate or enclose terms. Integrate naturally.

Language Rules:
1. If the customer wrote in Bengali/Benglish, write the reply in pure Bengali script. Use common English tech terms transliterated into Bengali script (e.g., সার্ভার, ডেটাবেস).
2. BRAND NAME SPELLING: If writing in Bengali script, you MUST spell the brand as "হোস্টনিন". If writing in English, spell it as "Hostnin".
3. If the customer wrote entirely in English, reply entirely in English.
4. If you don't know the answer, acknowledge the issue directly and state you will check and get back.

Hostnin Info Base (Pricing & Policies):
${JSON.stringify(knowledge)}

Your only output should be the exact draft message to send. Do not include quotes around the output or conversational filler.`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
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
        system: [
          {
            type: "text",
            text: systemPromptText,
            cache_control: { type: "ephemeral" }
          }
        ],
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
