import type { TileType, Vec2, BuildingState, ItemState } from '@game/protocol';
import { Rng } from './rng';
import { TILE_RESOURCE, TILE_STOCK, TILE_REGROW_DAYS, FARM_GROW_DAYS } from './catalog';

/** Transition de tuile programmée (repousse d'un gisement ou croissance d'une culture). */
interface TileTransition {
  index: number;
  to: TileType;
  /** Échéance, en secondes de jeu. */
  atGameTime: number;
  stock?: number;
}

/** Blé rendu par la récolte d'un champ mûr. */
const BLE_PER_HARVEST = 3;

/** Le monde tuilé : génération par biomes + accès/walkability + agriculture/gisements. */
export class World {
  readonly tiles: TileType[];
  readonly buildings: BuildingState[] = [];
  readonly items: ItemState[] = [];
  /** Stock restant d'un gisement, par index de tuile. */
  private readonly stock = new Map<number, number>();
  /** Transitions de tuiles programmées (repousse, croissance des cultures). */
  private transitions: TileTransition[] = [];
  /** Vrai si des tuiles ont changé depuis le dernier snapshot (renvoi du chunk). */
  private dirty = false;
  /** Propriétaire d'un champ (cultivé par un agent), par index de tuile. */
  private readonly farmOwner = new Map<number, number>();
  private nextEntityId = 1000;

  constructor(
    readonly width: number,
    readonly height: number,
    rng: Rng,
    /** Durée d'une journée en secondes de jeu (pour calibrer repousse/croissance). */
    private readonly secondsPerDay = 86_400,
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

  /** Une IA peut-elle marcher sur cette tuile ? (l'eau bloque) */
  walkable(x: number, y: number): boolean {
    return this.inBounds(x, y) && this.tileAt(x, y) !== 'water';
  }

  private set(x: number, y: number, t: TileType): void {
    if (this.inBounds(x, y)) this.tiles[this.idx(x, y)] = t;
  }

  // --- Génération par biomes ------------------------------------------------

  /** Champ de bruit lissé déterministe (value noise) renvoyant 0..1 pour (x,y). */
  private makeNoise(rng: Rng, cells: number): (x: number, y: number) => number {
    const cols = cells + 1;
    const grid = new Array((cells + 1) * cols);
    for (let i = 0; i < grid.length; i++) grid[i] = rng.next();
    const smooth = (t: number) => t * t * (3 - 2 * t);
    return (x: number, y: number) => {
      const gx = (x / this.width) * cells;
      const gy = (y / this.height) * cells;
      const x0 = Math.min(Math.floor(gx), cells - 1);
      const y0 = Math.min(Math.floor(gy), cells - 1);
      const tx = smooth(gx - x0);
      const ty = smooth(gy - y0);
      const a = grid[y0 * cols + x0]!;
      const b = grid[y0 * cols + x0 + 1]!;
      const c = grid[(y0 + 1) * cols + x0]!;
      const d = grid[(y0 + 1) * cols + x0 + 1]!;
      const top = a + (b - a) * tx;
      const bot = c + (d - c) * tx;
      return top + (bot - top) * ty;
    };
  }

  private generate(rng: Rng): void {
    const elevation = this.makeNoise(rng, 6);
    const moisture = this.makeNoise(rng, 5);

    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const e = elevation(x, y);
        const m = moisture(x, y);
        let t: TileType;
        if (e < 0.3) t = 'water';
        else if (e < 0.36) t = 'sand'; // rivage
        else if (e > 0.74) t = e < 0.8 && m < 0.4 ? 'dirt' : 'stone'; // montagnes/pentes
        else if (m > 0.6) t = rng.chance(0.78) ? 'forest' : 'grass'; // forêt + clairières
        else t = m < 0.3 && rng.chance(0.35) ? 'dirt' : 'grass'; // plaine + plaques de terre
        this.set(x, y, t);
        if (TILE_STOCK[t] != null) this.stock.set(this.idx(x, y), TILE_STOCK[t]!);
      }
    }
    // Aucun champ n'est posé d'office : un champ est un générateur de ressource
    // créé et possédé par un agent fermier (cf. `cultivate`).
  }

  // --- Récolte des gisements + eau ------------------------------------------

  /** Récolte la ressource de la tuile (x,y) si possible. Renvoie le `kind` ou null.
   *  Les gisements s'épuisent puis sont programmés pour repousser ; l'eau (puisée
   *  depuis une tuile adjacente) est une source renouvelable. */
  harvest(x: number, y: number, gameTime: number): string | null {
    const t = this.tileAt(x, y);
    const resource = TILE_RESOURCE[t as keyof typeof TILE_RESOURCE];
    if (resource) {
      const i = this.idx(x, y);
      const left = (this.stock.get(i) ?? 0) - 1;
      if (left <= 0) {
        this.stock.delete(i);
        this.set(x, y, 'grass');
        this.dirty = true;
        const days = TILE_REGROW_DAYS[t as keyof typeof TILE_REGROW_DAYS] ?? 1;
        this.transitions.push({
          index: i,
          to: t,
          atGameTime: gameTime + days * this.secondsPerDay,
          stock: TILE_STOCK[t as keyof typeof TILE_STOCK],
        });
      } else {
        this.stock.set(i, left);
      }
      return resource;
    }
    // Eau : puisable si une tuile d'eau est adjacente (source renouvelable).
    if (this.hasWaterNeighbor(x, y)) return 'eau';
    return null;
  }

  hasWaterNeighbor(x: number, y: number): boolean {
    return (
      this.tileAt(x + 1, y) === 'water' ||
      this.tileAt(x - 1, y) === 'water' ||
      this.tileAt(x, y + 1) === 'water' ||
      this.tileAt(x, y - 1) === 'water'
    );
  }

  // --- Agriculture : cultiver → semer → croître → récolter ------------------

  /** Laboure une tuile (grass/dirt) en champ possédé par `owner`. Renvoie le succès. */
  cultivate(x: number, y: number, owner: number): boolean {
    const t = this.tileAt(x, y);
    if (t !== 'grass' && t !== 'dirt') return false;
    const i = this.idx(x, y);
    this.set(x, y, 'farm');
    this.stock.delete(i); // un champ n'est pas un gisement
    this.farmOwner.set(i, owner);
    this.dirty = true;
    return true;
  }

  /** Propriétaire du champ en (x,y), ou 0 si la tuile n'est pas un champ possédé. */
  farmOwnerAt(x: number, y: number): number {
    return this.farmOwner.get(this.idx(x, y)) ?? 0;
  }

  /** Nombre de champs (toutes étapes) appartenant à un agent. */
  countFarms(owner: number): number {
    let n = 0;
    for (const o of this.farmOwner.values()) if (o === owner) n++;
    return n;
  }

  /** Champ d'un type donné appartenant à `owner`, le plus proche de `from`. */
  findOwnedFarm(from: Vec2, type: TileType, owner: number): Vec2 | null {
    let best: Vec2 | null = null;
    let bestD = Infinity;
    for (const [i, o] of this.farmOwner) {
      if (o !== owner || this.tiles[i] !== type) continue;
      const x = i % this.width;
      const y = Math.floor(i / this.width);
      const d = (from.x - x) ** 2 + (from.y - y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = { x, y };
      }
    }
    return best;
  }

  /** Tuile cultivable (grass/dirt, libre de bâtiment) la plus proche de `from`. */
  findCultivable(from: Vec2): Vec2 | null {
    let best: Vec2 | null = null;
    let bestD = Infinity;
    for (let y = 0; y < this.height; y++)
      for (let x = 0; x < this.width; x++) {
        const t = this.tiles[this.idx(x, y)];
        if (t !== 'grass' && t !== 'dirt') continue;
        if (this.buildingAt(x, y)) continue;
        const d = (from.x - x) ** 2 + (from.y - y) ** 2;
        if (d < bestD) {
          bestD = d;
          best = { x, y };
        }
      }
    return best;
  }

  /** Sème une graine sur un champ labouré (x,y). Programme la croissance. */
  plant(x: number, y: number, gameTime: number): boolean {
    if (this.tileAt(x, y) !== 'farm') return false;
    const i = this.idx(x, y);
    this.set(x, y, 'champ_seme');
    this.dirty = true;
    const g = FARM_GROW_DAYS * this.secondsPerDay;
    this.transitions.push({ index: i, to: 'champ_pousse', atGameTime: gameTime + g / 2 });
    this.transitions.push({ index: i, to: 'champ_mur', atGameTime: gameTime + g });
    return true;
  }

  /** Récolte un champ mûr (x,y) : renvoie le blé obtenu et remet le champ à vide. */
  reap(x: number, y: number): number {
    if (this.tileAt(x, y) !== 'champ_mur') return 0;
    this.set(x, y, 'farm');
    this.dirty = true;
    return BLE_PER_HARVEST;
  }

  /** Applique les transitions de tuiles arrivées à échéance (repousse + croissance). */
  regrow(gameTime: number): void {
    if (this.transitions.length === 0) return;
    const due = this.transitions.filter((tr) => tr.atGameTime <= gameTime);
    if (due.length === 0) return;
    for (const tr of due) {
      const x = tr.index % this.width;
      const y = Math.floor(tr.index / this.width);
      // Une culture récoltée avant maturité annule sa croissance en attente.
      const cur = this.tiles[tr.index]!;
      const isCropStep = tr.to === 'champ_pousse' || tr.to === 'champ_mur';
      if (isCropStep && cur !== 'champ_seme' && cur !== 'champ_pousse') continue;
      this.set(x, y, tr.to);
      if (tr.stock != null) this.stock.set(tr.index, tr.stock);
      this.dirty = true;
    }
    this.transitions = this.transitions.filter((tr) => tr.atGameTime > gameTime);
  }

  // --- Recherche / divers ---------------------------------------------------

  /** Tuile la plus proche d'un type donné (recherche linéaire). */
  findTile(from: Vec2, type: TileType): Vec2 | null {
    let best: Vec2 | null = null;
    let bestD = Infinity;
    for (let y = 0; y < this.height; y++)
      for (let x = 0; x < this.width; x++)
        if (this.tiles[this.idx(x, y)] === type) {
          const dx = from.x - x;
          const dy = from.y - y;
          const d = dx * dx + dy * dy;
          if (d < bestD) {
            bestD = d;
            best = { x, y };
          }
        }
    return best;
  }

  hasBuilding(kind: string): boolean {
    return this.buildings.some((b) => b.kind === kind);
  }

  /** Bâtiment d'un type donné le plus proche d'un point. */
  findBuilding(kind: string, from: Vec2): BuildingState | null {
    let best: BuildingState | null = null;
    let bestD = Infinity;
    for (const b of this.buildings) {
      if (b.kind !== kind) continue;
      const d = (b.pos.x - from.x) ** 2 + (b.pos.y - from.y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = b;
      }
    }
    return best;
  }

  /** Remplace le type d'un bâtiment (ex : chantier → bâtiment fini). */
  finishBuilding(id: number, kind: string): void {
    const b = this.buildings.find((x) => x.id === id);
    if (b) b.kind = kind;
  }

  /** Tuile marchable la plus proche bordant l'eau (pour puiser de l'eau). */
  findWaterEdge(from: Vec2): Vec2 | null {
    let best: Vec2 | null = null;
    let bestD = Infinity;
    for (let y = 0; y < this.height; y++)
      for (let x = 0; x < this.width; x++) {
        if (!this.walkable(x, y) || !this.hasWaterNeighbor(x, y)) continue;
        const d = (from.x - x) ** 2 + (from.y - y) ** 2;
        if (d < bestD) {
          bestD = d;
          best = { x, y };
        }
      }
    return best;
  }

  buildingAt(x: number, y: number, radius = 1.2): BuildingState | null {
    for (const b of this.buildings) {
      if (Math.hypot(b.pos.x - x, b.pos.y - y) <= radius) return b;
    }
    return null;
  }

  consumeTilesDirty(): boolean {
    const d = this.dirty;
    this.dirty = false;
    return d;
  }

  addBuilding(kind: string, pos: Vec2, owner = 0): BuildingState {
    const b: BuildingState = { id: this.nextEntityId++, kind, pos, owner };
    this.buildings.push(b);
    return b;
  }

  /** Réattribue bâtiments et champs d'un propriétaire à un autre (héritage ; 0 = public). */
  reassignOwner(oldOwner: number, newOwner: number): void {
    for (const b of this.buildings) if (b.owner === oldOwner) b.owner = newOwner;
    for (const [i, o] of this.farmOwner) if (o === oldOwner) this.farmOwner.set(i, newOwner);
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
