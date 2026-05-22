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
  | 'farm';

export type ActivityKind =
  | 'idle'
  | 'walking'
  | 'sleeping'
  | 'eating'
  | 'working'
  | 'crafting'
  | 'talking'
  | 'socializing';

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
  /** Nombre de maisons construites (aspiration logement). */
  houses: number;
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
}

export interface TileChunk {
  width: number;
  height: number;
  /** TileType aplati, ligne par ligne (index = y * width + x). */
  tiles: TileType[];
}

export interface WorldSnapshot {
  tick: number;
  timeOfDay: number; // 0..24
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

export type ClientMessage = HelloMessage | ChatToAgentMessage;

export interface SnapshotMessage {
  t: 'snapshot';
  snapshot: WorldSnapshot;
}

export interface DialogueMessage {
  t: 'dialogue';
  event: DialogueEvent;
}

export type ServerMessage = SnapshotMessage | DialogueMessage;
