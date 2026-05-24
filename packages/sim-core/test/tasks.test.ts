import { describe, it, expect } from 'vitest';
import { Simulation } from '../src/sim';
import { Rng } from '../src/rng';
import { SimClock, BASE_SCALE } from '../src/clock';
import { buildTask, type TaskContext } from '../src/ai/tasks';
import { DECISION_INTERVAL_SECONDS, MAX_VISUAL_TILES_PER_REAL_SEC } from '../src/catalog';

describe('Task (phases multi-étapes)', () => {
  it('manger : décompose en travel → préparer → manger', () => {
    const sim = new Simulation({ seed: 4, agentCount: 1 });
    const a = sim.agents[0]!;
    const ctx: TaskContext = {
      agent: a,
      rng: new Rng(123),
      clock: sim.clock,
      resolveTarget: (_act, fb) => fb,
    };
    const task = buildTask('eating', a.home, ctx);
    expect(task.goal).toBe('eating');
    expect(task.phases.map((p) => p.kind)).toEqual(['travel', 'execute', 'execute']);
    expect(task.phases[1]!.activity).toBe('eating');
    expect(task.phases[2]!.activity).toBe('eating');
  });

  it("dormir : une phase d'attente longue après le déplacement à la maison", () => {
    const sim = new Simulation({ seed: 4, agentCount: 1 });
    const a = sim.agents[0]!;
    const ctx: TaskContext = {
      agent: a,
      rng: new Rng(123),
      clock: sim.clock,
      resolveTarget: (_act, fb) => fb,
    };
    const task = buildTask('sleeping', a.home, ctx);
    expect(task.phases.map((p) => p.kind)).toEqual(['travel', 'wait']);
    expect(task.phases[1]!.activity).toBe('sleeping');
  });

  it('flânerie (idle) : wander + pause autour de la maison', () => {
    const sim = new Simulation({ seed: 4, agentCount: 1 });
    const a = sim.agents[0]!;
    const ctx: TaskContext = {
      agent: a,
      rng: new Rng(123),
      clock: sim.clock,
      resolveTarget: (_act, fb) => fb,
    };
    const task = buildTask('idle', a.home, ctx);
    expect(task.phases.map((p) => p.kind)).toEqual(['wander', 'wait']);
  });
});

describe('Simulation — tâches & désynchronisation', () => {
  it('les agents enchaînent les phases : transitions visibles dans state.activity', () => {
    const sim = new Simulation({ seed: 19, agentCount: 6 });
    const seen = new Map<number, Set<string>>(sim.agents.map((a) => [a.state.id, new Set()]));
    // ~1 minute réelle à 1× : suffisant pour observer travel → execute → re-décision.
    for (let i = 0; i < 1000; i++) {
      sim.tick();
      for (const a of sim.agents) seen.get(a.state.id)!.add(a.state.activity);
    }
    // Au moins un agent doit avoir alterné « walking » avec une activité concrète.
    const richest = [...seen.values()].reduce((a, b) => (a.size >= b.size ? a : b));
    expect(richest.has('walking')).toBe(true);
    expect(richest.size).toBeGreaterThanOrEqual(2);
  });

  it("désynchronise la toute première décision (stagger sur firstDecisionAt)", () => {
    const sim = new Simulation({ seed: 31, agentCount: 16 });
    const offsets = sim.agents.map((a) => a.firstDecisionAt - sim.clock.gameTime);
    // Tous doivent être dans la fenêtre [0, DECISION_INTERVAL_SECONDS].
    for (const o of offsets) {
      expect(o).toBeGreaterThanOrEqual(0);
      expect(o).toBeLessThanOrEqual(DECISION_INTERVAL_SECONDS);
    }
    // Bonne dispersion : l'écart-type doit être franchement non nul (>= 20 % de l'intervalle).
    const mean = offsets.reduce((s, x) => s + x, 0) / offsets.length;
    const variance =
      offsets.reduce((s, x) => s + (x - mean) ** 2, 0) / offsets.length;
    const stdev = Math.sqrt(variance);
    expect(stdev).toBeGreaterThan(0.2 * DECISION_INTERVAL_SECONDS);
  });

  it('borne visuelle : à 1×, un agent ne dépasse pas ~4 tuiles parcourues en 1 s réelle', () => {
    const sim = new Simulation({ seed: 5, agentCount: 1 });
    const a = sim.agents[0]!;
    // Force une cible lointaine pour saturer le déplacement.
    const far = sim.world.nearestWalkable(
      Math.round(a.state.pos.x + 30),
      Math.round(a.state.pos.y + 0),
    );
    a.currentTask = {
      goal: 'idle',
      idx: 0,
      hardDeadlineAt: sim.clock.gameTime + 9999,
      phases: [{ kind: 'travel', activity: 'walking', target: far, label: 'test' }],
    };
    a.firstDecisionAt = sim.clock.gameTime; // pas de stagger qui retarde
    const start = { ...a.state.pos };
    // 15 ticks = 1 seconde réelle à ticksPerSecond=15.
    for (let i = 0; i < 15; i++) sim.tick();
    const dist = Math.hypot(a.state.pos.x - start.x, a.state.pos.y - start.y);
    // Tolérance : la borne est de 4 t/s réelles ; ~5 = marge pour le sous-pas final.
    expect(dist).toBeLessThanOrEqual(MAX_VISUAL_TILES_PER_REAL_SEC + 1.5);
  });

  it("un besoin critique interrompt une activité non-essentielle", () => {
    const sim = new Simulation({ seed: 8, agentCount: 1 });
    const a = sim.agents[0]!;
    // Provoque une tâche « working » bidon, puis effondre la faim : la prochaine
    // re-décision doit basculer sur « eating » (seuil faim < 15 = critique).
    a.currentTask = {
      goal: 'working',
      idx: 0,
      hardDeadlineAt: sim.clock.gameTime + 9999,
      phases: [{ kind: 'execute', activity: 'working', durationSeconds: 9999, label: 'bosse' }],
    };
    a.firstDecisionAt = sim.clock.gameTime;
    a.state.needs.hunger = 5;
    // Laisse la sim détecter le critique et basculer.
    for (let i = 0; i < 5; i++) sim.tick();
    expect(a.currentTask?.goal).toBe('eating');
  });
});
