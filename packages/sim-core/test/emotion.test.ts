import { describe, it, expect } from 'vitest';
import { Simulation } from '../src/sim';
import { bumpEmotion, decayEmotions, dominantEmotion, makeEmotions } from '../src/ai/emotion';
import type { Personality } from '../src/entities';
import { YEAR_SECONDS } from '../src/catalog';

const flat: Personality = {
  openness: 0.5,
  conscientiousness: 0.5,
  extraversion: 0.5,
  agreeableness: 0.5,
  neuroticism: 0.5,
  industriousness: 0.5,
};

describe('émotions', () => {
  it('les humeurs décroissent vers leur valeur cible', () => {
    const e = makeEmotions();
    bumpEmotion(e, flat, 'colere', 80);
    expect(e.colere).toBeGreaterThan(40);
    decayEmotions(e, flat, 2 * 24 * 3600); // 2 jours de jeu
    expect(e.colere).toBeLessThan(5);
  });

  it('joie est amplifiée par extraversion, tristesse par neuroticism', () => {
    const extra: Personality = { ...flat, extraversion: 1 };
    const neuro: Personality = { ...flat, neuroticism: 1 };
    const e1 = makeEmotions();
    const e2 = makeEmotions();
    bumpEmotion(e1, extra, 'joie', 10);
    bumpEmotion(e2, flat, 'joie', 10);
    expect(e1.joie).toBeGreaterThan(e2.joie);
    const e3 = makeEmotions();
    const e4 = makeEmotions();
    bumpEmotion(e3, neuro, 'tristesse', 10);
    bumpEmotion(e4, flat, 'tristesse', 10);
    expect(e3.tristesse).toBeGreaterThan(e4.tristesse);
  });

  it('dominantEmotion renvoie la plus haute', () => {
    const e = makeEmotions();
    bumpEmotion(e, flat, 'peur', 80);
    expect(dominantEmotion(e).key).toBe('peur');
  });

  it('un agent malade voit sa tristesse et sa peur monter', () => {
    const sim = new Simulation({ seed: 30, agentCount: 2 });
    const a = sim.agents[0]!;
    a.illness = {
      kind: 'fièvre',
      sinceGameTime: sim.clock.gameTime,
      durationSeconds: 999_999,
      contagious: true,
    };
    const before = { ...a.emotions };
    sim.setSpeed(500);
    for (let i = 0; i < 50; i++) sim.tick();
    expect(a.emotions.tristesse + a.emotions.peur).toBeGreaterThan(
      before.tristesse + before.peur,
    );
  });

  it('la naissance déclenche une grande joie chez les parents', () => {
    const sim = new Simulation({ seed: 31, agentCount: 2 });
    const mother = sim.agents[0]!;
    const father = sim.agents[1]!;
    mother.state.gender = 'F';
    father.state.gender = 'M';
    mother.birthGameTime = sim.clock.gameTime - 25 * YEAR_SECONDS;
    mother.state.partnerId = father.state.id;
    father.state.partnerId = mother.state.id;
    mother.pregnant = { sinceGameTime: sim.clock.gameTime, fatherId: father.state.id };
    const joyBefore = mother.emotions.joie;
    sim.setSpeed(1_000_000);
    const initial = sim.agents.length;
    for (let i = 0; i < 200 && sim.agents.length === initial; i++) sim.tick();
    expect(sim.agents.length).toBe(initial + 1);
    expect(mother.emotions.joie).toBeGreaterThan(joyBefore + 20);
  });
});
