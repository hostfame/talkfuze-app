const { createClient } = require('@supabase/supabase-js');
global.WebSocket = require('ws');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing credentials in .env.local!");
  process.exit(1);
}

// Enable standard Node.js global fetch
const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false }
});

async function run() {
  console.log("Connecting to Supabase REST API:", supabaseUrl);
  const start = Date.now();
  try {
    const { data, error } = await supabase
      .from('conversations')
      .select('id, created_at')
      .limit(5);

    const end = Date.now();
    if (error) {
      console.error("❌ Supabase API Error:", error.message);
    } else {
      console.log(`✅ Success! Query latency: ${end - start}ms`);
      console.log("Conversations:", data);
    }
  } catch (err) {
    console.error("❌ Exception:", err.message);
  }
}

run();
