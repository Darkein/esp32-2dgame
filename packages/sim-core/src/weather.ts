import type { Season, WeatherKind, WeatherState } from '@game/protocol';
import type { Rng } from './rng';

/** Effets numériques d'un type de météo sur la simulation. */
export interface WeatherEffects {
  /** Multiplicateur de vitesse de marche (1 = normal). */
  walkSpeed: number;
  /** Multiplicateur de vitesse de croissance des cultures (0 = pause, 1 = normal). */
  cropGrowth: number;
  /** Vrai si les agents perçoivent un besoin de chauffage (consomme du bois). */
  needsHeating: boolean;
}

/** Effets numériques associés à chaque type de météo. Calibrés simples / lisibles. */
export const WEATHER_EFFECTS: Record<WeatherKind, WeatherEffects> = {
  clair: { walkSpeed: 1, cropGrowth: 1, needsHeating: false },
  nuage: { walkSpeed: 1, cropGrowth: 1, needsHeating: false },
  pluie: { walkSpeed: 0.8, cropGrowth: 1.4, needsHeating: false },
  orage: { walkSpeed: 0.7, cropGrowth: 1.2, needsHeating: false },
  neige: { walkSpeed: 0.55, cropGrowth: 0, needsHeating: true },
  brouillard: { walkSpeed: 0.9, cropGrowth: 0.9, needsHeating: false },
  canicule: { walkSpeed: 0.85, cropGrowth: 0.3, needsHeating: false },
};

/** Distributions de météo par saison (probabilités, doivent sommer à ~1). */
const SEASON_WEIGHTS: Record<Season, Partial<Record<WeatherKind, number>>> = {
  printemps: { clair: 0.35, nuage: 0.25, pluie: 0.3, orage: 0.05, brouillard: 0.05 },
  ete: { clair: 0.55, nuage: 0.15, pluie: 0.1, orage: 0.1, canicule: 0.1 },
  automne: { clair: 0.25, nuage: 0.25, pluie: 0.3, orage: 0.05, brouillard: 0.15 },
  hiver: { clair: 0.2, nuage: 0.2, pluie: 0.05, neige: 0.4, brouillard: 0.15 },
};

/** Tire une météo aléatoire selon la saison. */
export function rollWeather(season: Season, rng: Rng): WeatherKind {
  const weights = SEASON_WEIGHTS[season];
  const total = Object.values(weights).reduce<number>((s, v) => s + (v ?? 0), 0);
  let r = rng.next() * total;
  for (const [k, w] of Object.entries(weights) as [WeatherKind, number][]) {
    r -= w;
    if (r <= 0) return k;
  }
  return 'clair';
}

/** Crée un état météo neuf, valable jusqu'au prochain bord de journée. */
export function makeWeather(
  kind: WeatherKind,
  now: number,
  secondsPerDay: number,
): WeatherState {
  const nextBoundary = Math.ceil(now / secondsPerDay) * secondsPerDay;
  return {
    kind,
    sinceGameTime: now,
    untilGameTime: nextBoundary === now ? now + secondsPerDay : nextBoundary,
  };
}
