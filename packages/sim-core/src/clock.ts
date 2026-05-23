import type { GameDate } from '@game/protocol';

/** Une journée de jeu = 24 h = 86 400 secondes de jeu. Base de TOUTES les durées du monde. */
export const GAME_SECONDS_PER_DAY = 86_400;
/** Secondes de jeu écoulées par seconde réelle à vitesse 1× (1 journée ≈ 1 h réelle). */
export const BASE_SCALE = 24;
/** Longueurs des mois (calendrier de 365 jours) pour l'affichage de la date. */
const MONTH_LENGTHS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
/** Première année du calendrier du village. */
const START_YEAR = 1;

/**
 * Horloge de simulation. Deux compteurs distincts :
 *  - `tick` (entier, temps réel à TPS fixe) : pour ce qui doit rester réactif quelle que
 *    soit la vitesse (throttle LLM, durée d'affichage des répliques).
 *  - `gameTime` (secondes de jeu) : base de toutes les durées du monde. Avance plus ou
 *    moins vite selon la vitesse choisie depuis l'interface.
 */
export class SimClock {
  tick = 0;
  /** Temps de jeu écoulé, en secondes de jeu, depuis l'an 1 jour 1 00:00. */
  gameTime: number;

  constructor(
    /** Ticks de simulation par seconde réelle. */
    readonly ticksPerSecond = 15,
    /** Heure de départ (0..24). */
    startHour = 8,
  ) {
    this.gameTime = (startHour / 24) * GAME_SECONDS_PER_DAY;
  }

  /**
   * Avance d'un tick réel et fait s'écouler `speed × BASE_SCALE` secondes de jeu par
   * seconde réelle. Retourne le temps de jeu écoulé ce tick (dt, en secondes de jeu).
   */
  advance(speed = 1): number {
    this.tick++;
    const dt = (speed * BASE_SCALE) / this.ticksPerSecond;
    this.gameTime += dt;
    return dt;
  }

  /** Heure courante, 0..24. */
  get timeOfDay(): number {
    return (this.gameTime % GAME_SECONDS_PER_DAY) / 3600;
  }

  /** Nombre de jours de jeu écoulés. */
  get dayCount(): number {
    return Math.floor(this.gameTime / GAME_SECONDS_PER_DAY);
  }

  /** Date courante du calendrier (année/mois/jour, 1-indexés). */
  get date(): GameDate {
    const year = START_YEAR + Math.floor(this.dayCount / 365);
    let doy = this.dayCount % 365;
    let month = 0;
    while (month < 11 && doy >= MONTH_LENGTHS[month]!) {
      doy -= MONTH_LENGTHS[month]!;
      month++;
    }
    return { year, month: month + 1, day: doy + 1 };
  }

  get isNight(): boolean {
    const h = this.timeOfDay;
    return h < 6 || h >= 21;
  }

  /** Facteur d'obscurité 0 (plein jour) .. 1 (nuit noire), pour l'éclairage. */
  get darkness(): number {
    const h = this.timeOfDay;
    if (h >= 7 && h <= 19) return 0;
    if (h >= 22 || h <= 4) return 1;
    // crépuscules
    if (h > 4 && h < 7) return (7 - h) / 3;
    return (h - 19) / 3;
  }
}
