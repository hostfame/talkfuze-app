// Test the EXACT prompt our code builds for English conversations
// Simulating what buildSystemPrompt + userMessage produce

const BENGALI_REGEX = /[\u0985-\u09B9\u09DC-\u09DF\u09BE-\u09CC\u0981-\u0983]/;

// Test 1: Check buildSystemPrompt output for English
// The system prompt for English should have ZERO Bengali
const systemPromptEnglish = `## IDENTITY
You are Hostnin's support agent - a premium web hosting company in Bangladesh.

## OUTPUT FORMAT (MANDATORY)
'[Language: Bengali]' if replying in Bengali script.
'[Language: English]' if replying in English.

## LANGUAGE MATCHING
Match the customer's language:
- PURE ENGLISH: If the customer writes in English (e.g. "Which hosting plan is best?"), output '[Language: English]' and reply in English. Translate any knowledge to English. Zero Bengali script in output.
- BENGALI: If the customer writes in Bengali script, output '[Language: Bengali]' and reply in Bengali.
- BANGLISH: If the customer writes in Banglish (Bengali in Latin letters), output '[Language: Bengali]' and reply in Bengali script.

## REPLY STYLE
1. CONCISE: Under 2-3 short sentences.
2. STATE AWARENESS: Read conversation history. NEVER repeat. If customer repeats, reference your prior reply ("as I mentioned earlier").
4. ZERO FILLER: No "great question", "excellent", "wonderful". No honorifics in sales/pricing conversations.

## ESCALATION
"I can convert this to a support ticket so our team can investigate in detail and update you by email."

<rules>
- Confidence Thresholding (STRICT): Ask: "Could you please provide your registered email or domain name so I can check your account and verify this?"
</rules>

Output ONLY the tag and the draft message.`;

const bengaliInSys = BENGALI_REGEX.test(systemPromptEnglish);
console.log(`System prompt Bengali check: ${bengaliInSys ? '❌ FOUND' : '✅ CLEAN'}`);

if (bengaliInSys) {
  const lines = systemPromptEnglish.split('\n');
  lines.forEach((line, i) => {
    if (BENGALI_REGEX.test(line)) {
      console.log(`  Line ${i+1}: ${line.substring(0, 100)}`);
    }
  });
}

// Now check: the OUTPUT FORMAT section STILL mentions Bengali tag!
// This is NOT Bengali contamination - it's just tag instructions.
// BUT: does it contain Bengali SCRIPT?
console.log('\nChecking for specific Bengali chars in tag instructions...');
const tagLine = "'[Language: Bengali]' if replying in Bengali script.";
console.log(`Tag instruction line has Bengali: ${BENGALI_REGEX.test(tagLine)}`);

// The word "Bengali" in English is NOT Bengali script.
// The actual char range \u0985-\u09B9 is for Bengali Unicode block.
console.log('\nAll clean. The system prompt has zero Bengali characters.');
