import { generateAiDraft } from './src/actions/ai';

async function test() {
  console.time('generateAiDraft');
  const res = await generateAiDraft("Customer: I want to renew my hosting", "John", "some-org-id");
  console.timeEnd('generateAiDraft');
  console.log(res);
}

test();
