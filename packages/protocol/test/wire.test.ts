import { describe, it, expect } from 'vitest';
import {
  decodeClientMessage,
  decodeServerMessage,
  encodeClientMessage,
  encodeServerMessage,
} from '../src/wire';
import type { ClientMessage, ServerMessage, WorldSnapshot } from '../src/types';

const snapshot: WorldSnapshot = {
  tick: 12345,
  timeOfDay: 13.5,
  gameTime: 1234567.5,
  dayCount: 14,
  date: { year: 1, month: 1, day: 15 },
  agents: [
    {
      id: 1,
      name: 'Camille',
      pos: { x: 3.25, y: 7.75 },
      activity: 'working',
      needs: { energy: 80, hunger: 60, social: 40, hygiene: 90, fun: 55 },
      voiceProfile: 2,
      goal: 'construire une maison',
      saying: 'Bonjour !',
      inventory: [
        { kind: 'bois', count: 5 },
        { kind: 'planche', count: 2 },
      ],
      houses: 1,
      job: 'bucheron',
      coins: 42,
      gender: 'F',
      ageYears: 27,
      lifeStage: 'adulte',
      partnerId: 3,
    },
  ],
  items: [{ id: 1000, kind: 'pomme', pos: { x: 1, y: 2 } }],
  buildings: [{ id: 1001, kind: 'maison', pos: { x: 4, y: 5 }, owner: 1 }],
  chunk: { width: 3, height: 2, tiles: ['grass', 'water', 'forest', 'farm', 'stone', 'sand'] },
};

describe('protocole binaire FlatBuffers', () => {
  it('round-trip d\'un snapshot complet', () => {
    const decoded = decodeServerMessage(encodeServerMessage({ t: 'snapshot', snapshot }));
    expect(decoded?.t).toBe('snapshot');
    const s = (decoded as { t: 'snapshot'; snapshot: WorldSnapshot }).snapshot;
    expect(s.tick).toBe(12345);
    expect(s.timeOfDay).toBeCloseTo(13.5, 3);
    expect(s.gameTime).toBeCloseTo(1234567.5, 1);
    expect(s.dayCount).toBe(14);
    expect(s.date).toEqual({ year: 1, month: 1, day: 15 });
    expect(s.agents).toHaveLength(1);
    const a = s.agents[0]!;
    expect(a.name).toBe('Camille');
    expect(a.activity).toBe('working');
    expect(a.gender).toBe('F');
    expect(a.ageYears).toBe(27);
    expect(a.lifeStage).toBe('adulte');
    expect(a.partnerId).toBe(3);
    expect(a.pos.x).toBeCloseTo(3.25, 4);
    expect(a.needs.energy).toBeCloseTo(80, 3);
    expect(a.inventory).toEqual([
      { kind: 'bois', count: 5 },
      { kind: 'planche', count: 2 },
    ]);
    expect(a.houses).toBe(1);
    expect(a.job).toBe('bucheron');
    expect(a.coins).toBe(42);
    expect(s.items[0]).toMatchObject({ id: 1000, kind: 'pomme' });
    expect(s.buildings[0]).toMatchObject({ id: 1001, kind: 'maison', owner: 1 });
    expect(s.chunk?.tiles).toEqual(['grass', 'water', 'forest', 'farm', 'stone', 'sand']);
  });

  it('round-trip d\'un dialogue', () => {
    const msg: ServerMessage = {
      t: 'dialogue',
      event: { speakerId: 7, listenerId: 0, text: 'Salut, ça va ?', voiceProfile: 4 },
    };
    const decoded = decodeServerMessage(encodeServerMessage(msg));
    expect(decoded).toEqual(msg);
  });

  it('round-trip des messages client (hello + chat)', () => {
    const hello: ClientMessage = { t: 'hello', clientKind: 'web', viewW: 800, viewH: 600 };
    expect(decodeClientMessage(encodeClientMessage(hello))).toEqual(hello);

    const chat: ClientMessage = { t: 'chat', agentId: 3, text: 'Va dormir !', isOrder: true };
    expect(decodeClientMessage(encodeClientMessage(chat))).toEqual(chat);

    const speed: ClientMessage = { t: 'speed', scale: 20 };
    expect(decodeClientMessage(encodeClientMessage(speed))).toEqual(speed);
  });
});
