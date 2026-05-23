import { describe, it, expect } from 'vitest';
import { Simulation } from '../src/sim';
import { LEVEL_BASE_XP, levelFromXp, skillSpeed } from '../src/catalog';

describe('compétences & apprentissage', () => {
  it('le niveau croît logarithmiquement avec la XP', () => {
    expect(levelFromXp(0)).toBe(0);
    expect(levelFromXp(LEVEL_BASE_XP)).toBe(1);
    expect(levelFromXp(LEVEL_BASE_XP * 3)).toBe(2);
    expect(levelFromXp(LEVEL_BASE_XP * 7)).toBe(3);
    expect(levelFromXp(LEVEL_BASE_XP * 100_000)).toBe(7); // borné à 7
  });

  it('la vitesse augmente avec le niveau', () => {
    expect(skillSpeed(0)).toBe(1);
    expect(skillSpeed(7)).toBeGreaterThan(1.9);
  });

  it("un agent qui travaille accumule de l'XP dans son métier au fil des ticks", () => {
    const sim = new Simulation({ seed: 50, agentCount: 4 });
    // On laisse la sim tourner suffisamment pour observer du travail.
    sim.setSpeed(5000);
    for (let i = 0; i < 50; i++) sim.tick();
    const totalXp = sim.agents.reduce(
      (s, a) => s + Array.from(a.skills.values()).reduce((t, v) => t + v, 0),
      0,
    );
    expect(totalXp).toBeGreaterThan(0);
  });
});
