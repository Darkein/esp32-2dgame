import { describe, it, expect } from 'vitest';
import { World } from '../src/world';
import { Rng } from '../src/rng';
import { PATH_WEAR_THRESHOLD } from '../src/catalog';

describe('chemins émergents (usure des tuiles)', () => {
  it('un passage répété sur une tuile grass la transforme en chemin', () => {
    const w = new World(10, 10, new Rng(1), 100);
    for (let i = 0; i < w.tiles.length; i++) w.tiles[i] = 'grass';
    for (let k = 0; k < PATH_WEAR_THRESHOLD - 1; k++) w.stampWear(5, 5);
    expect(w.tileAt(5, 5)).toBe('grass');
    w.stampWear(5, 5); // dernier passage : franchit le seuil
    expect(w.tileAt(5, 5)).toBe('path');
  });

  it('une tuile forest ne s\'use pas (pas de chemin sous les arbres)', () => {
    const w = new World(10, 10, new Rng(1), 100);
    for (let i = 0; i < w.tiles.length; i++) w.tiles[i] = 'forest';
    for (let k = 0; k < PATH_WEAR_THRESHOLD * 2; k++) w.stampWear(3, 3);
    expect(w.tileAt(3, 3)).toBe('forest');
  });

  it('pavePath transforme directement une tuile grass/dirt en chemin', () => {
    const w = new World(10, 10, new Rng(1), 100);
    for (let i = 0; i < w.tiles.length; i++) w.tiles[i] = 'grass';
    expect(w.pavePath(2, 2)).toBe(true);
    expect(w.tileAt(2, 2)).toBe('path');
    // On ne pave pas l'eau ou un champ.
    w.tiles[w.idx(3, 3)] = 'water';
    expect(w.pavePath(3, 3)).toBe(false);
  });
});
