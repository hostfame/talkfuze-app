"use server"

import { supabaseAdmin } from "@/lib/supabase-admin"

const EVOLUTION_URL = 'http://46.225.152.127:8080'
const EVOLUTION_API_KEY = 'talkfuze_evolution_key_2026'
const EVOLUTION_INSTANCE = 'talkfuze'

/**
 * Soft-disconnects WhatsApp:
 * 1. Logs out + deletes the Evolution instance (server-side, bypasses firewall)
 * 2. Updates the Supabase channel row to 'disconnected' status (preserves chat history)
 *
 * IMPORTANT: We do NOT delete the channel row because conversations and messages
 * reference it via channel_id with ON DELETE CASCADE. Deleting the channel would
 * wipe ALL chat history. Instead we soft-disconnect by updating the status.
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

  // Step 3: Soft-disconnect - update status, clear connection config, keep the row
  const { error } = await supabaseAdmin
    .from('channels')
    .update({
      config: { status: 'disconnected', qr_code: null, pairing_code: null },
      is_active: false
    })
    .eq('id', channelId)

  if (error) throw new Error(`Failed to disconnect channel: ${error.message}`)
}

export async function getOrCreateWhatsAppInstance(orgId: string) {
  try {
    // ALWAYS delete the instance first if it exists to guarantee a fresh Baileys session and instant QR code generation
    try {
      await fetch(`${EVOLUTION_URL}/instance/delete/${EVOLUTION_INSTANCE}`, {
        method: 'DELETE',
        headers: { apikey: EVOLUTION_API_KEY },
        cache: 'no-store'
      })
    } catch (_) {
      // Ignore - instance may not exist yet
    }

    // Create a brand new fresh instance
    await fetch(`${EVOLUTION_URL}/instance/create`, {
      method: 'POST',
      headers: {
        apikey: EVOLUTION_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        instanceName: EVOLUTION_INSTANCE,
        qrcode: true,
        integration: 'WHATSAPP-BAILEYS'
      }),
      cache: 'no-store'
    })

    // Set webhook for the fresh instance
    await fetch(`${EVOLUTION_URL}/webhook/set/${EVOLUTION_INSTANCE}`, {
      method: 'POST',
      headers: {
        apikey: EVOLUTION_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        webhook: {
          enabled: true,
          url: 'http://46.225.152.127:3001/webhook/evolution',
          byEvents: false,
          base64: true,
          events: ['MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'CONNECTION_UPDATE', 'QRCODE_UPDATED']
        }
      }),
      cache: 'no-store'
    })
  } catch (err) {
    console.error('Error creating WhatsApp instance:', err)
  }

  // 2. Ensure channel row exists in Supabase
  const { data: existing } = await supabaseAdmin
    .from('channels')
    .select('id')
    .eq('org_id', orgId)
    .eq('type', 'whatsapp')
    .maybeSingle()

  if (!existing) {
    await supabaseAdmin.from('channels').insert({
      org_id: orgId,
      type: 'whatsapp',
      config: { status: 'pending' },
      is_active: true
    })
  } else {
    // If it already exists (e.g. after a soft-disconnect), reactivate and reset status
    await supabaseAdmin.from('channels')
      .update({ config: { status: 'pending' }, is_active: true })
      .eq('id', existing.id)
  }
}


