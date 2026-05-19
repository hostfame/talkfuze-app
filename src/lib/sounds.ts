export const playUISound = (type: 'send' | 'receive') => {
  if (typeof window === 'undefined') return;
  try {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    
    // Global compressor to make it completely smooth and avoid clipping
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.setValueAtTime(-24, ctx.currentTime);
    compressor.knee.setValueAtTime(30, ctx.currentTime);
    compressor.ratio.setValueAtTime(12, ctx.currentTime);
    compressor.attack.setValueAtTime(0.003, ctx.currentTime);
    compressor.release.setValueAtTime(0.25, ctx.currentTime);
    compressor.connect(ctx.destination);

    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();
    
    // Add a lowpass filter to make the tone "rounder" and cut harsh highs
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1200, ctx.currentTime);
    
    osc.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(compressor);
    
    if (type === 'send') {
      // Cute, soft "bloop" going up slightly
      osc.type = 'sine';
      osc.frequency.setValueAtTime(350, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(450, ctx.currentTime + 0.1);
      
      // Much softer volume and gentler attack
      gainNode.gain.setValueAtTime(0, ctx.currentTime);
      gainNode.gain.linearRampToValueAtTime(0.15, ctx.currentTime + 0.03); // Softer attack
      gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15); // Gentle decay
      
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.2);
    } else {
      // receive: cute, friendly double pop (like two water drops)
      osc.type = 'sine';
      osc.frequency.setValueAtTime(500, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(650, ctx.currentTime + 0.08);
      
      gainNode.gain.setValueAtTime(0, ctx.currentTime);
      gainNode.gain.linearRampToValueAtTime(0.12, ctx.currentTime + 0.02);
      gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
      
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      const filter2 = ctx.createBiquadFilter();
      filter2.type = 'lowpass';
      filter2.frequency.setValueAtTime(1500, ctx.currentTime);
      
      osc2.connect(filter2);
      filter2.connect(gain2);
      gain2.connect(compressor);
      
      osc2.type = 'sine';
      // Second drop is higher
      osc2.frequency.setValueAtTime(750, ctx.currentTime + 0.12);
      osc2.frequency.exponentialRampToValueAtTime(900, ctx.currentTime + 0.2);
      
      gain2.gain.setValueAtTime(0, ctx.currentTime + 0.12);
      gain2.gain.linearRampToValueAtTime(0.15, ctx.currentTime + 0.14);
      gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
      
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.1);
      osc2.start(ctx.currentTime + 0.12);
      osc2.stop(ctx.currentTime + 0.3);
    }
  } catch (e) {
    console.error("Audio playback failed", e);
  }
};
