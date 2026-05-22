import { describe, it, expect } from 'vitest';
import { Simulation } from '../src/sim';
import { SimClock } from '../src/clock';
import { stepNeeds, mostUrgent } from '../src/ai/needs';
import { makeNeeds } from '../src/entities';

describe('SimClock', () => {
  it('passe du jour à la nuit sur un cycle', () => {
    const c = new SimClock(15, 240, 12);
    expect(c.isNight).toBe(false);
    // avance jusqu'à 23h
    while (c.timeOfDay < 23) c.advance();
    expect(c.isNight).toBe(true);
    expect(c.darkness).toBeGreaterThan(0.5);
  });
});

describe('needs', () => {
  it('décroissent avec le temps', () => {
    const n = makeNeeds({ energy: 50 });
    stepNeeds(n, 'idle');
    expect(n.energy).toBeLessThan(50);
  });

  it('le sommeil restaure l\'énergie', () => {
    const n = makeNeeds({ energy: 50 });
    stepNeeds(n, 'sleeping');
    expect(n.energy).toBeGreaterThan(50);
  });

  it('identifie le besoin le plus urgent', () => {
    const n = makeNeeds({ hunger: 5, energy: 90 });
    expect(mostUrgent(n).key).toBe('hunger');
  });
});

describe('Simulation', () => {
  it('est déterministe pour une même graine', () => {
    const a = new Simulation({ seed: 42, agentCount: 6 });
    const b = new Simulation({ seed: 42, agentCount: 6 });
    for (let i = 0; i < 300; i++) {
      a.tick();
      b.tick();
    }
    expect(a.snapshot().agents.map((x) => [x.id, Math.round(x.pos.x), Math.round(x.pos.y)])).toEqual(
      b.snapshot().agents.map((x) => [x.id, Math.round(x.pos.x), Math.round(x.pos.y)]),
    );
  });

  it('les agents agissent et bougent (vie autonome)', () => {
    const sim = new Simulation({ seed: 7, agentCount: 8 });
    const start = sim.snapshot().agents.map((a) => ({ ...a.pos }));
    for (let i = 0; i < 500; i++) sim.tick();
    const end = sim.snapshot().agents.map((a) => a.pos);
    const moved = end.some((p, i) => Math.hypot(p.x - start[i]!.x, p.y - start[i]!.y) > 0.5);
    expect(moved).toBe(true);
  });

  it('décision de la couche rapide < 0,5 s par agent', () => {
    const sim = new Simulation({ seed: 1, agentCount: 16 });
    const t0 = performance.now();
    sim.tick();
    const perAgent = (performance.now() - t0) / 16;
    expect(perAgent).toBeLessThan(500);
  });
});
