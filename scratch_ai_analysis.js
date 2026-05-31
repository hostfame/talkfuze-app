require('dotenv').config({ path: '.env.local' });
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function runAnalysis() {
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  
  const res = await fetch(`${supabaseUrl}/rest/v1/ai_draft_logs?created_at=gte.${yesterday}&select=id,was_edited,agent_sent,ai_draft,correction_feedback,conversation_id,created_at`, {
    headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }
  });
  
  if (!res.ok) {
    console.error("Failed to fetch", await res.text());
    return;
  }
  
  const drafts = await res.json();
  
  let totalSent = 0;
  let sentAsIs = 0;
  let edited = 0;
  let notSent = 0;
  
  const editedLogs = [];
  
  for (const draft of drafts) {
    if (draft.agent_sent !== null && draft.agent_sent.trim() !== "") {
      totalSent++;
      if (draft.was_edited) {
        edited++;
        editedLogs.push(draft);
      } else {
        sentAsIs++;
      }
    } else {
      notSent++;
    }
  }
  
  console.log("Analysis for the last 24 hours:");
  console.log("Total drafts generated:", drafts.length);
  console.log("Total drafts processed (sent by agent):", totalSent);
  console.log(`Sent as is (Acceptance Rate): ${sentAsIs} (${totalSent > 0 ? ((sentAsIs/totalSent)*100).toFixed(2) : 0}%)`);
  console.log(`Edited before sending: ${edited} (${totalSent > 0 ? ((edited/totalSent)*100).toFixed(2) : 0}%)`);
  console.log("Drafts discarded/not sent:", notSent);
  
  console.log("\n--- EDITED MESSAGES DETAILS ---");
  for (const draft of editedLogs) {
    console.log(`\nDraft ID: ${draft.id}`);
    console.log(`Time: ${draft.created_at}`);
    console.log(`AI Draft: ${draft.ai_draft}`);
    console.log(`Agent Sent: ${draft.agent_sent}`);
    if (draft.correction_feedback) {
      console.log(`Correction/Reason: ${draft.correction_feedback}`);
    }
  }
}

runAnalysis();
