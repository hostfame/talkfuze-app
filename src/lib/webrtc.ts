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

export function createPeerConnection(): RTCPeerConnection {
  return new RTCPeerConnection({ iceServers: ICE_SERVERS })
}
