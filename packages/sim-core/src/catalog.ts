// Catalogue de contenu du jeu (data-driven, extensible) : ressources brutes, recettes
// (avec durée + but), recettes de bâtiment et table d'aliments. C'est ici qu'on ajoute
// du contenu sans toucher à la logique.
import type { NeedKey, TileType } from '@game/protocol';
import { GAME_SECONDS_PER_DAY } from './clock';

const HOUR = 3600; // secondes de jeu dans une heure de jeu
const MIN = 60; // secondes de jeu dans une minute de jeu

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
  /** Durée du craft, en secondes de jeu (réaliste, indépendante de la vitesse). */
  durationSeconds: number;
  /** Bâtiment requis ('atelier', 'four') ou null (craftable n'importe où). */
  station: string | null;
  purpose: CraftPurpose;
}

export const RECIPES: Recipe[] = [
  { id: 'planche', inputs: { bois: 2 }, output: { kind: 'planche', qty: 1 }, durationSeconds: 10 * MIN, station: null, purpose: { kind: 'material' } },
  { id: 'farine', inputs: { ble: 2 }, output: { kind: 'farine', qty: 1 }, durationSeconds: 15 * MIN, station: null, purpose: { kind: 'material' } },
  { id: 'graine', inputs: { ble: 1 }, output: { kind: 'graine', qty: 2 }, durationSeconds: 5 * MIN, station: null, purpose: { kind: 'material' } },
  { id: 'pain', inputs: { farine: 1, eau: 1 }, output: { kind: 'pain', qty: 1 }, durationSeconds: 30 * MIN, station: 'four', purpose: { kind: 'need', need: 'hunger' } },
  { id: 'outil', inputs: { bois: 1, pierre: 1 }, output: { kind: 'outil', qty: 1 }, durationSeconds: 1 * HOUR, station: 'atelier', purpose: { kind: 'aspiration', tag: 'crafting' } },
  { id: 'meuble', inputs: { planche: 2, outil: 1 }, output: { kind: 'meuble', qty: 1 }, durationSeconds: 2 * HOUR, station: 'atelier', purpose: { kind: 'aspiration', tag: 'richesse' } },
  { id: 'brique', inputs: { argile: 2, bois: 1 }, output: { kind: 'brique', qty: 2 }, durationSeconds: 45 * MIN, station: 'four', purpose: { kind: 'material' } },
  { id: 'verre', inputs: { sable: 2, bois: 1 }, output: { kind: 'verre', qty: 1 }, durationSeconds: 45 * MIN, station: 'four', purpose: { kind: 'material' } },
  { id: 'poterie', inputs: { argile: 2 }, output: { kind: 'poterie', qty: 1 }, durationSeconds: 1 * HOUR, station: 'four', purpose: { kind: 'aspiration', tag: 'richesse' } },
];

export const RECIPE_BY_ID: Record<string, Recipe> = Object.fromEntries(RECIPES.map((r) => [r.id, r]));

export interface BuildRecipe {
  kind: string;
  inputs: Record<string, number>;
  durationSeconds: number;
  aspirationTag?: string;
}

export const BUILD_RECIPES: BuildRecipe[] = [
  { kind: 'maison', inputs: { planche: 4, pierre: 2 }, durationSeconds: 8 * HOUR, aspirationTag: 'logement' },
  { kind: 'four', inputs: { pierre: 3, argile: 2 }, durationSeconds: 6 * HOUR },
  { kind: 'atelier', inputs: { planche: 3, pierre: 1 }, durationSeconds: 6 * HOUR },
  { kind: 'puits', inputs: { pierre: 4 }, durationSeconds: 5 * HOUR },
  { kind: 'entrepot', inputs: { planche: 3 }, durationSeconds: 5 * HOUR },
];

export const BUILD_BY_KIND: Record<string, BuildRecipe> = Object.fromEntries(
  BUILD_RECIPES.map((b) => [b.kind, b]),
);

/** Footprint d'un bâtiment et offset (depuis le coin haut-gauche) de sa tuile-porte.
 *  Seule la porte reste walkable dans la zone occupée — c'est l'unique point d'entrée.
 *  Convention : porte en bordure basse, ce qui colle au rendu iso (face « avant »). */
export interface BuildingShape {
  /** Largeur/hauteur en tuiles entières. */
  footprint: { w: number; h: number };
  /** Offset de la porte (x ∈ [0, w−1], y ∈ [0, h−1]) depuis le coin haut-gauche. */
  door: { dx: number; dy: number };
}

export const BUILDING_SHAPES: Record<string, BuildingShape> = {
  maison:   { footprint: { w: 3, h: 3 }, door: { dx: 1, dy: 2 } },
  atelier:  { footprint: { w: 2, h: 2 }, door: { dx: 0, dy: 1 } },
  four:     { footprint: { w: 2, h: 2 }, door: { dx: 0, dy: 1 } },
  entrepot: { footprint: { w: 3, h: 2 }, door: { dx: 1, dy: 1 } },
  puits:    { footprint: { w: 1, h: 1 }, door: { dx: 0, dy: 0 } },
  marche:   { footprint: { w: 4, h: 4 }, door: { dx: 1, dy: 3 } },
  chantier: { footprint: { w: 1, h: 1 }, door: { dx: 0, dy: 0 } },
};

/** Forme par défaut si le bâtiment n'est pas répertorié (mono-tuile, porte = elle-même). */
export const DEFAULT_BUILDING_SHAPE: BuildingShape = {
  footprint: { w: 1, h: 1 },
  door: { dx: 0, dy: 0 },
};

export function buildingShape(kind: string): BuildingShape {
  return BUILDING_SHAPES[kind] ?? DEFAULT_BUILDING_SHAPE;
}

/** Rassasiement par aliment (point de faim regagné par unité consommée). */
export const FOOD_SATIETY: Record<string, number> = {
  pain: 30,
  ble: 8,
};

/** Inventaire de départ d'un agent (amorce la boucle agricole : battage → semis). */
export const STARTING_INVENTORY: Record<string, number> = {
  ble: 5,
};

/** Monnaie de départ d'un agent (économie de marché). */
export const STARTING_COINS = 20;

// --- Métiers --------------------------------------------------------------

export type Job = 'fermier' | 'bucheron' | 'mineur' | 'artisan' | 'boulanger';

export interface JobProfile {
  /** Gisements à exploiter en priorité (hors champs, gérés par l'agriculture). */
  gather: TileType[];
  /** Le métier cultive-t-il ses propres champs (semis/récolte de blé) ? */
  farms: boolean;
  /** Recettes que le métier privilégie (ordre de préférence). */
  crafts: string[];
  /** Bâtiments que le métier érige volontiers. */
  builds: string[];
  /** Biens que le métier achète au marché (ce qu'il ne produit pas lui-même). */
  buys: string[];
}

export const JOB_PROFILES: Record<Job, JobProfile> = {
  fermier: { gather: [], farms: true, crafts: ['graine'], builds: ['entrepot'], buys: [] },
  bucheron: { gather: ['forest'], farms: false, crafts: ['planche'], builds: [], buys: ['pain', 'ble'] },
  mineur: { gather: ['stone', 'dirt', 'sand'], farms: false, crafts: [], builds: ['puits'], buys: ['pain', 'ble'] },
  artisan: { gather: ['forest', 'stone'], farms: false, crafts: ['outil', 'meuble', 'poterie', 'planche'], builds: ['atelier', 'maison'], buys: ['pain', 'ble'] },
  boulanger: { gather: [], farms: false, crafts: ['farine', 'pain'], builds: ['four'], buys: ['ble'] },
};

/** Nombre maximum de champs qu'un fermier entretient. */
export const MAX_FARMS_PER_AGENT = 4;

/** Coût de déplacement par type de tuile (multiplicateur du pas A*).
 *  Water/path n'apparaissent jamais comme « non walkable » côté A* via water :
 *  on les filtre avant. Path est presque gratuit (chemin foulé), forêt lente. */
export const TILE_MOVE_COST: Record<TileType, number> = {
  path: 0.5,
  grass: 1,
  dirt: 1,
  sand: 1.4,
  farm: 1.2,
  champ_seme: 1.3,
  champ_pousse: 1.4,
  champ_mur: 1.5,
  forest: 2.5,
  stone: 1.6,
  water: Infinity,
};

/** Nombre de passages sur une tuile grass/dirt avant qu'elle bascule en chemin foulé. */
export const PATH_WEAR_THRESHOLD = 40;

export const JOBS = Object.keys(JOB_PROFILES) as Job[];

// --- Marché : prix de base par bien échangeable ----------------------------

// --- Cadences & déplacement (en temps de jeu) ------------------------------

/** Vitesse de marche, en tuiles par seconde de jeu (≈ marche humaine réaliste). */
export const WALK_TILES_PER_GAME_SEC = 1.2;
/** Délai de jeu entre deux gestes de récolte/craft/troc d'un agent. */
export const GATHER_CADENCE_SECONDS = 5 * MIN;
/** Délai de jeu entre deux re-décisions de la couche rapide. */
export const DECISION_INTERVAL_SECONDS = 15 * MIN;
/** Affinité gagnée par seconde de jeu de socialisation (en présence d'un autre agent). */
export const RELATIONSHIP_GAIN_PER_GAME_SEC = 0.02;
/** Nombre maximal d'actions cadencées exécutées dans un même tick (garde-fou). */
export const MAX_ACTIONS_PER_TICK = 64;
/** Nombre maximal de sous-étapes décisionnelles par tick (cap à très haute vitesse). */
export const MAX_SUBSTEPS_PER_TICK = 200;

// --- Cycle de la vie (en temps de jeu) -------------------------------------

/** Durée d'une année de jeu, en secondes de jeu (calendrier de 365 jours). */
export const YEAR_SECONDS = 365 * GAME_SECONDS_PER_DAY;
/** Âge (années de jeu) d'accès à l'âge adulte et à la vieillesse. */
export const ADULT_AGE = 18;
export const ELDER_AGE = 65;
/** Âge à partir duquel un enfant peut apprendre un métier auprès d'un mentor. */
export const TEEN_AGE = 14;
/** Espérance de vie tirée aléatoirement dans cet intervalle (années de jeu). */
export const LIFESPAN_MIN = 72;
export const LIFESPAN_MAX = 92;
/** Fenêtre de fertilité des femmes (années de jeu). */
export const FERTILE_MIN = 18;
export const FERTILE_MAX = 45;
/** Durée d'une grossesse, en secondes de jeu (~9 mois). */
export const GESTATION_SECONDS = 0.75 * YEAR_SECONDS;
/** Affinité (0..100) au-delà de laquelle deux adultes se mettent en couple. */
export const COUPLE_THRESHOLD = 60;
/** Nombre attendu de conceptions par couple fertile et par année de jeu. */
export const CONCEPTION_RATE_PER_YEAR = 0.6;
/** Plafond de population (sécurité performance / explosion démographique). */
export const MAX_POP = 60;
/** Plafond d'énergie d'un aîné : la fatigue arrive plus vite après 65 ans. */
export const ELDER_ENERGY_CAP = 75;
/** Distance (tuiles) sous laquelle un ado apprend en observant un adulte au travail. */
export const APPRENTICE_PROXIMITY_TILES = 3;
/** Rayon (tuiles) du « souvenir partagé » lors d'une sépulture (mort = mémoire collective). */
export const FUNERAL_MEMORY_RADIUS = 30;

// --- Relations sociales avancées (Phase 13) --------------------------------

/** Différence d'affinité (rival - partenaire) au-delà de laquelle la jalousie monte. */
export const JEALOUSY_GAP = 20;
/** Affinité perdue par seconde de jeu de jalousie active (cumulative côté partenaire). */
export const JEALOUSY_DECAY_PER_SEC = 0.0002;
/** Seuil d'affinité (négative) entre conjoints en-deçà duquel le couple se brise. */
export const BREAKUP_AFFINITY = -10;
/** Pénalité d'affinité immédiate au moment de la rupture (vers ex et rival). */
export const BREAKUP_AFFINITY_SHOCK = 40;

// --- Santé & maladies (Phase 10) -------------------------------------------

/** Santé maximale (un agent en parfaite santé). */
export const HEALTH_MAX = 100;
/** Seuil d'hygiène sous lequel la santé se dégrade lentement. */
export const HYGIENE_HEALTH_THRESHOLD = 30;
/** Perte de santé par seconde de jeu quand l'hygiène est sous le seuil
 *  (calibré pour ~5 ans de saleté chronique avant épuisement — signal de fond,
 *  jamais un risque accidentel ; le wash explicite et l'aggravation viennent en Phase 19). */
export const HEALTH_DECAY_FROM_HYGIENE_PER_SEC = HEALTH_MAX / (5 * 365 * 24 * 3600);
/** Récupération de santé par seconde de jeu (hors maladie, hygiène ok). */
export const HEALTH_RECOVERY_PER_SEC = HEALTH_MAX / (3 * 24 * 3600);
/** Probabilité spontanée de tomber malade, par année de jeu (hors contagion). */
export const ILLNESS_ONSET_PER_YEAR = 0.4;
/** Rayon (tuiles) de contagion d'un agent malade contagieux. */
export const CONTAGION_RADIUS = 2.5;
/** Probabilité de contagion par seconde de jeu de proximité (cumulative). */
export const CONTAGION_RATE_PER_SEC = 1 / (8 * 3600);
/** Durée d'incubation d'une maladie avant qu'elle ne devienne contagieuse (s de jeu). */
export const ILLNESS_INCUBATION_SECONDS = 0.5 * 24 * 3600;
/** Durée moyenne d'une maladie après incubation (s de jeu, distribution exponentielle). */
export const ILLNESS_DURATION_SECONDS = 5 * 24 * 3600;
/** Multiplicateur de perte de santé par seconde quand l'agent est malade
 *  (calibré pour ~10 hp sur une maladie typique de 5 jours, survivable). */
export const ILLNESS_DAMAGE_PER_SEC = HEALTH_MAX / (50 * 24 * 3600);
/** Santé en-deçà de laquelle un agent meurt (mortalité par maladie / épuisement). */
export const HEALTH_DEATH_THRESHOLD = 0;
/** Facteur de fragilité supplémentaire pour les enfants et les aînés (maladie + dégâts). */
export const FRAGILE_FACTOR = 1.8;

/** Prix d'équilibre indicatif (en pièces) ; le marché les fait varier selon l'offre. */
export const BASE_PRICE: Record<string, number> = {
  eau: 1,
  graine: 1,
  bois: 2,
  sable: 2,
  ble: 2,
  pierre: 3,
  argile: 3,
  farine: 3,
  planche: 4,
  brique: 6,
  verre: 7,
  pain: 8,
  outil: 10,
  poterie: 12,
  meuble: 20,
};
