import { generateAiDraft } from './src/actions/ai';

async function test() {
  const result = await generateAiDraft("customer: outlook e code gece den\ncustomer: ok sent\ncustomer: 3553");
  console.log("Draft:", result.text);
}

test();
