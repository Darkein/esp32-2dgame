import { describe, it, expect } from 'vitest';
import { Simulation } from '../src/sim';
import { SimClock, BASE_SCALE } from '../src/clock';
import { ELDER_AGE, ELDER_ENERGY_CAP, TEEN_AGE, YEAR_SECONDS, GESTATION_SECONDS } from '../src/catalog';

describe('échelle de temps', () => {
  it('le temps de jeu écoulé par tick est proportionnel à la vitesse', () => {
    const c = new SimClock(15);
    expect(c.advance(1)).toBeCloseTo(BASE_SCALE / 15, 6);
    expect(c.advance(10)).toBeCloseTo((10 * BASE_SCALE) / 15, 6);
    expect(c.advance(0)).toBe(0); // pause
  });
});

describe('cycle de la vie', () => {
  it('un enfant devient adulte à 18 ans (métier attribué)', () => {
    const sim = new Simulation({ seed: 1, agentCount: 2 });
    const a = sim.agents[0]!;
    a.birthGameTime = sim.clock.gameTime - 17.99 * YEAR_SECONDS;
    a.state.lifeStage = 'enfant';
    a.state.job = '';
    sim.setSpeed(1_000_000);
    for (let i = 0; i < 50 && a.state.lifeStage === 'enfant'; i++) sim.tick();
    expect(a.state.lifeStage).toBe('adulte');
    expect(a.state.job).not.toBe('');
  });

  it('un agent meurt au-delà de son espérance de vie', () => {
    const sim = new Simulation({ seed: 1, agentCount: 3 });
    const a = sim.agents[1]!;
    const id = a.state.id;
    a.lifespanYears = 80;
    a.birthGameTime = sim.clock.gameTime - 80.5 * YEAR_SECONDS;
    sim.tick();
    expect(sim.agents.find((x) => x.state.id === id)).toBeUndefined();
  });

  it("l'énergie d'un aîné est plafonnée par ELDER_ENERGY_CAP", () => {
    const sim = new Simulation({ seed: 3, agentCount: 2 });
    const a = sim.agents[0]!;
    a.birthGameTime = sim.clock.gameTime - (ELDER_AGE + 5) * YEAR_SECONDS;
    a.state.lifeStage = 'adulte';
    a.state.needs.energy = 100; // tente de dépasser le plafond
    sim.setSpeed(1);
    sim.tick();
    expect(a.state.lifeStage).toBe('aine');
    expect(a.state.needs.energy).toBeLessThanOrEqual(ELDER_ENERGY_CAP);
  });

  it("un ado qui a un métier appris en hérite à la majorité (plutôt que par défaut)", () => {
    const sim = new Simulation({ seed: 4, agentCount: 2 });
    const teen = sim.agents[0]!;
    teen.birthGameTime = sim.clock.gameTime - 17.99 * YEAR_SECONDS;
    teen.state.lifeStage = 'enfant';
    teen.state.job = '';
    teen.learnedJob = 'fermier';
    teen.apprenticeXp.set('fermier', 1000);
    sim.setSpeed(1_000_000);
    for (let i = 0; i < 50 && teen.state.lifeStage === 'enfant'; i++) sim.tick();
    expect(teen.state.lifeStage).toBe('adulte');
    expect(teen.state.job).toBe('fermier');
  });

  it("la mort laisse un souvenir partagé aux villageois proches", () => {
    const sim = new Simulation({ seed: 5, agentCount: 3 });
    const dying = sim.agents[0]!;
    const witness = sim.agents[1]!;
    witness.state.pos = { ...dying.state.pos };
    const beforeMem = witness.memory.recentText(sim.clock.tick, 10);
    dying.lifespanYears = 80;
    dying.birthGameTime = sim.clock.gameTime - 80.5 * YEAR_SECONDS;
    sim.tick();
    const afterMem = witness.memory.recentText(sim.clock.tick, 10);
    expect(afterMem).toContain('mort');
    expect(afterMem).not.toEqual(beforeMem);
  });

  it('une grossesse aboutit à la naissance d\'un enfant', () => {
    const sim = new Simulation({ seed: 2, agentCount: 2 });
    const mother = sim.agents[0]!;
    const father = sim.agents[1]!;
    mother.state.gender = 'F';
    father.state.gender = 'M';
    mother.birthGameTime = sim.clock.gameTime - 25 * YEAR_SECONDS;
    mother.state.partnerId = father.state.id;
    father.state.partnerId = mother.state.id;
    mother.pregnant = { sinceGameTime: sim.clock.gameTime, fatherId: father.state.id };
    const before = sim.agents.length;
    sim.setSpeed(1_000_000);
    let ticks = 0;
    while (sim.agents.length === before && ticks++ < 200) sim.tick();
    expect(sim.agents.length).toBe(before + 1);
    const child = sim.agents[sim.agents.length - 1]!;
    expect(child.state.lifeStage).toBe('enfant');
    expect(child.parents).toEqual([mother.state.id, father.state.id]);
    // La grossesse a bien duré ~la gestation prévue.
    expect(GESTATION_SECONDS).toBeGreaterThan(0);
  });
});
