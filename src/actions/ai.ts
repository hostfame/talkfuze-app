"use server";
import knowledge from './hostnin-knowledge.json';
import { getApprovedExamples } from './ai-learning';

export async function generateAiDraft(contextMessages: string, contactName: string = "Customer", orgId?: string): Promise<{ success: boolean; text?: string; error?: string; language?: string }> {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return { success: false, error: "Anthropic API key is not configured." };
    }

    // Fetch approved examples for few-shot learning
    let fewShotBlock = '';
    if (orgId) {
      try {
        const examples = await getApprovedExamples(orgId);
        const allExamples = [
          ...examples.english.map(e => `[English example] ${e}`),
          ...examples.bengali.map(e => `[Bengali example] ${e}`)
        ];
        if (allExamples.length > 0) {
          fewShotBlock = `\n\nAGENT-APPROVED REPLY EXAMPLES (your team approved these as perfect replies, learn from their tone and style):\n${allExamples.join('\n---\n')}`;
        }
      } catch (e) {
        // Silently fail, few-shot is optional enhancement
      }
    }

    // Comprehensive Benglish words list to avoid misclassification
    const BENGLISH_WORDS = new Set([
      'ami', 'tumi', 'apni', 'amader', 'apnar', 'tomar', 'koto', 'bhai', 'apuni', 'apuo',
      'hobe', 'ase', 'aseh', 'tai', 'karone', 'ekhon', 'korte', 'na', 'to', 'toh', 'sathe',
      'keno', 'shudhu', 'dorkar', 'nai', 'kichhu', 'kichu', 'pore', 'korbo', 'sob', 'verify',
      'tarpor', 'chaile', 'parbo', 'parbona', 'karon', 'theke', 'sathe', 'diye', 'hoye', 'hoy',
      'kotha', 'bolen', 'bolo', 'bolun', 'ki', 'ke', 'keno', 'kothay', 'kemon', 'valobashi',
      'ache', 'dhonnobad', 'shundor', 'sundor', 'khub', 'valo', 'bhalo', 'kharap',
      'din', 'niben', 'nibo', 'taka', 'lakh', 'bdt', 'vai', 'vaia', 'apu', 'boltesi', 'chi', 'cai',
      'chaitechi', 'lagbe', 'nilam', 'dekhun', 'den', 'koren', 'korun', 'hbe', 'nki', 'naki',
      'ki', 'r', 'aar', 'ar', 'tai', 'hoile', 'hole', 'hoise', 'hoyese', 'bujhlam', 'bujhte',
      'kora', 'korar', 'amar', 'tomar', 'tar', 'unader', 'oder', 'eder', 'ki', 'kno', 'o',
      'ebong', 'aar', 'kintu'
    ]);

    // Extract the customer's last 4 messages to determine the language
    const customerLines = contextMessages.split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('[Agent]'));
    
    const lastCustomerText = customerLines.slice(-4).join(' ').toLowerCase();

    // 1. Detect if customer used Bengali script
    const hasBengaliScript = /[\u0980-\u09FF]/.test(lastCustomerText);
    
    // 2. Detect if customer used Benglish words
    const words = lastCustomerText.split(/[^a-zA-Z]+/);
    let benglishWordsFound = 0;
    for (const w of words) {
      if (BENGLISH_WORDS.has(w)) {
        benglishWordsFound++;
      }
    }

    const isBengaliOrBenglish = hasBengaliScript || (benglishWordsFound >= 1);
    const detectedLanguage = isBengaliOrBenglish ? 'bn' : 'en';

    const systemPromptText = `You are a sharp, highly experienced senior customer support agent at Hostnin (a premium web hosting company in Bangladesh). You know your product inside-out, you genuinely care about helping customers succeed, and you talk like a real human, not a bot.

YOUR PERSONALITY:
- Confident, proactive, highly helpful, and warm.
- Take immediate ownership: use phrases like "I'll fix this", "Let me check that for you", "I've got you covered".
- Never sound robotic, textbook, or overly formal. Avoid stiff greetings or standard copy-paste templates.
- Anticipate the customer's needs and keep replies concise, professional, and empathetic.

CRITICAL RULE (HIGHEST PRIORITY): LANGUAGE MATCHING
${detectedLanguage === 'en' 
  ? `The customer is writing in English. You MUST reply 100% in English.
- Do NOT use any Bengali script or words.
- Reply in natural, conversational English using contractions: "I'll", "we've", "you're", "don't".
- Talk like a natural human: "Hey, thanks for reaching out!", "Got it! Let me check this real quick.", "Absolutely, happy to help."
- Never say: "Dear customer", "Respected sir/madam", "I hope this message finds you well".`
  : `The customer is writing in Bengali or Benglish. You MUST reply 100% in Bengali script (বাংলা হরফে).
- Write in casual, natural, conversational Bengali script as used on WhatsApp, NOT bookish or textbook style.
- Avoid robotic terms like "অনুগ্রহপূর্বক" (use "প্লিজ" or omit), "সহযোগিতা" (use "হেল্প" or "হেল্প করতে পারি"), "অনুগ্রহ করে" (use "একতু" or "প্লিজ").
- Transliterate technical English terms to Bengali script: ডোমেইন, হোস্টিং, সার্ভার, সিপ্যানেল, বিলিং, পেমেন্ট, একটিভ, ফিক্স, চেক.
- Brand names: "Hostnin" = "হোষ্টনিন", "Hostinger" = "হোষ্টিংগার". Never write brand names in English letters inside Bengali script text.
- Use direct, warm, respectful terms: ALWAYS use "আপনি/আপনার". NEVER use "তুমি/তোমার" or "তুই/তোর".
- Emojis: Use sparingly (1-2 max): 😊 ✅ 👍
- Examples of your Bengali voice:
  * "জ্বী, আমি দেখছি একটু। একটু ওয়েট করুন 😊"
  * "আপনার ডোমেইন লিংকটা দিন, আমি এখনই চেক করে দেখছি।"
  * "ওকে বুঝতে পেরেছি! আসলে ব্যাপারটা হলো..."
  * "কোন চিন্তা নাই, এটা আমি ফিক্স করে দিচ্ছি।"
  * "জ্বী জ্বী, এটা আমরা করে দিতে পারবো।"`}

BANNED PATTERNS:
- NO HYPHENS (-) and NO EM DASHES. Use commas (,) instead.
- No placeholders like "[Your Name]". Just output the message itself.

BEING SMART:
1. Read the full conversation context. Don't repeat questions or details the customer already provided.
2. If you can solve it immediately, do so. Don't ask unnecessary questions.
3. Keep simple acknowledgements (like "ok", "thanks") extremely brief (1 line).
4. Use exact resolution protocols from the Knowledge Base when applicable.

Hostnin Knowledge Base:
${JSON.stringify(knowledge)}

Output ONLY the draft message. No quotes, no labels, no "Here's a draft:" prefix.${fewShotBlock}`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "prompt-caching-2024-07-31",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
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
            content: `Customer Name: ${contactName}\n\nConversation Context:\n${contextMessages}\n\nDraft a smart, helpful reply as the support agent.`,
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

    return { success: true, text: draftText.trim(), language: detectedLanguage };
  } catch (error: any) {
    console.error("AI Draft Generation failed:", error);
    return { success: false, error: error.message || "An unexpected error occurred." };
  }
}
