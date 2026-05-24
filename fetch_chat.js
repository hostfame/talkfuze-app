require('dotenv').config({ path: '.env.local' });
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const convId = "ce7c3cbd-2c59-4169-898d-c18fd6424b19";

async function fetchChat() {
  const resMsg = await fetch(`${supabaseUrl}/rest/v1/messages?conversation_id=eq.${convId}&order=created_at.asc`, {
    headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }
  });
  const messages = await resMsg.json();
  
  const resDrafts = await fetch(`${supabaseUrl}/rest/v1/ai_draft_logs?conversation_id=eq.${convId}&order=created_at.asc`, {
    headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }
  });
  const drafts = await resDrafts.json();

  console.log("=== MESSAGES ===");
  messages.forEach(m => {
    console.log(`[${m.sender_type}] ${m.content_type === 'text' ? m.content : '<media>'}`);
  });
  
  console.log("\n=== AI DRAFTS ===");
  drafts.forEach(d => {
    console.log(`[Draft] ${d.drafted_text}`);
    console.log(`[Final] ${d.final_sent_text}`);
    console.log(`[Status] ${d.status}`);
    console.log("-------------------");
  });
}
fetchChat();
