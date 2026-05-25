require('dotenv').config({ path: '.env.local' });
globalThis.WebSocket = require('ws');
const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function run() {
  console.log("Fetching messages with objection keywords...");
  
  const keywords = ['বাজেট', 'দাম', 'বেশি', 'discount', 'price', 'কম', 'try', 'test', 'hidden', 'renew', 'kisti', 'masher', 'komano', 'bdix', 'cpanel'];
  let convIds = new Set();
  
  for (const kw of keywords) {
    const { data } = await supabase.from('messages')
      .select('conversation_id')
      .ilike('content', `%${kw}%`)
      .limit(50); 
    
    if (data) data.forEach(d => convIds.add(d.conversation_id));
  }
  
  const cids = Array.from(convIds);
  console.log(`Found ${cids.length} unique conversations. Extracting Q&A pairs via AI...`);
  
  let allQA = [];
  const limitCids = cids.slice(0, 100); // 100 conversations should yield plenty of unique ones
  for (let i = 0; i < limitCids.length; i++) {
    const cid = limitCids[i];
    const { data: msgs } = await supabase.from('messages')
      .select('content,sender_type,created_at')
      .eq('conversation_id', cid)
      .order('created_at', { ascending: true });
      
    if (!msgs || msgs.length < 2) continue;
    
    const chatLog = msgs.map(m => `[${m.sender_type.toUpperCase()}]: ${m.content}`).join('\n');
    
    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "You are an expert sales analyst at Hostnin. Extract ONE or TWO main customer objections/questions and the agent's professional resolution from this chat. Output ONLY valid JSON containing a 'pairs' array: { \"pairs\": [{ \"question\": \"Bengali customer question\", \"answer\": \"Agent's response\" }] }"
          },
          { role: "user", content: chatLog }
        ],
        response_format: { type: "json_object" }
      });
      
      const parsed = JSON.parse(completion.choices[0].message.content);
      if (parsed.pairs) {
        allQA.push(...parsed.pairs);
      }
      process.stdout.write('.');
    } catch (e) {
      process.stdout.write('x');
    }
  }
  
  console.log(`\n\nExtracted ${allQA.length} total Q&A pairs! Deduplicating...`);
  
  const uniqueQA = [];
  const seen = new Set();
  for (const qa of allQA) {
    if (qa.question && qa.answer) {
      // Very rough deduplication to avoid exact identical questions
      const key = qa.question.substring(0, 30);
      if (!seen.has(key)) {
        seen.add(key);
        uniqueQA.push(qa);
      }
    }
  }
  
  console.log(`Final unique objections: ${uniqueQA.length}`);
  
  const outPath = path.resolve(__dirname, '../scratch/all_extracted_objections.json');
  fs.writeFileSync(outPath, JSON.stringify(uniqueQA, null, 2));
  console.log(`Saved ${uniqueQA.length} objections to scratch/all_extracted_objections.json`);
}

run().catch(console.error);
