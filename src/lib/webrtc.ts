/**
 * Shared WebRTC ICE server configuration for TalkFuze.
 * 
 * Uses self-hosted coturn TURN server on strack VPS (46.225.152.127)
 * plus Google STUN servers for direct connectivity when possible.
 * 
 * TURN relay is critical for cross-network connections where
 * direct peer-to-peer (STUN-only) fails due to symmetric NATs.
 */

export const ICE_SERVERS: RTCIceServer[] = [
  // Google STUN servers (free, for direct connections)
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  // Self-hosted TURN server on strack VPS
  // UDP (fastest, works in most cases)
  {
    urls: 'turn:46.225.152.127:3478',
    username: 'talkfuze',
    credential: 'Tf$Turn2026!Secure'
  },
  // TCP fallback (for restrictive firewalls that block UDP)
  {
    urls: 'turn:46.225.152.127:3478?transport=tcp',
    username: 'talkfuze',
    credential: 'Tf$Turn2026!Secure'
  },
]

/** Connection timeout in milliseconds - if ICE doesn't connect in 15s, auto-cleanup */
const ICE_CONNECTION_TIMEOUT_MS = 15000

export type PeerConnectionCallbacks = {
  /** Called when ICE connection fails or disconnects after being connected */
  onConnectionFailed?: () => void
  /** Called when connection successfully establishes */
  onConnected?: () => void
}

/**
 * Creates a monitored RTCPeerConnection with auto-timeout and connection
 * state tracking. Automatically cleans up if ICE never connects.
 */
export function createPeerConnection(callbacks?: PeerConnectionCallbacks): RTCPeerConnection {
  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })

  // ICE connection timeout - auto-close if stuck in "checking" for too long
  let iceTimeout: ReturnType<typeof setTimeout> | null = setTimeout(() => {
    if (pc.iceConnectionState === 'checking' || pc.iceConnectionState === 'new') {
      console.warn('[WebRTC] ICE connection timeout after 15s, closing')
      callbacks?.onConnectionFailed?.()
    }
    iceTimeout = null
  }, ICE_CONNECTION_TIMEOUT_MS)

  pc.oniceconnectionstatechange = () => {
    const state = pc.iceConnectionState
    console.log(`[WebRTC] ICE state: ${state}`)

    if (state === 'connected' || state === 'completed') {
      // Connection successful, clear timeout
      if (iceTimeout) { clearTimeout(iceTimeout); iceTimeout = null }
      callbacks?.onConnected?.()
    }

    if (state === 'failed') {
      if (iceTimeout) { clearTimeout(iceTimeout); iceTimeout = null }
      console.error('[WebRTC] ICE connection failed')
      callbacks?.onConnectionFailed?.()
    }

    if (state === 'disconnected') {
      // Brief disconnection, might recover. Wait 5s then check.
      setTimeout(() => {
        if (pc.iceConnectionState === 'disconnected') {
          console.warn('[WebRTC] ICE still disconnected after 5s, treating as failed')
          callbacks?.onConnectionFailed?.()
        }
      }, 5000)
    }
  }

  return pc
}
