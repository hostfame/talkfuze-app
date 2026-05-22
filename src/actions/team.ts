"use server"

import { supabaseAdmin } from "@/lib/supabase-admin"

import { createClient } from "@/lib/supabase/server"
import { getErrorMessage } from "@/lib/utils"

export async function getTeammates() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Unauthorized")
  
  const { data: profile } = await supabaseAdmin.from("users").select("org_id").eq("id", user.id).single()
  if (!profile) throw new Error("Profile not found")

  const { data, error } = await supabaseAdmin
    .from("users")
    .select("*")
    .eq("org_id", profile.org_id)
    .order("created_at", { ascending: true })

  if (error) {
    console.error("Error fetching teammates:", error)
    return []
  }

  return data || []
}

export async function updateTeammateRole(targetUserId: string, newRole: string) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error("Unauthorized")

    // Check if current user is admin
    const { data: currentUserProfile } = await supabaseAdmin
      .from("users")
      .select("role, org_id")
      .eq("id", user.id)
      .single()

    if (!currentUserProfile || currentUserProfile.role !== "admin") {
      return { success: false, error: "Only admins can change roles" }
    }

    // Verify the target user is in the same org
    const { data: targetUserProfile } = await supabaseAdmin
      .from("users")
      .select("org_id")
      .eq("id", targetUserId)
      .single()

    if (!targetUserProfile || targetUserProfile.org_id !== currentUserProfile.org_id) {
      return { success: false, error: "User not found in your organization" }
    }

    // Update the role in public.users
    const { error: dbError } = await supabaseAdmin
      .from("users")
      .update({ role: newRole.toLowerCase() })
      .eq("id", targetUserId)

    if (dbError) throw new Error(dbError.message)

    await supabaseAdmin.auth.admin.updateUserById(targetUserId, {
      user_metadata: { role: newRole.toLowerCase() }
    })

    return { success: true }
  } catch (err: unknown) {
    console.error("Error updating teammate role:", err)
    return { success: false, error: getErrorMessage(err) }
  }
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
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error("Unauthorized")
    const { data: profile } = await supabaseAdmin.from("users").select("org_id").eq("id", user.id).single()
    if (!profile) throw new Error("Profile not found")

    const { error: dbError } = await supabaseAdmin
      .from("users")
      .insert({
        id: authData.user.id,
        org_id: profile.org_id,
        name: name,
        email: email,
        role: role.toLowerCase(),
        status: "offline"
      })

    if (dbError) {
      console.error("Error inserting into public.users:", dbError)
      // Cleanup the auth user if DB insert fails
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id)
      return { success: false, error: dbError.message }
    }

    return { success: true }
  } catch (err: unknown) {
    console.error("Exception in addTeammate:", err)
    return { success: false, error: getErrorMessage(err) }
  }
}

export async function updateProfile(updates: { name?: string; avatar_url?: string; email?: string }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) throw new Error("Unauthorized")

  // Using supabaseAdmin to update public.users
  const { error } = await supabaseAdmin
    .from('users')
    .update(updates)
    .eq('id', user.id)

  if (error) {
    console.error("Failed to update profile", error)
    return { success: false, error: error.message }
  }

  return { success: true }
}

export async function uploadAvatar(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) throw new Error("Unauthorized")

  const file = formData.get('file') as File
  if (!file) throw new Error("No file provided")

  const fileExt = file.name.split('.').pop()
  const filePath = `${user.id}-${Math.random()}.${fileExt}`

  // Use supabaseAdmin (Service Role Key) to bypass RLS
  const { error: uploadError } = await supabaseAdmin.storage
    .from('avatars')
    .upload(filePath, file)

  if (uploadError) {
    console.error("Upload error", uploadError)
    return { success: false, error: uploadError.message }
  }

  const { data: { publicUrl } } = supabaseAdmin.storage
    .from('avatars')
    .getPublicUrl(filePath)

  return { success: true, url: publicUrl }
}
