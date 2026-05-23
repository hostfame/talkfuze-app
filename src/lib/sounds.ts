let cachedCtx: AudioContext | null = null;

// Initialize or get the cached AudioContext
export const getAudioContext = (): AudioContext | null => {
  if (typeof window === 'undefined') return null;
  
  if (!cachedCtx) {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioContextClass) {
      cachedCtx = new AudioContextClass();
    }
  }
  return cachedCtx;
};

// Setup automatic unlock listeners on the very first user interaction
if (typeof window !== 'undefined') {
  const unlock = () => {
    const ctx = getAudioContext();
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().then(() => {
        // Once successfully unlocked, remove the event listeners to save CPU cycles
        removeListeners();
      }).catch((err) => {
        console.warn('Failed to resume AudioContext:', err);
      });
    } else if (ctx && ctx.state === 'running') {
      removeListeners();
    }
  };

  const removeListeners = () => {
    window.removeEventListener('click', unlock);
    window.removeEventListener('touchstart', unlock);
    window.removeEventListener('keydown', unlock);
  };

  window.addEventListener('click', unlock, { passive: true });
  window.addEventListener('touchstart', unlock, { passive: true });
  window.addEventListener('keydown', unlock, { passive: true });
}

// ─────────────────────────────────────────────
// Sound Presets System
// ─────────────────────────────────────────────

export type SoundPreset = 'default' | 'chime' | 'bell' | 'alert' | 'loud' | 'custom' | 'intercom';

export const SOUND_PRESETS: { id: SoundPreset; name: string; description: string }[] = [
  { id: 'intercom', name: 'Intercom (Cute)', description: 'Beautiful soft intercom-style pop' },
  { id: 'default', name: 'Default', description: 'Subtle pop sound' },
  { id: 'chime', name: 'Chime', description: 'Two-tone rising chime' },
  { id: 'bell', name: 'Bell', description: 'Clear bell ring' },
  { id: 'alert', name: 'Alert', description: 'Urgent double-beep' },
  { id: 'loud', name: 'Loud Ping', description: 'Loud triple ping for noisy environments' },
  { id: 'custom', name: 'Custom Uploaded Sound', description: 'Your custom uploaded notification sound' },
];

export const getSelectedSound = (): SoundPreset => {
  if (typeof window === 'undefined') return 'loud';
  return (localStorage.getItem('talkfuze_sound_preset') as SoundPreset) || 'loud';
};

export const setSelectedSound = (preset: SoundPreset): void => {
  if (typeof window === 'undefined') return;
  localStorage.setItem('talkfuze_sound_preset', preset);
};

// Minimum volume floors - agents can't go below this
export const MIN_SOUND_VOLUME = 0.30;
export const MIN_RINGTONE_VOLUME = 0.40;

export const getSoundVolume = (): number => {
  if (typeof window === 'undefined') return 1.0;
  const stored = localStorage.getItem('talkfuze_sound_volume');
  const val = stored ? parseFloat(stored) : 1.0;
  return Math.max(MIN_SOUND_VOLUME, val);
};

export const setSoundVolume = (vol: number): void => {
  if (typeof window === 'undefined') return;
  localStorage.setItem('talkfuze_sound_volume', String(Math.max(MIN_SOUND_VOLUME, Math.min(1, vol))));
};

// ─────────────────────────────────────────────
// Call Ringtone Presets System
// ─────────────────────────────────────────────

export type RingtonePreset = 'classic' | 'digital' | 'urgent' | 'marimba' | 'siren' | 'custom';

export const RINGTONE_PRESETS: { id: RingtonePreset; name: string; description: string }[] = [
  { id: 'classic', name: 'Classic', description: 'Traditional telephone ring' },
  { id: 'digital', name: 'Digital', description: 'Modern soft digital tone' },
  { id: 'urgent', name: 'Urgent', description: 'Fast-paced alert ring' },
  { id: 'marimba', name: 'Marimba', description: 'Melodic ascending pattern' },
  { id: 'siren', name: 'Siren', description: 'Loud oscillating alarm for noisy environments' },
  { id: 'custom', name: 'Custom Uploaded Ringtone', description: 'Your custom uploaded call ringtone' },
];

export const getSelectedRingtone = (): RingtonePreset => {
  if (typeof window === 'undefined') return 'siren';
  return (localStorage.getItem('talkfuze_ringtone_preset') as RingtonePreset) || 'siren';
};

export const setSelectedRingtone = (preset: RingtonePreset): void => {
  if (typeof window === 'undefined') return;
  localStorage.setItem('talkfuze_ringtone_preset', preset);
};

export const getRingtoneVolume = (): number => {
  if (typeof window === 'undefined') return 1.0;
  const stored = localStorage.getItem('talkfuze_ringtone_volume');
  const val = stored ? parseFloat(stored) : 1.0;
  return Math.max(MIN_RINGTONE_VOLUME, val);
};

export const setRingtoneVolume = (vol: number): void => {
  if (typeof window === 'undefined') return;
  localStorage.setItem('talkfuze_ringtone_volume', String(Math.max(MIN_RINGTONE_VOLUME, Math.min(1, vol))));
};

// ─────────────────────────────────────────────
// Synthesized Sound Engine (fallback when mp3 blocked)
// ─────────────────────────────────────────────

const playSynthesizedSound = (type: 'send' | 'receive') => {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.setValueAtTime(-30, ctx.currentTime);
    compressor.knee.setValueAtTime(40, ctx.currentTime);
    compressor.ratio.setValueAtTime(12, ctx.currentTime);
    compressor.attack.setValueAtTime(0.005, ctx.currentTime);
    compressor.release.setValueAtTime(0.25, ctx.currentTime);
    compressor.connect(ctx.destination);

    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();
    
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(700, ctx.currentTime);
    
    osc.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(compressor);
    
    if (type === 'send') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(250, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(320, ctx.currentTime + 0.1);
      
      gainNode.gain.setValueAtTime(0, ctx.currentTime);
      gainNode.gain.linearRampToValueAtTime(0.08, ctx.currentTime + 0.04);
      gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
      
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.25);
    } else {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(350, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(450, ctx.currentTime + 0.08);
      
      gainNode.gain.setValueAtTime(0, ctx.currentTime);
      gainNode.gain.linearRampToValueAtTime(0.06, ctx.currentTime + 0.03);
      gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
      
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      const filter2 = ctx.createBiquadFilter();
      filter2.type = 'lowpass';
      filter2.frequency.setValueAtTime(800, ctx.currentTime);
      
      osc2.connect(filter2);
      filter2.connect(gain2);
      gain2.connect(compressor);
      
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(450, ctx.currentTime + 0.12);
      osc2.frequency.exponentialRampToValueAtTime(550, ctx.currentTime + 0.2);
      
      gain2.gain.setValueAtTime(0, ctx.currentTime + 0.12);
      gain2.gain.linearRampToValueAtTime(0.06, ctx.currentTime + 0.15);
      gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.27);
      
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.15);
      
      osc2.start(ctx.currentTime + 0.12);
      osc2.stop(ctx.currentTime + 0.3);
    }
  } catch (err) {
    console.error('Synthesized sound play error:', err);
  }
};

// ─────────────────────────────────────────────
// Preset Sound Synthesizers (WebAudio - works everywhere)
// ─────────────────────────────────────────────

const playSynthPreset = (preset: SoundPreset, volumeMultiplier: number) => {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});

    const t = ctx.currentTime;
    const vol = volumeMultiplier;

    // For loud/alert: bypass compressor, go straight to destination with a waveshaper for max volume
    // For others: use a light limiter
    if (preset === 'loud') {
      // ── MAXIMUM LOUDNESS PATH ──
      // Waveshaper for soft-clipping saturation (pushes perceived loudness beyond digital ceiling)
      const waveshaper = ctx.createWaveShaper();
      const curve = new Float32Array(256);
      for (let i = 0; i < 256; i++) {
        const x = (i * 2) / 256 - 1;
        curve[i] = (Math.PI + 3.5) * x / (Math.PI + 3.5 * Math.abs(x)); // tanh-like soft clip
      }
      waveshaper.curve = curve;
      waveshaper.oversample = '2x';

      // Master gain (no compressor - raw output)
      const masterGain = ctx.createGain();
      masterGain.gain.setValueAtTime(1.0, t);
      masterGain.connect(waveshaper);
      waveshaper.connect(ctx.destination);

      // Fat tone: stacks 2 slightly detuned oscillators for each note
      const fatTone = (freq: number, start: number, dur: number, gain: number) => {
        for (const detune of [-4, 4]) {
          const osc = ctx.createOscillator();
          const g = ctx.createGain();
          osc.connect(g);
          g.connect(masterGain);
          osc.type = 'square';
          osc.frequency.setValueAtTime(freq, t + start);
          osc.detune.setValueAtTime(detune, t + start);
          g.gain.setValueAtTime(0, t + start);
          g.gain.linearRampToValueAtTime(gain * vol, t + start + 0.005);
          g.gain.setValueAtTime(gain * vol, t + start + dur * 0.7);
          g.gain.exponentialRampToValueAtTime(0.001, t + start + dur);
          osc.start(t + start);
          osc.stop(t + start + dur + 0.05);
        }
      };

      // Hit 1: aggressive ascending triple
      fatTone(1318, 0, 0.22, 1.0);       // E6
      fatTone(1568, 0.14, 0.22, 0.95);   // G6
      fatTone(1976, 0.28, 0.28, 1.0);    // B6
      // Hit 2: repeat
      fatTone(1318, 0.62, 0.22, 1.0);
      fatTone(1568, 0.76, 0.22, 0.95);
      fatTone(1976, 0.90, 0.28, 1.0);
      // Sub-bass punch on both hits
      fatTone(110, 0, 0.25, 0.60);
      fatTone(110, 0.62, 0.25, 0.60);
      return;
    }

    // ── STANDARD PATH (with limiter) ──
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.setValueAtTime(-3, t);
    comp.knee.setValueAtTime(6, t);
    comp.ratio.setValueAtTime(3, t);
    comp.attack.setValueAtTime(0.003, t);
    comp.release.setValueAtTime(0.08, t);
    comp.connect(ctx.destination);

    // Helper to make a tone
    const tone = (freq: number, start: number, dur: number, gain: number, waveType: OscillatorType = 'sine', filterFreq: number = 3500) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      const filt = ctx.createBiquadFilter();
      filt.type = 'lowpass';
      filt.frequency.setValueAtTime(filterFreq, t);
      osc.connect(filt);
      filt.connect(g);
      g.connect(comp);
      osc.type = waveType;
      osc.frequency.setValueAtTime(freq, t + start);
      g.gain.setValueAtTime(0, t + start);
      g.gain.linearRampToValueAtTime(gain * vol, t + start + 0.005);
      g.gain.setValueAtTime(gain * vol, t + start + dur * 0.65);
      g.gain.exponentialRampToValueAtTime(0.001, t + start + dur);
      osc.start(t + start);
      osc.stop(t + start + dur + 0.05);
    };

    switch (preset) {
      case 'intercom': {
        // Premium Intercom-style cute soft sliding pop
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        const filt = ctx.createBiquadFilter();
        filt.type = 'lowpass';
        filt.frequency.setValueAtTime(1400, t);
        
        osc.connect(filt);
        filt.connect(g);
        g.connect(comp);
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, t); // start at A4
        osc.frequency.exponentialRampToValueAtTime(784, t + 0.08); // slide up to G5
        
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.35 * vol, t + 0.015); // soft attack
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.22); // smooth decay
        
        osc.start(t);
        osc.stop(t + 0.25);

        // A tiny high-frequency accent chime overlay for premium texture
        const osc2 = ctx.createOscillator();
        const g2 = ctx.createGain();
        osc2.connect(g2);
        g2.connect(comp);
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(1568, t + 0.02); // G6 chime
        g2.gain.setValueAtTime(0, t + 0.02);
        g2.gain.linearRampToValueAtTime(0.06 * vol, t + 0.03);
        g2.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
        osc2.start(t + 0.02);
        osc2.stop(t + 0.18);
        break;
      }

      case 'chime':
        // Two-tone rising chime - bright and clear
        tone(880, 0, 0.3, 0.70);       // A5
        tone(1175, 0.15, 0.35, 0.65);  // D6
        break;

      case 'bell':
        // Clear bell ring - bright hit with harmonics
        tone(1047, 0, 0.45, 0.75, 'sine', 5000);  // C6
        tone(2093, 0, 0.3, 0.40, 'sine', 6000);   // C7 harmonic
        tone(1568, 0.05, 0.25, 0.30, 'sine', 5000); // G6 shimmer
        break;

      case 'alert':
        // Urgent double-beep - hard square wave hits
        tone(1200, 0, 0.18, 0.90, 'square', 3000);
        tone(1200, 0.25, 0.18, 0.90, 'square', 3000);
        break;

      default:
        // 'default' - balanced pop
        tone(880, 0, 0.22, 0.55);
        tone(1100, 0.1, 0.18, 0.45);
        break;
    }
  } catch (err) {
    console.error('Preset sound play error:', err);
  }
};

// Play preview of a specific preset (for settings page)
export const previewSound = (preset: SoundPreset): void => {
  const vol = getSoundVolume();
  playSynthPreset(preset, vol);
};

// ─────────────────────────────────────────────
// DND (Do Not Disturb) Check
// ─────────────────────────────────────────────

export const isDndActive = (): boolean => {
  if (typeof window === 'undefined') return false;
  const enabled = localStorage.getItem('talkfuze_dnd') === 'true';
  if (!enabled) return false;

  const start = localStorage.getItem('talkfuze_dnd_start') || '22:00';
  const end = localStorage.getItem('talkfuze_dnd_end') || '07:00';
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  const startMin = sh * 60 + sm;
  const endMin = eh * 60 + em;

  // Handle overnight ranges (e.g. 22:00 - 07:00)
  if (startMin <= endMin) {
    return nowMin >= startMin && nowMin < endMin;
  } else {
    return nowMin >= startMin || nowMin < endMin;
  }
};

// ─────────────────────────────────────────────
// Desktop Notification + Tab Badge Utilities
// ─────────────────────────────────────────────

export const sendDesktopNotification = (title: string, body: string): void => {
  if (typeof window === 'undefined') return;
  if (isDndActive()) return;
  if (localStorage.getItem('talkfuze_desktop_notifs') === 'false') return;
  if (!('Notification' in window) || Notification.permission !== 'granted') return;

  const showPreview = localStorage.getItem('talkfuze_notif_preview') !== 'false';
  try {
    const notif = new Notification(title, {
      body: showPreview ? body : 'New message received',
      icon: '/talkfuze-logo.png',
      tag: 'talkfuze-msg',
    });
    notif.onclick = () => {
      window.focus();
    };
  } catch (e) {
    // Fallback for browsers that block Notification constructor on main thread
    console.error('Desktop notification trigger error:', e);
  }
};

let _originalTitle: string | null = null;
let flashIntervalId: ReturnType<typeof setInterval> | null = null;
let isFlashState = false;

export const startTabTitleFlash = (message: string, count: number): void => {
  if (typeof window === 'undefined') return;
  if (localStorage.getItem('talkfuze_tab_badge') === 'false') return;
  
  // Only flash if tab is currently out of focus / blurred
  if (document.hasFocus()) return;
  
  if (flashIntervalId !== null) {
    clearInterval(flashIntervalId);
  }

  if (_originalTitle === null) {
    _originalTitle = document.title.replace(/^\(\d+\)\s*/, '');
  }

  isFlashState = false;
  flashIntervalId = setInterval(() => {
    isFlashState = !isFlashState;
    if (isFlashState) {
      document.title = `🔴 ${message}`;
    } else {
      document.title = count > 0 ? `(${count}) ${_originalTitle}` : (_originalTitle || 'TalkFuze');
    }
  }, 1200);
};

export const stopTabTitleFlash = (): void => {
  if (typeof window === 'undefined') return;
  if (flashIntervalId !== null) {
    clearInterval(flashIntervalId);
    flashIntervalId = null;
  }
  if (_originalTitle !== null) {
    const unreadStr = document.title.match(/^\((\d+)\)/);
    const count = unreadStr ? parseInt(unreadStr[1]) : 0;
    document.title = count > 0 ? `(${count}) ${_originalTitle}` : (_originalTitle || 'TalkFuze');
  }
};

// Auto clear flash when window gets focus
if (typeof window !== 'undefined') {
  window.addEventListener('focus', () => {
    stopTabTitleFlash();
  });
}

export const updateTabBadge = (count: number): void => {
  if (typeof window === 'undefined') return;
  if (localStorage.getItem('talkfuze_tab_badge') === 'false') return;
  if (_originalTitle === null) _originalTitle = document.title.replace(/^\(\d+\)\s*/, '');
  document.title = count > 0 ? `(${count}) ${_originalTitle}` : (_originalTitle || 'TalkFuze');
  
  if (count > 0) {
    startTabTitleFlash('NEW CHAT RECEIVED', count);
  } else {
    stopTabTitleFlash();
  }
};

// ─────────────────────────────────────────────
// Main Public API
// ─────────────────────────────────────────────

export const playUISound = (type: 'send' | 'receive', presetOverride?: SoundPreset) => {
  if (typeof window === 'undefined') return;
  // Respect DND for receive sounds
  if (type === 'receive' && isDndActive()) return;
  
  const preset = presetOverride || getSelectedSound();
  const volume = getSoundVolume();

  // Send sound uses its own independent volume
  if (type === 'send') {
    const sendVol = typeof window !== 'undefined'
      ? Math.max(0.15, parseFloat(localStorage.getItem('talkfuze_send_volume') || '1.0'))
      : 1.0;
    
    // Play custom send sound if uploaded
    if (typeof window !== 'undefined') {
      const customSend = localStorage.getItem('talkfuze_custom_sound_send');
      if (customSend) {
        try {
          const audio = new Audio(customSend);
          audio.volume = Math.min(sendVol, 1.0);
          audio.play().catch(() => playSynthesizedSound(type));
          return;
        } catch {
          // Fallback to standard swoosh
        }
      }
    }

    try {
      const audio = new Audio('/swoosh.mp3');
      audio.volume = Math.min(sendVol, 1.0);
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch(() => {
          playSynthesizedSound(type);
        });
      }
    } catch {
      playSynthesizedSound(type);
    }
    return;
  }

  // Receive sound uses the selected preset
  if (preset === 'custom') {
    if (typeof window !== 'undefined') {
      const customMsg = localStorage.getItem('talkfuze_custom_sound_msg');
      if (customMsg) {
        try {
          const audio = new Audio(customMsg);
          audio.volume = Math.min(volume, 1.0);
          audio.play().catch(() => playSynthPreset('loud', volume));
          return;
        } catch {
          // Fallback to loud preset
        }
      }
    }
    // Fallback if custom file is missing
    playSynthPreset('loud', volume);
  } else if (preset === 'default') {
    // Original behavior: try mp3 first, fallback to synth
    try {
      const audio = new Audio('/pop.mp3');
      audio.volume = Math.min(volume, 1.0);
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.then(() => {}).catch(() => {
          playSynthesizedSound(type);
        });
      }
    } catch {
      playSynthesizedSound(type);
    }
  } else {
    // Custom presets always use WebAudio synth (no mp3 dependency, works everywhere)
    playSynthPreset(preset, volume);
  }
};

// ---- Persistent alert loop for incoming requests (co-browse, remote view) ----
// Plays a cute but loud "ding-ding...ding-ding" pattern every 1.5s until stopped.

let alertIntervalId: ReturnType<typeof setInterval> | null = null;

const playAlertChime = () => {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    const t = ctx.currentTime;

    // Compressor to keep it punchy but safe
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.setValueAtTime(-24, t);
    comp.knee.setValueAtTime(30, t);
    comp.ratio.setValueAtTime(8, t);
    comp.attack.setValueAtTime(0.003, t);
    comp.release.setValueAtTime(0.15, t);
    comp.connect(ctx.destination);

    // Helper: create a single chime tone
    const chime = (freq: number, start: number, dur: number, vol: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const filt = ctx.createBiquadFilter();
      filt.type = 'lowpass';
      filt.frequency.setValueAtTime(2200, t);

      osc.connect(filt);
      filt.connect(gain);
      gain.connect(comp);

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t + start);

      gain.gain.setValueAtTime(0, t + start);
      gain.gain.linearRampToValueAtTime(vol, t + start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, t + start + dur);

      osc.start(t + start);
      osc.stop(t + start + dur + 0.05);
    };

    // Pattern: two quick "ding-ding" tones with a short gap, like a doorbell
    // Tone 1: E6 (1318 Hz) - bright and clear
    chime(1318, 0, 0.18, 0.35);
    // Tone 2: G6 (1568 Hz) - slightly higher, cute interval
    chime(1568, 0.15, 0.22, 0.30);
    // Tone 3: quick echo of tone 1 at lower volume
    chime(1318, 0.35, 0.12, 0.15);
  } catch (err) {
    console.error('Alert chime error:', err);
  }
};

export const playAlertLoop = (): void => {
  if (typeof window === 'undefined') return;
  // Don't stack multiple loops
  if (alertIntervalId !== null) return;

  // Play immediately, then repeat every 1.5s
  playAlertChime();
  alertIntervalId = setInterval(playAlertChime, 1500);
};

export const stopAlertLoop = (): void => {
  if (alertIntervalId !== null) {
    clearInterval(alertIntervalId);
    alertIntervalId = null;
  }
};

// ---- Persistent loud ring loop for Unassigned incoming chats ----
let unassignedRingIntervalId: ReturnType<typeof setInterval> | null = null;

const playUnassignedChime = () => {
  if (isDndActive()) return;
  // Use the 'urgent' preset logic but louder
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    const t = ctx.currentTime;
    
    // Waveshaper for soft-clipping saturation to allow 3x volume without harsh digital distortion
    const waveshaper = ctx.createWaveShaper();
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) {
      const x = (i * 2) / 256 - 1;
      curve[i] = (Math.PI + 3.5) * x / (Math.PI + 3.5 * Math.abs(x));
    }
    waveshaper.curve = curve;
    waveshaper.oversample = '2x';

    const userVol = typeof window !== 'undefined' ? parseFloat(localStorage.getItem('talkfuze_unassigned_volume') ?? '1.0') : 1.0;
    
    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(15.0 * userVol, t); // 15x volume multiplier for MAXIMUM loudness, scaled by user setting
    masterGain.connect(waveshaper);
    waveshaper.connect(ctx.destination);

    const ring = (freq: number, start: number, dur: number, gain: number) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      const filt = ctx.createBiquadFilter();
      filt.type = 'lowpass';
      filt.frequency.setValueAtTime(2500, t);
      osc.connect(filt);
      filt.connect(g);
      g.connect(masterGain);
      osc.type = 'square';
      osc.frequency.setValueAtTime(freq, t + start);
      g.gain.setValueAtTime(0, t + start);
      g.gain.linearRampToValueAtTime(gain, t + start + 0.01);
      g.gain.setValueAtTime(gain, t + start + dur * 0.6);
      g.gain.exponentialRampToValueAtTime(0.001, t + start + dur);
      osc.start(t + start);
      osc.stop(t + start + dur + 0.05);
    };

    // Loud "Tuck-Tuck" urgent pulse
    ring(1200, 0, 0.1, 0.95);
    ring(1200, 0.15, 0.1, 0.95);
    ring(1200, 0.30, 0.1, 0.95);
  } catch (err) {
    console.error('Unassigned ring error:', err);
  }
};

export const playUnassignedRingLoop = (): void => {
  if (typeof window === 'undefined') return;
  if (unassignedRingIntervalId !== null) return;

  playUnassignedChime();
  unassignedRingIntervalId = setInterval(playUnassignedChime, 2500); // Repeat every 2.5s
};

export const stopUnassignedRingLoop = (): void => {
  if (unassignedRingIntervalId !== null) {
    clearInterval(unassignedRingIntervalId);
    unassignedRingIntervalId = null;
  }
};

// ---- Persistent alert loop for outgoing calls (Ringback Tone) ----
// Synthesizes a premium, beautiful modern telephone ringback tone (425Hz + 450Hz sine pulse)
let ringbackIntervalId: ReturnType<typeof setInterval> | null = null;

const playRingbackChime = () => {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    const t = ctx.currentTime;
    
    // Dynamics compressor for professional, clipping-free output
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.setValueAtTime(-24, t);
    comp.knee.setValueAtTime(30, t);
    comp.ratio.setValueAtTime(8, t);
    comp.attack.setValueAtTime(0.01, t);
    comp.release.setValueAtTime(0.2, t);
    comp.connect(ctx.destination);

    // Pulse synthesis function
    const pulse = (freq1: number, freq2: number, start: number, duration: number) => {
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      // Lowpass filter to make it perfectly smooth, warm, and professional
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(750, t); 

      osc1.type = 'sine';
      osc2.type = 'sine';
      osc1.frequency.setValueAtTime(freq1, t + start);
      osc2.frequency.setValueAtTime(freq2, t + start);

      osc1.connect(filter);
      osc2.connect(filter);
      filter.connect(gain);
      gain.connect(comp);

      // Smooth breathe-like volume envelope
      gain.gain.setValueAtTime(0, t + start);
      gain.gain.linearRampToValueAtTime(0.06, t + start + 0.15); // soft warm fade-in
      gain.gain.linearRampToValueAtTime(0.04, t + start + 0.5);  // slight natural dip
      gain.gain.exponentialRampToValueAtTime(0.001, t + start + duration);

      osc1.start(t + start);
      osc2.start(t + start);
      osc1.stop(t + start + duration + 0.05);
      osc2.stop(t + start + duration + 0.05);
    };

    // Premium modern dual-sine telephone ringback chimes
    // 0.8s chime, 0.2s pause, 0.8s chime, followed by 2.2s silence
    pulse(425, 450, 0, 0.8);
    pulse(425, 450, 1.0, 0.8);
  } catch (err) {
    console.error('Ringback chime error:', err);
  }
};

export const playRingbackLoop = (): void => {
  if (typeof window === 'undefined') return;
  if (ringbackIntervalId !== null) return;

  playRingbackChime();
  ringbackIntervalId = setInterval(playRingbackChime, 4000); // 4-second telephone cadence
};

export const stopRingbackLoop = (): void => {
  if (ringbackIntervalId !== null) {
    clearInterval(ringbackIntervalId);
    ringbackIntervalId = null;
  }
};

// ─────────────────────────────────────────────
// Incoming Call Ringtone Loop (Agent-selected preset)
// ─────────────────────────────────────────────

let ringtoneIntervalId: ReturnType<typeof setInterval> | null = null;

const playRingtoneChime = (preset: RingtonePreset, vol: number) => {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});

    const t = ctx.currentTime;

    const comp = ctx.createDynamicsCompressor();
    comp.threshold.setValueAtTime(-3, t);
    comp.knee.setValueAtTime(6, t);
    comp.ratio.setValueAtTime(3, t);
    comp.attack.setValueAtTime(0.003, t);
    comp.release.setValueAtTime(0.08, t);
    comp.connect(ctx.destination);

    const ring = (freq: number, start: number, dur: number, gain: number, wave: OscillatorType = 'sine', filterFreq: number = 4000) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      const filt = ctx.createBiquadFilter();
      filt.type = 'lowpass';
      filt.frequency.setValueAtTime(filterFreq, t);
      osc.connect(filt);
      filt.connect(g);
      g.connect(comp);
      osc.type = wave;
      osc.frequency.setValueAtTime(freq, t + start);
      g.gain.setValueAtTime(0, t + start);
      g.gain.linearRampToValueAtTime(gain * vol, t + start + 0.01);
      g.gain.setValueAtTime(gain * vol, t + start + dur * 0.6);
      g.gain.exponentialRampToValueAtTime(0.001, t + start + dur);
      osc.start(t + start);
      osc.stop(t + start + dur + 0.05);
    };

    switch (preset) {
      case 'classic':
        // Traditional telephone ring: two bursts of 440+480Hz
        ring(440, 0, 0.4, 0.70);
        ring(480, 0, 0.4, 0.65);
        ring(440, 0.5, 0.4, 0.70);
        ring(480, 0.5, 0.4, 0.65);
        break;

      case 'digital':
        // Modern soft digital: melodic two-note pattern
        ring(784, 0, 0.3, 0.55, 'sine', 3000);    // G5
        ring(988, 0.25, 0.35, 0.50, 'sine', 3000); // B5
        ring(784, 0.65, 0.3, 0.55, 'sine', 3000);
        ring(988, 0.90, 0.35, 0.50, 'sine', 3000);
        break;

      case 'urgent':
        // Fast staccato beeps - hard to ignore
        ring(1000, 0, 0.1, 0.85, 'square', 2500);
        ring(1000, 0.15, 0.1, 0.85, 'square', 2500);
        ring(1000, 0.30, 0.1, 0.85, 'square', 2500);
        ring(1200, 0.50, 0.1, 0.85, 'square', 2500);
        ring(1200, 0.65, 0.1, 0.85, 'square', 2500);
        ring(1200, 0.80, 0.1, 0.85, 'square', 2500);
        break;

      case 'marimba':
        // Melodic ascending scale pattern
        ring(523, 0, 0.2, 0.65, 'sine', 5000);     // C5
        ring(659, 0.18, 0.2, 0.60, 'sine', 5000);  // E5
        ring(784, 0.36, 0.2, 0.65, 'sine', 5000);  // G5
        ring(1047, 0.54, 0.3, 0.70, 'sine', 5000); // C6
        // Reverse
        ring(784, 0.90, 0.2, 0.60, 'sine', 5000);
        ring(659, 1.08, 0.2, 0.55, 'sine', 5000);
        ring(523, 1.26, 0.3, 0.65, 'sine', 5000);
        break;

      case 'siren':
        // Loud oscillating siren - maximum attention
        for (let i = 0; i < 4; i++) {
          const offset = i * 0.3;
          ring(1200 + (i % 2) * 400, offset, 0.25, 0.90, 'square', 4000);
          ring(200, offset, 0.15, 0.35, 'sine', 400); // sub-bass punch
        }
        break;
    }
  } catch (err) {
    console.error('Ringtone chime error:', err);
  }
};

let customRingtoneAudio: HTMLAudioElement | null = null;
let isRingtoneStopping = false;

export const playIncomingRingtoneLoop = (): void => {
  if (typeof window === 'undefined') return;
  if (ringtoneIntervalId !== null || customRingtoneAudio !== null) return;
  isRingtoneStopping = false;

  const preset = getSelectedRingtone();
  const vol = getRingtoneVolume();

  if (preset === 'custom') {
    const customRing = localStorage.getItem('talkfuze_custom_sound_ring');
    if (customRing) {
      try {
        const audio = new Audio(customRing);
        audio.loop = true;
        audio.volume = Math.min(vol, 1.0);
        customRingtoneAudio = audio;
        audio.play().then(() => {
          if (isRingtoneStopping) {
            audio.pause();
            audio.currentTime = 0;
            customRingtoneAudio = null;
          }
        }).catch(() => {
          // Fallback to siren if play fails
          if (!isRingtoneStopping) {
            playRingtoneChime('siren', vol);
            ringtoneIntervalId = setInterval(() => playRingtoneChime('siren', vol), 1800);
          }
        });
        return;
      } catch {
        // Fallback
      }
    }
    // Fallback if missing
    playRingtoneChime('siren', vol);
    ringtoneIntervalId = setInterval(() => playRingtoneChime('siren', vol), 1800);
  } else {
    playRingtoneChime(preset, vol);
    // Interval based on preset length
    const interval = preset === 'marimba' ? 2200 : preset === 'urgent' ? 1400 : 1800;
    ringtoneIntervalId = setInterval(() => playRingtoneChime(preset, vol), interval);
  }
};

export const stopIncomingRingtoneLoop = (): void => {
  isRingtoneStopping = true;
  if (ringtoneIntervalId !== null) {
    clearInterval(ringtoneIntervalId);
    ringtoneIntervalId = null;
  }
  if (customRingtoneAudio !== null) {
    try {
      customRingtoneAudio.pause();
      customRingtoneAudio.currentTime = 0;
    } catch {
      // Ignore
    }
    customRingtoneAudio = null;
  }
};

// Preview a single cycle of a ringtone preset (for settings page)
export const previewRingtone = (preset: RingtonePreset): void => {
  const vol = getRingtoneVolume();
  if (preset === 'custom') {
    const customRing = localStorage.getItem('talkfuze_custom_sound_ring');
    if (customRing) {
      try {
        const audio = new Audio(customRing);
        audio.volume = Math.min(vol, 1.0);
        audio.play();
        // Stop it after 3 seconds for preview purposes
        setTimeout(() => {
          try { audio.pause(); } catch {}
        }, 3000);
        return;
      } catch {}
    }
    playRingtoneChime('siren', vol);
  } else {
    playRingtoneChime(preset, vol);
  }
};
