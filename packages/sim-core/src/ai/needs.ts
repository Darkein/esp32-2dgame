import type { ActivityKind, Needs } from '@game/protocol';
import { NEED_KEYS } from '@game/protocol';

/** Décroissance par tick de chaque besoin (vie qui « s'use »). */
const DECAY: Needs = {
  energy: 0.02,
  hunger: 0.03,
  social: 0.015,
  hygiene: 0.012,
  fun: 0.02,
};

/** Gain par tick selon l'activité en cours. */
const GAIN: Record<ActivityKind, Partial<Needs>> = {
  idle: {},
  walking: {},
  sleeping: { energy: 0.4 },
  eating: { hunger: 0.5 },
  working: { fun: -0.01, energy: -0.02 },
  crafting: { fun: 0.05 },
  talking: { social: 0.3, fun: 0.1 },
  socializing: { social: 0.35, fun: 0.15 },
};

function clamp(v: number): number {
  return v < 0 ? 0 : v > 100 ? 100 : v;
}

/** Applique décroissance naturelle + gains de l'activité courante. */
export function stepNeeds(needs: Needs, activity: ActivityKind): void {
  const gain = GAIN[activity];
  for (const key of NEED_KEYS) {
    needs[key] = clamp(needs[key] - DECAY[key] + (gain[key] ?? 0));
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
