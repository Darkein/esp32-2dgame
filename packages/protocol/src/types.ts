// Types de domaine partagés (serveur, web, worker). Miroir ergonomique du schéma
// FlatBuffers `schema/world.fbs` — ce dernier reste la source de vérité pour le
// format binaire/cross-langage (ESP32 C++). Voir gen/ pour le code généré.

export type TileType =
  | 'grass'
  | 'dirt'
  | 'water'
  | 'stone'
  | 'sand'
  | 'forest'
  | 'farm'
  | 'champ_seme'
  | 'champ_pousse'
  | 'champ_mur'
  | 'path';

export type ActivityKind =
  | 'idle'
  | 'walking'
  | 'sleeping'
  | 'eating'
  | 'working'
  | 'crafting'
  | 'talking'
  | 'socializing'
  | 'trading'
  | 'washing';

export interface Vec2 {
  x: number;
  y: number;
}

/** Besoins normalisés 0..100 (100 = pleinement satisfait). */
export interface Needs {
  energy: number;
  hunger: number;
  social: number;
  hygiene: number;
  fun: number;
}

export type NeedKey = keyof Needs;
export const NEED_KEYS: readonly NeedKey[] = ['energy', 'hunger', 'social', 'hygiene', 'fun'];

export interface ItemStack {
  kind: string;
  count: number;
}

export type Gender = 'M' | 'F';
export type LifeStage = 'enfant' | 'adulte' | 'aine';

/** Saison dérivée du calendrier (mois 1-12). */
export type Season = 'printemps' | 'ete' | 'automne' | 'hiver';

/** Vecteur d'humeurs (Phase 12). Chaque composante 0..100, décroît naturellement. */
export interface Emotions {
  joie: number;
  tristesse: number;
  colere: number;
  peur: number;
  degout: number;
  surprise: number;
}

export type EmotionKey = keyof Emotions;
export const EMOTION_KEYS: readonly EmotionKey[] = [
  'joie',
  'tristesse',
  'colere',
  'peur',
  'degout',
  'surprise',
];

/** Type de météo journalière (Phase 11). */
export type WeatherKind =
  | 'clair'
  | 'nuage'
  | 'pluie'
  | 'orage'
  | 'neige'
  | 'brouillard'
  | 'canicule';

/** État météo courant. Renouvelé à chaque changement de journée. */
export interface WeatherState {
  kind: WeatherKind;
  /** Temps de jeu (s) du début du phénomène. */
  sinceGameTime: number;
  /** Temps de jeu (s) jusqu'à la prochaine bascule possible. */
  untilGameTime: number;
}

export interface AgentState {
  id: number;
  name: string;
  pos: Vec2;
  activity: ActivityKind;
  needs: Needs;
  voiceProfile: number;
  goal: string;
  saying: string;
  /** Ressources brutes + objets craftés portés par l'agent. */
  inventory: ItemStack[];
  /** Nombre de bâtiments construits (aspiration logement). */
  houses: number;
  /** Métier de l'agent (oriente récolte/craft/construction). */
  job: string;
  /** Monnaie détenue (économie de marché). */
  coins: number;
  /** Sexe (couples hétéro requis pour procréer). */
  gender: Gender;
  /** Âge en années de jeu (entier). */
  ageYears: number;
  /** Étape de vie dérivée de l'âge. */
  lifeStage: LifeStage;
  /** Id du/de la conjoint(e), 0 si célibataire. */
  partnerId: number;
  /** Étiquette de la phase courante de la tâche (« rentrer dormir », « manger »,
   *  « flâner »…). Optionnelle : utilisée par le HUD/debug client. */
  phase?: string;
}

export interface ItemState {
  id: number;
  kind: string;
  pos: Vec2;
}

export interface BuildingState {
  id: number;
  kind: string;
  /** Coin haut-gauche du footprint (tuiles entières), ou centre si mono-tuile. */
  pos: Vec2;
  /** Id de l'agent propriétaire (0 = bien public, ex : marché). */
  owner: number;
  /** Taille du footprint en tuiles. (0,0) = mono-tuile (rétro-compatibilité). */
  footprint: Vec2;
  /** Tuile-porte en coordonnées monde absolues (seul point d'entrée pratique). */
  door: Vec2;
}

export interface TileChunk {
  width: number;
  height: number;
  /** TileType aplati, ligne par ligne (index = y * width + x). */
  tiles: TileType[];
}

/** Date du calendrier du village (année/mois/jour, 1-indexés). */
export interface GameDate {
  year: number;
  month: number;
  day: number;
}

export interface WorldSnapshot {
  tick: number;
  timeOfDay: number; // 0..24
  /** Temps de jeu écoulé, en secondes de jeu (base de toutes les durées du monde). */
  gameTime: number;
  /** Nombre de jours de jeu écoulés depuis le début. */
  dayCount: number;
  /** Date courante du calendrier (affichage). */
  date: GameDate;
  /** Saison courante (dérivée du mois). */
  season?: Season;
  /** Météo courante (renouvelée à chaque journée). */
  weather?: WeatherState;
  agents: AgentState[];
  items: ItemState[];
  buildings: BuildingState[];
  /** Présent uniquement sur le premier snapshot d'une session. */
  chunk?: TileChunk;
}

export interface DialogueEvent {
  speakerId: number;
  listenerId: number; // 0 = monde / joueur
  text: string;
  voiceProfile: number;
}

// --- Messages réseau --------------------------------------------------------

export interface HelloMessage {
  t: 'hello';
  clientKind: 'web' | 'esp32';
  viewW: number;
  viewH: number;
}

export interface ChatToAgentMessage {
  t: 'chat';
  agentId: number;
  text: string;
  isOrder: boolean;
}

/** Règle la vitesse d'écoulement du temps (0 = pause, 1 = base, >1 = accéléré). */
export interface SetSpeedMessage {
  t: 'speed';
  scale: number;
}

export type ClientMessage = HelloMessage | ChatToAgentMessage | SetSpeedMessage;

export interface SnapshotMessage {
  t: 'snapshot';
  snapshot: WorldSnapshot;
}

export interface DialogueMessage {
  t: 'dialogue';
  event: DialogueEvent;
}

export type ServerMessage = SnapshotMessage | DialogueMessage;
