import WebSocket from 'ws';
globalThis.WebSocket = WebSocket;
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve('.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const openaiApiKey = process.env.OPENAI_API_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);
const openai = new OpenAI({ apiKey: openaiApiKey });

async function run() {
  const queryText = "How do I use Cloudflare for my domain DNS?";
  const embeddingRes = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: queryText,
    dimensions: 1536
  });
  const query_embedding = embeddingRes.data[0].embedding;

  const { data: vectorDocs, error } = await supabase.rpc('match_knowledge', {
    query_embedding,
    match_threshold: 0.50,
    match_count: 5
  });

  if (error) console.error("RPC Error:", error);
  
  console.log("Docs retrieved for query:", queryText);
  vectorDocs.forEach(d => {
    console.log(`- SIMILARITY: ${d.similarity.toFixed(3)} | Q: ${d.question}`);
  });
}
run();
