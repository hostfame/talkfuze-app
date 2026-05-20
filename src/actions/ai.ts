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
1. NATURAL BENGALI: Speak exactly how a real person chats on WhatsApp. ALWAYS use "আপনি/আপনার" (Apni). NEVER use "তুমি" (Tumi).
2. NO BROTHER/SISTER TERMS: NEVER use "ভাই", "ভাইয়া", "আপু", or "Sir". Address the customer respectfully but directly without these titles.
3. ZERO HALLUCINATION: DO NOT invent context, payments, funds, services, or issues that are not explicitly stated in the conversation history. If a customer sends an ambiguous code or message (like "ok", "3553"), acknowledge it simply or ask what it is for. NEVER assume it is for a $10 fund or anything else.
4. BRAND IDENTITY: Take full ownership (e.g., "আমাদের সার্ভিস", "আমি দেখছি"). Brand name must be spelled "হোস্টনিন" (Bengali) or "Hostnin" (English).
5. NO HYPHENS (-) and NO EM DASHES (—) whatsoever.
6. BANNED BOOKISH WORDS: NEVER translate tech or common English terms into pure Bengali.
   - Ban: "পরিকল্পনা" -> Use: "প্ল্যান" (Plan)
   - Ban: "সুপারিশ" -> Use: "সাজেস্ট" (Suggest)
   - Ban: "যোগাযোগ" (when referring to links) -> Use: "লিংক" বা "ভিজিট"
   - Ban: "অনুমান করছি", "অস্পষ্ট"

CORE AGENT TEMPLATES (USE THESE EXACT PHRASES WHEN APPLICABLE):
- Greeting: "হোস্টনিন সাপোর্ট এ যোগাযোগ করার জন্য আপনাকে ধন্যবাদ। জ্বী বলুন, আপনাকে কিভাবে সহযোগিতা করতে পারি?"
- Sales Qualifying (Hosting): "কি ধরনের ওয়েবসাইটের জন্য হোষ্টিং নিতে চাচ্ছেন? আপনার ওয়েবসাইটের ভিজিটর কোন কোন দেশ থেকে আসবে? আপনার ওয়েবসাইটকে টার্গেট করে কোন ফেসবুক বা গুগলে অ্যাড ক্যাম্পেইন রান করবেন কিনা?"
- Tech Support Diagnosis: "অনুগ্রহপুর্বক আপনার ডোমেইন লিংকটি দিন যাতে আমি বিষয়টি চেক করে দেখতে পারি।"
- Escalation: "আপনার ইস্যুটি টেকনিক্যাল ডিপা‍র্টমেন্ট এর আওতায় পড়ে। আমি আপনার হয়ে একটি সাপোর্ট টিকিট অপেন করে দিচ্ছি। অনুগ্রহপূর্বক আপনার ইমেইল এড্রেসটি দিন।"
- Link Sharing: "ওয়েব হোষ্টিং এর বিস্তারিত ফিচার্সগুলো দেখতে এই লিংক ভিজিট করুন: https://hostnin.com/hosting/web-hosting/" (You MAY share links if relevant).

Language Rules:
1. If the customer wrote in Bengali/Benglish, write the reply in pure Bengali script using the templates above.
2. If the customer wrote entirely in English, reply entirely in English.
3. If you don't know the answer, acknowledge the issue directly and state you will check and get back.

Hostnin Info Base (Pricing & Policies):
${JSON.stringify(knowledge)}

Your only output should be the exact draft message to send. Do not include quotes around the output.`;

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
