import { describe, it, expect } from 'vitest';
import { Simulation } from '../src/sim';
import type { Agent } from '../src/entities';
import {
  CONTAGION_RADIUS,
  HEALTH_MAX,
  HYGIENE_HEALTH_THRESHOLD,
  ILLNESS_INCUBATION_SECONDS,
} from '../src/catalog';

// Accès direct aux méthodes privées de santé : utile pour des tests déterministes
// qui ne dépendent pas des déplacements et décisions stochastiques du tick complet.
type SimHealthInternals = {
  stepHealth: (a: Agent, dt: number) => void;
  spreadIllness: (source: Agent, dt: number) => void;
};
const internals = (sim: Simulation) => sim as unknown as SimHealthInternals;

describe('santé & maladies', () => {
  it("l'hygiène basse dégrade la santé au fil du temps", () => {
    const sim = new Simulation({ seed: 10, agentCount: 2 });
    const a = sim.agents[0]!;
    a.state.needs.hygiene = HYGIENE_HEALTH_THRESHOLD - 5;
    a.health = HEALTH_MAX;
    // ~10 jours de jeu cumulés, hygiène maintenue basse.
    for (let i = 0; i < 10; i++) {
      a.state.needs.hygiene = HYGIENE_HEALTH_THRESHOLD - 5;
      internals(sim).stepHealth(a, 24 * 3600);
    }
    expect(a.health).toBeLessThan(HEALTH_MAX);
  });

  it('une maladie devient contagieuse après incubation et infecte un voisin proche', () => {
    const sim = new Simulation({ seed: 11, agentCount: 2 });
    const sick = sim.agents[0]!;
    const target = sim.agents[1]!;
    target.state.pos = { ...sick.state.pos };
    sick.illness = {
      kind: 'rhume',
      sinceGameTime: sim.clock.gameTime - ILLNESS_INCUBATION_SECONDS - 10,
      durationSeconds: 999_999, // ne guérit pas pendant le test
      contagious: false,
    };
    // Une seule étape de santé d'1 jour suffit : p ≈ 1 - e^{-1/8} × 24 ≈ 0,95
    internals(sim).stepHealth(sick, 24 * 3600);
    expect(sick.illness?.contagious).toBe(true);
    expect(target.illness).not.toBeNull();
    expect(target.illness?.kind).toBe('rhume');
  });

  it('un agent à santé nulle meurt', () => {
    const sim = new Simulation({ seed: 12, agentCount: 3 });
    const a = sim.agents[1]!;
    const id = a.state.id;
    a.health = 0;
    sim.tick();
    expect(sim.agents.find((x) => x.state.id === id)).toBeUndefined();
  });

  it("la contagion ne s'applique pas hors rayon", () => {
    const sim = new Simulation({ seed: 13, agentCount: 2 });
    const sick = sim.agents[0]!;
    const target = sim.agents[1]!;
    target.state.pos = { x: sick.state.pos.x + CONTAGION_RADIUS + 5, y: sick.state.pos.y };
    sick.illness = {
      kind: 'fièvre',
      sinceGameTime: sim.clock.gameTime,
      durationSeconds: 999_999,
      contagious: true,
    };
    // Forte exposition (10 jours de jeu) mais hors rayon : aucune infection.
    internals(sim).spreadIllness(sick, 10 * 24 * 3600);
    expect(target.illness).toBeNull();
  });
});
