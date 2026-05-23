import { describe, it, expect } from 'vitest';
import { World } from '../src/world';
import { Rng } from '../src/rng';

describe('footprints de bâtiments', () => {
  it('un bâtiment 3×3 bloque 8 tuiles ; la tuile-porte reste walkable', () => {
    const w = new World(20, 20, new Rng(1), 100);
    for (let i = 0; i < w.tiles.length; i++) w.tiles[i] = 'grass';
    const b = w.addBuilding('maison', { x: 5, y: 5 });
    expect(b.footprint).toEqual({ x: 3, y: 3 });
    let blocked = 0;
    let walkableInFootprint = 0;
    for (let dy = 0; dy < 3; dy++)
      for (let dx = 0; dx < 3; dx++) {
        const x = 5 + dx;
        const y = 5 + dy;
        if (w.walkable(x, y)) walkableInFootprint++;
        else blocked++;
      }
    expect(blocked).toBe(8);
    expect(walkableInFootprint).toBe(1);
    // La tuile-porte est précisément la tuile walkable du footprint.
    expect(w.walkable(b.door.x, b.door.y)).toBe(true);
  });

  it('buildingAt retrouve le bâtiment à partir de n\'importe quelle tuile du footprint', () => {
    const w = new World(20, 20, new Rng(1), 100);
    for (let i = 0; i < w.tiles.length; i++) w.tiles[i] = 'grass';
    const b = w.addBuilding('marche', { x: 8, y: 8 }); // 4×4
    for (let dy = 0; dy < 4; dy++)
      for (let dx = 0; dx < 4; dx++) {
        expect(w.buildingAt(8 + dx, 8 + dy)?.id).toBe(b.id);
      }
    // Hors du footprint, plus rien.
    expect(w.buildingAt(7, 8)).toBeNull();
    expect(w.buildingAt(12, 8)).toBeNull();
  });

  it('finishBuilding réajuste le footprint depuis le chantier réservé', () => {
    const w = new World(20, 20, new Rng(1), 100);
    for (let i = 0; i < w.tiles.length; i++) w.tiles[i] = 'grass';
    // Chantier réservant d'emblée la forme de la maison finale.
    const ch = w.addBuilding('chantier', { x: 5, y: 5 }, 1, 'maison');
    expect(ch.footprint).toEqual({ x: 3, y: 3 });
    // Le footprint est bloqué (sauf porte) tant que le chantier existe.
    expect(w.walkable(5, 5)).toBe(false);
    // Finition : kind change, footprint reste (toujours bloqué).
    w.finishBuilding(ch.id, 'maison');
    const finished = w.buildingAt(5, 5) ?? w.buildingAt(6, 5);
    expect(finished?.kind).toBe('maison');
    expect(w.walkable(5, 5)).toBe(false);
  });
});
