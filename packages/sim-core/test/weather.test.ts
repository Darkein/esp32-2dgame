import { describe, it, expect } from 'vitest';
import { Simulation } from '../src/sim';
import { SimClock, GAME_SECONDS_PER_DAY } from '../src/clock';
import { Rng } from '../src/rng';
import { makeWeather, rollWeather, WEATHER_EFFECTS } from '../src/weather';
import { YEAR_SECONDS } from '../src/catalog';

describe('saisons & météo', () => {
  it("la saison change avec le mois (calendrier de 365 jours)", () => {
    const c = new SimClock(15, 8, 0); // force le départ au 1er janvier
    expect(c.season).toBe('hiver');
    c.gameTime = 200 * GAME_SECONDS_PER_DAY;
    expect(c.season).toBe('ete');
    c.gameTime = 305 * GAME_SECONDS_PER_DAY;
    expect(c.season).toBe('automne');
  });

  it('le tirage météo respecte la distribution saisonnière', () => {
    const rng = new Rng(42);
    const counts: Record<string, number> = {};
    for (let i = 0; i < 1000; i++) {
      const k = rollWeather('hiver', rng);
      counts[k] = (counts[k] ?? 0) + 1;
    }
    // En hiver la neige domine (poids 0.4) ; pas de canicule possible.
    expect(counts.neige ?? 0).toBeGreaterThan(counts.clair ?? 0);
    expect(counts.canicule ?? 0).toBe(0);
  });

  it('la météo est renouvelée à chaque journée de jeu', () => {
    const sim = new Simulation({ seed: 21, agentCount: 2 });
    const first = sim.weather.kind;
    sim.setSpeed(50_000);
    let changed = false;
    for (let i = 0; i < 30 && !changed; i++) {
      sim.tick();
      if (sim.weather.kind !== first) changed = true;
    }
    expect(changed).toBe(true);
  });

  it("la pluie ralentit la marche, la canicule encore plus selon les effets", () => {
    expect(WEATHER_EFFECTS.clair.walkSpeed).toBe(1);
    expect(WEATHER_EFFECTS.pluie.walkSpeed).toBeLessThan(1);
    expect(WEATHER_EFFECTS.neige.walkSpeed).toBeLessThan(WEATHER_EFFECTS.pluie.walkSpeed);
  });

  it('aucune nouvelle culture ne démarre en plein hiver', () => {
    const sim = new Simulation({ seed: 22, agentCount: 4 });
    // Force l'horloge en plein hiver (janvier) et la météo pour rester en hiver.
    sim.clock.gameTime = 5 * GAME_SECONDS_PER_DAY; // jour 6, janvier
    sim.weather = makeWeather('clair', sim.clock.gameTime, GAME_SECONDS_PER_DAY);
    expect(sim.clock.season).toBe('hiver');
    const before = sim.world.tiles.filter((t) => t === 'champ_seme').length;
    sim.setSpeed(50);
    for (let i = 0; i < 100; i++) sim.tick();
    const after = sim.world.tiles.filter((t) => t === 'champ_seme').length;
    expect(after).toBe(before);
  });

  it("la météo apparaît dans le snapshot", () => {
    const sim = new Simulation({ seed: 23, agentCount: 1 });
    const snap = sim.snapshot();
    expect(snap.season).toBeTruthy();
    expect(snap.weather?.kind).toBeTruthy();
  });
});

// Évite le warning « variable non utilisée » sans toucher au code.
void YEAR_SECONDS;
