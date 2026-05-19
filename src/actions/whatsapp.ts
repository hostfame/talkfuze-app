"use server"

import { supabaseAdmin } from "@/lib/supabase-admin"

const EVOLUTION_URL = 'http://46.225.152.127:8080'
const EVOLUTION_API_KEY = 'talkfuze_evolution_key_2026'
const EVOLUTION_INSTANCE = 'talkfuze'

/**
 * Fully disconnects WhatsApp:
 * 1. Logs out + deletes the Evolution instance (server-side, bypasses firewall)
 * 2. Deletes the Supabase channel row using service role (bypasses RLS)
 *
 * Must run as server action - browser anon client cannot delete channels (RLS blocked).
 */
export async function disconnectWhatsAppFull(channelId: string) {
  // Step 1: Logout from Evolution API
  try {
    await fetch(`${EVOLUTION_URL}/instance/logout/${EVOLUTION_INSTANCE}`, {
      method: 'DELETE',
      headers: { apikey: EVOLUTION_API_KEY },
      cache: 'no-store'
    })
  } catch (_) {
    // Ignore - instance may already be gone
  }

  // Step 2: Delete Evolution instance so next QR scan creates fresh auth
  try {
    await fetch(`${EVOLUTION_URL}/instance/delete/${EVOLUTION_INSTANCE}`, {
      method: 'DELETE',
      headers: { apikey: EVOLUTION_API_KEY },
      cache: 'no-store'
    })
  } catch (_) {
    // Ignore
  }

  // Step 3: Delete the channel row using service role (bypasses RLS)
  const { error } = await supabaseAdmin
    .from('channels')
    .delete()
    .eq('id', channelId)

  if (error) throw new Error(`Failed to delete channel: ${error.message}`)
}

