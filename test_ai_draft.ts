import { generateAiDraft } from './src/actions/ai';

async function test() {
  const result = await generateAiDraft("customer: ভাই, আপনাদের হোস্টিং ভালো নাকি Hostinger? কেন আপনাদেরটা নিবো?");
  console.log("Draft:", result.text);
}

test();
