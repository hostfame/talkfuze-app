const dotenv = require('dotenv');
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

async function query() {
  const url = `${supabaseUrl}/rest/v1/ai_draft_logs?select=ai_draft,agent_sent,correction_feedback&was_edited=eq.true&agent_sent=not.is.null&order=created_at.desc&limit=20`;
  const res = await fetch(url, {
    headers: {
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`
    }
  });
  const json = await res.json();
  console.log(JSON.stringify(json, null, 2));
}

query();
