import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import WebSocket from 'ws';

globalThis.WebSocket = WebSocket;
dotenv.config({ path: path.resolve('.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !supabaseKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
const supabase = createClient(supabaseUrl, supabaseKey);

const openaiApiKey = process.env.OPENAI_API_KEY;
if (!openaiApiKey) {
  console.error("Missing OPENAI_API_KEY");
  process.exit(1);
}
const openai = new OpenAI({ apiKey: openaiApiKey });

async function run() {
  console.log("Fetching all canned_replies to update with variations...");
  const { data: replies, error } = await supabase
    .from('canned_replies')
    .select('id, shortcut, content, category');

  if (error) {
    console.error("Error fetching canned_replies:", error);
    process.exit(1);
  }

  if (!replies || replies.length === 0) {
    console.log("No canned replies need updating.");
    process.exit(0);
  }

  console.log(`Found ${replies.length} replies to process.`);

  for (const reply of replies) {
    console.log(`\nProcessing: ${reply.shortcut}`);
    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `You are an AI assistant helping to categorize support team canned replies for vector search. 
Given the canned reply text, your job is to write 2 to 3 natural customer questions or problem statements that this reply answers, separated by the '|' character. 
CRITICAL RULES:
1. Provide variations (e.g., one formal, one casual, one problem-focused).
2. REDUCE CONFUSION WITH EXPLICIT BOUNDARIES: If the reply is clearly for a specific platform (e.g., cPanel, WordPress, VPS, Cloudflare, bkash), you MUST explicitly state that restriction in the questions. Example: "How to install SSL? (ONLY for cPanel, do NOT use for CyberPanel) | My cPanel SSL failed".
3. Write from the customer's perspective.
4. Do not include quotes or extra text. Output ONLY the variations separated by '|'.`
          },
          {
            role: 'user',
            content: `Category: ${reply.category}\nShortcut: ${reply.shortcut}\nReply Content: ${reply.content}`
          }
        ],
        temperature: 0.3,
        max_tokens: 150,
      });

      let question = response.choices[0].message.content.trim();
      question = question.replace(/^["']|["']$/g, ''); // Remove surrounding quotes if any

      console.log(`Generated Question: ${question}`);

      const { error: updateError } = await supabase
        .from('canned_replies')
        .update({ semantic_question: question })
        .eq('id', reply.id);

      if (updateError) {
        console.error(`Failed to update ${reply.shortcut}:`, updateError);
      } else {
        console.log(`Updated successfully.`);
      }

    } catch (e) {
      console.error(`Failed to process ${reply.shortcut}:`, e);
    }
  }
  
  console.log("\nDone generating semantic questions!");
}

run();
