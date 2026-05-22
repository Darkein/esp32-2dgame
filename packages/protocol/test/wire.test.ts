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
    },
  ],
  items: [{ id: 1000, kind: 'pomme', pos: { x: 1, y: 2 } }],
  buildings: [{ id: 1001, kind: 'maison', pos: { x: 4, y: 5 } }],
  chunk: { width: 3, height: 2, tiles: ['grass', 'water', 'forest', 'farm', 'stone', 'sand'] },
};

describe('protocole binaire FlatBuffers', () => {
  it('round-trip d\'un snapshot complet', () => {
    const decoded = decodeServerMessage(encodeServerMessage({ t: 'snapshot', snapshot }));
    expect(decoded?.t).toBe('snapshot');
    const s = (decoded as { t: 'snapshot'; snapshot: WorldSnapshot }).snapshot;
    expect(s.tick).toBe(12345);
    expect(s.timeOfDay).toBeCloseTo(13.5, 3);
    expect(s.agents).toHaveLength(1);
    const a = s.agents[0]!;
    expect(a.name).toBe('Camille');
    expect(a.activity).toBe('working');
    expect(a.pos.x).toBeCloseTo(3.25, 4);
    expect(a.needs.energy).toBeCloseTo(80, 3);
    expect(a.inventory).toEqual([
      { kind: 'bois', count: 5 },
      { kind: 'planche', count: 2 },
    ]);
    expect(a.houses).toBe(1);
    expect(s.items[0]).toMatchObject({ id: 1000, kind: 'pomme' });
    expect(s.buildings[0]).toMatchObject({ id: 1001, kind: 'maison' });
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
  });
});
