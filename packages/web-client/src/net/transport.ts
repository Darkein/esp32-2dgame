import type { ClientMessage, ServerMessage, WorldSnapshot, DialogueEvent } from '@game/protocol';
import { decodeServerMessage, encodeClientMessage } from '@game/protocol';

export interface Transport {
  onSnapshot(cb: (s: WorldSnapshot) => void): void;
  onDialogue(cb: (e: DialogueEvent) => void): void;
  sendChat(agentId: number, text: string, isOrder: boolean): void;
  /** Règle la vitesse d'écoulement du temps (0 = pause, 1 = base, >1 = accéléré). */
  sendSpeed(scale: number): void;
  start(): void;
  readonly label: string;
}

abstract class BaseTransport implements Transport {
  protected snapshotCb: (s: WorldSnapshot) => void = () => {};
  protected dialogueCb: (e: DialogueEvent) => void = () => {};
  abstract readonly label: string;
  onSnapshot(cb: (s: WorldSnapshot) => void): void {
    this.snapshotCb = cb;
  }
  onDialogue(cb: (e: DialogueEvent) => void): void {
    this.dialogueCb = cb;
  }
  protected dispatch(msg: ServerMessage): void {
    if (msg.t === 'snapshot') this.snapshotCb(msg.snapshot);
    else if (msg.t === 'dialogue') this.dialogueCb(msg.event);
  }
  abstract sendChat(agentId: number, text: string, isOrder: boolean): void;
  abstract sendSpeed(scale: number): void;
  abstract start(): void;
}

/** Simulation locale dans un Web Worker (démo Pages, zéro infra). */
export class WorkerTransport extends BaseTransport {
  readonly label = 'local (worker)';
  private worker: Worker;
  constructor(private agentCount = 10) {
    super();
    this.worker = new Worker(new URL('../sim-worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (ev) => this.dispatch(ev.data as ServerMessage);
  }
  start(): void {
    this.worker.postMessage({ t: 'init', agentCount: this.agentCount });
  }
  sendChat(agentId: number, text: string, isOrder: boolean): void {
    const msg: ClientMessage = { t: 'chat', agentId, text, isOrder };
    this.worker.postMessage(msg);
  }
  sendSpeed(scale: number): void {
    const msg: ClientMessage = { t: 'speed', scale };
    this.worker.postMessage(msg);
  }
}

/** Serveur distant (vrai MMO, chemin ESP32). Protocole binaire FlatBuffers. */
export class WebSocketTransport extends BaseTransport {
  readonly label: string;
  private ws?: WebSocket;
  constructor(private url: string) {
    super();
    this.label = `serveur ${url}`;
  }
  start(): void {
    this.ws = new WebSocket(this.url);
    this.ws.binaryType = 'arraybuffer';
    this.ws.onopen = () => {
      const hello: ClientMessage = { t: 'hello', clientKind: 'web', viewW: innerWidth, viewH: innerHeight };
      this.ws?.send(encodeClientMessage(hello));
    };
    this.ws.onmessage = (ev) => {
      const msg = decodeServerMessage(new Uint8Array(ev.data as ArrayBuffer));
      if (msg) this.dispatch(msg);
    };
  }
  sendChat(agentId: number, text: string, isOrder: boolean): void {
    if (!this.ws) return;
    this.ws.send(encodeClientMessage({ t: 'chat', agentId, text, isOrder }));
  }
  sendSpeed(scale: number): void {
    if (!this.ws) return;
    this.ws.send(encodeClientMessage({ t: 'speed', scale }));
  }
}

export type TransportChoice = { mode: 'local' } | { mode: 'server'; url: string };

/** URL serveur par défaut, injectée au build (déploiement distant). */
export const DEFAULT_SERVER_URL: string = import.meta.env.VITE_SERVER_URL ?? '';

/**
 * Choisit le transport. `?server=ws://...` dans l'URL prime (tests) ; sinon on suit le
 * choix explicite de l'utilisateur ; à défaut, simulation locale.
 */
export function createTransport(choice?: TransportChoice): Transport {
  const override = new URLSearchParams(location.search).get('server');
  if (override) return new WebSocketTransport(override);
  if (choice?.mode === 'server' && choice.url) return new WebSocketTransport(choice.url);
  return new WorkerTransport();
}
