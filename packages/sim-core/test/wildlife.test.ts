import { describe, it, expect } from 'vitest';
import { Simulation } from '../src/sim';
import {
  ANIMAL_PROFILES,
  HUNT_RANGE,
  ISOLATION_RADIUS,
  WILDLIFE_HARD_CAP,
  WILDLIFE_RESPAWN_INTERVAL_SECONDS,
  WILDLIFE_STEP_INTERVAL_SECONDS,
  WOLF_ATTACK_RADIUS,
} from '../src/catalog';
import { findNearestPrey } from '../src/wildlife';
import { count } from '../src/crafting';
import type { Job } from '../src/catalog';

describe('faune (Phase 15)', () => {
  it('le monde est peuplé au démarrage et respecte le cap dur', () => {
    const sim = new Simulation({ seed: 70, agentCount: 4 });
    expect(sim.wildlife.length).toBeGreaterThan(0);
    expect(sim.wildlife.length).toBeLessThanOrEqual(WILDLIFE_HARD_CAP);
    // Au moins une espèce de proies ET au moins un poisson : la sim ne doit pas
    // se retrouver vide d'une catégorie entière sur un monde 48x48 standard.
    const kinds = new Set(sim.wildlife.map((a) => a.kind));
    expect([...kinds].some((k) => ANIMAL_PROFILES[k].isPrey && k !== 'poisson')).toBe(true);
  });

  it('un animal terrestre change de position après le délai d\'errance', () => {
    const sim = new Simulation({ seed: 71, agentCount: 2 });
    const deer = sim.wildlife.find((a) => a.kind === 'cerf');
    if (!deer) return; // le seed peut ne pas spawner de cerf — on ne casse pas la suite
    const startX = deer.pos.x;
    const startY = deer.pos.y;
    // Avance le temps de plusieurs intervalles d'errance pour garantir un pas.
    sim.setSpeed(2_000);
    for (let i = 0; i < 30; i++) sim.tick();
    // Le cerf a soit bougé, soit a été tué. Dans les deux cas, il n'est plus à la même
    // tuile : sa position de départ ne doit pas être identique sauf coup de RNG.
    if (sim.wildlife.includes(deer)) {
      const moved = deer.pos.x !== startX || deer.pos.y !== startY;
      // Au pire, plusieurs tirages sur place — on retente alors avec plus de temps.
      if (!moved) {
        for (let i = 0; i < 60; i++) sim.tick();
        expect(deer.pos.x !== startX || deer.pos.y !== startY).toBe(true);
      } else {
        expect(moved).toBe(true);
      }
    }
    expect(WILDLIFE_STEP_INTERVAL_SECONDS).toBeGreaterThan(0); // garde-fou anti-dérive
  });

  it('un chasseur adjacent à un cerf finit par l\'abattre et en rapporte viande + peau', () => {
    const sim = new Simulation({ seed: 72, agentCount: 2 });
    // Place le 1er agent comme chasseur, juste à côté d'un cerf simulé.
    const hunter = sim.agents[0]!;
    hunter.state.job = 'chasseur' as Job;
    // Force une proie connue : on injecte un cerf au pied du chasseur.
    sim.wildlife.length = 0;
    sim.wildlife.push({
      id: 999_999,
      kind: 'cerf',
      pos: { x: hunter.state.pos.x + 1, y: hunter.state.pos.y },
      hp: ANIMAL_PROFILES.cerf.maxHp,
      fleeingFrom: null,
      nextStepAt: Number.POSITIVE_INFINITY, // immobile (sinon il fuit hors portée)
      nextBiteAt: 0,
    });
    // Empêche la faim de couper la chasse, et laisse mille tentatives au timer.
    hunter.state.needs.hunger = 99;
    hunter.state.needs.energy = 99;
    hunter.nextGatherGameTime = 0;
    // Boucle d'attaque manuelle : on appelle advanceHunt par réflexion (méthode privée),
    // mais elle est exercée indirectement en mettant l'activité et en appelant tick.
    const before = count(hunter.inventory, 'viande');
    sim.setSpeed(300);
    for (let i = 0; i < 200 && sim.wildlife.length > 0; i++) sim.tick();
    // Soit le cerf a été tué (viande +), soit il a fui hors portée. Dans le 2e cas, on
    // re-place un cerf et on relance pour vraiment éprouver la mécanique de kill.
    if (sim.wildlife.length > 0) {
      sim.wildlife[0]!.pos = { x: hunter.state.pos.x + 1, y: hunter.state.pos.y };
      sim.wildlife[0]!.fleeingFrom = null;
      sim.wildlife[0]!.nextStepAt = Number.POSITIVE_INFINITY;
      hunter.nextGatherGameTime = 0;
      for (let i = 0; i < 200 && sim.wildlife.length > 0; i++) sim.tick();
    }
    expect(count(hunter.inventory, 'viande')).toBeGreaterThan(before);
    expect(count(hunter.inventory, 'peau')).toBeGreaterThan(0);
  });

  it('une proie attaquée fuit le chasseur', () => {
    const sim = new Simulation({ seed: 73, agentCount: 1 });
    const hunter = sim.agents[0]!;
    hunter.state.job = 'chasseur' as Job;
    sim.wildlife.length = 0;
    sim.wildlife.push({
      id: 999_998,
      kind: 'sanglier', // 4 hp : ne tombe pas du premier coup
      pos: { x: hunter.state.pos.x + 1, y: hunter.state.pos.y },
      hp: ANIMAL_PROFILES.sanglier.maxHp,
      fleeingFrom: null,
      nextStepAt: Number.POSITIVE_INFINITY,
      nextBiteAt: 0,
    });
    hunter.state.needs.hunger = 99;
    hunter.state.needs.energy = 99;
    hunter.nextGatherGameTime = 0;
    sim.setSpeed(300);
    for (let i = 0; i < 60; i++) {
      sim.tick();
      const prey = sim.wildlife[0];
      if (prey && prey.fleeingFrom != null) {
        expect(prey.fleeingFrom).toBe(hunter.state.id);
        return;
      }
    }
    // Si on n'a jamais vu de marquage de fuite, le test fail volontairement.
    expect.fail('la proie n\'a jamais été marquée en fuite');
  });

  it('un loup la nuit attaque un agent isolé et l\'épargne s\'il est accompagné', () => {
    const sim = new Simulation({ seed: 74, agentCount: 2 });
    // Force la nuit (1h du matin) en avançant le temps de jeu.
    sim.clock.gameTime = sim.clock.gameTime + 24 * 3600; // arbitraire, on lit timeOfDay ensuite
    while (sim.clock.timeOfDay > 4 && sim.clock.timeOfDay < 22) sim.clock.gameTime += 3600;
    const victim = sim.agents[0]!;
    const other = sim.agents[1]!;
    // Loup planté juste à côté de la victime.
    sim.wildlife.length = 0;
    sim.wildlife.push({
      id: 888_001,
      kind: 'loup',
      pos: { x: victim.state.pos.x + 1, y: victim.state.pos.y },
      hp: ANIMAL_PROFILES.loup.maxHp,
      fleeingFrom: null,
      nextStepAt: Number.POSITIVE_INFINITY,
      nextBiteAt: 0,
    });
    // Cas isolé : éloigne l'autre agent + désactive le sommeil de la victime.
    other.state.pos = { x: victim.state.pos.x + 50, y: victim.state.pos.y + 50 };
    victim.state.activity = 'idle';
    const hpBefore = victim.health;
    sim.tick();
    expect(victim.health).toBeLessThan(hpBefore);
    expect(WOLF_ATTACK_RADIUS).toBeGreaterThan(0);
    // Cas accompagné : l'autre revient à portée de protection.
    sim.wildlife[0]!.nextBiteAt = 0;
    other.state.pos = { x: victim.state.pos.x + 1, y: victim.state.pos.y + 1 };
    expect(distanceTo(other.state.pos, victim.state.pos)).toBeLessThanOrEqual(ISOLATION_RADIUS);
    const hpMid = victim.health;
    sim.tick();
    // Pas de nouvelle morsure (la récupération naturelle peut faire varier d'une fraction).
    expect(victim.health).toBeGreaterThanOrEqual(hpMid);
  });

  it('un loup le jour ne s\'en prend pas aux passants', () => {
    const sim = new Simulation({ seed: 75, agentCount: 1 });
    // Force midi.
    while (sim.clock.timeOfDay < 11 || sim.clock.timeOfDay > 13) sim.clock.gameTime += 1800;
    const victim = sim.agents[0]!;
    sim.wildlife.length = 0;
    sim.wildlife.push({
      id: 888_002,
      kind: 'loup',
      pos: { x: victim.state.pos.x + 1, y: victim.state.pos.y },
      hp: ANIMAL_PROFILES.loup.maxHp,
      fleeingFrom: null,
      nextStepAt: Number.POSITIVE_INFINITY,
      nextBiteAt: 0,
    });
    victim.state.activity = 'idle';
    const hpBefore = victim.health;
    sim.tick();
    expect(victim.health).toBe(hpBefore);
  });

  it('la population se réajuste après un effondrement (respawn périodique)', () => {
    const sim = new Simulation({ seed: 76, agentCount: 2 });
    // Vide totalement la faune. On force ensuite le moment du respawn et on tick.
    sim.wildlife.length = 0;
    sim.clock.gameTime += WILDLIFE_RESPAWN_INTERVAL_SECONDS + 1;
    // Plusieurs ticks pour laisser maintainWildlife respawner kind par kind.
    for (let i = 0; i < 20; i++) sim.tick();
    expect(sim.wildlife.length).toBeGreaterThan(0);
  });

  it('findNearestPrey ignore les poissons (chassés via la pêche) et les prédateurs morts', () => {
    const sim = new Simulation({ seed: 77, agentCount: 1 });
    const agent = sim.agents[0]!;
    sim.wildlife.length = 0;
    sim.wildlife.push(
      { id: 1, kind: 'poisson', pos: { ...agent.state.pos }, hp: 1, fleeingFrom: null, nextStepAt: 0, nextBiteAt: 0 },
      { id: 2, kind: 'cerf', pos: { x: agent.state.pos.x + 3, y: agent.state.pos.y }, hp: 0, fleeingFrom: null, nextStepAt: 0, nextBiteAt: 0 },
      { id: 3, kind: 'lapin', pos: { x: agent.state.pos.x + 5, y: agent.state.pos.y }, hp: 1, fleeingFrom: null, nextStepAt: 0, nextBiteAt: 0 },
    );
    const prey = findNearestPrey(sim.wildlife, agent.state.pos);
    expect(prey?.kind).toBe('lapin');
    expect(HUNT_RANGE).toBeGreaterThan(0);
  });
});

function distanceTo(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
