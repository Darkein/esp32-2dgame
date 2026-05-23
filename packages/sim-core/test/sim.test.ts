import { describe, it, expect } from 'vitest';
import { Simulation } from '../src/sim';
import { SimClock } from '../src/clock';
import { stepNeeds, mostUrgent } from '../src/ai/needs';
import { makeNeeds } from '../src/entities';

describe('SimClock', () => {
  it('passe du jour à la nuit sur un cycle', () => {
    const c = new SimClock(15, 12); // démarre à midi
    expect(c.isNight).toBe(false);
    // avance jusqu'à 23h
    while (c.timeOfDay < 23) c.advance();
    expect(c.isNight).toBe(true);
    expect(c.darkness).toBeGreaterThan(0.5);
  });

  it('expose date et compteur de jours dérivés du temps de jeu', () => {
    const c = new SimClock(15, 0, 0); // démarre à l'an 1, jour 1, 00:00
    expect(c.dayCount).toBe(0);
    expect(c.date).toEqual({ year: 1, month: 1, day: 1 });
    // Avance d'exactement 40 jours de jeu (40 × 86400 s à vitesse 1×).
    const target = 40 * 86_400;
    while (c.gameTime < target) c.advance();
    expect(c.dayCount).toBe(40);
    expect(c.date).toEqual({ year: 1, month: 2, day: 10 }); // 31 (janv.) + 9
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

  it('répond au joueur (dialogue adressé au joueur)', () => {
    const sim = new Simulation({ seed: 3, agentCount: 4 });
    const id = sim.agents[0]!.state.id;
    sim.handleChat(id, 'Quelles sont tes aspirations ?', false);
    let dialogues = sim.tick();
    for (let i = 0; i < 3 && dialogues.length === 0; i++) dialogues = sim.tick();
    const toPlayer = dialogues.find((d) => d.listenerId === 0 && d.speakerId === id);
    expect(toPlayer?.text.length).toBeGreaterThan(0);
  });

  it('un ordre est accepté ou refusé selon la personnalité', () => {
    const sim = new Simulation({ seed: 5, agentCount: 4 });
    const docile = sim.agents[0]!;
    docile.personality.agreeableness = 1;
    docile.personality.conscientiousness = 1;
    docile.state.needs.energy = 90;
    sim.handleChat(docile.state.id, 'Va travailler !', true);
    expect(docile.state.goal).toContain('obéir');

    const rebelle = sim.agents[1]!;
    rebelle.personality.agreeableness = 0;
    rebelle.personality.conscientiousness = 0;
    const goalBefore = rebelle.state.goal;
    sim.handleChat(rebelle.state.id, 'Va travailler !', true);
    expect(rebelle.state.goal).toBe(goalBefore);
  });
});
