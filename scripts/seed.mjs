import { createClient } from "@supabase/supabase-js";
import ws from "ws";

const supabaseUrl = "https://fyuymnldgvfvdqcnbsxh.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ5dXltbmxkZ3ZmdmRxY25ic3hoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODgxNzUwNiwiZXhwIjoyMDk0MzkzNTA2fQ.fkZvxGkgW3yktVkLUxmOaEEdVRTymtrFK4uOj9Wa66A";

const supabaseAdmin = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false },
  realtime: { transport: ws },
});

const ORG_ID = "ec2f8436-05dc-4621-8a7f-57202f865b8e";

async function seed() {
  const agents = [
    { name: "Imran", email: "imran@hostnin.com", role: "Admin" },
    { name: "Asad", email: "asad@hostnin.com", role: "Agent" },
  ];

  for (const agent of agents) {
    // Create Auth User
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: agent.email,
      password: "Hostnin2026!",
      email_confirm: true,
      user_metadata: { name: agent.name, role: agent.role },
    });

    if (authError) {
      if (authError) {
        console.log(`${agent.email} encountered error: ${authError.message}. Trying to map existing user.`);
        // Try to fetch existing user
        const { data: { users } } = await supabaseAdmin.auth.admin.listUsers();
        const existingUser = users.find((u) => u.email === agent.email);
        if (existingUser) {
          // Check if mapped
          const { data: mapping } = await supabaseAdmin.from("users").select("id").eq("id", existingUser.id).single();
          if (!mapping) {
            await supabaseAdmin.from("users").insert({
              id: existingUser.id,
              org_id: ORG_ID,
              name: agent.name,
              email: agent.email,
              role: agent.role,
              status: 'offline',
            });
            console.log(`Mapped existing user ${agent.email} to public.users`);
          }
        }
      } else {
        console.error(`Error creating ${agent.email}:`, authError.message);
      }
      continue;
    }

    if (authData?.user) {
      // Map to public.users
      const { error: dbError } = await supabaseAdmin.from("users").insert({
        id: authData.user.id,
        org_id: ORG_ID,
        name: agent.name,
        email: agent.email,
        role: agent.role,
        status: 'offline',
      });

      if (dbError) {
        console.error(`Error mapping ${agent.email}:`, dbError.message);
      } else {
        console.log(`Successfully created and mapped ${agent.email}`);
      }
    }
  }
}

seed().catch(console.error);
