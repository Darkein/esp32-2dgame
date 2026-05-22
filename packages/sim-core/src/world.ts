import type { TileType, Vec2, BuildingState, ItemState } from '@game/protocol';
import { Rng } from './rng';

/** Le monde tuilé : génération procédurale simple + accès/walkability. */
export class World {
  readonly tiles: TileType[];
  readonly buildings: BuildingState[] = [];
  readonly items: ItemState[] = [];
  private nextEntityId = 1000;

  constructor(
    readonly width: number,
    readonly height: number,
    rng: Rng,
  ) {
    this.tiles = new Array(width * height).fill('grass');
    this.generate(rng);
  }

  idx(x: number, y: number): number {
    return y * this.width + x;
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  tileAt(x: number, y: number): TileType {
    if (!this.inBounds(x, y)) return 'water';
    return this.tiles[this.idx(x, y)]!;
  }

  /** Une IA peut-elle marcher sur cette tuile ? */
  walkable(x: number, y: number): boolean {
    return this.inBounds(x, y) && this.tileAt(x, y) !== 'water';
  }

  private set(x: number, y: number, t: TileType): void {
    if (this.inBounds(x, y)) this.tiles[this.idx(x, y)] = t;
  }

  private generate(rng: Rng): void {
    // Quelques étendues d'eau.
    for (let i = 0; i < 3; i++) {
      const cx = rng.int(this.width);
      const cy = rng.int(this.height);
      const r = 2 + rng.int(3);
      for (let y = -r; y <= r; y++)
        for (let x = -r; x <= r; x++)
          if (x * x + y * y <= r * r) this.set(cx + x, cy + y, 'water');
    }
    // Forêts et pierres dispersées.
    for (let i = 0; i < this.width * this.height * 0.06; i++) {
      const x = rng.int(this.width);
      const y = rng.int(this.height);
      if (this.tileAt(x, y) === 'grass') this.set(x, y, rng.chance(0.6) ? 'forest' : 'stone');
    }
    // Champs (sources de nourriture).
    for (let i = 0; i < 4; i++) {
      const x = 4 + rng.int(this.width - 8);
      const y = 4 + rng.int(this.height - 8);
      for (let dy = 0; dy < 2; dy++)
        for (let dx = 0; dx < 2; dx++) if (this.walkable(x + dx, y + dy)) this.set(x + dx, y + dy, 'farm');
    }
  }

  addBuilding(kind: string, pos: Vec2): BuildingState {
    const b: BuildingState = { id: this.nextEntityId++, kind, pos };
    this.buildings.push(b);
    return b;
  }

  /** Cherche une tuile marchable proche d'un point (spirale). */
  nearestWalkable(x: number, y: number): Vec2 {
    if (this.walkable(x, y)) return { x, y };
    for (let r = 1; r < Math.max(this.width, this.height); r++) {
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
          if (this.walkable(x + dx, y + dy)) return { x: x + dx, y: y + dy };
        }
    }
    return { x: Math.floor(this.width / 2), y: Math.floor(this.height / 2) };
  }
}
