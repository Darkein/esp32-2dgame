import type { ClientMessage, ServerMessage, WorldSnapshot, DialogueEvent } from '@game/protocol';

export interface Transport {
  onSnapshot(cb: (s: WorldSnapshot) => void): void;
  onDialogue(cb: (e: DialogueEvent) => void): void;
  sendChat(agentId: number, text: string, isOrder: boolean): void;
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
}

/** Serveur distant (vrai MMO, chemin ESP32). */
export class WebSocketTransport extends BaseTransport {
  readonly label: string;
  private ws?: WebSocket;
  constructor(private url: string) {
    super();
    this.label = `serveur ${url}`;
  }
  start(): void {
    this.ws = new WebSocket(this.url);
    this.ws.onmessage = (ev) => this.dispatch(JSON.parse(ev.data as string) as ServerMessage);
  }
  sendChat(agentId: number, text: string, isOrder: boolean): void {
    const msg: ClientMessage = { t: 'chat', agentId, text, isOrder };
    this.ws?.send(JSON.stringify(msg));
  }
}

/** Choisit le transport selon `?server=ws://...` dans l'URL. */
export function createTransport(): Transport {
  const params = new URLSearchParams(location.search);
  const server = params.get('server');
  return server ? new WebSocketTransport(server) : new WorkerTransport();
}
