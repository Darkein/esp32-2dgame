import { RECIPES, TILE_RESOURCE, type Recipe } from './catalog';

// Recettes réexportées depuis le catalogue (point d'entrée historique).
export { RECIPES, type Recipe };

/** Ressource récoltable directement sur une tuile, le cas échéant (cf. catalogue). */
export function tileResource(tile: string): string | null {
  return TILE_RESOURCE[tile as keyof typeof TILE_RESOURCE] ?? null;
}

export type Inventory = Map<string, number>;

export function count(inv: Inventory, kind: string): number {
  return inv.get(kind) ?? 0;
}

export function add(inv: Inventory, kind: string, n = 1): void {
  inv.set(kind, count(inv, kind) + n);
}

/** Retire `n` unités si disponibles ; retourne false sinon. */
export function take(inv: Inventory, kind: string, n = 1): boolean {
  if (count(inv, kind) < n) return false;
  inv.set(kind, count(inv, kind) - n);
  return true;
}

export function canAfford(inv: Inventory, cost: Record<string, number>): boolean {
  return Object.entries(cost).every(([k, v]) => count(inv, k) >= v);
}

export function pay(inv: Inventory, cost: Record<string, number>): boolean {
  if (!canAfford(inv, cost)) return false;
  for (const [k, v] of Object.entries(cost)) take(inv, k, v);
  return true;
}

/** Première recette réalisable (matériaux suffisants) compte tenu des postes disponibles. */
export function craftable(inv: Inventory, stations: Iterable<string> = []): Recipe | null {
  const avail = new Set(stations);
  for (const r of RECIPES) {
    if (r.station && !avail.has(r.station)) continue;
    if (canAfford(inv, r.inputs)) return r;
  }
  return null;
}

export function inventoryToStacks(inv: Inventory): { kind: string; count: number }[] {
  return [...inv.entries()].filter(([, c]) => c > 0).map(([kind, count]) => ({ kind, count }));
}
