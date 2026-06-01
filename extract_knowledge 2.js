const fs = require('fs');
const readline = require('readline');
const { createClient } = require('@supabase/supabase-js');
const { OpenAI } = require('openai');

// Load environment variables manually
const envFile = fs.readFileSync('.env.local', 'utf8');
const envVars = {};
envFile.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
        let key = match[1].trim();
        let val = match[2].trim();
        if (val.startsWith('"') && val.endsWith('"')) {
            val = val.substring(1, val.length - 1);
        }
        envVars[key] = val;
    }
});

// No supabase client

const openai = new OpenAI({
  apiKey: envVars['OPENAI_API_KEY']
});

async function main() {
    console.log("Loading TSV...");
    const fileStream = fs.createReadStream('/Users/imran/Documents/Nina/chat_history_full.tsv');
    const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

    const chats = {};

    for await (const line of rl) {
        const parts = line.split('\t');
        if (parts.length < 9) continue;
        const [index, chatId, userId, name, role, message, p1, p2, date] = parts;
        
        if (!chats[chatId]) chats[chatId] = [];
        chats[chatId].push({ role, message, date });
    }

    console.log(`Loaded ${Object.keys(chats).length} chats. Extracting Q&A...`);

    const qaPairs = [];
    
    for (const chatId in chats) {
        const msgs = chats[chatId].sort((a, b) => new Date(a.date) - new Date(b.date));
        
        let currentUserMsg = "";
        
        for (let i = 0; i < msgs.length; i++) {
            const m = msgs[i];
            if (m.role === 'user') {
                currentUserMsg += m.message + " ";
            } else if (m.role === 'assistant') {
                if (currentUserMsg.trim().length > 10) {
                    let answer = m.message;
                    while(i + 1 < msgs.length && msgs[i+1].role === 'assistant') {
                        i++;
                        answer += " \n" + msgs[i].message;
                    }
                    
                    if (!answer.includes("technical issue while processing") && 
                        !answer.includes("I'd love to help! Could you tell me") &&
                        !answer.includes("I'll connect you with a live agent") &&
                        answer.length > 20) {
                        qaPairs.push({
                            question: currentUserMsg.trim(),
                            answer: answer.trim()
                        });
                    }
                }
                currentUserMsg = "";
            }
        }
    }

    console.log(`Extracted ${qaPairs.length} raw Q&A pairs.`);
    
    // Deduplicate
    const uniquePairs = [];
    const seenQs = new Set();
    for(const pair of qaPairs) {
        if(!seenQs.has(pair.question) && pair.question.split(' ').length <= 200) { // Avoid massively long spam texts
            seenQs.add(pair.question);
            uniquePairs.push(pair);
        }
    }
    
    console.log(`Processing ${uniquePairs.length} unique Q&A pairs to Vector DB...`);

    let inserted = 0;
    
    for(let i=0; i < uniquePairs.length; i+=100) {
        const batch = uniquePairs.slice(i, i+100);
        console.log(`Batch ${Math.floor(i/100) + 1} (${batch.length} items)...`);
        
        const questions = batch.map(b => b.question);
        
        try {
            const embeddingResponse = await openai.embeddings.create({
                model: 'text-embedding-3-small',
                input: questions,
                dimensions: 1536
            });
            
            const insertData = batch.map((pair, index) => ({
                question: pair.question,
                answer: pair.answer,
                embedding: embeddingResponse.data[index].embedding
            }));
            
            const response = await fetch(`${envVars['NEXT_PUBLIC_SUPABASE_URL']}/rest/v1/ai_knowledge_base`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': envVars['SUPABASE_SERVICE_ROLE_KEY'],
                    'Authorization': `Bearer ${envVars['SUPABASE_SERVICE_ROLE_KEY']}`
                },
                body: JSON.stringify(insertData)
            });
            
            if (!response.ok) {
                console.error("Supabase Insert Error:", await response.text());
            } else {
                inserted += batch.length;
            }
        } catch (e) {
            console.error("OpenAI Error:", e.message);
        }
    }
    
    console.log("Extraction & Upload Complete. Total inserted:", inserted);
}

main().catch(console.error);
