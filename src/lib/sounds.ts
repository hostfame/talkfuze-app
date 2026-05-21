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

export type SoundPreset = 'default' | 'chime' | 'bell' | 'alert' | 'loud';

export const SOUND_PRESETS: { id: SoundPreset; name: string; description: string }[] = [
  { id: 'default', name: 'Default', description: 'Subtle pop sound' },
  { id: 'chime', name: 'Chime', description: 'Two-tone rising chime' },
  { id: 'bell', name: 'Bell', description: 'Clear bell ring' },
  { id: 'alert', name: 'Alert', description: 'Urgent double-beep' },
  { id: 'loud', name: 'Loud Ping', description: 'Loud triple ping for noisy environments' },
];

export const getSelectedSound = (): SoundPreset => {
  if (typeof window === 'undefined') return 'default';
  return (localStorage.getItem('talkfuze_sound_preset') as SoundPreset) || 'default';
};

export const setSelectedSound = (preset: SoundPreset): void => {
  if (typeof window === 'undefined') return;
  localStorage.setItem('talkfuze_sound_preset', preset);
};

export const getSoundVolume = (): number => {
  if (typeof window === 'undefined') return 0.9;
  const stored = localStorage.getItem('talkfuze_sound_volume');
  return stored ? parseFloat(stored) : 0.9;
};

export const setSoundVolume = (vol: number): void => {
  if (typeof window === 'undefined') return;
  localStorage.setItem('talkfuze_sound_volume', String(Math.max(0, Math.min(1, vol))));
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

    // Master limiter - high threshold so sounds stay loud and punchy
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.setValueAtTime(-6, t);
    comp.knee.setValueAtTime(10, t);
    comp.ratio.setValueAtTime(4, t);
    comp.attack.setValueAtTime(0.003, t);
    comp.release.setValueAtTime(0.1, t);
    comp.connect(ctx.destination);

    // Helper to make a tone
    const tone = (freq: number, start: number, dur: number, gain: number, waveType: OscillatorType = 'sine', filterFreq: number = 3000) => {
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
      g.gain.linearRampToValueAtTime(gain * vol, t + start + 0.008);
      g.gain.setValueAtTime(gain * vol, t + start + dur * 0.6);
      g.gain.exponentialRampToValueAtTime(0.001, t + start + dur);
      osc.start(t + start);
      osc.stop(t + start + dur + 0.05);
    };

    switch (preset) {
      case 'chime':
        // Two-tone rising chime - bright and clear
        tone(880, 0, 0.3, 0.60);       // A5
        tone(1175, 0.15, 0.35, 0.55);  // D6
        break;

      case 'bell':
        // Clear bell ring - bright hit with harmonics
        tone(1047, 0, 0.45, 0.65, 'sine', 4000);  // C6
        tone(2093, 0, 0.3, 0.30, 'sine', 5000);   // C7 harmonic
        tone(1568, 0.05, 0.25, 0.20, 'sine', 4000); // G6 shimmer
        break;

      case 'alert':
        // Urgent double-beep - hard square wave hits
        tone(1200, 0, 0.15, 0.75, 'square', 2500);
        tone(1200, 0.22, 0.15, 0.75, 'square', 2500);
        break;

      case 'loud':
        // LOUD double-hit siren pattern - impossible to miss
        // Hit 1: aggressive ascending triple
        tone(1318, 0, 0.2, 0.85, 'square', 3500);     // E6 square
        tone(1568, 0.12, 0.2, 0.80, 'square', 3500);   // G6
        tone(1976, 0.24, 0.25, 0.90, 'square', 4000);   // B6
        // Hit 2: repeat after short pause for urgency
        tone(1318, 0.55, 0.2, 0.85, 'square', 3500);
        tone(1568, 0.67, 0.2, 0.80, 'square', 3500);
        tone(1976, 0.79, 0.25, 0.90, 'square', 4000);
        // Sub-bass punch on both hits for physical feel
        tone(110, 0, 0.2, 0.40, 'sine', 300);
        tone(110, 0.55, 0.2, 0.40, 'sine', 300);
        break;

      default:
        // 'default' - balanced pop
        tone(880, 0, 0.22, 0.45);
        tone(1100, 0.1, 0.18, 0.35);
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
// Main Public API
// ─────────────────────────────────────────────

export const playUISound = (type: 'send' | 'receive') => {
  if (typeof window === 'undefined') return;
  
  const preset = getSelectedSound();
  const volume = getSoundVolume();

  // Send sound always uses the subtle swoosh (no customization needed)
  if (type === 'send') {
    try {
      const audio = new Audio('/swoosh.mp3');
      audio.volume = Math.min(0.35 * (volume / 0.7), 1.0);
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
  if (preset === 'default') {
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
