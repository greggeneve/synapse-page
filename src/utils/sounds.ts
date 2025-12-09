/**
 * Utilitaires pour les sons de notification
 * Génère des sons sans fichier audio externe
 */

// Contexte audio partagé
let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioContext) {
    audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  return audioContext;
}

/**
 * Jouer un son de notification (ding-dong style médical)
 */
export function playNotificationSound(): void {
  try {
    const ctx = getAudioContext();
    
    // Reprendre le contexte si suspendu (restriction navigateur)
    if (ctx.state === 'suspended') {
      ctx.resume();
    }
    
    const now = ctx.currentTime;
    
    // Première note (ding)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.frequency.value = 880; // La5
    osc1.type = 'sine';
    gain1.gain.setValueAtTime(0.3, now);
    gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
    osc1.start(now);
    osc1.stop(now + 0.3);
    
    // Deuxième note (dong)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.frequency.value = 659.25; // Mi5
    osc2.type = 'sine';
    gain2.gain.setValueAtTime(0.3, now + 0.15);
    gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
    osc2.start(now + 0.15);
    osc2.stop(now + 0.5);
    
  } catch (error) {
    console.warn('Impossible de jouer le son:', error);
  }
}

/**
 * Jouer un son d'alerte (pour les alertes critiques)
 */
export function playAlertSound(): void {
  try {
    const ctx = getAudioContext();
    
    if (ctx.state === 'suspended') {
      ctx.resume();
    }
    
    const now = ctx.currentTime;
    
    // Son d'alerte plus urgent (3 bips)
    for (let i = 0; i < 3; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 1000;
      osc.type = 'square';
      gain.gain.setValueAtTime(0.15, now + i * 0.2);
      gain.gain.exponentialRampToValueAtTime(0.01, now + i * 0.2 + 0.1);
      osc.start(now + i * 0.2);
      osc.stop(now + i * 0.2 + 0.1);
    }
    
  } catch (error) {
    console.warn('Impossible de jouer le son:', error);
  }
}

/**
 * Jouer un son de succès
 */
export function playSuccessSound(): void {
  try {
    const ctx = getAudioContext();
    
    if (ctx.state === 'suspended') {
      ctx.resume();
    }
    
    const now = ctx.currentTime;
    
    // Arpège ascendant
    const notes = [523.25, 659.25, 783.99]; // Do5, Mi5, Sol5
    
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = freq;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.2, now + i * 0.1);
      gain.gain.exponentialRampToValueAtTime(0.01, now + i * 0.1 + 0.2);
      osc.start(now + i * 0.1);
      osc.stop(now + i * 0.1 + 0.2);
    });
    
  } catch (error) {
    console.warn('Impossible de jouer le son:', error);
  }
}

/**
 * Préparer le contexte audio (à appeler sur une interaction utilisateur)
 */
export function initAudioContext(): void {
  try {
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') {
      ctx.resume();
    }
  } catch (error) {
    console.warn('Impossible d\'initialiser le contexte audio:', error);
  }
}

