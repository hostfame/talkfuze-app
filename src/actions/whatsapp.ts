"use server"

const EVOLUTION_URL = 'http://46.225.152.127:8080'
const EVOLUTION_API_KEY = 'talkfuze_evolution_key_2026'
const EVOLUTION_INSTANCE = 'talkfuze'

/**
 * Logs out and deletes the WhatsApp Evolution instance.
 * This must run server-side since the Evolution API is on an internal VPS IP.
 */
export async function disconnectWhatsAppEvolution() {
  // Step 1: Logout (gracefully ends the WA session on the phone)
  try {
    await fetch(`${EVOLUTION_URL}/instance/logout/${EVOLUTION_INSTANCE}`, {
      method: 'DELETE',
      headers: { apikey: EVOLUTION_API_KEY },
      cache: 'no-store'
    })
  } catch (_) {
    // Ignore - instance may already be disconnected
  }

  // Step 2: Delete the instance so next QR scan creates fresh auth
  try {
    await fetch(`${EVOLUTION_URL}/instance/delete/${EVOLUTION_INSTANCE}`, {
      method: 'DELETE',
      headers: { apikey: EVOLUTION_API_KEY },
      cache: 'no-store'
    })
  } catch (_) {
    // Ignore
  }
}
