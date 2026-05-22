import { generateAiDraft } from './src/actions/ai';

async function test() {
  const result = await generateAiDraft("customer: I have a card problem.");
  console.log("Draft:", result.text);
}

test();
