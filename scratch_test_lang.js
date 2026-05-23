require('dotenv').config({ path: '.env.local' });

const API_KEY = process.env.ANTHROPIC_API_KEY;

const tests = [
  { label: "ENGLISH", customerMsg: "Whatever", context: "[Istiak Ahmed]: Tell me about the starter plan\n[Agent]: The Starter plan is our most popular choice. Pricing wise, it's ৳999/month if you pay monthly, or ৳395/month yearly.\n[Istiak Ahmed]: The price is quite high this time\n[Istiak Ahmed]: Whatever" },
  { label: "BENGALI", customerMsg: "জ্বী ভাইয়া, আমার সাইট ডাউন", context: "[Rahim]: জ্বী ভাইয়া, আমার সাইট ডাউন" },
  { label: "BANGLISH", customerMsg: "vai amr site down hoise", context: "[Karim]: vai amr site down hoise" },
];

async function testDraft(test) {
  console.log(`\n${'='.repeat(60)}\nTEST: ${test.label} | Input: "${test.customerMsg}"\n${'='.repeat(60)}`);

  const conversationLines = test.context.split('\n').map(l => l.trim()).filter(Boolean);
  const customerLines = conversationLines.filter(l => !l.startsWith('[Agent]') && !l.startsWith('[System]'));
  const lastCustomerLine = customerLines[customerLines.length - 1] || '';
  const latestCleaned = lastCustomerLine.replace(/^\[[^\]]+\]:\s*/, '').trim();

  const userMessage = `The customer's latest message is: "${latestCleaned}"
Match the language of this message in your reply.

FORMATTING & BREVITY:
- Keep response 3-4 short sentences max.

## Hostnin Knowledge (use ONLY if relevant)
No specific knowledge needed for this test.

Customer Name: Test Customer

Conversation:
${test.context}

Draft a smart, helpful reply as the support agent.`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 300,
      system: [{ type: "text", text: `You are a sharp, highly experienced senior customer support agent at Hostnin (a premium web hosting company in Bangladesh).

## LANGUAGE MATCHING (HIGHEST PRIORITY)
You MUST reply in the SAME language the customer is currently speaking in their most recent message.
- If their latest message is in English (including messages with Bengali currency symbols like ৳), reply in English.
- If their latest message contains Bengali script letters or is in Banglish (Bengali words in Latin letters like "vai", "apni", "hobe", "bhai"), reply in Bengali script.
- IGNORE the language of older messages, audio transcripts, agent replies, example responses, or pitch scripts in this prompt. ONLY the customer's latest message determines your reply language.

## LANGUAGE STYLE GUIDELINES
If replying in English:
- Use natural conversational contractions ("I'll", "we've", "don't"). Talk like a human, not a robot.

If replying in Bengali:
- Write casual WhatsApp-style Bengali, NOT bookish/textbook/corporate Bengali.
- Use transliterated English words: লস (not ক্ষতি), সেলস (not বিক্রয়), প্রবলেম/ইস্যু (not সমস্যা), প্লিজ (not অনুগ্রহপূর্বক), দরকার (not প্রয়োজন).
- ALWAYS use "আপনি/আপনার". NEVER use "তুমি/তোমার".
- Use polite verb forms: "জানাতে পারেন" (not "জানান"), "করতে পারবেন" (not "করেন").
- Write ENTIRELY in Bengali script, no English letters except URLs.
- Transliterate brand names: "Hostnin" = "হোষ্টনিন".

NO EMOJIS EVER.
Output ONLY the draft message.` }],
      messages: [{ role: "user", content: userMessage }],
    }),
  });

  const data = await res.json();
  const output = data.content?.[0]?.text || 'ERROR';
  
  const hasBengali = /[\u0985-\u09B9\u09DC-\u09DF\u09BE-\u09CC\u0981-\u0983]/.test(output);
  console.log(`OUTPUT: ${output}`);
  console.log(`CONTAINS BENGALI: ${hasBengali}`);
  console.log(`VERDICT: ${test.label === 'ENGLISH' ? (hasBengali ? '❌ FAIL' : '✅ PASS') : (hasBengali ? '✅ PASS' : '❌ FAIL')}`);
}

(async () => {
  for (const t of tests) await testDraft(t);
})();
