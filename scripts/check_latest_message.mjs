import { createClient } from "@supabase/supabase-js";
import ws from "ws";

const supabaseUrl = "https://fyuymnldgvfvdqcnbsxh.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ5dXltbmxkZ3ZmdmRxY25ic3hoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODgxNzUwNiwiZXhwIjoyMDk0MzkzNTA2fQ.fkZvxGkgW3yktVkLUxmOaEEdVRTymtrFK4uOj9Wa66A";

const supabaseAdmin = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false },
  realtime: { transport: ws },
});

async function run() {
  const { data, error } = await supabaseAdmin
    .from("messages")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(5);

  if (error) {
    console.error(error);
  } else {
    console.log("Latest Message:");
    console.log(data);
    if (data.sender_id === "agent-1") {
      console.log("❌ FAILED: sender_id is still hardcoded.");
    } else {
      console.log("✅ SUCCESS: sender_id is a dynamic ID.");
    }
  }
}
run();
