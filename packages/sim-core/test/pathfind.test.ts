import { describe, it, expect } from 'vitest';
import { World } from '../src/world';
import { Rng } from '../src/rng';
import { findPath } from '../src/ai/pathfind';

describe('A* pathfinding', () => {
  it('trouve un chemin direct en l\'absence d\'obstacle', () => {
    const w = new World(20, 20, new Rng(1), 100);
    // Force toute la zone en herbe pour un test prévisible.
    for (let i = 0; i < w.tiles.length; i++) w.tiles[i] = 'grass';
    const path = findPath(w, { x: 1, y: 1 }, { x: 10, y: 10 });
    expect(path).not.toBeNull();
    expect(path!.length).toBeGreaterThan(1);
    // Premier waypoint = case de départ ; dernier = case d'arrivée.
    expect(path![0]).toEqual({ x: 1, y: 1 });
    expect(path![path!.length - 1]).toEqual({ x: 10, y: 10 });
  });

  it('contourne un footprint bloquant (bâtiment)', () => {
    const w = new World(20, 20, new Rng(1), 100);
    for (let i = 0; i < w.tiles.length; i++) w.tiles[i] = 'grass';
    // Place une maison 3×3 entre départ et arrivée.
    w.addBuilding('maison', { x: 8, y: 4 });
    const path = findPath(w, { x: 8, y: 1 }, { x: 8, y: 10 });
    expect(path).not.toBeNull();
    // Aucun waypoint ne doit traverser une tuile bloquée du footprint (sauf porte).
    for (const wp of path!) {
      expect(w.walkable(wp.x, wp.y)).toBe(true);
    }
  });

  it('renvoie null si la destination est isolée par de l\'eau infranchissable', () => {
    const w = new World(10, 10, new Rng(1), 100);
    for (let i = 0; i < w.tiles.length; i++) w.tiles[i] = 'grass';
    // Mur d'eau plein y=5 sauf bords (qu'on rendra aussi water) → isole le bas.
    for (let x = 0; x < 10; x++) w.tiles[5 * 10 + x] = 'water';
    const path = findPath(w, { x: 1, y: 1 }, { x: 1, y: 9 });
    expect(path).toBeNull();
  });

  it('préfère la tuile path à la tuile forest (coût plus bas)', () => {
    const w = new World(20, 5, new Rng(1), 100);
    for (let i = 0; i < w.tiles.length; i++) w.tiles[i] = 'forest';
    // Couloir de chemin sur la rangée 2 entre x=0 et x=10.
    for (let x = 0; x < 11; x++) w.tiles[2 * 20 + x] = 'path';
    const path = findPath(w, { x: 0, y: 0 }, { x: 10, y: 0 });
    expect(path).not.toBeNull();
    // Le chemin emprunté doit majoritairement passer par y=2 (chemin) plutôt que y=0 (forêt).
    const onPath = path!.filter((p) => p.y === 2).length;
    expect(onPath).toBeGreaterThan(path!.length / 2);
  });
});
