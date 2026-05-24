require('dotenv').config({ path: '.env.local' });
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const convId = "cd11b376-ca74-4b42-b656-a4911643d27e";

async function fetchDrafts() {
  const resDrafts = await fetch(`${supabaseUrl}/rest/v1/ai_draft_logs?conversation_id=eq.${convId}&order=created_at.asc`, {
    headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }
  });
  const drafts = await resDrafts.json();
  drafts.forEach((d, i) => {
    console.log(`\n--- Draft ${i+1} ---`);
    console.log("Customer Context:\n" + (d.customer_context ? d.customer_context.split('\n').slice(-5).join('\n') : "NULL"));
    console.log("AI Draft:\n" + d.ai_draft);
    console.log("Agent Sent:\n" + d.agent_sent);
  });
}
fetchDrafts();
