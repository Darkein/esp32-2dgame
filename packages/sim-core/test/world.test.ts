import { describe, it, expect } from 'vitest';
import { World } from '../src/world';
import { Rng } from '../src/rng';
import type { Vec2 } from '@game/protocol';

function findTileOfType(w: World, type: string): Vec2 | null {
  for (let y = 0; y < w.height; y++)
    for (let x = 0; x < w.width; x++) if (w.tileAt(x, y) === type) return { x, y };
  return null;
}

describe('génération par biomes', () => {
  it('produit forêt, pierre et eau, mais aucun champ (créés par les agents)', () => {
    const w = new World(48, 48, new Rng(123), 100);
    for (const t of ['forest', 'stone', 'water']) {
      expect(findTileOfType(w, t), `tuile ${t} absente`).not.toBeNull();
    }
    expect(findTileOfType(w, 'farm')).toBeNull();
    expect(findTileOfType(w, 'champ_mur')).toBeNull();
  });
});

describe('champs : générateurs créés et possédés par un agent', () => {
  it('cultiver une tuile crée un champ possédé ; usage réservé au propriétaire', () => {
    const w = new World(48, 48, new Rng(123), 100);
    const g = findTileOfType(w, 'grass')!;
    expect(w.cultivate(g.x, g.y, 7)).toBe(true);
    expect(w.tileAt(g.x, g.y)).toBe('farm');
    expect(w.farmOwnerAt(g.x, g.y)).toBe(7);
    expect(w.countFarms(7)).toBe(1);
    // On ne peut pas labourer de l'eau / une tuile non cultivable.
    const water = findTileOfType(w, 'water')!;
    expect(w.cultivate(water.x, water.y, 7)).toBe(false);
  });
});

describe('gisements : épuisement puis repousse', () => {
  it('une forêt s\'épuise (→ grass) puis repousse', () => {
    const w = new World(48, 48, new Rng(123), 100);
    const f = findTileOfType(w, 'forest')!;
    let res: string | null = null;
    let guard = 0;
    while (w.tileAt(f.x, f.y) === 'forest' && guard++ < 200) res = w.harvest(f.x, f.y, 0);
    expect(res).toBe('bois');
    expect(w.tileAt(f.x, f.y)).toBe('grass'); // épuisée
    w.regrow(100000); // bien après la repousse programmée
    expect(w.tileAt(f.x, f.y)).toBe('forest');
  });
});

describe('agriculture : semer → croître → récolter', () => {
  it('un champ semé mûrit en deux étapes puis se récolte', () => {
    const w = new World(48, 48, new Rng(123), 100); // 1 journée = 100 ticks
    const g = findTileOfType(w, 'grass')!;
    w.cultivate(g.x, g.y, 1);
    const fm = g;
    expect(w.plant(fm.x, fm.y, 0)).toBe(true);
    expect(w.tileAt(fm.x, fm.y)).toBe('champ_seme');
    w.regrow(50); // mi-croissance
    expect(w.tileAt(fm.x, fm.y)).toBe('champ_pousse');
    w.regrow(100); // maturité
    expect(w.tileAt(fm.x, fm.y)).toBe('champ_mur');
    expect(w.reap(fm.x, fm.y)).toBeGreaterThan(0);
    expect(w.tileAt(fm.x, fm.y)).toBe('farm'); // redevient labouré (à resemer)
  });

  it('le chunk est marqué « dirty » quand une tuile change', () => {
    const w = new World(48, 48, new Rng(123), 100);
    w.consumeTilesDirty(); // remet à zéro
    const g = findTileOfType(w, 'grass')!;
    w.cultivate(g.x, g.y, 1);
    expect(w.consumeTilesDirty()).toBe(true);
    expect(w.consumeTilesDirty()).toBe(false);
  });
});
