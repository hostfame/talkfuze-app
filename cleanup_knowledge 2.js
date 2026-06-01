const fs = require('fs');
const { OpenAI } = require('openai');

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

const SUPABASE_URL = envVars['NEXT_PUBLIC_SUPABASE_URL'];
const SUPABASE_KEY = envVars['SUPABASE_SERVICE_ROLE_KEY'];

const openai = new OpenAI({
  apiKey: envVars['OPENAI_API_KEY']
});

async function main() {
    console.log("Fetching all knowledge base pairs...");
    const res = await fetch(`${SUPABASE_URL}/rest/v1/ai_knowledge_base?select=id,question,answer`, {
        headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`
        }
    });
    
    if (!res.ok) {
        console.error("Failed to fetch:", await res.text());
        return;
    }
    
    const pairs = await res.json();
    console.log(`Found ${pairs.length} pairs. Starting cleanup...`);

    let deletedCount = 0;
    let keptCount = 0;

    // Process in batches of 10 to keep it fast but not hit rate limits too hard
    const batchSize = 20;
    for (let i = 0; i < pairs.length; i += batchSize) {
        const batch = pairs.slice(i, i + batchSize);
        console.log(`Processing batch ${i / batchSize + 1} of ${Math.ceil(pairs.length / batchSize)}...`);
        
        await Promise.all(batch.map(async (pair) => {
            try {
                const response = await openai.chat.completions.create({
                    model: "gpt-4o-mini",
                    messages: [
                        {
                            role: "system",
                            content: `You are a data cleaner. Look at the customer support Q&A pair.
Determine if it represents GENERAL COMPANY KNOWLEDGE or a SPECIFIC USER TICKET.
- GENERAL: Rules, features, pricing, generic errors, "how to", standard responses. (KEEP)
- SPECIFIC: Contains specific domain names, IP addresses, invoices, user names, password resets, "your account", "I have fixed your issue", specific apologies. (DISCARD)

Reply ONLY with "KEEP" or "DISCARD".`
                        },
                        {
                            role: "user",
                            content: `Q: ${pair.question}\nA: ${pair.answer}`
                        }
                    ],
                    temperature: 0,
                    max_tokens: 5
                });
                
                const decision = response.choices[0].message.content.trim();
                
                if (decision === "DISCARD") {
                    // Delete from DB
                    const delRes = await fetch(`${SUPABASE_URL}/rest/v1/ai_knowledge_base?id=eq.${pair.id}`, {
                        method: 'DELETE',
                        headers: {
                            'apikey': SUPABASE_KEY,
                            'Authorization': `Bearer ${SUPABASE_KEY}`
                        }
                    });
                    
                    if (delRes.ok) {
                        deletedCount++;
                        // console.log(`[DISCARD] Q: ${pair.question.substring(0,30)}...`);
                    } else {
                        console.error("Failed to delete", pair.id);
                    }
                } else {
                    keptCount++;
                }
            } catch (e) {
                console.error("Error processing pair:", e.message);
            }
        }));
    }
    
    console.log(`Cleanup complete!`);
    console.log(`Kept: ${keptCount}`);
    console.log(`Deleted: ${deletedCount}`);
}

main().catch(console.error);
