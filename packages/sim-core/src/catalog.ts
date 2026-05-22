// Catalogue de contenu du jeu (data-driven, extensible) : ressources brutes, recettes
// (avec durée + but), recettes de bâtiment et table d'aliments. C'est ici qu'on ajoute
// du contenu sans toucher à la logique.
import type { NeedKey, TileType } from '@game/protocol';

/** Ressource récoltable directement sur une tuile (le blé n'en fait PAS partie : il
 *  s'obtient en récoltant un champ mûr, cf. agriculture dans `world.ts`). */
export const TILE_RESOURCE: Partial<Record<TileType, string>> = {
  forest: 'bois',
  stone: 'pierre',
  dirt: 'argile',
  sand: 'sable',
};

/** Stock initial d'un gisement (nombre de récoltes avant épuisement). */
export const TILE_STOCK: Partial<Record<TileType, number>> = {
  forest: 25,
  stone: 18,
  dirt: 20,
  sand: 20,
};

/** Délai de repousse d'un gisement épuisé, en fraction de journée de jeu. */
export const TILE_REGROW_DAYS: Partial<Record<TileType, number>> = {
  forest: 1.5,
  stone: 4, // gisement lent (quasi fini)
  dirt: 1,
  sand: 1,
};

/** Durée totale du cycle d'une culture (semis → mûr), en fraction de journée. */
export const FARM_GROW_DAYS = 1;

/** But d'une recette : satisfaire un besoin, servir une aspiration, ou intermédiaire. */
export type CraftPurpose =
  | { kind: 'need'; need: NeedKey }
  | { kind: 'aspiration'; tag: string }
  | { kind: 'material' };

export interface Recipe {
  id: string;
  inputs: Record<string, number>;
  output: { kind: string; qty: number };
  /** Le craft prend du temps (en secondes réelles, converti en ticks au runtime). */
  durationSeconds: number;
  /** Bâtiment requis ('atelier', 'four') ou null (craftable n'importe où). */
  station: string | null;
  purpose: CraftPurpose;
}

export const RECIPES: Recipe[] = [
  { id: 'planche', inputs: { bois: 2 }, output: { kind: 'planche', qty: 1 }, durationSeconds: 2, station: null, purpose: { kind: 'material' } },
  { id: 'farine', inputs: { ble: 2 }, output: { kind: 'farine', qty: 1 }, durationSeconds: 2, station: null, purpose: { kind: 'material' } },
  { id: 'graine', inputs: { ble: 1 }, output: { kind: 'graine', qty: 2 }, durationSeconds: 1, station: null, purpose: { kind: 'material' } },
  { id: 'pain', inputs: { farine: 1, eau: 1 }, output: { kind: 'pain', qty: 1 }, durationSeconds: 3, station: 'four', purpose: { kind: 'need', need: 'hunger' } },
  { id: 'outil', inputs: { bois: 1, pierre: 1 }, output: { kind: 'outil', qty: 1 }, durationSeconds: 3, station: 'atelier', purpose: { kind: 'aspiration', tag: 'crafting' } },
  { id: 'meuble', inputs: { planche: 2, outil: 1 }, output: { kind: 'meuble', qty: 1 }, durationSeconds: 4, station: 'atelier', purpose: { kind: 'aspiration', tag: 'richesse' } },
  { id: 'brique', inputs: { argile: 2, bois: 1 }, output: { kind: 'brique', qty: 2 }, durationSeconds: 3, station: 'four', purpose: { kind: 'material' } },
  { id: 'verre', inputs: { sable: 2, bois: 1 }, output: { kind: 'verre', qty: 1 }, durationSeconds: 3, station: 'four', purpose: { kind: 'material' } },
  { id: 'poterie', inputs: { argile: 2 }, output: { kind: 'poterie', qty: 1 }, durationSeconds: 3, station: 'four', purpose: { kind: 'aspiration', tag: 'richesse' } },
];

export const RECIPE_BY_ID: Record<string, Recipe> = Object.fromEntries(RECIPES.map((r) => [r.id, r]));

export interface BuildRecipe {
  kind: string;
  inputs: Record<string, number>;
  durationSeconds: number;
  aspirationTag?: string;
}

export const BUILD_RECIPES: BuildRecipe[] = [
  { kind: 'maison', inputs: { planche: 4, pierre: 2 }, durationSeconds: 8, aspirationTag: 'logement' },
  { kind: 'four', inputs: { pierre: 3, argile: 2 }, durationSeconds: 6 },
  { kind: 'atelier', inputs: { planche: 3, pierre: 1 }, durationSeconds: 6 },
  { kind: 'puits', inputs: { pierre: 4 }, durationSeconds: 5 },
  { kind: 'entrepot', inputs: { planche: 3 }, durationSeconds: 5 },
];

export const BUILD_BY_KIND: Record<string, BuildRecipe> = Object.fromEntries(
  BUILD_RECIPES.map((b) => [b.kind, b]),
);

/** Rassasiement par aliment (point de faim regagné par unité consommée). */
export const FOOD_SATIETY: Record<string, number> = {
  pain: 30,
  ble: 8,
};

/** Inventaire de départ d'un agent (amorce la boucle agricole : battage → semis). */
export const STARTING_INVENTORY: Record<string, number> = {
  ble: 5,
};
