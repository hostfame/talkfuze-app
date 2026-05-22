require('dotenv').config({path: '.env.local'});
import OpenAI from 'openai';
import knowledge from '../src/actions/hostnin-knowledge.json';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || 'no-key' });

async function test() {
  console.time('OpenAI Execution');
  try {
    const res = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: `You are a support agent. KB: ${JSON.stringify(knowledge)}` },
        { role: 'user', content: 'My domain is not working' }
      ]
    });
    console.timeEnd('OpenAI Execution');
    console.log(res.usage);
  } catch(e) {
    console.log("Error:", e.message);
  }
}
test();
