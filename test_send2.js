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
      const { data: channels, error: chFetchErr } = await supabaseAdmin
        .from("channels")
        .select("id")
        .eq("org_id", orgId)
        .eq("type", "widget")
        .limit(1)

      if (chFetchErr) throw chFetchErr

      let channel = channels && channels.length > 0 ? channels[0] : null;

      const { data: contacts, error: cFetchErr } = await supabaseAdmin
        .from("contacts")
        .select("id")
        .eq("org_id", orgId)
        .eq("platform_type", "widget")
        .eq("platform_id", deviceId)
        .limit(1)

      if (cFetchErr) throw cFetchErr

      let contact = contacts && contacts.length > 0 ? contacts[0] : null;

      const { data: convs, error: convFetchErr } = await supabaseAdmin
        .from("conversations")
        .select("id")
        .eq("org_id", orgId)
        .eq("contact_id", contact.id)
        .eq("status", "open")
        .order('created_at', { ascending: false })
        .limit(1)

      if (convFetchErr) throw convFetchErr

      let conversation = convs && convs.length > 0 ? convs[0] : null;
      if (!conversation) {
        const { data: newConv, error: convErr } = await supabaseAdmin
          .from("conversations")
          .insert({
            org_id: orgId,
            channel_id: channel.id,
            contact_id: contact.id,
            status: "open"
          })
          .select("id")
          .single()
        if (convErr) throw convErr
        conversation = newConv
      }

      const { error: msgErr } = await supabaseAdmin
        .from("messages")
        .insert({
          org_id: orgId,
          conversation_id: conversation.id,
          sender_type: "contact",
          sender_id: contact.id,
          content: "hlw",
          content_type: "text",
        })

      if (msgErr) throw msgErr

      const { error: updateErr } = await supabaseAdmin
        .from("conversations")
        .update({ last_message_at: new Date().toISOString() })
        .eq("id", conversation.id)

      if (updateErr) throw updateErr
      
      console.log("SUCCESS sendWidgetMessage");
  } catch (err) {
      console.error("FAILED:", err);
  }
}
run();
