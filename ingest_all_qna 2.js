/**
 * TalkFuze + AnyChat Comprehensive Q&A Ingestion Pipeline
 * 
 * Sources:
 *   1. AnyChat all_conversations.json (12,229 convos, 314K msgs, 112K human agent replies)
 *   2. TalkFuze Supabase messages table (482 convos, 2,743 agent replies)
 * 
 * Pipeline:
 *   1. Extract raw Q&A pairs (customer question -> human agent answer)
 *   2. Quality filter (skip short, acks, system msgs, bot garbage)
 *   3. Normalize + deduplicate
 *   4. Clear old ai_knowledge_base
 *   5. Generate embeddings + batch insert
 */

require('dotenv').config({ path: '.env.local' });
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
const ws = require('ws');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { realtime: { transport: ws } }
);

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// ============================================================
// QUALITY FILTERS
// ============================================================

const SKIP_PATTERNS = [
  // Bot garbage
  /I apologize, but I encountered a technical issue/i,
  /I'd love to help! Could you tell me/i,
  /I'll connect you with a live agent/i,
  /technical issue while processing/i,
  /Would you like me to create a support ticket/i,
  // System/auto messages
  /^Dear .+, your payment for the due date/,
  /^Hello .+, an invoice with ID \d+/,
  /^Hi .+, the domain name .+ has been successfully/,
  /has been created\. The total amount is/,
  /your payment .+ has been received/i,
  /Invoice #\d+ .+ has been (paid|created)/i,
  // Canned greetings only
  /^(Hello|Hi|Hey|Salam|Assalamu)\s*[!.]?\s*$/i,
  /^(ok|okay|hmm|ji|jee|yes|no|sure|thanks|thank you|tnx|thx|dhonnobad)\s*[!.]?\s*$/i,
];

const ACK_PATTERNS = [
  /^(ok|okay|hmm|ji|jee|jii|haa|ha|yes|no|sure|alright|right|done|fine|got it|noted)\s*[!.]*\s*$/i,
  /^(thanks|thank you|tnx|thx|ty|dhonnobad|ধন্যবাদ|শুকরিয়া)\s*[!.]*\s*$/i,
  /^(welcome|you're welcome)\s*[!.]*\s*$/i,
  /^(bye|goodbye|see you|ok bye)\s*[!.]*\s*$/i,
  /^\d+$/, // just numbers
  /^https?:\/\/\S+$/, // just a URL
  /^[👍🙏✅❤️😊🤝]+$/, // just emoji
];

function isGarbage(text) {
  if (!text || text.trim().length < 8) return true;
  const t = text.trim();
  if (SKIP_PATTERNS.some(p => p.test(t))) return true;
  if (ACK_PATTERNS.some(p => p.test(t))) return true;
  return false;
}

function isGarbageQuestion(text) {
  if (!text || text.trim().length < 8) return true;
  if (text.trim().length > 1500) return true; // Too long for embedding
  const t = text.trim();
  if (ACK_PATTERNS.some(p => p.test(t))) return true;
  // Skip if it's just a domain name or URL
  if (/^(https?:\/\/)?[\w.-]+\.(com|net|org|info|xyz|bd|me|io|dev|shop|store|site|online)\s*$/i.test(t)) return true;
  return false;
}

function isGarbageAnswer(text) {
  if (!text || text.trim().length < 15) return true;
  const t = text.trim();
  if (SKIP_PATTERNS.some(p => p.test(t))) return true;
  if (ACK_PATTERNS.some(p => p.test(t))) return true;
  return false;
}

// ============================================================
// Q&A EXTRACTION FROM CONVERSATIONS
// ============================================================

function extractQAPairsFromConversation(messages) {
  const pairs = [];
  // Sort by timestamp
  const sorted = messages
    .filter(m => m.message && m.message.trim().length > 0)
    .sort((a, b) => (a.created_at || 0) - (b.created_at || 0));

  let customerBuffer = [];

  for (let i = 0; i < sorted.length; i++) {
    const msg = sorted[i];

    if (msg.from === 'customer' || msg.from === 'contact') {
      customerBuffer.push(msg.message.trim());
    } else if (msg.from === 'agent' || msg.from === 'operator') {
      if (customerBuffer.length === 0) continue;

      // Combine consecutive customer messages as the "question"
      const question = customerBuffer.join('\n').trim();
      
      // Collect consecutive agent messages as the "answer"
      let answerParts = [msg.message.trim()];
      while (i + 1 < sorted.length && (sorted[i + 1].from === 'agent' || sorted[i + 1].from === 'operator')) {
        i++;
        answerParts.push(sorted[i].message.trim());
      }
      const answer = answerParts.join('\n').trim();

      // Quality check
      if (!isGarbageQuestion(question) && !isGarbageAnswer(answer)) {
        pairs.push({ question, answer });
      }

      customerBuffer = [];
    } else {
      // system messages, ignore
    }
  }

  return pairs;
}

// ============================================================
// SUPABASE Q&A EXTRACTION (TalkFuze)
// ============================================================

async function extractFromTalkFuze() {
  console.log('\n=== PHASE 1B: Extracting from TalkFuze Supabase ===');
  
  // Fetch all conversations
  const { data: convos, error: convErr } = await supabase
    .from('conversations')
    .select('id')
    .order('created_at', { ascending: false });
  
  if (convErr) {
    console.error('Error fetching conversations:', convErr);
    return [];
  }

  console.log(`Found ${convos.length} TalkFuze conversations`);
  const allPairs = [];

  // Process in batches of 20
  for (let i = 0; i < convos.length; i += 20) {
    const batch = convos.slice(i, i + 20);
    const convIds = batch.map(c => c.id);
    
    const { data: messages, error: msgErr } = await supabase
      .from('messages')
      .select('conversation_id, content, sender_type, created_at')
      .in('conversation_id', convIds)
      .in('sender_type', ['contact', 'agent'])
      .not('content', 'is', null)
      .order('created_at', { ascending: true });

    if (msgErr) {
      console.error('Error fetching messages batch:', msgErr);
      continue;
    }

    // Group messages by conversation
    const byConv = {};
    for (const m of messages) {
      if (!byConv[m.conversation_id]) byConv[m.conversation_id] = [];
      byConv[m.conversation_id].push({
        from: m.sender_type === 'contact' ? 'customer' : 'agent',
        message: m.content,
        created_at: new Date(m.created_at).getTime() / 1000
      });
    }

    for (const convId in byConv) {
      const pairs = extractQAPairsFromConversation(byConv[convId]);
      allPairs.push(...pairs);
    }
  }

  console.log(`Extracted ${allPairs.length} Q&A pairs from TalkFuze`);
  return allPairs;
}

// ============================================================
// NORMALIZATION & DEDUPLICATION
// ============================================================

function normalizeText(text) {
  return text
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[।,.!?;:'"()\[\]{}]+/g, '')
    .trim();
}

function deduplicatePairs(pairs) {
  console.log(`\nDeduplicating ${pairs.length} raw pairs...`);
  
  // Step 1: Exact question dedup (keep longest answer)
  const byNormQ = {};
  for (const p of pairs) {
    const normQ = normalizeText(p.question);
    if (!normQ || normQ.length < 5) continue;
    
    if (!byNormQ[normQ] || p.answer.length > byNormQ[normQ].answer.length) {
      byNormQ[normQ] = p;
    }
  }
  
  let unique = Object.values(byNormQ);
  console.log(`After exact dedup: ${unique.length} pairs`);

  // Step 2: Near-duplicate removal (question substring containment)
  // Sort by question length (keep longer, more specific questions)
  unique.sort((a, b) => b.question.length - a.question.length);
  
  const final = [];
  const seen = new Set();
  
  for (const p of unique) {
    const normQ = normalizeText(p.question);
    // Check if this question is a substring of or contains an already-seen question
    let isDup = false;
    for (const s of seen) {
      if (s.includes(normQ) || normQ.includes(s)) {
        // If the existing one is shorter, this new one is more specific - skip the check
        if (normQ.length > s.length + 10) continue; // Allow if significantly longer
        isDup = true;
        break;
      }
    }
    if (!isDup) {
      seen.add(normQ);
      final.push(p);
    }
  }
  
  console.log(`After near-dedup: ${final.length} pairs`);
  return final;
}

// ============================================================
// TOPIC CATEGORIZATION (local, no API)
// ============================================================

function categorize(question) {
  const q = question.toLowerCase();
  
  if (/pric|cost|dam|daam|koto|taka|tkr?|bdt|plan|package|offer|discount|coupon|promo/i.test(q)) return 'pricing';
  if (/domain|ডোমেইন|\.com|\.net|\.org|\.bd|nameserver|ns1|ns2|dns|transfer.*domain/i.test(q)) return 'domain';
  if (/ssl|https|certificate|সার্টিফিকেট/i.test(q)) return 'ssl';
  if (/email|mail|smtp|imap|pop3|ইমেইল|মেইল|webmail/i.test(q)) return 'email';
  if (/cpanel|সিপ্যানেল|c panel|control panel|login.*panel/i.test(q)) return 'cpanel';
  if (/wordpress|wp|ওয়ার্ডপ্রেস|plugin|theme/i.test(q)) return 'wordpress';
  if (/down|slow|error|not work|load|ডাউন|কাজ করছে না|লোড|speed|timeout/i.test(q)) return 'technical';
  if (/backup|ব্যাকআপ/i.test(q)) return 'backup';
  if (/invoic|payment|bkash|বিকাশ|nagad|নগদ|pay|bill|renew|রিনিউ|refund/i.test(q)) return 'billing';
  if (/vps|ভিপিএস|dedicated|root|ssh/i.test(q)) return 'vps';
  if (/migrat|transfer.*site|move.*site|মাইগ্রেশন/i.test(q)) return 'migration';
  if (/node\.?js|react|laravel|python|deploy|git/i.test(q)) return 'development';
  if (/database|db|mysql|phpmyadmin|ডাটাবেস/i.test(q)) return 'database';
  if (/ip.*block|block.*ip|আইপি.*ব্লক|firewall/i.test(q)) return 'ip_block';
  if (/subdomain|সাবডোমেইন|addon.*domain/i.test(q)) return 'subdomain';
  if (/cancel|ক্যান্সেল|terminate|close.*account/i.test(q)) return 'cancellation';
  if (/upgrade|downgrade|আপগ্রেড|change.*plan/i.test(q)) return 'plan_change';
  
  return 'general';
}

// ============================================================
// EMBEDDING + DATABASE INSERT
// ============================================================

async function generateEmbeddings(texts) {
  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'text-embedding-3-small',
      input: texts,
      dimensions: 1536
    })
  });
  
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenAI embedding error: ${err}`);
  }
  
  const data = await response.json();
  return data.data.map(d => d.embedding);
}

async function clearOldKnowledgeBase() {
  console.log('\n=== Clearing old ai_knowledge_base entries ===');
  
  // Delete in batches (Supabase has row limits)
  let deleted = 0;
  while (true) {
    const { data, error } = await supabase
      .from('ai_knowledge_base')
      .select('id')
      .limit(500);
    
    if (error) {
      console.error('Error fetching for delete:', error);
      break;
    }
    if (!data || data.length === 0) break;
    
    const ids = data.map(d => d.id);
    const { error: delErr } = await supabase
      .from('ai_knowledge_base')
      .delete()
      .in('id', ids);
    
    if (delErr) {
      console.error('Delete error:', delErr);
      break;
    }
    deleted += ids.length;
    process.stdout.write(`  Deleted ${deleted} old entries...\r`);
  }
  console.log(`  Cleared ${deleted} old entries.`);
}

async function insertQAPairs(pairs) {
  console.log(`\n=== Inserting ${pairs.length} Q&A pairs with embeddings ===`);
  
  let inserted = 0;
  let failed = 0;
  const BATCH = 80; // OpenAI embedding batch size
  
  for (let i = 0; i < pairs.length; i += BATCH) {
    const batch = pairs.slice(i, i + BATCH);
    const questions = batch.map(p => p.question);
    
    try {
      // Cap each question to 1500 chars for embedding safety
      const cappedQuestions = questions.map(q => q.substring(0, 1500));
      const embeddings = await generateEmbeddings(cappedQuestions);
      
      const rows = batch.map((p, idx) => ({
        question: p.question.substring(0, 2000), // cap length
        answer: p.answer.substring(0, 5000),     // cap length
        embedding: embeddings[idx]
      }));
      
      const { error } = await supabase.from('ai_knowledge_base').insert(rows);
      
      if (error) {
        console.error(`  Batch ${Math.floor(i/BATCH)+1} insert error:`, error.message);
        failed += batch.length;
      } else {
        inserted += batch.length;
      }
    } catch (e) {
      console.error(`  Batch ${Math.floor(i/BATCH)+1} error:`, e.message);
      failed += batch.length;
    }
    
    process.stdout.write(`  Progress: ${inserted} inserted, ${failed} failed (${Math.round((i+BATCH)/pairs.length*100)}%)\r`);
    
    // Rate limit: 3 requests/sec for embeddings
    if (i + BATCH < pairs.length) await new Promise(r => setTimeout(r, 400));
  }
  
  console.log(`\n  Final: ${inserted} inserted, ${failed} failed.`);
  return inserted;
}

// ============================================================
// MAIN PIPELINE
// ============================================================

async function main() {
  console.log('========================================');
  console.log('TalkFuze + AnyChat Q&A Ingestion Pipeline');
  console.log('========================================\n');
  
  const startTime = Date.now();
  
  // ---- PHASE 1A: AnyChat data ----
  console.log('=== PHASE 1A: Extracting from AnyChat (all_conversations.json) ===');
  const anychatPath = '/Users/imran/Documents/Nina/chat-analysis/all_conversations.json';
  
  if (!fs.existsSync(anychatPath)) {
    console.error('AnyChat data file not found!');
    return;
  }
  
  const rawData = JSON.parse(fs.readFileSync(anychatPath, 'utf8'));
  const convos = rawData.conversations;
  console.log(`Loaded ${convos.length} AnyChat conversations (${rawData.meta.total_messages} total messages)`);
  
  let anychatPairs = [];
  let processed = 0;
  
  for (const conv of convos) {
    const pairs = extractQAPairsFromConversation(conv.messages || []);
    anychatPairs.push(...pairs);
    processed++;
    if (processed % 2000 === 0) {
      process.stdout.write(`  Processed ${processed}/${convos.length} convos, ${anychatPairs.length} pairs so far...\r`);
    }
  }
  console.log(`  Extracted ${anychatPairs.length} Q&A pairs from AnyChat`);
  
  // ---- PHASE 1B: TalkFuze data ----
  const talkfuzePairs = await extractFromTalkFuze();
  
  // ---- PHASE 2: Combine + Deduplicate ----
  console.log('\n=== PHASE 2: Combine and Deduplicate ===');
  const allPairs = [...anychatPairs, ...talkfuzePairs];
  console.log(`Total raw pairs: ${allPairs.length} (AnyChat: ${anychatPairs.length}, TalkFuze: ${talkfuzePairs.length})`);
  
  const uniquePairs = deduplicatePairs(allPairs);
  
  // ---- PHASE 3: Categorize ----
  console.log('\n=== PHASE 3: Categorize ===');
  const categoryCounts = {};
  for (const p of uniquePairs) {
    p.category = categorize(p.question);
    categoryCounts[p.category] = (categoryCounts[p.category] || 0) + 1;
  }
  console.log('Category distribution:');
  const sorted = Object.entries(categoryCounts).sort((a, b) => b[1] - a[1]);
  for (const [cat, count] of sorted) {
    console.log(`  ${cat}: ${count}`);
  }
  
  // ---- PHASE 4: No caps, include all unique pairs ----
  console.log('\n=== PHASE 4: Including ALL unique pairs (no caps) ===');
  const finalPairs = uniquePairs;
  console.log(`Final Q&A count: ${finalPairs.length}`);
  
  // ---- PHASE 5: Save preview before DB insert ----
  const previewPath = '/Users/imran/Documents/Talkfuze/qna_preview.json';
  fs.writeFileSync(previewPath, JSON.stringify({
    total: finalPairs.length,
    categories: categoryCounts,
    sample: finalPairs.slice(0, 20).map(p => ({ q: p.question.substring(0, 100), a: p.answer.substring(0, 200), cat: p.category }))
  }, null, 2));
  console.log(`\nPreview saved to ${previewPath}`);
  
  // ---- PHASE 6: Clear old DB + Insert ----
  await clearOldKnowledgeBase();
  const inserted = await insertQAPairs(finalPairs);
  
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n========================================`);
  console.log(`PIPELINE COMPLETE in ${elapsed}s`);
  console.log(`  Sources: AnyChat (${anychatPairs.length} raw) + TalkFuze (${talkfuzePairs.length} raw)`);
  console.log(`  After dedup: ${uniquePairs.length}`);
  console.log(`  After sampling: ${finalPairs.length}`);
  console.log(`  Inserted to DB: ${inserted}`);
  console.log(`========================================`);
}

main().catch(e => {
  console.error('Pipeline failed:', e);
  process.exit(1);
});
