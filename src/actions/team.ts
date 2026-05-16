"use server"

import { supabaseAdmin } from "@/lib/supabase-admin"

// Hardcoded for MVP
const ORG_ID = "ec2f8436-05dc-4621-8a7f-57202f865b8e"

export async function getTeammates() {
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("*")
    .eq("org_id", ORG_ID)
    .order("created_at", { ascending: true })

  if (error) {
    console.error("Error fetching teammates:", error)
    return []
  }

  return data || []
}

export async function addTeammate(name: string, email: string, role: string = "Agent") {
  try {
    // 1. Create the user in Supabase Auth using Admin API
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: email,
      password: "Hostnin2026!", // Default MVP password
      email_confirm: true,
      user_metadata: {
        name: name,
        role: role
      }
    })

    if (authError) {
      console.error("Error creating auth user:", authError)
      return { success: false, error: authError.message }
    }

    if (!authData.user) {
      return { success: false, error: "Failed to create user" }
    }

    // 2. Insert into the public.users table
    const { error: dbError } = await supabaseAdmin
      .from("users")
      .insert({
        id: authData.user.id,
        org_id: ORG_ID,
        name: name,
        email: email,
        role: role,
        is_active: true
      })

    if (dbError) {
      console.error("Error inserting into public.users:", dbError)
      // Cleanup the auth user if DB insert fails
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id)
      return { success: false, error: dbError.message }
    }

    return { success: true }
  } catch (err: any) {
    console.error("Exception in addTeammate:", err)
    return { success: false, error: err.message || "An unexpected error occurred" }
  }
}
