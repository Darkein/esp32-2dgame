// A* sur la grille tuilée, voisinage 8-directions, coûts par type de terrain.
// Heuristique octile (admissible avec coûts ≥ 1) modulée par le coût minimal.
// Borné en nœuds explorés pour rester sub-ms même sur une carte 128×128.
import type { Vec2 } from '@game/protocol';
import type { World } from '../world';
import { TILE_MOVE_COST } from '../catalog';

const SQRT2 = Math.SQRT2;
const NEIGHBORS_8: Array<[number, number, number]> = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, SQRT2], [1, -1, SQRT2], [-1, 1, SQRT2], [-1, -1, SQRT2],
];

const MAX_NODES = 5000;

/** Min-heap binaire indexé par `f` (somme g+h). Suffisant pour ~5k nœuds. */
class MinHeap {
  private a: Array<{ i: number; f: number }> = [];
  push(node: { i: number; f: number }): void {
    this.a.push(node);
    this.up(this.a.length - 1);
  }
  pop(): { i: number; f: number } | undefined {
    if (this.a.length === 0) return undefined;
    const top = this.a[0]!;
    const last = this.a.pop()!;
    if (this.a.length > 0) {
      this.a[0] = last;
      this.down(0);
    }
    return top;
  }
  get size(): number { return this.a.length; }
  private up(k: number): void {
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (this.a[p]!.f <= this.a[k]!.f) break;
      [this.a[p], this.a[k]] = [this.a[k]!, this.a[p]!];
      k = p;
    }
  }
  private down(k: number): void {
    const n = this.a.length;
    for (;;) {
      const l = 2 * k + 1;
      const r = l + 1;
      let m = k;
      if (l < n && this.a[l]!.f < this.a[m]!.f) m = l;
      if (r < n && this.a[r]!.f < this.a[m]!.f) m = r;
      if (m === k) return;
      [this.a[m], this.a[k]] = [this.a[k]!, this.a[m]!];
      k = m;
    }
  }
}

/** Distance octile : min(dx,dy)*√2 + |dx−dy|. Admissible pour 8-dir avec coût ≥ 1. */
function octile(ax: number, ay: number, bx: number, by: number): number {
  const dx = Math.abs(bx - ax);
  const dy = Math.abs(by - ay);
  return dx + dy + (SQRT2 - 2) * Math.min(dx, dy);
}

/** Cherche un chemin tuile-à-tuile entre `from` et `to`. Renvoie la liste des
 *  waypoints (cellules entières) ou null si inatteignable / hors budget.
 *  La cible est forcée vers la tuile-porte si `to` tombe dans un footprint bloqué. */
export function findPath(world: World, from: Vec2, to: Vec2): Vec2[] | null {
  const w = world.width;
  const h = world.height;
  const sx = Math.round(from.x);
  const sy = Math.round(from.y);
  const tx = Math.round(to.x);
  const ty = Math.round(to.y);
  if (!world.inBounds(sx, sy) || !world.inBounds(tx, ty)) return null;
  // Si la cible est sur une tuile bloquée (ex: footprint sans porte), reporter sur le voisin libre.
  let goalX = tx;
  let goalY = ty;
  if (!world.walkable(goalX, goalY)) {
    const near = world.nearestWalkable(tx, ty);
    goalX = Math.round(near.x);
    goalY = Math.round(near.y);
  }
  if (sx === goalX && sy === goalY) return [{ x: goalX, y: goalY }];

  const startIdx = sy * w + sx;
  const goalIdx = goalY * w + goalX;

  const gScore = new Map<number, number>();
  const cameFrom = new Map<number, number>();
  const open = new MinHeap();
  gScore.set(startIdx, 0);
  open.push({ i: startIdx, f: octile(sx, sy, goalX, goalY) });
  let explored = 0;

  while (open.size > 0 && explored < MAX_NODES) {
    const cur = open.pop()!;
    if (cur.i === goalIdx) return reconstruct(cameFrom, cur.i, w);
    // Lazy delete : si un meilleur g existait, on l'a déjà traité.
    const cx = cur.i % w;
    const cy = (cur.i - cx) / w;
    const gCur = gScore.get(cur.i)!;
    explored++;

    for (const [dx, dy, base] of NEIGHBORS_8) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      if (!world.walkable(nx, ny)) continue;
      // Évite le « coin-clipping » à travers un mur en diagonale.
      if (dx !== 0 && dy !== 0 && (!world.walkable(cx + dx, cy) || !world.walkable(cx, cy + dy))) continue;
      const tile = world.tileAt(nx, ny);
      const cost = TILE_MOVE_COST[tile] * base;
      if (!Number.isFinite(cost)) continue;
      const ni = ny * w + nx;
      const tentative = gCur + cost;
      if (tentative < (gScore.get(ni) ?? Infinity)) {
        gScore.set(ni, tentative);
        cameFrom.set(ni, cur.i);
        open.push({ i: ni, f: tentative + octile(nx, ny, goalX, goalY) });
      }
    }
  }
  return null;
}

function reconstruct(cameFrom: Map<number, number>, endIdx: number, w: number): Vec2[] {
  const out: Vec2[] = [];
  let i: number | undefined = endIdx;
  while (i !== undefined) {
    const x = i % w;
    const y = (i - x) / w;
    out.push({ x, y });
    i = cameFrom.get(i);
  }
  out.reverse();
  return out;
}
