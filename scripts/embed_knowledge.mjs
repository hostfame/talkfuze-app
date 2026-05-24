import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import WebSocket from 'ws';

globalThis.WebSocket = WebSocket;

// Initialize Supabase
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !supabaseKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
const supabase = createClient(supabaseUrl, supabaseKey);

// Initialize OpenAI
const openaiApiKey = process.env.OPENAI_API_KEY;
if (!openaiApiKey) {
  console.error("Missing OPENAI_API_KEY");
  process.exit(1);
}
const openai = new OpenAI({ apiKey: openaiApiKey });

// Load JSON data
const knowledgePath = path.resolve('./src/actions/hostnin-knowledge.json');
const knowledgeData = JSON.parse(fs.readFileSync(knowledgePath, 'utf8'));

// Policies and Core Info
const coreInfo = `## Hostnin Support Info
WhatsApp: +880 1325-875955 (01325875955)
Email: support@hostnin.com, hello@hostnin.com (For highly sensitive/formal issues only)
Website: hostnin.com
Payment: bKash, Nagad, Bank Transfer, Card (Stripe)
Bank: ISLAMI BANK, SPOTLIGHT CREATIVE, Pahartali Branch, Acc: 20502020100506002`;

const policiesInfo = `## Key Policies
- 99.9% Uptime Guarantee on all hosting plans.
- All shared/cloud/turbo hosting includes: Free SSL, LiteSpeed Web Server, cPanel, Daily Backups.
- Free website migration from any provider.
- 30-day money-back for hosting. Refund to original method ONLY if Hostnin's fault. Otherwise = Account Credit.
- Domains, VPS, Dedicated Servers: Non-refundable.
- Prohibited content: Adult, spam, nulled scripts, phishing, illegal.
- Free .com/.net/.org domain with yearly hosting plans (Starter and above).
- Domain transfer needs EPP/Auth code, must be 60+ days old, not expired.
- VPS: Self-managed by default, full root access. Locations: Bangladesh (BDIX), Singapore, Germany, Finland, USA.
- Dedicated Servers: Full dedicated hardware, most have setup fees (except Value AMD = Free Setup).
- MySQL/Database: External MySQL connections are NOT allowed on standard Web/Cloud Hosting or BDIX VPS for security reasons. We DO allow external MySQL connections on Node.js Hosting.
- Pricing Confusion (e.g., 549tk plan): refers to the 3-year discounted monthly breakdown price.
- Affiliate: 10% lifetime commission. Min withdrawal 5000 BDT.
- Nameservers: ns1.stackdns.com, ns2.stackdns.com

## Hosting Recommendation Rules (STRICT)
- NEVER recommend Cloud Hosting or WordPress Hosting by default.
- DO NOT recommend Cloud Hosting for e-commerce or Bangladesh-targeted sites (Cloud/WordPress plans are UK/Global optimized and slow for BD traffic).
- Only recommend Cloud Hosting if the user explicitly prioritizes massive STORAGE capacity over speed.`;

async function getEmbedding(text) {
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text.substring(0, 8000),
    dimensions: 1536
  });
  return response.data[0].embedding;
}

async function insertKnowledge(question, answer) {
  console.log(`Embedding: ${question}`);
  const embeddingText = `Question: ${question}\nAnswer: ${answer}`;
  const embedding = await getEmbedding(embeddingText);

  const { error } = await supabase.from('ai_knowledge_base').insert({
    question,
    answer,
    embedding
  });

  if (error) {
    console.error(`Failed to insert: ${question}`, error);
  }
}

async function run() {
  console.log("Clearing existing ai_knowledge_base...");
  // Delete all records to avoid duplicates
  await supabase.from('ai_knowledge_base').delete().neq('id', '00000000-0000-0000-0000-000000000000');

  console.log("Inserting Core and Policies...");
  await insertKnowledge(
    "What is Hostnin's WhatsApp number, contact email, and bank account details for payment?",
    coreInfo
  );

  await insertKnowledge(
    "What is the money back guarantee, refund policy, migration policy, nameservers, and external MySQL rules?",
    policiesInfo
  );

  console.log("Fetching canned_replies from database...");
  const { data: cannedReplies, error: cannedError } = await supabase.from('canned_replies').select('*');
  if (cannedError) {
    console.error("Error fetching canned_replies:", cannedError);
  } else {
    for (const reply of cannedReplies) {
      await insertKnowledge(
        `Saved reply for ${reply.shortcut} - ${reply.shortcut.replace('/', '')}`,
        `Shortcut: ${reply.shortcut}\nMessage: ${reply.content}`
      );
    }
  }

  console.log("Inserting Hosting Plans and Server Specs...");
  for (const plan of knowledgeData.plans) {
    const specs = (plan.server || []).join(', ');
    const features = (plan.features || []).join(', ');
    const setupFee = plan.setupFee ? `\nSetup Fee: ৳${plan.setupFee}` : '';
    
    await insertKnowledge(
      `What is the price, server hardware specs, processor, RAM, and features of the ${plan.name} ${plan.type} (${plan.period} billing)?`,
      `Plan: ${plan.name} ${plan.type}\nBilling Period: ${plan.period}\nPrice: ${plan.currency}${plan.price} (${plan.currency}${plan.monthlyBreakdown}/month breakdown)${setupFee}\nFeatures: ${features}\nHardware Specs & Limits: ${specs}`
    );
  }

  console.log("Inserting Domains...");
  for (const domain of knowledgeData.domains) {
    await insertKnowledge(
      `What is the price to register, transfer, or renew a ${domain.tld} domain?`,
      `Domain Extension: ${domain.tld}\nPrice: ৳${domain.price}/year`
    );
  }
  
  if (knowledgeData.comparisons) {
    for (const comp of knowledgeData.comparisons) {
      await insertKnowledge(
        `Hosting comparison: ${comp.substring(0, 50)}...`,
        comp
      );
    }
  }

  console.log("Done! Knowledge base is fully embedded.");
  process.exit(0);
}

run();
