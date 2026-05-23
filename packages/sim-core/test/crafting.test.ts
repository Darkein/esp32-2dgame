import { describe, it, expect } from 'vitest';
import { Simulation } from '../src/sim';
import { add, canAfford, craftable, pay, take, tileResource } from '../src/crafting';

describe('crafting (fonctions pures)', () => {
  it('mappe les tuiles vers leurs ressources', () => {
    expect(tileResource('forest')).toBe('bois');
    expect(tileResource('stone')).toBe('pierre');
    expect(tileResource('dirt')).toBe('argile');
    expect(tileResource('sand')).toBe('sable');
    // Le champ ne donne rien passivement : le blé vient de la récolte d'un champ mûr.
    expect(tileResource('farm')).toBeNull();
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

  it('propose une recette réalisable selon les postes disponibles', () => {
    const inv = new Map<string, number>();
    add(inv, 'farine', 1);
    add(inv, 'eau', 1);
    // Le pain exige un four : indisponible sans poste.
    expect(craftable(inv, [])).toBeNull();
    expect(craftable(inv, ['four'])?.id).toBe('pain');
    expect(take(inv, 'pain', 1)).toBe(false);
  });
});

describe('économie en jeu', () => {
  it('les agents récoltent des ressources brutes variées au fil du temps', () => {
    const sim = new Simulation({ seed: 11, agentCount: 8 });
    for (let i = 0; i < 4000; i++) sim.tick();
    const inv = new Map<string, number>();
    for (const a of sim.snapshot().agents)
      for (const st of a.inventory) inv.set(st.kind, (inv.get(st.kind) ?? 0) + st.count);
    // Au moins une ressource brute issue d'un gisement a été récoltée.
    const raw = ['bois', 'pierre', 'argile', 'sable'].filter((k) => (inv.get(k) ?? 0) > 0);
    expect(raw.length).toBeGreaterThan(0);
  });

  it('les agents fabriquent des objets et bâtissent avec le temps', () => {
    const sim = new Simulation({ seed: 7, agentCount: 8 });
    const initialBuildings = sim.world.buildings.length;
    // ~15 jours de jeu : laisse le temps aux agents de contourner les footprints multi-tuiles
    // et d'accumuler de quoi poser un chantier en plus de leur maison/atelier de départ.
    for (let i = 0; i < 18000; i++) sim.tick();
    const inv = new Map<string, number>();
    for (const a of sim.snapshot().agents)
      for (const st of a.inventory) inv.set(st.kind, (inv.get(st.kind) ?? 0) + st.count);
    const crafted = ['planche', 'meuble', 'poterie', 'outil', 'brique', 'verre'].reduce(
      (s, k) => s + (inv.get(k) ?? 0),
      0,
    );
    expect(crafted).toBeGreaterThan(0); // des objets ont été fabriqués (craft = temps)
    expect(sim.world.buildings.length).toBeGreaterThan(initialBuildings); // des bâtiments ont été bâtis
  });
});
