import { describe, it, expect } from 'vitest';
import { Simulation } from '../src/sim';
import { familyOf, reputation } from '../src/social';
import { BREAKUP_AFFINITY, YEAR_SECONDS } from '../src/catalog';

describe('relations sociales avancées', () => {
  it('un couple se rompt si l\'affinité chute sous le seuil', () => {
    const sim = new Simulation({ seed: 40, agentCount: 2 });
    const a = sim.agents[0]!;
    const b = sim.agents[1]!;
    a.state.partnerId = b.state.id;
    b.state.partnerId = a.state.id;
    a.relationships.set(b.state.id, BREAKUP_AFFINITY - 1);
    sim.tick();
    expect(a.state.partnerId).toBe(0);
    expect(b.state.partnerId).toBe(0);
    // Mémoires de séparation présentes
    expect(a.memory.recentText(sim.clock.tick, 5)).toMatch(/séparé/);
    expect(b.memory.recentText(sim.clock.tick, 5)).toMatch(/séparé/);
  });

  it('la jalousie fait baisser l\'affinité envers le partenaire si un rival monte', () => {
    const sim = new Simulation({ seed: 41, agentCount: 3 });
    const a = sim.agents[0]!;
    const partner = sim.agents[1]!;
    const rival = sim.agents[2]!;
    a.state.partnerId = partner.state.id;
    partner.state.partnerId = a.state.id;
    a.relationships.set(partner.state.id, 50);
    partner.relationships.set(a.state.id, 50);
    partner.relationships.set(rival.state.id, 90); // gros écart
    sim.setSpeed(1000);
    for (let i = 0; i < 30; i++) sim.tick();
    expect(a.relationships.get(partner.state.id)!).toBeLessThan(50);
  });

  it('familyOf récupère parents, enfants et fratrie', () => {
    const sim = new Simulation({ seed: 42, agentCount: 4 });
    const dad = sim.agents[0]!;
    const mom = sim.agents[1]!;
    const child1 = sim.agents[2]!;
    const child2 = sim.agents[3]!;
    child1.parents = [dad.state.id, mom.state.id];
    child2.parents = [dad.state.id, mom.state.id];
    const fam = familyOf(child1, sim.agents);
    expect(fam.parents).toHaveLength(2);
    expect(fam.siblings.map((s) => s.state.id)).toContain(child2.state.id);
    const dadFam = familyOf(dad, sim.agents);
    expect(dadFam.children.map((c) => c.state.id).sort()).toEqual(
      [child1.state.id, child2.state.id].sort(),
    );
  });

  it('reputation moyenne les affinités des autres envers la cible', () => {
    const sim = new Simulation({ seed: 43, agentCount: 4 });
    const target = sim.agents[0]!;
    sim.agents[1]!.relationships.set(target.state.id, 80);
    sim.agents[2]!.relationships.set(target.state.id, 40);
    sim.agents[3]!.relationships.set(target.state.id, -20);
    expect(reputation(target, sim.agents)).toBeCloseTo(33.33, 1);
  });
});

void YEAR_SECONDS;
