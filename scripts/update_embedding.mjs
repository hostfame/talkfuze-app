import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import WebSocket from 'ws';

globalThis.WebSocket = WebSocket;

// If running from scratch dir, we need to load .env.local from Talkfuze workspace
const workspacePath = '/Users/imran/Documents/Talkfuze';
dotenv.config({ path: path.join(workspacePath, '.env.local') });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function run() {
  const { data, error } = await supabase.from('ai_knowledge_base')
    .select('id, question, answer')
    .filter('embedding', 'is', 'null');
    
  if (error) {
    console.error("Fetch error:", error);
    return;
  }
  
  if (!data || data.length === 0) {
    console.log("No null embeddings found.");
    return;
  }
  
  console.log(`Found ${data.length} records with null embeddings.`);
  
  for (const row of data) {
    const embeddingText = `Question: ${row.question}\nAnswer: ${row.answer}`;
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: embeddingText.substring(0, 8000),
      dimensions: 1536
    });
    
    const embedding = response.data[0].embedding;
    
    const { error: updateError } = await supabase.from('ai_knowledge_base')
      .update({ embedding })
      .eq('id', row.id);
      
    if (updateError) {
      console.error(`Error updating id ${row.id}:`, updateError);
    } else {
      console.log(`Updated embedding for rule ${row.id}`);
    }
  }
}

run().catch(console.error);
