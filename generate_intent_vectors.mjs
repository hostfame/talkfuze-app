import fs from 'fs';
import OpenAI from 'openai';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function run() {
  const intents = {
    technical: "technical support issue error down dns nameserver ip address cpanel database connection failed speed slow bug",
    sales: "sales pricing buy purchase plan package how much cost bucks upgrade order domain affiliate commission",
    billing: "billing refund money back guarantee cancel invoice renew payment method transfer domain suspended"
  };

  const results = {};
  for (const [intent, text] of Object.entries(intents)) {
    console.log(`Generating embedding for ${intent}...`);
    const res = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: text,
      dimensions: 1536
    });
    results[intent] = res.data[0].embedding;
  }

  fs.writeFileSync('src/actions/intent-vectors.json', JSON.stringify(results));
  console.log('Saved to src/actions/intent-vectors.json');
}
run();
