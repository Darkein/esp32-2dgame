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
  | 'champ_mur';

export type ActivityKind =
  | 'idle'
  | 'walking'
  | 'sleeping'
  | 'eating'
  | 'working'
  | 'crafting'
  | 'talking'
  | 'socializing'
  | 'trading';

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
}

export interface ItemState {
  id: number;
  kind: string;
  pos: Vec2;
}

export interface BuildingState {
  id: number;
  kind: string;
  pos: Vec2;
  /** Id de l'agent propriétaire (0 = bien public, ex : marché). */
  owner: number;
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
