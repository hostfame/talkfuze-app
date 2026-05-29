const { createClient } = require('@supabase/supabase-js');
require(process.cwd() + '/node_modules/dotenv').config({ path: '/Users/imran/Documents/Talkfuze/.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function runAudit() {
  const hours = parseInt(process.argv[2]) || 7;
  const timeLimit = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  
  console.log(`Auditing AI drafts since ${timeLimit} (${hours} hours ago)...\n`);
  
  const { data, error } = await supabase
    .from('ai_draft_logs')
    .select('conversation_id, ai_draft, customer_context, created_at, language, was_edited, agent_sent')
    .gte('created_at', timeLimit)
    .eq('language', 'bn')
    .order('created_at', { ascending: false });
    
  if (error) {
    console.error('Error fetching logs:', error);
    return;
  }
  
  const BENGALI_REGEX = /[\u0985-\u09B9\u09DC-\u09DF\u09BE-\u09CC\u0981-\u0983]/;
  let flaggedCount = 0;
  
  console.log(`Found ${data.length} total Bengali (bn) drafts.\n`);
  
  for (const log of data) {
    const context = log.customer_context || '';
    
    // If context has NO Bengali script, it's either Banglish or a Hallucination
    if (!BENGALI_REGEX.test(context)) {
      flaggedCount++;
      console.log(`[!] POTENTIAL HALLUCINATION OR BANGLISH`);
      console.log(`ID: ${log.conversation_id}`);
      console.log(`Time: ${log.created_at}`);
      console.log(`Context: \n${context.trim()}`);
      console.log(`\nDraft:\n${log.ai_draft}`);
      if (log.was_edited) {
        console.log(`\n[EDITED BY AGENT]:\n${log.agent_sent}`);
      }
      console.log('\n----------------------------------------\n');
    }
  }
  
  console.log(`Flagged ${flaggedCount} drafts for manual review (No Unicode Bengali found in context).`);
  console.log(`Note: If the context is Banglish, the draft is CORRECT. If the context is pure English, the bug is back.`);
}

runAudit();
