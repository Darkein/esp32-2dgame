import { describe, it, expect } from 'vitest';
import { Simulation } from '../src/sim';
import { add, canAfford, craftable, pay, take, tileResource } from '../src/crafting';

describe('crafting (fonctions pures)', () => {
  it('mappe les tuiles vers leurs ressources', () => {
    expect(tileResource('forest')).toBe('bois');
    expect(tileResource('stone')).toBe('pierre');
    expect(tileResource('farm')).toBe('ble');
    expect(tileResource('grass')).toBeNull();
  });

  it('paie une recette seulement si les matériaux suffisent', () => {
    const inv = new Map<string, number>();
    add(inv, 'bois', 1);
    expect(canAfford(inv, { bois: 2 })).toBe(false);
    add(inv, 'bois', 1);
    expect(canAfford(inv, { bois: 2 })).toBe(true);
    expect(pay(inv, { bois: 2 })).toBe(true);
    expect(inv.get('bois')).toBe(0);
  });

  it('propose une recette réalisable', () => {
    const inv = new Map<string, number>();
    add(inv, 'ble', 2);
    expect(craftable(inv, false)?.id).toBe('pain');
    expect(take(inv, 'pain', 1)).toBe(false);
  });
});

describe('économie en jeu', () => {
  it('les agents récoltent des ressources au fil du temps', () => {
    const sim = new Simulation({ seed: 11, agentCount: 8 });
    for (let i = 0; i < 4000; i++) sim.tick();
    const totalItems = sim
      .snapshot()
      .agents.reduce((acc, a) => acc + a.inventory.reduce((s, st) => s + st.count, 0), 0);
    expect(totalItems).toBeGreaterThan(0);
  });
});
