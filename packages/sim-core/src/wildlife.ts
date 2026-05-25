// Faune sauvage (Phase 15). Entités légères : position, hp, biome préféré, état de
// fuite. La logique est volontairement déterministe (tirages via `Rng`) et bornée
// (`WILDLIFE_HARD_CAP`) pour rester compatible avec la sim accélérée.
import type { TileType, Vec2, AnimalKind } from '@game/protocol';
import type { World } from './world';
import type { Rng } from './rng';
import {
  ANIMAL_KINDS,
  ANIMAL_PROFILES,
  WILDLIFE_DENSITY,
  WILDLIFE_FLEE_STEP_INTERVAL_SECONDS,
  WILDLIFE_HARD_CAP,
  WILDLIFE_STEP_INTERVAL_SECONDS,
} from './catalog';

export interface Animal {
  id: number;
  kind: AnimalKind;
  pos: Vec2;
  hp: number;
  /** Id d'agent qui terrorise l'animal (chasseur en approche). null hors fuite. */
  fleeingFrom: number | null;
  /** Temps de jeu (s) du prochain pas d'errance. */
  nextStepAt: number;
  /** Temps de jeu (s) auquel le loup peut mordre à nouveau (cooldown). 0 par défaut. */
  nextBiteAt: number;
}

/** Tuiles candidates pour un kind donné : tuiles libres de bâtiment + de bon biome.
 *  Le poisson est posé sur la tuile d'eau (non walkable) mais reste atteignable
 *  depuis n'importe quelle tuile adjacente (cf. `findFishingSpot` côté sim). */
function eligibleTiles(world: World, kind: AnimalKind): Vec2[] {
  const profile = ANIMAL_PROFILES[kind];
  const tiles: Vec2[] = [];
  for (let y = 0; y < world.height; y++) {
    for (let x = 0; x < world.width; x++) {
      const t = world.tileAt(x, y);
      if (kind === 'poisson') {
        if (t === 'water') tiles.push({ x, y });
      } else if (t === profile.biome && world.walkable(x, y)) {
        tiles.push({ x, y });
      }
    }
  }
  return tiles;
}

/** Capacité cible pour un kind, dérivée de la densité × tuiles éligibles. */
export function targetPopulation(world: World, kind: AnimalKind): number {
  const tiles = eligibleTiles(world, kind);
  return Math.max(0, Math.floor(tiles.length * WILDLIFE_DENSITY[kind]));
}

/** Pose la population initiale à la cible de densité, dans la limite du cap dur. */
export function seedWildlife(
  world: World,
  rng: Rng,
  allocId: () => number,
  now: number,
): Animal[] {
  const out: Animal[] = [];
  for (const kind of ANIMAL_KINDS) {
    const target = targetPopulation(world, kind);
    const tiles = eligibleTiles(world, kind);
    if (tiles.length === 0) continue;
    for (let i = 0; i < target && out.length < WILDLIFE_HARD_CAP; i++) {
      const tile = tiles[rng.int(tiles.length)]!;
      out.push(spawn(kind, tile, allocId(), now, rng));
    }
  }
  return out;
}

/** Réajuste la population : pour chaque kind sous la cible, respawne quelques individus. */
export function maintainWildlife(
  world: World,
  wildlife: Animal[],
  rng: Rng,
  allocId: () => number,
  now: number,
): void {
  for (const kind of ANIMAL_KINDS) {
    if (wildlife.length >= WILDLIFE_HARD_CAP) return;
    const current = wildlife.filter((a) => a.kind === kind).length;
    const target = targetPopulation(world, kind);
    if (current >= target) continue;
    const tiles = eligibleTiles(world, kind);
    if (tiles.length === 0) continue;
    // Respawn doux : un seul individu par appel (l'intervalle est déjà long).
    const tile = tiles[rng.int(tiles.length)]!;
    wildlife.push(spawn(kind, tile, allocId(), now, rng));
  }
}

function spawn(kind: AnimalKind, tile: Vec2, id: number, now: number, rng: Rng): Animal {
  const profile = ANIMAL_PROFILES[kind];
  return {
    id,
    kind,
    pos: { x: tile.x, y: tile.y },
    hp: profile.maxHp,
    fleeingFrom: null,
    // Désynchronise les premiers pas pour éviter qu'ils bougent tous au même tick.
    nextStepAt: now + rng.next() * WILDLIFE_STEP_INTERVAL_SECONDS,
    nextBiteAt: 0,
  };
}

/** Errance simple : si l'instant est venu, on tente un pas vers une tuile voisine.
 *  En fuite, on s'éloigne de la position du chasseur (rng + biais directionnel).
 *  Le poisson reste sur sa tuile d'eau (bouge rarement, ±1 case). */
export function stepWildlifeAll(
  world: World,
  wildlife: Animal[],
  rng: Rng,
  now: number,
  hunterPos: (id: number) => Vec2 | null,
): void {
  for (const a of wildlife) {
    if (now < a.nextStepAt) continue;
    const profile = ANIMAL_PROFILES[a.kind];
    if (a.kind === 'poisson') {
      // Poisson : ondulation autour de sa tuile d'eau (±1 case max).
      const nx = Math.round(a.pos.x) + rng.int(3) - 1;
      const ny = Math.round(a.pos.y) + rng.int(3) - 1;
      if (world.tileAt(nx, ny) === 'water') {
        a.pos.x = nx;
        a.pos.y = ny;
      }
      a.nextStepAt = now + WILDLIFE_STEP_INTERVAL_SECONDS * (1 + rng.next());
      continue;
    }
    // Cible aléatoire ou opposée au chasseur en fuite.
    let dx = rng.int(3) - 1;
    let dy = rng.int(3) - 1;
    if (a.fleeingFrom != null) {
      const h = hunterPos(a.fleeingFrom);
      if (h) {
        // Biais opposé au chasseur (signe inverse, magnitude 1).
        dx = a.pos.x - h.x >= 0 ? 1 : -1;
        dy = a.pos.y - h.y >= 0 ? 1 : -1;
      }
    }
    const nx = Math.round(a.pos.x) + dx;
    const ny = Math.round(a.pos.y) + dy;
    // Reste dans le bon biome quand c'est possible : si la cible n'est pas en biome
    // préféré mais walkable, on bouge quand même (sinon on s'enfermerait dans une forêt).
    if (world.walkable(nx, ny)) {
      a.pos.x = nx;
      a.pos.y = ny;
    }
    const interval = a.fleeingFrom != null
      ? WILDLIFE_FLEE_STEP_INTERVAL_SECONDS
      : WILDLIFE_STEP_INTERVAL_SECONDS;
    a.nextStepAt = now + interval * (0.5 + rng.next());
    // Reset de la fuite une fois éloigné : si le chasseur n'est plus à portée.
    void profile;
  }
}

/** Cherche la proie la plus proche d'un point (animal vivant et `isPrey`). */
export function findNearestPrey(wildlife: Animal[], from: Vec2): Animal | null {
  let best: Animal | null = null;
  let bestD = Infinity;
  for (const a of wildlife) {
    if (!ANIMAL_PROFILES[a.kind].isPrey) continue;
    if (a.kind === 'poisson') continue; // pêché, pas chassé
    if (a.hp <= 0) continue;
    const d = (a.pos.x - from.x) ** 2 + (a.pos.y - from.y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = a;
    }
  }
  return best;
}

/** Cherche le poisson le plus proche (en eau). Sert au pêcheur. */
export function findNearestFish(wildlife: Animal[], from: Vec2): Animal | null {
  let best: Animal | null = null;
  let bestD = Infinity;
  for (const a of wildlife) {
    if (a.kind !== 'poisson' || a.hp <= 0) continue;
    const d = (a.pos.x - from.x) ** 2 + (a.pos.y - from.y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = a;
    }
  }
  return best;
}

/** Tuile marchable adjacente à un poisson (point où le pêcheur va se poster). */
export function fishingSpot(world: World, fish: Animal): Vec2 | null {
  const fx = Math.round(fish.pos.x);
  const fy = Math.round(fish.pos.y);
  for (const [dx, dy] of [
    [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1],
  ] as const) {
    const x = fx + dx;
    const y = fy + dy;
    if (world.walkable(x, y)) return { x, y };
  }
  return null;
}

/** Type de tuile demandé par un kind (utilisé pour le test d'éligibilité externe). */
export function biomeOf(kind: AnimalKind): TileType {
  return ANIMAL_PROFILES[kind].biome;
}
