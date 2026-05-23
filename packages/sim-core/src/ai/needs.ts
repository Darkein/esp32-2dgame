import type { ActivityKind, Needs } from '@game/protocol';
import { NEED_KEYS } from '@game/protocol';

// Toutes les vitesses ci-dessous sont exprimées PAR SECONDE DE JEU : l'usure et la
// récupération suivent donc des durées réalistes (p.ex. l'énergie tient ~16 h d'éveil et
// se régénère en ~8 h de sommeil) quelle que soit la vitesse d'accélération du temps.

const H = 3600; // secondes de jeu par heure de jeu

/** Décroissance par seconde de jeu (le besoin tombe de 100 à 0 en N heures de jeu). */
const DECAY: Needs = {
  energy: 100 / (16 * H), // ~16 h d'éveil
  hunger: 100 / (12 * H), // faim sur ~12 h
  social: 100 / (20 * H),
  hygiene: 100 / (24 * H),
  fun: 100 / (14 * H),
};

/** Gain par seconde de jeu selon l'activité (recharge en quelques heures/minutes de jeu). */
const GAIN: Record<ActivityKind, Partial<Needs>> = {
  idle: {},
  walking: {},
  sleeping: { energy: 100 / (7 * H) + DECAY.energy }, // recharge pleine en ~7 h
  eating: { hunger: 100 / (20 * 60) + DECAY.hunger }, // rassasié en ~20 min
  working: { fun: -DECAY.fun * 0.5, energy: -DECAY.energy * 0.5 },
  crafting: { fun: 100 / (4 * H) },
  talking: { social: 100 / (1 * H), fun: 100 / (3 * H) },
  socializing: { social: 100 / (45 * 60), fun: 100 / (2.5 * H) },
  trading: { social: 100 / (6 * H) },
  // Lavage au puits / bord d'eau : ~10 min de jeu pour repasser de 0 à 100 d'hygiène.
  washing: { hygiene: 100 / (10 * 60) + DECAY.hygiene },
};

function clamp(v: number): number {
  return v < 0 ? 0 : v > 100 ? 100 : v;
}

/** Applique décroissance naturelle + gains de l'activité sur `dtGame` secondes de jeu. */
export function stepNeeds(needs: Needs, activity: ActivityKind, dtGame = 1): void {
  const gain = GAIN[activity];
  for (const key of NEED_KEYS) {
    needs[key] = clamp(needs[key] + (-DECAY[key] + (gain[key] ?? 0)) * dtGame);
  }
}

/** Besoin le plus urgent (valeur la plus basse) et son intensité 0..1. */
export function mostUrgent(needs: Needs): { key: keyof Needs; urgency: number } {
  let key: keyof Needs = 'energy';
  let lowest = Infinity;
  for (const k of NEED_KEYS) {
    if (needs[k] < lowest) {
      lowest = needs[k];
      key = k;
    }
  }
  return { key, urgency: 1 - lowest / 100 };
}
