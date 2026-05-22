import type { TileType } from '@game/protocol';

export type Resource = 'bois' | 'pierre' | 'ble';
export type Good = 'planche' | 'pain' | 'outil';

export interface Recipe {
  id: Good;
  inputs: Partial<Record<string, number>>;
  /** Atelier requis ? (sinon craftable n'importe où). */
  needsWorkshop: boolean;
}

export const RECIPES: Recipe[] = [
  { id: 'planche', inputs: { bois: 2 }, needsWorkshop: false },
  { id: 'pain', inputs: { ble: 2 }, needsWorkshop: false },
  { id: 'outil', inputs: { bois: 1, pierre: 1 }, needsWorkshop: true },
];

/** Coût d'une maison (consommé lors de la construction). */
export const HOUSE_COST: Record<string, number> = { planche: 4, pierre: 2 };

/** Ressource récoltable sur une tuile, le cas échéant. */
export function tileResource(tile: TileType): Resource | null {
  if (tile === 'forest') return 'bois';
  if (tile === 'stone') return 'pierre';
  if (tile === 'farm') return 'ble';
  return null;
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

/** Première recette réalisable (matériaux suffisants), en respectant l'atelier. */
export function craftable(inv: Inventory, atWorkshop: boolean): Recipe | null {
  for (const r of RECIPES) {
    if (r.needsWorkshop && !atWorkshop) continue;
    if (canAfford(inv, r.inputs as Record<string, number>)) return r;
  }
  return null;
}

export function inventoryToStacks(inv: Inventory): { kind: string; count: number }[] {
  return [...inv.entries()].filter(([, c]) => c > 0).map(([kind, count]) => ({ kind, count }));
}
