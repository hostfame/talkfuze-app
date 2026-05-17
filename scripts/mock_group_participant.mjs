import { createClient } from "@supabase/supabase-js";
import ws from "ws";

const supabaseUrl = "https://fyuymnldgvfvdqcnbsxh.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ5dXltbmxkZ3ZmdmRxY25ic3hoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODgxNzUwNiwiZXhwIjoyMDk0MzkzNTA2fQ.fkZvxGkgW3yktVkLUxmOaEEdVRTymtrFK4uOj9Wa66A";

const supabaseAdmin = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false },
  realtime: { transport: ws },
});

async function run() {
  const { data: contacts, error: contactError } = await supabaseAdmin
    .from("contacts")
    .select("id")
    .ilike("name", "%WhatsApp Group%");

  if (contactError || !contacts || contacts.length === 0) {
    console.error("No contact found");
    return;
  }

  const { data, error } = await supabaseAdmin
    .from("messages")
    .select("*")
    .eq("sender_id", contacts[0].id)
    .order("created_at", { ascending: false })
    .limit(5);

  if (error) {
    console.error("ERROR:", error.message);
    return;
  }
  
  console.log("Found messages:", data.length);
  
  for (const msg of data) {
    if (msg.sender_type === 'contact') {
      const { error: updateError } = await supabaseAdmin
        .from("messages")
        .update({
          metadata: {
            ...msg.metadata,
            participant_name: "Customer Participant",
            participant_avatar: "https://i.pravatar.cc/150?u=" + msg.id
          }
        })
        .eq("id", msg.id);
        
      if (updateError) console.error("Error updating", msg.id, updateError);
      else console.log("Updated msg", msg.id);
    }
  }
}
run();
