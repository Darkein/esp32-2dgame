// Encodage/décodage binaire FlatBuffers du protocole WebSocket. Convertit entre les
// types de domaine (types.ts, ergonomiques) et le code généré (gen/, numérique).
// Le format binaire est le contrat partagé avec le client C++ de l'ESP32.
import * as flatbuffers from 'flatbuffers';
import { ServerMessage as FbServerMessage } from './gen/game/wire/server-message';
import { ServerPayload as FbServerPayload } from './gen/game/wire/server-payload';
import { ClientMessage as FbClientMessage } from './gen/game/wire/client-message';
import { ClientPayload as FbClientPayload } from './gen/game/wire/client-payload';
import { WorldSnapshot as FbWorldSnapshot } from './gen/game/wire/world-snapshot';
import { AgentState as FbAgentState } from './gen/game/wire/agent-state';
import { ItemState as FbItemState } from './gen/game/wire/item-state';
import { BuildingState as FbBuildingState } from './gen/game/wire/building-state';
import { ItemStack as FbItemStack } from './gen/game/wire/item-stack';
import { TileChunk as FbTileChunk } from './gen/game/wire/tile-chunk';
import { DialogueEvent as FbDialogueEvent } from './gen/game/wire/dialogue-event';
import { Hello as FbHello } from './gen/game/wire/hello';
import { ChatToAgent as FbChatToAgent } from './gen/game/wire/chat-to-agent';
import { SetSpeed as FbSetSpeed } from './gen/game/wire/set-speed';
import { Vec2 as FbVec2 } from './gen/game/wire/vec2';
import { Needs as FbNeeds } from './gen/game/wire/needs';
import type {
  ActivityKind,
  AgentState,
  BuildingState,
  ClientMessage,
  DialogueEvent,
  Gender,
  ItemState,
  LifeStage,
  ServerMessage,
  TileType,
  WorldSnapshot,
} from './types';

// Tables d'enums (ordre identique au schéma .fbs).
const TILE_TO_FB: Record<TileType, number> = {
  grass: 0, dirt: 1, water: 2, stone: 3, sand: 4, forest: 5, farm: 6,
  champ_seme: 7, champ_pousse: 8, champ_mur: 9, path: 10,
};
const TILE_FROM_FB: TileType[] = [
  'grass', 'dirt', 'water', 'stone', 'sand', 'forest', 'farm',
  'champ_seme', 'champ_pousse', 'champ_mur', 'path',
];
const ACT_TO_FB: Record<ActivityKind, number> = {
  idle: 0, walking: 1, sleeping: 2, eating: 3, working: 4, crafting: 5, talking: 6, socializing: 7,
  trading: 8,
};
const ACT_FROM_FB: ActivityKind[] = [
  'idle', 'walking', 'sleeping', 'eating', 'working', 'crafting', 'talking', 'socializing',
  'trading',
];
const GENDER_TO_FB: Record<Gender, number> = { M: 0, F: 1 };
const GENDER_FROM_FB: Gender[] = ['M', 'F'];
const STAGE_TO_FB: Record<LifeStage, number> = { enfant: 0, adulte: 1, aine: 2 };
const STAGE_FROM_FB: LifeStage[] = ['enfant', 'adulte', 'aine'];

// --- Encodage --------------------------------------------------------------

function encodeAgent(b: flatbuffers.Builder, a: AgentState): number {
  const nameOff = b.createString(a.name);
  const goalOff = b.createString(a.goal);
  const sayOff = b.createString(a.saying);
  const jobOff = b.createString(a.job);
  const stackOffsets = a.inventory.map((st) => {
    const kindOff = b.createString(st.kind);
    return FbItemStack.createItemStack(b, kindOff, st.count);
  });
  const invVec = FbAgentState.createInventoryVector(b, stackOffsets);

  FbAgentState.startAgentState(b);
  FbAgentState.addId(b, a.id);
  FbAgentState.addName(b, nameOff);
  FbAgentState.addPos(b, FbVec2.createVec2(b, a.pos.x, a.pos.y));
  FbAgentState.addActivity(b, ACT_TO_FB[a.activity]);
  FbAgentState.addNeeds(
    b,
    FbNeeds.createNeeds(b, a.needs.energy, a.needs.hunger, a.needs.social, a.needs.hygiene, a.needs.fun),
  );
  FbAgentState.addVoiceProfile(b, a.voiceProfile);
  FbAgentState.addGoal(b, goalOff);
  FbAgentState.addSaying(b, sayOff);
  FbAgentState.addInventory(b, invVec);
  FbAgentState.addHouses(b, a.houses);
  FbAgentState.addJob(b, jobOff);
  FbAgentState.addCoins(b, a.coins);
  FbAgentState.addGender(b, GENDER_TO_FB[a.gender]);
  FbAgentState.addAgeYears(b, a.ageYears);
  FbAgentState.addLifeStage(b, STAGE_TO_FB[a.lifeStage]);
  FbAgentState.addPartnerId(b, a.partnerId);
  return FbAgentState.endAgentState(b);
}

function encodeItem(b: flatbuffers.Builder, it: ItemState): number {
  const kindOff = b.createString(it.kind);
  FbItemState.startItemState(b);
  FbItemState.addId(b, it.id);
  FbItemState.addKind(b, kindOff);
  FbItemState.addPos(b, FbVec2.createVec2(b, it.pos.x, it.pos.y));
  return FbItemState.endItemState(b);
}

function encodeBuilding(b: flatbuffers.Builder, bd: BuildingState): number {
  const kindOff = b.createString(bd.kind);
  FbBuildingState.startBuildingState(b);
  FbBuildingState.addId(b, bd.id);
  FbBuildingState.addKind(b, kindOff);
  FbBuildingState.addPos(b, FbVec2.createVec2(b, bd.pos.x, bd.pos.y));
  FbBuildingState.addOwner(b, bd.owner);
  FbBuildingState.addFootprint(b, FbVec2.createVec2(b, bd.footprint.x, bd.footprint.y));
  FbBuildingState.addDoor(b, FbVec2.createVec2(b, bd.door.x, bd.door.y));
  return FbBuildingState.endBuildingState(b);
}

function encodeSnapshot(b: flatbuffers.Builder, s: WorldSnapshot): number {
  const agentsVec = FbWorldSnapshot.createAgentsVector(b, s.agents.map((a) => encodeAgent(b, a)));
  const itemsVec = FbWorldSnapshot.createItemsVector(b, s.items.map((i) => encodeItem(b, i)));
  const buildingsVec = FbWorldSnapshot.createBuildingsVector(b, s.buildings.map((x) => encodeBuilding(b, x)));
  let chunkOff = 0;
  if (s.chunk) {
    const tilesVec = FbTileChunk.createTilesVector(b, Uint8Array.from(s.chunk.tiles.map((t) => TILE_TO_FB[t])));
    chunkOff = FbTileChunk.createTileChunk(b, s.chunk.width, s.chunk.height, tilesVec);
  }
  FbWorldSnapshot.startWorldSnapshot(b);
  FbWorldSnapshot.addTick(b, BigInt(Math.trunc(s.tick)));
  FbWorldSnapshot.addTimeOfDay(b, s.timeOfDay);
  FbWorldSnapshot.addGameTime(b, s.gameTime);
  FbWorldSnapshot.addDayCount(b, s.dayCount);
  FbWorldSnapshot.addDateYear(b, s.date.year);
  FbWorldSnapshot.addDateMonth(b, s.date.month);
  FbWorldSnapshot.addDateDay(b, s.date.day);
  FbWorldSnapshot.addAgents(b, agentsVec);
  FbWorldSnapshot.addItems(b, itemsVec);
  FbWorldSnapshot.addBuildings(b, buildingsVec);
  if (chunkOff) FbWorldSnapshot.addChunk(b, chunkOff);
  return FbWorldSnapshot.endWorldSnapshot(b);
}

function encodeDialogue(b: flatbuffers.Builder, e: DialogueEvent): number {
  const textOff = b.createString(e.text);
  return FbDialogueEvent.createDialogueEvent(b, e.speakerId, e.listenerId, textOff, e.voiceProfile);
}

export function encodeServerMessage(msg: ServerMessage): Uint8Array {
  const b = new flatbuffers.Builder(1024);
  let payloadType: FbServerPayload;
  let payloadOff: number;
  if (msg.t === 'snapshot') {
    payloadType = FbServerPayload.WorldSnapshot;
    payloadOff = encodeSnapshot(b, msg.snapshot);
  } else {
    payloadType = FbServerPayload.DialogueEvent;
    payloadOff = encodeDialogue(b, msg.event);
  }
  const root = FbServerMessage.createServerMessage(b, payloadType, payloadOff);
  FbServerMessage.finishServerMessageBuffer(b, root);
  return b.asUint8Array().slice();
}

export function encodeClientMessage(msg: ClientMessage): Uint8Array {
  const b = new flatbuffers.Builder(256);
  let payloadType: FbClientPayload;
  let payloadOff: number;
  if (msg.t === 'hello') {
    const kindOff = b.createString(msg.clientKind);
    payloadType = FbClientPayload.Hello;
    payloadOff = FbHello.createHello(b, kindOff, msg.viewW, msg.viewH);
  } else if (msg.t === 'chat') {
    const textOff = b.createString(msg.text);
    payloadType = FbClientPayload.ChatToAgent;
    payloadOff = FbChatToAgent.createChatToAgent(b, msg.agentId, textOff, msg.isOrder);
  } else {
    payloadType = FbClientPayload.SetSpeed;
    payloadOff = FbSetSpeed.createSetSpeed(b, msg.scale);
  }
  const root = FbClientMessage.createClientMessage(b, payloadType, payloadOff);
  b.finish(root);
  return b.asUint8Array().slice();
}

// --- Décodage --------------------------------------------------------------

function decodeAgent(a: FbAgentState): AgentState {
  const pos = a.pos()!;
  const n = a.needs()!;
  const inventory = [];
  for (let i = 0; i < a.inventoryLength(); i++) {
    const st = a.inventory(i)!;
    inventory.push({ kind: st.kind() ?? '', count: st.count() });
  }
  return {
    id: a.id(),
    name: a.name() ?? '',
    pos: { x: pos.x(), y: pos.y() },
    activity: ACT_FROM_FB[a.activity()] ?? 'idle',
    needs: { energy: n.energy(), hunger: n.hunger(), social: n.social(), hygiene: n.hygiene(), fun: n.fun() },
    voiceProfile: a.voiceProfile(),
    goal: a.goal() ?? '',
    saying: a.saying() ?? '',
    inventory,
    houses: a.houses(),
    job: a.job() ?? '',
    coins: a.coins(),
    gender: GENDER_FROM_FB[a.gender()] ?? 'M',
    ageYears: a.ageYears(),
    lifeStage: STAGE_FROM_FB[a.lifeStage()] ?? 'adulte',
    partnerId: a.partnerId(),
  };
}

function decodeSnapshot(ws: FbWorldSnapshot): WorldSnapshot {
  const agents: AgentState[] = [];
  for (let i = 0; i < ws.agentsLength(); i++) agents.push(decodeAgent(ws.agents(i)!));
  const items: ItemState[] = [];
  for (let i = 0; i < ws.itemsLength(); i++) {
    const it = ws.items(i)!;
    const p = it.pos()!;
    items.push({ id: it.id(), kind: it.kind() ?? '', pos: { x: p.x(), y: p.y() } });
  }
  const buildings: BuildingState[] = [];
  for (let i = 0; i < ws.buildingsLength(); i++) {
    const bd = ws.buildings(i)!;
    const p = bd.pos()!;
    const fp = bd.footprint();
    const dr = bd.door();
    buildings.push({
      id: bd.id(),
      kind: bd.kind() ?? '',
      pos: { x: p.x(), y: p.y() },
      owner: bd.owner(),
      footprint: fp ? { x: fp.x(), y: fp.y() } : { x: 0, y: 0 },
      door: dr ? { x: dr.x(), y: dr.y() } : { x: 0, y: 0 },
    });
  }
  const snapshot: WorldSnapshot = {
    tick: Number(ws.tick()),
    timeOfDay: ws.timeOfDay(),
    gameTime: ws.gameTime(),
    dayCount: ws.dayCount(),
    date: { year: ws.dateYear(), month: ws.dateMonth(), day: ws.dateDay() },
    agents,
    items,
    buildings,
  };
  const chunk = ws.chunk();
  if (chunk) {
    const tiles: TileType[] = [];
    const arr = chunk.tilesArray();
    if (arr) for (const t of arr) tiles.push(TILE_FROM_FB[t] ?? 'grass');
    snapshot.chunk = { width: chunk.width(), height: chunk.height(), tiles };
  }
  return snapshot;
}

export function decodeServerMessage(buf: Uint8Array): ServerMessage | null {
  const bb = new flatbuffers.ByteBuffer(buf);
  const msg = FbServerMessage.getRootAsServerMessage(bb);
  switch (msg.payloadType()) {
    case FbServerPayload.WorldSnapshot:
      return { t: 'snapshot', snapshot: decodeSnapshot(msg.payload(new FbWorldSnapshot())) };
    case FbServerPayload.DialogueEvent: {
      const de = msg.payload(new FbDialogueEvent()) as FbDialogueEvent;
      return {
        t: 'dialogue',
        event: {
          speakerId: de.speakerId(),
          listenerId: de.listenerId(),
          text: de.text() ?? '',
          voiceProfile: de.voiceProfile(),
        },
      };
    }
    default:
      return null; // AudioEvent (phase 6) ignoré pour l'instant
  }
}

export function decodeClientMessage(buf: Uint8Array): ClientMessage | null {
  const bb = new flatbuffers.ByteBuffer(buf);
  const msg = FbClientMessage.getRootAsClientMessage(bb);
  switch (msg.payloadType()) {
    case FbClientPayload.Hello: {
      const h = msg.payload(new FbHello()) as FbHello;
      return { t: 'hello', clientKind: (h.clientKind() ?? 'web') as 'web' | 'esp32', viewW: h.viewW(), viewH: h.viewH() };
    }
    case FbClientPayload.ChatToAgent: {
      const c = msg.payload(new FbChatToAgent()) as FbChatToAgent;
      return { t: 'chat', agentId: c.agentId(), text: c.text() ?? '', isOrder: c.isOrder() };
    }
    case FbClientPayload.SetSpeed: {
      const s = msg.payload(new FbSetSpeed()) as FbSetSpeed;
      return { t: 'speed', scale: s.scale() };
    }
    default:
      return null;
  }
}
