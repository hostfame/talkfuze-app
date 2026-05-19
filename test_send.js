require('dotenv').config({ path: '.env.local' });
const orgId = "ec2f8436-05dc-4621-8a7f-57202f865b8e";
const deviceId = "cee603f8-5130-46e6-874b-c036a1d987fb"; 
const ws = require('ws');

async function run() {
  const { createClient } = require('@supabase/supabase-js');
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { realtime: { transport: ws }, auth: { persistSession: false } }
  );

  try {
      const { data: contacts, error: cFetchErr } = await supabaseAdmin
        .from("contacts")
        .select("id")
        .eq("org_id", orgId)
        .eq("platform_type", "widget")
        .eq("platform_id", deviceId)
        .limit(1)

      if (cFetchErr) throw cFetchErr
      const contact = contacts[0];

      // Mark all open conversations for this contact as resolved
      const { error: updateCrr } = await supabaseAdmin
        .from("conversations")
        .update({ status: "resolved" })
        .eq("org_id", orgId)
        .eq("contact_id", contact.id)
        .eq("status", "open");
        
      if (updateCrr) throw updateCrr;
      
      console.log("SUCCESS startNewConversation");
  } catch (err) {
      console.error("FAILED:", err);
  }
}
run();
