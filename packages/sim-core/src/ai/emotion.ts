import type { Emotions, EmotionKey } from '@game/protocol';
import { EMOTION_KEYS } from '@game/protocol';
import type { Personality } from '../entities';

/** Humeurs neutres (départ d'agent). */
export function makeEmotions(): Emotions {
  return { joie: 30, tristesse: 0, colere: 0, peur: 0, degout: 0, surprise: 0 };
}

/** Décroissance par seconde de jeu — vers 0 pour les négatives, vers 20 pour la joie
 *  (base d'humeur stable, comme un « set point »). */
const TARGET: Emotions = { joie: 20, tristesse: 0, colere: 0, peur: 0, degout: 0, surprise: 0 };
const HALFLIFE_SECONDS = 6 * 3600; // une émotion revient à mi-distance en ~6 h de jeu

/** Décroissance exponentielle de chaque humeur vers sa valeur cible. */
export function decayEmotions(e: Emotions, p: Personality, dt: number): void {
  // Neuroticism dilate la persistance (les émotions négatives s'effacent moins vite).
  const k = Math.LN2 / HALFLIFE_SECONDS;
  const calmK = k * (1 - 0.5 * p.neuroticism);
  const factor = Math.exp(-calmK * dt);
  for (const key of EMOTION_KEYS) {
    const target = TARGET[key];
    e[key] = target + (e[key] - target) * factor;
  }
}

/** Applique une impulsion bornée. L'extraversion amplifie joie/surprise/colère ;
 *  le neuroticism amplifie tristesse/peur. */
export function bumpEmotion(e: Emotions, p: Personality, key: EmotionKey, amount: number): void {
  let amp = 1;
  if (key === 'joie' || key === 'surprise' || key === 'colere') amp = 0.6 + 0.8 * p.extraversion;
  if (key === 'tristesse' || key === 'peur') amp = 0.6 + 0.8 * p.neuroticism;
  if (key === 'degout') amp = 0.6 + 0.4 * p.neuroticism;
  e[key] = Math.max(0, Math.min(100, e[key] + amount * amp));
}

/** Humeur dominante (clé + intensité) — utile pour le ton du dialogue. */
export function dominantEmotion(e: Emotions): { key: EmotionKey; value: number } {
  let key: EmotionKey = 'joie';
  let v = e.joie;
  for (const k of EMOTION_KEYS) {
    if (e[k] > v) {
      v = e[k];
      key = k;
    }
  }
  return { key, value: v };
}
