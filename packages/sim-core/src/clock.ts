/** Horloge de simulation : convertit les ticks en heure du jour (cycle jour/nuit). */
export class SimClock {
  tick = 0;

  constructor(
    /** Ticks de simulation par seconde réelle. */
    readonly ticksPerSecond = 15,
    /** Durée d'une journée en jeu, en secondes réelles. */
    readonly dayLengthSeconds = 240,
    /** Heure de départ (0..24). */
    startHour = 8,
  ) {
    this.tick = Math.round((startHour / 24) * this.ticksPerDay);
  }

  get ticksPerDay(): number {
    return this.ticksPerSecond * this.dayLengthSeconds;
  }

  advance(): void {
    this.tick++;
  }

  /** Heure courante, 0..24. */
  get timeOfDay(): number {
    return ((this.tick % this.ticksPerDay) / this.ticksPerDay) * 24;
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
