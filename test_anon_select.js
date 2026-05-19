const { createClient } = require('@supabase/supabase-js');
const ws = require('ws');

const supabaseUrl = "https://fyuymnldgvfvdqcnbsxh.supabase.co";
const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ5dXltbmxkZ3ZmdmRxY25ic3hoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg4MTc1MDYsImV4cCI6MjA5NDM5MzUwNn0.2ka6tdQCXfg5Z77Z8_u5hK1WeLQ5a4O3L0pUH469aD0";

const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: false },
  realtime: { transport: ws }
});

async function run() {
  console.log("Signing in as imran@hostnin.com...");
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: 'imran@hostnin.com',
    password: 'Imran@Talkfuze2026'
  });

  if (authError) {
    console.error("Auth failed:", authError.message);
    return;
  }

  console.log("Auth successful! User ID:", authData.user.id);
  console.log("App Metadata:", authData.user.app_metadata);
  console.log("User Metadata:", authData.user.user_metadata);

  const orgId = authData.user.app_metadata?.org_id || authData.user.user_metadata?.org_id;
  console.log("Org ID from metadata:", orgId);

  console.log("\nQuerying channels table...");
  const { data: channels, error: channelsError } = await supabase
    .from('channels')
    .select('id, type, is_active, config')
    .eq('org_id', 'ec2f8436-05dc-4621-8a7f-57202f865b8e');

  if (channelsError) {
    console.error("Channels query failed:", channelsError.message);
  } else {
    console.log("Channels in org:", channels);
  }
}

run().catch(console.error);
