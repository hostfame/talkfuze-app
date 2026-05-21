require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const ws = require('ws');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin = createClient(supabaseUrl, serviceKey, {
  auth: {
    persistSession: false
  },
  realtime: {
    transport: ws
  }
});

async function check() {
  // Fetch latest 10 logs where agent actually sent a message and it was edited
  const { data: logs, error } = await supabaseAdmin
    .from('ai_draft_logs')
    .select('id, ai_draft, agent_sent, was_edited, language, created_at')
    .not('agent_sent', 'is', null)
    .order('created_at', { ascending: false })
    .limit(10);

  if (error) {
    console.error('Error fetching logs:', error);
    return;
  }

  console.log(`Fetched ${logs.length} recent AI draft logs:\n`);
  logs.forEach((log, index) => {
    console.log(`[${index + 1}] Log ID: ${log.id}`);
    console.log(`    Created At: ${log.created_at}`);
    console.log(`    Language: ${log.language}`);
    console.log(`    Was Edited: ${log.was_edited}`);
    console.log(`    --- AI DRAFT ---`);
    console.log(log.ai_draft);
    console.log(`    --- AGENT SENT ---`);
    console.log(log.agent_sent);
    console.log(`====================================================\n`);
  });
}

check();
