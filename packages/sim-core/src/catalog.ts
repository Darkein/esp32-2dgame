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
  viande: 22,
  poisson: 18,
  ble: 8,
};

/** Inventaire de départ d'un agent (amorce la boucle agricole : battage → semis). */
export const STARTING_INVENTORY: Record<string, number> = {
  ble: 5,
};

/** Monnaie de départ d'un agent (économie de marché). */
export const STARTING_COINS = 20;

// --- Métiers --------------------------------------------------------------

export type Job =
  | 'fermier'
  | 'bucheron'
  | 'mineur'
  | 'artisan'
  | 'boulanger'
  | 'chasseur'
  | 'pecheur';

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
  // Faune (Phase 15) : chasseur/pêcheur n'exploitent pas les tuiles mais traquent des
  // animaux. `gather` reste vide — leur boucle de travail passe par `decideAction`
  // (`hunting`/`fishing`) puis `advanceHunt`/`advanceFish`, pas par les gisements.
  chasseur: { gather: [], farms: false, crafts: [], builds: [], buys: ['pain', 'ble'] },
  pecheur: { gather: [], farms: false, crafts: [], builds: [], buys: ['pain', 'ble'] },
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

/** Vitesse de marche humaine, en tuiles par seconde *réelle* à `speed = 1`, sur un
 *  terrain de coût 1 (grass/dirt). À `speed = N`, multipliée par N. Modulée
 *  ensuite par `TILE_MOVE_COST` (forêt plus lente, chemin foulé plus rapide). */
export const WALK_TILES_PER_REAL_SEC = 1.0;
/** Délai de jeu entre deux gestes de récolte/craft/troc d'un agent. */
export const GATHER_CADENCE_SECONDS = 5 * MIN;
/** Filet de sécurité : durée maximale d'une décision avant re-évaluation forcée.
 *  La cadence « normale » des décisions est dictée par la fin naturelle des tâches
 *  (phases enchaînées), plus par cet intervalle. */
export const DECISION_INTERVAL_SECONDS = 5 * MIN;
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

// --- Compétences & apprentissage (Phase 14) --------------------------------

/** XP gagnée par action de travail / craft (avant bonus de proximité d'un mentor). */
export const XP_PER_ACTION = 1;
/** Bonus de XP quand un mentor (adulte expérimenté du même métier) travaille à côté. */
export const APPRENTICE_XP_BONUS = 0.5;
/** XP nécessaire pour atteindre le niveau N : `LEVEL_BASE_XP * 2^N`. Soit niveaux ~0-7. */
export const LEVEL_BASE_XP = 20;
/** Multiplicateur de vitesse de craft/récolte selon le niveau : 1 (N0) → ~2 (N7). */
export function levelFromXp(xp: number): number {
  if (xp <= 0) return 0;
  return Math.min(7, Math.floor(Math.log2(xp / LEVEL_BASE_XP + 1)));
}
/** Multiplicateur de cadence selon le niveau (réduction du délai entre actions). */
export function skillSpeed(level: number): number {
  // N0 = 1, N1 ≈ 1.10, N7 ≈ 2.0
  return 1 + level * 0.14;
}

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
  poisson: 4,
  peau: 5,
  viande: 6,
  brique: 6,
  verre: 7,
  pain: 8,
  outil: 10,
  poterie: 12,
  meuble: 20,
};

// --- Faune (Phase 15) ------------------------------------------------------

/** Espèces présentes dans le monde. `loup` est l'unique prédateur ; `poisson` ne se
 *  chasse pas, il se pêche au bord de l'eau. Les autres sont des proies marchables. */
export type AnimalKind = 'cerf' | 'lapin' | 'sanglier' | 'loup' | 'poisson';

export interface AnimalProfile {
  /** Points de vie de l'animal (le chasseur en retire 1 par tentative cadencée). */
  maxHp: number;
  /** Unités de viande larguées à la mort (0 = prédateur non comestible). */
  meat: number;
  /** Unités de peau larguées à la mort. */
  hide: number;
  /** Biome de spawn préféré : `forest` pour les ongulés et le loup, `grass` pour le
   *  lapin, `water` pour le poisson. */
  biome: TileType;
  /** Vrai pour les espèces dangereuses (loup) — déclenche `stepPredators`. */
  isPredator: boolean;
  /** Vrai pour les espèces chassables (proie terrestre). */
  isPrey: boolean;
}

export const ANIMAL_PROFILES: Record<AnimalKind, AnimalProfile> = {
  cerf:     { maxHp: 3, meat: 3, hide: 1, biome: 'forest', isPredator: false, isPrey: true },
  sanglier: { maxHp: 4, meat: 3, hide: 1, biome: 'forest', isPredator: false, isPrey: true },
  lapin:    { maxHp: 1, meat: 1, hide: 0, biome: 'grass',  isPredator: false, isPrey: true },
  loup:     { maxHp: 5, meat: 0, hide: 1, biome: 'forest', isPredator: true,  isPrey: true },
  poisson:  { maxHp: 1, meat: 0, hide: 0, biome: 'water',  isPredator: false, isPrey: false },
};

export const ANIMAL_KINDS: AnimalKind[] = ['cerf', 'sanglier', 'lapin', 'loup', 'poisson'];

/** Densité cible : nombre d'individus visés par tuile éligible du biome. */
export const WILDLIFE_DENSITY: Record<AnimalKind, number> = {
  cerf: 1 / 120,
  sanglier: 1 / 200,
  lapin: 1 / 90,
  loup: 1 / 320,
  poisson: 1 / 60,
};

/** Plafond dur (sécurité — coût `O(wildlife * agents)` du pas des prédateurs). */
export const WILDLIFE_HARD_CAP = 80;

/** Intervalle (s de jeu) de réajustement de la population (respawn jusqu'à la densité). */
export const WILDLIFE_RESPAWN_INTERVAL_SECONDS = 6 * 3600; // ~6 h jeu

/** Cadence d'errance (s de jeu entre deux pas d'un animal terrestre). */
export const WILDLIFE_STEP_INTERVAL_SECONDS = 8;
/** Idem, mais pour la fuite (un animal qui fuit bouge plus souvent). */
export const WILDLIFE_FLEE_STEP_INTERVAL_SECONDS = 2;

/** Distance (tuiles) sous laquelle un chasseur peut frapper son gibier. */
export const HUNT_RANGE = 1.5;
/** Distance (tuiles) sous laquelle un pêcheur peut capturer un poisson. */
export const FISH_RANGE = 1.5;
/** Distance (tuiles) sous laquelle une proie perçoit la menace et fuit. */
export const PREY_FLEE_RADIUS = 4;

/** Dégâts infligés par une morsure discrète de loup. Le modèle est événementiel
 *  (pas un débit) pour rester sain à très haute vitesse de jeu. */
export const WOLF_BITE_DAMAGE = 8;
/** Délai (s de jeu) entre deux morsures d'un même loup — fenêtre laissée au village
 *  pour secourir l'isolé / à l'isolé pour fuir. */
export const WOLF_BITE_COOLDOWN_SECONDS = 900; // 15 min jeu
/** Distance (tuiles) sous laquelle un loup peut mordre. */
export const WOLF_ATTACK_RADIUS = 1.8;
/** Rayon (tuiles) d'« isolement » : un agent est seul s'il n'a aucun autre agent
 *  à l'intérieur de ce cercle (les loups n'attaquent que les isolés). */
export const ISOLATION_RADIUS = 5;

/** Risque (probabilité par tentative) qu'un agent se blesse en chassant un gros gibier. */
export const HUNT_INJURY_CHANCE = 0.05;
/** Dégâts infligés à l'agent en cas de blessure de chasse. */
export const HUNT_INJURY_DAMAGE = 10;
