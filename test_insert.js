const { createClient } = require('@supabase/supabase-js');

const supabaseAdmin = createClient(
  "https://fyuymnldgvfvdqcnbsxh.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ5dXltbmxkZ3ZmdmRxY25ic3hoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODgxNzUwNiwiZXhwIjoyMDk0MzkzNTA2fQ.fkZvxGkgW3yktVkLUxmOaEEdVRTymtrFK4uOj9Wa66A"
);

const orgId = "ec2f8436-05dc-4621-8a7f-57202f865b8e";
const deviceId = "test-device-id";
const content = "hello world";

async function test() {
  try {
    let { data: channel, error: chErr } = await supabaseAdmin
      .from("channels")
      .select("id")
      .eq("org_id", orgId)
      .eq("type", "widget")
      .maybeSingle();

    if (chErr) throw chErr;

    if (!channel) {
      console.log("Creating channel...");
      const { data: newChannel, error: channelErr } = await supabaseAdmin
        .from("channels")
        .insert({ org_id: orgId, type: "widget" })
        .select("id")
        .single();
      if (channelErr) throw channelErr;
      channel = newChannel;
    }

    console.log("Channel ID:", channel.id);

    let { data: contact, error: contactErr } = await supabaseAdmin
      .from("contacts")
      .select("id")
      .eq("org_id", orgId)
      .eq("platform_type", "widget")
      .eq("platform_id", deviceId)
      .maybeSingle();

    if (contactErr) throw contactErr;

    if (!contact) {
      console.log("Creating contact...");
      const { data: newContact, error: cErr } = await supabaseAdmin
        .from("contacts")
        .insert({
          org_id: orgId,
          platform_type: "widget",
          platform_id: deviceId,
          name: "Website Visitor"
        })
        .select("id")
        .single();
      if (cErr) throw cErr;
      contact = newContact;
    }

    console.log("Contact ID:", contact.id);

    let { data: conversation, error: convErr1 } = await supabaseAdmin
      .from("conversations")
      .select("id")
      .eq("org_id", orgId)
      .eq("contact_id", contact.id)
      .eq("status", "open")
      .maybeSingle();

    if (convErr1) throw convErr1;

    if (!conversation) {
      console.log("Creating conversation...");
      const { data: newConv, error: convErr } = await supabaseAdmin
        .from("conversations")
        .insert({
          org_id: orgId,
          channel_id: channel.id,
          contact_id: contact.id,
          status: "open"
        })
        .select("id")
        .single();
      if (convErr) throw convErr;
      conversation = newConv;
    }

    console.log("Conversation ID:", conversation.id);

    console.log("Inserting message...");
    const { error: msgErr } = await supabaseAdmin
      .from("messages")
      .insert({
        org_id: orgId,
        conversation_id: conversation.id,
        sender_type: "contact",
        sender_id: contact.id,
        content: content
      });

    if (msgErr) throw msgErr;

    console.log("Success!");
  } catch (e) {
    console.error("Test Failed:");
    console.error(e);
  }
}

test();
