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

/** Mobile-safe audio constraints with echo cancellation and noise suppression */
export const VOICE_CONSTRAINTS: MediaStreamConstraints = {
  audio: {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    // Lower sample rate for better mobile compatibility
    sampleRate: 48000,
  },
  video: false,
}

export type PeerConnectionCallbacks = {
  /** Called when ICE connection fails or disconnects after being connected */
  onConnectionFailed?: () => void
  /** Called when connection successfully establishes */
  onConnected?: () => void
  /** 
   * When true, the ICE timeout won't start until startTimeout() is called.
   * Use for agent-initiated calls where the visitor hasn't accepted yet.
   */
  deferTimeout?: boolean
}

/**
 * Creates a monitored RTCPeerConnection with auto-timeout and connection
 * state tracking. Automatically cleans up if ICE never connects.
 * 
 * When deferTimeout is true, the ICE timeout won't begin until pc.startTimeout()
 * is called. Use this for outgoing calls where the remote party hasn't accepted yet.
 */
export function createPeerConnection(callbacks?: PeerConnectionCallbacks): RTCPeerConnection & { startTimeout: () => void } {
  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })

  let iceTimeout: ReturnType<typeof setTimeout> | null = null

  const startTimeout = () => {
    if (iceTimeout) return // Already started
    iceTimeout = setTimeout(() => {
      if (pc.iceConnectionState === 'checking' || pc.iceConnectionState === 'new') {
        console.warn('[WebRTC] ICE connection timeout after 15s, closing')
        callbacks?.onConnectionFailed?.()
      }
      iceTimeout = null
    }, ICE_CONNECTION_TIMEOUT_MS)
  }

  // Start timeout immediately unless deferred
  if (!callbacks?.deferTimeout) {
    startTimeout()
  }

  // Attach startTimeout to the pc object for easy access
  ;(pc as any).startTimeout = startTimeout

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

  return pc as RTCPeerConnection & { startTimeout: () => void }
}

/**
 * Creates and attaches a mobile-safe audio element for WebRTC remote audio.
 * 
 * Mobile browsers (especially iOS Safari and Android Chrome) have strict
 * autoplay policies. This function:
 * 1. Creates a hidden audio element with proper attributes
 * 2. Attaches it to DOM (required for Safari)
 * 3. Sets playsinline (required for iOS)
 * 4. Handles play() promise rejection gracefully
 * 5. Returns the element for cleanup reference
 */
export function createRemoteAudioElement(stream: MediaStream): HTMLAudioElement {
  const audio = document.createElement('audio')
  audio.autoplay = true
  audio.setAttribute('playsinline', '')
  audio.setAttribute('webkit-playsinline', '')
  // Prevent iOS from routing to speaker by default (use earpiece for calls)
  audio.setAttribute('x-webkit-airplay', 'deny')
  audio.srcObject = stream
  // Style: hidden but in DOM (required for mobile playback)
  audio.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;opacity:0;pointer-events:none;'
  document.body.appendChild(audio)

  // Try to play - on mobile this may fail due to autoplay policy
  // but the user gesture from clicking "Accept Call" should allow it
  const playPromise = audio.play()
  if (playPromise) {
    playPromise.catch(err => {
      console.warn('[WebRTC] Audio autoplay blocked, retrying on next user interaction:', err.message)
      // Fallback: play on next user touch/click (iOS requirement)
      const resumeAudio = () => {
        audio.play().catch(() => {})
        document.removeEventListener('touchstart', resumeAudio)
        document.removeEventListener('click', resumeAudio)
      }
      document.addEventListener('touchstart', resumeAudio, { once: true })
      document.addEventListener('click', resumeAudio, { once: true })
    })
  }

  return audio
}

/**
 * Creates a blank audio element synchronously inside a user gesture event
 * (like clicking 'Accept') to unlock mobile browser audio autoplay.
 * This should be invoked synchronously at the start of click handlers
 * before any async await statements.
 */
export function unlockAudioContext(): HTMLAudioElement {
  const audio = document.createElement('audio')
  audio.autoplay = true
  audio.setAttribute('playsinline', '')
  audio.setAttribute('webkit-playsinline', '')
  audio.setAttribute('x-webkit-airplay', 'deny')
  audio.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;opacity:0;pointer-events:none;'
  document.body.appendChild(audio)
  
  // Warm up / play blank element immediately to register user gesture interaction
  audio.play().catch(() => {})
  return audio
}

/**
 * Binds the remote stream to the pre-unlocked mobile audio element.
 */
export function bindRemoteAudioStream(audio: HTMLAudioElement, stream: MediaStream) {
  audio.srcObject = stream
  audio.play().catch(err => {
    console.warn('[WebRTC] Failed to play bound remote stream:', err)
  })
}

/**
 * Safely cleans up a remote audio element created by createRemoteAudioElement.
 */
export function destroyRemoteAudioElement(audio: HTMLAudioElement | null) {
  if (!audio) return
  audio.pause()
  audio.srcObject = null
  if (audio.parentNode) {
    audio.parentNode.removeChild(audio)
  }
}

/**
 * Screen Wake Lock - prevents device screen from sleeping during active calls.
 * Crucial for mobile: without this, the screen dims and the call gets
 * backgrounded which can kill the WebRTC connection.
 */
let wakeLockSentinel: WakeLockSentinel | null = null

export async function requestWakeLock(): Promise<void> {
  try {
    if ('wakeLock' in navigator) {
      wakeLockSentinel = await (navigator as any).wakeLock.request('screen')
      console.log('[WebRTC] Screen wake lock acquired')
      // Re-acquire if released by browser (tab switch)
      wakeLockSentinel?.addEventListener('release', () => {
        console.log('[WebRTC] Wake lock released')
        wakeLockSentinel = null
      })
    }
  } catch (err) {
    console.warn('[WebRTC] Wake lock not available:', err)
  }
}

export function releaseWakeLock(): void {
  if (wakeLockSentinel) {
    wakeLockSentinel.release().catch(() => {})
    wakeLockSentinel = null
    console.log('[WebRTC] Wake lock released manually')
  }
}

/**
 * Detects if the browser supports screen capture (getDisplayMedia).
 * Returns false on iOS (all browsers) which don't support it.
 */
export function isScreenShareSupported(): boolean {
  if (typeof navigator === 'undefined') return false
  if (!navigator.mediaDevices) return false
  if (typeof navigator.mediaDevices.getDisplayMedia !== 'function') return false
  // iOS detection - getDisplayMedia exists but throws on iOS
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  return !isIOS
}
