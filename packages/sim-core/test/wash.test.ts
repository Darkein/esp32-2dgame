import { describe, it, expect } from 'vitest';
import { Simulation } from '../src/sim';
import { stepNeeds } from '../src/ai/needs';
import { decideAction } from '../src/ai/utility';
import { makeNeeds } from '../src/entities';
import { HYGIENE_HEALTH_THRESHOLD } from '../src/catalog';

describe('hygiène : activité washing', () => {
  it('stepNeeds(washing) restaure l\'hygiène en quelques minutes de jeu', () => {
    const needs = makeNeeds({ hygiene: 5 });
    // 12 minutes de jeu de lavage continu : l'hygiène doit dépasser le seuil santé.
    stepNeeds(needs, 'washing', 12 * 60);
    expect(needs.hygiene).toBeGreaterThan(HYGIENE_HEALTH_THRESHOLD);
  });

  it("la couche rapide choisit 'washing' quand l'hygiène est très basse et l'eau accessible", () => {
    const sim = new Simulation({ seed: 60, agentCount: 2 });
    const a = sim.agents[0]!;
    // Hygiène effondrée, autres besoins satisfaits → le seul candidat plausible est se laver.
    a.state.needs.hygiene = 5;
    a.state.needs.energy = 90;
    a.state.needs.hunger = 90;
    a.state.needs.social = 90;
    a.state.needs.fun = 90;
    a.personality.conscientiousness = 1; // pointilleux → priorité forte à l'hygiène
    const decision = decideAction(a, sim.world, sim.clock, sim.agents, null);
    expect(decision.activity).toBe('washing');
  });

  it("un agent dont l'hygiène est basse finit par se laver et la fait remonter", () => {
    const sim = new Simulation({ seed: 61, agentCount: 4 });
    const a = sim.agents[0]!;
    a.state.needs.hygiene = 5;
    sim.setSpeed(500);
    for (let i = 0; i < 200; i++) sim.tick();
    expect(a.state.needs.hygiene).toBeGreaterThan(HYGIENE_HEALTH_THRESHOLD);
  });
});
