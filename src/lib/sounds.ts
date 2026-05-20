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

export const playUISound = (type: 'send' | 'receive') => {
  if (typeof window === 'undefined') return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    
    // If the browser suspended it again (e.g. tab went to background), try to resume
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    // Global compressor to make it completely smooth and avoid clipping
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.setValueAtTime(-30, ctx.currentTime);
    compressor.knee.setValueAtTime(40, ctx.currentTime);
    compressor.ratio.setValueAtTime(12, ctx.currentTime);
    compressor.attack.setValueAtTime(0.005, ctx.currentTime);
    compressor.release.setValueAtTime(0.25, ctx.currentTime);
    compressor.connect(ctx.destination);

    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();
    
    // Add a strong lowpass filter to make the tone very "round" and completely cut harsh highs
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(700, ctx.currentTime); // Lowered from 1200
    
    osc.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(compressor);
    
    if (type === 'send') {
      // Extremely cute, soft, lower-pitched "bloop" going up slightly
      osc.type = 'sine';
      osc.frequency.setValueAtTime(250, ctx.currentTime); // Lower pitch
      osc.frequency.exponentialRampToValueAtTime(320, ctx.currentTime + 0.1);
      
      // Much softer volume and gentler attack
      gainNode.gain.setValueAtTime(0, ctx.currentTime);
      gainNode.gain.linearRampToValueAtTime(0.08, ctx.currentTime + 0.04); // Softer attack, lower volume
      gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2); // Gentle decay
      
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.25);
    } else {
      // receive: very gentle, cute double "bloop" (like tiny water drops)
      osc.type = 'sine';
      osc.frequency.setValueAtTime(350, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(450, ctx.currentTime + 0.08);
      
      gainNode.gain.setValueAtTime(0, ctx.currentTime);
      gainNode.gain.linearRampToValueAtTime(0.06, ctx.currentTime + 0.03); // Very quiet
      gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
      
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      const filter2 = ctx.createBiquadFilter();
      filter2.type = 'lowpass';
      filter2.frequency.setValueAtTime(800, ctx.currentTime); // Cut harsh highs
      
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
    console.error('Audio play error:', err);
  }
};
