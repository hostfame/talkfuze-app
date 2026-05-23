"use server"

import { supabaseAdmin } from "@/lib/supabase-admin"
import { unstable_noStore as noStore } from "next/cache"

export async function getCannedReplies(orgId: string) {
  noStore()
  if (!orgId) return []
  const { data, error } = await supabaseAdmin
    .from("canned_replies")
    .select("*")
    .eq("org_id", orgId)
    .order("shortcut", { ascending: true })

  if (error) {
    console.error("Error fetching canned replies:", error)
    return []
  }
  return data || []
}

export async function createCannedReply(orgId: string, shortcut: string, content: string, category: string = "general") {
  if (!orgId || !shortcut || !content) throw new Error("Missing required fields")
  
  // Format shortcut to start with slash /
  const formattedShortcut = shortcut.startsWith("/") ? shortcut.toLowerCase() : `/${shortcut.toLowerCase()}`

  const { data, error } = await supabaseAdmin
    .from("canned_replies")
    .insert([{
      org_id: orgId,
      shortcut: formattedShortcut,
      content,
      category: category.toLowerCase()
    }])
    .select()

  if (error) {
    console.error("Error creating canned reply:", error)
    throw new Error(error.message)
  }
  return data[0]
}

export async function updateCannedReply(id: string, shortcut: string, content: string, category: string = "general") {
  if (!id || !shortcut || !content) throw new Error("Missing required fields")
  
  const formattedShortcut = shortcut.startsWith("/") ? shortcut.toLowerCase() : `/${shortcut.toLowerCase()}`

  const { data, error } = await supabaseAdmin
    .from("canned_replies")
    .update({
      shortcut: formattedShortcut,
      content,
      category: category.toLowerCase()
    })
    .eq("id", id)
    .select()

  if (error) {
    console.error("Error updating canned reply:", error)
    throw new Error(error.message)
  }
  return data[0]
}

export async function deleteCannedReply(id: string) {
  if (!id) throw new Error("Missing snippet ID")
  const { error } = await supabaseAdmin
    .from("canned_replies")
    .delete()
    .eq("id", id)

  if (error) {
    console.error("Error deleting canned reply:", error)
    throw new Error(error.message)
  }
  return true
}
