import { createClient } from "@supabase/supabase-js";
import ws from "ws";

const supabaseUrl = "https://fyuymnldgvfvdqcnbsxh.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ5dXltbmxkZ3ZmdmRxY25ic3hoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODgxNzUwNiwiZXhwIjoyMDk0MzkzNTA2fQ.fkZvxGkgW3yktVkLUxmOaEEdVRTymtrFK4uOj9Wa66A";

const supabaseAdmin = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false },
  realtime: { transport: ws },
});

const ORG_ID = "ec2f8436-05dc-4621-8a7f-57202f865b8e";

async function run() {
  const email = "agent@hostnin.com";
  const password = "TalkFuze2026!";
  const name = "Demo Agent";

  // Check if exists
  const { data: { users } } = await supabaseAdmin.auth.admin.listUsers();
  let user = users.find((u) => u.email === email);

  if (user) {
    // Update password
    await supabaseAdmin.auth.admin.updateUserById(user.id, { password });
    console.log("Updated password for existing user.");
  } else {
    // Create new
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name, role: "agent" },
    });
    if (error) throw error;
    user = data.user;
    console.log("Created new user.");
  }

  // Map to public.users
  const { data: mapping } = await supabaseAdmin.from("users").select("id").eq("id", user.id).single();
  if (!mapping) {
    await supabaseAdmin.from("users").insert({
      id: user.id,
      org_id: ORG_ID,
      name,
      email,
      role: "agent",
      status: "offline",
    });
    console.log("Mapped to public.users");
  } else {
    console.log("Already mapped.");
  }
}

run().catch(console.error);
