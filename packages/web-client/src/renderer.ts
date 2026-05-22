import { Application, Container, Graphics, Text, TextStyle } from 'pixi.js';
import type { TileType, WorldSnapshot, AgentState, Vec2 } from '@game/protocol';

const TILE_W = 64;
const TILE_H = 32;

const TILE_COLOR: Record<TileType, number> = {
  grass: 0x6ab04c,
  dirt: 0x9c6b3f,
  water: 0x3d8bd4,
  stone: 0x8d8d8d,
  sand: 0xd9c27a,
  forest: 0x2f7a3a,
  farm: 0xc9a227,
};

function isoToScreen(x: number, y: number): Vec2 {
  return { x: (x - y) * (TILE_W / 2), y: (x + y) * (TILE_H / 2) };
}

interface AgentView {
  container: Container;
  body: Graphics;
  label: Text;
  bubble: Text;
  target: Vec2; // position iso cible (interpolation)
  state: AgentState;
}

export class Renderer {
  readonly app = new Application();
  private world = new Container();
  private tileLayer = new Graphics();
  private agentLayer = new Container();
  private night = new Graphics();
  private views = new Map<number, AgentView>();
  private latest: WorldSnapshot | null = null;
  onSelect: (agent: AgentState) => void = () => {};

  async init(host: HTMLElement): Promise<void> {
    await this.app.init({ background: 0x1a1f2b, resizeTo: window, antialias: true });
    host.appendChild(this.app.canvas);
    this.world.addChild(this.tileLayer);
    this.world.addChild(this.agentLayer);
    this.app.stage.addChild(this.world);
    this.app.stage.addChild(this.night);
    this.centerCamera();
    this.app.ticker.add(() => this.frame());
    this.app.canvas.addEventListener('pointerdown', (e) => this.pick(e));
  }

  private centerCamera(): void {
    this.world.x = this.app.renderer.width / 2;
    this.world.y = this.app.renderer.height / 4;
  }

  get camera(): Container {
    return this.world;
  }

  apply(snapshot: WorldSnapshot): void {
    this.latest = snapshot;
    if (snapshot.chunk) this.drawTiles(snapshot.chunk.width, snapshot.chunk.height, snapshot.chunk.tiles);
    this.syncAgents(snapshot.agents);
    this.updateNight(snapshot.timeOfDay);
  }

  private drawTiles(w: number, h: number, tiles: TileType[]): void {
    this.tileLayer.clear();
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const s = isoToScreen(x, y);
        const color = TILE_COLOR[tiles[y * w + x] ?? 'grass'];
        this.tileLayer
          .poly([s.x, s.y - TILE_H / 2, s.x + TILE_W / 2, s.y, s.x, s.y + TILE_H / 2, s.x - TILE_W / 2, s.y])
          .fill({ color })
          .stroke({ color: 0x000000, alpha: 0.08, width: 1 });
      }
  }

  private syncAgents(agents: AgentState[]): void {
    const seen = new Set<number>();
    for (const a of agents) {
      seen.add(a.id);
      let v = this.views.get(a.id);
      if (!v) v = this.createAgentView(a);
      v.state = a;
      v.target = isoToScreen(a.pos.x, a.pos.y);
      v.label.text = a.name;
      v.bubble.text = a.saying;
      v.bubble.visible = a.saying.length > 0;
    }
    for (const [id, v] of this.views)
      if (!seen.has(id)) {
        v.container.destroy({ children: true });
        this.views.delete(id);
      }
  }

  private createAgentView(a: AgentState): AgentView {
    const container = new Container();
    const body = new Graphics().circle(0, 0, 8).fill({ color: agentColor(a.id) }).stroke({ color: 0x000000, width: 1.5 });
    body.y = -8;
    const label = new Text({ text: a.name, style: nameStyle });
    label.anchor.set(0.5, 1);
    label.y = -20;
    const bubble = new Text({ text: '', style: bubbleStyle });
    bubble.anchor.set(0.5, 1);
    bubble.y = -34;
    bubble.visible = false;
    container.addChild(body, label, bubble);
    const s = isoToScreen(a.pos.x, a.pos.y);
    container.x = s.x;
    container.y = s.y;
    this.agentLayer.addChild(container);
    const v: AgentView = { container, body, label, bubble, target: s, state: a };
    this.views.set(a.id, v);
    return v;
  }

  private updateNight(timeOfDay: number): void {
    let darkness: number;
    if (timeOfDay >= 7 && timeOfDay <= 19) darkness = 0;
    else if (timeOfDay >= 22 || timeOfDay <= 4) darkness = 1;
    else if (timeOfDay > 4 && timeOfDay < 7) darkness = (7 - timeOfDay) / 3;
    else darkness = (timeOfDay - 19) / 3;
    this.night.clear();
    this.night.rect(0, 0, this.app.renderer.width, this.app.renderer.height).fill({ color: 0x0a1030, alpha: darkness * 0.6 });
  }

  private frame(): void {
    // Interpolation fluide vers les positions cibles + tri par profondeur.
    for (const v of this.views.values()) {
      v.container.x += (v.target.x - v.container.x) * 0.2;
      v.container.y += (v.target.y - v.container.y) * 0.2;
      v.container.zIndex = v.container.y;
    }
    this.agentLayer.sortableChildren = true;
  }

  private pick(e: PointerEvent): void {
    if (!this.latest) return;
    const lx = e.clientX - this.world.x;
    const ly = e.clientY - this.world.y;
    let best: AgentState | null = null;
    let bestD = 28;
    for (const v of this.views.values()) {
      const d = Math.hypot(v.container.x * this.world.scale.x - lx, v.container.y * this.world.scale.y - ly);
      if (d < bestD) {
        bestD = d;
        best = v.state;
      }
    }
    if (best) this.onSelect(best);
  }
}

function agentColor(id: number): number {
  const palette = [0xff6b6b, 0xffd166, 0x06d6a0, 0x4d96ff, 0xc77dff, 0xff9f1c, 0x8ac926, 0xff5d8f];
  return palette[id % palette.length]!;
}

const nameStyle = new TextStyle({ fontFamily: 'sans-serif', fontSize: 11, fill: 0xffffff, stroke: { color: 0x000000, width: 3 } });
const bubbleStyle = new TextStyle({ fontFamily: 'sans-serif', fontSize: 11, fill: 0xfff3b0, stroke: { color: 0x000000, width: 3 }, wordWrap: true, wordWrapWidth: 160, align: 'center' });
