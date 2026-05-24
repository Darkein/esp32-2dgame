import { Application, Container, Graphics, Text, TextStyle } from 'pixi.js';
import type { TileType, WorldSnapshot, AgentState, BuildingState, Vec2 } from '@game/protocol';

const TILE_W = 64;
const TILE_H = 32;

const TILE_COLOR: Record<TileType, number> = {
  grass: 0x6ab04c,
  dirt: 0x9c6b3f,
  water: 0x3d8bd4,
  stone: 0x8d8d8d,
  sand: 0xd9c27a,
  forest: 0x2f7a3a, // sol forestier (sombre) ; le tronc + frondaison sont au-dessus
  farm: 0x8a6a3f, // champ labouré (terre nue)
  champ_seme: 0xa07a4a, // semé (terre + germes)
  champ_pousse: 0x8fd14f, // jeune pousse
  champ_mur: 0xe3c34a, // épis dorés, prêt à récolter
  path: 0xd8c89a, // chemin foulé / pavé (beige clair)
};

// Couleurs des bâtiments : { toit, mur }. Le chantier est translucide.
const BUILDING_COLOR: Record<string, { roof: number; wall: number; alpha?: number }> = {
  maison: { roof: 0xb5462f, wall: 0xcaa472 },
  atelier: { roof: 0x6d4c91, wall: 0x9a8c7a },
  four: { roof: 0x7a3b2e, wall: 0x8d8d8d },
  entrepot: { roof: 0x4a6d8c, wall: 0xb0a080 },
  puits: { roof: 0x6f7d86, wall: 0x8d8d8d },
  marche: { roof: 0xe0a32e, wall: 0xb5793a },
  chantier: { roof: 0xe8e0a0, wall: 0xc8b870, alpha: 0.5 },
};

function isoToScreen(x: number, y: number): Vec2 {
  return { x: (x - y) * (TILE_W / 2), y: (x + y) * (TILE_H / 2) };
}

interface AgentView {
  container: Container;
  body: Graphics;
  label: Text;
  bubble: Text;
  /** Position rendue, en coordonnées tuiles (interpolation le long du segment). */
  tilePos: Vec2;
  /** Prochain waypoint serveur (tuiles) tant que l'agent marche, sinon null. */
  moveTo: Vec2 | null;
  /** Vitesse à appliquer pendant cette interpolation, en tuiles/sec réelles. */
  speedTPS: number;
  state: AgentState;
}

/** Vue d'un bâtiment : partie basse (murs, triée Y avec les agents) et partie haute
 *  (toit, toujours dessinée par-dessus tout — flag ★ de RPG Maker). */
interface BuildingView {
  lower: Container;
  upper: Container;
  /** Petit losange clair posé sur la tuile-porte (sous les agents). */
  doorMarker: Graphics | null;
  kind: string;
}

/** Vue d'un arbre (tuile forest) : partie basse (tronc, triée Y) + partie haute
 *  (frondaison, par-dessus). */
interface TreeView {
  lower: Container;
  upper: Container;
}

export class Renderer {
  readonly app = new Application();
  private world = new Container();
  private tileLayer = new Graphics();
  /** Calque « partie basse » d'objets hauts (troncs d'arbres, murs de bâtiments). Trié Y. */
  private propLayer = new Container();
  /** Calque des agents. Trié Y. */
  private agentLayer = new Container();
  /** Calque « partie haute » (frondaisons, toits). Toujours dessiné par-dessus les agents. */
  private overheadLayer = new Container();
  private night = new Graphics();
  private views = new Map<number, AgentView>();
  private buildingViews = new Map<number, BuildingView>();
  /** Vues d'arbres indexées par index de tuile. */
  private treeViews = new Map<number, TreeView>();
  private latest: WorldSnapshot | null = null;
  /** Horodatage de la dernière frame pour calculer `dt` réel sur l'interpolation. */
  private lastFrame = performance.now();
  onSelect: (agent: AgentState) => void = () => {};

  async init(host: HTMLElement): Promise<void> {
    await this.app.init({ background: 0x1a1f2b, resizeTo: window, antialias: true });
    host.appendChild(this.app.canvas);
    // Ordre fond → surface : sol, parties basses (Y), agents (Y), parties hautes (par-dessus).
    this.propLayer.sortableChildren = true;
    this.agentLayer.sortableChildren = true;
    this.overheadLayer.sortableChildren = true;
    this.world.addChild(this.tileLayer);
    this.world.addChild(this.propLayer);
    this.world.addChild(this.agentLayer);
    this.world.addChild(this.overheadLayer);
    this.app.stage.addChild(this.world);
    this.app.stage.addChild(this.night);
    this.centerCamera();
    this.app.ticker.add(() => this.frame());
    // La sélection est désormais pilotée par `pickAt`, appelé sur un *tap* depuis
    // `attachCameraControls` (mobile-friendly : pas de sélection au début d'un drag/pinch).
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
    this.syncBuildings(snapshot.buildings);
    this.syncAgents(snapshot.agents);
    this.updateNight(snapshot.timeOfDay);
  }

  private syncBuildings(buildings: BuildingState[]): void {
    const seen = new Set<number>();
    for (const b of buildings) {
      seen.add(b.id);
      let v = this.buildingViews.get(b.id);
      if (!v || v.kind !== b.kind) {
        if (v) this.destroyBuildingView(v);
        v = this.createBuildingView(b);
        this.buildingViews.set(b.id, v);
      }
    }
    for (const [id, v] of this.buildingViews)
      if (!seen.has(id)) {
        this.destroyBuildingView(v);
        this.buildingViews.delete(id);
      }
  }

  private destroyBuildingView(v: BuildingView): void {
    v.lower.destroy({ children: true });
    v.upper.destroy({ children: true });
    if (v.doorMarker) v.doorMarker.destroy();
  }

  /** Crée la vue d'un bâtiment : murs (propLayer, triés Y) + toit (overheadLayer, par-dessus). */
  private createBuildingView(b: BuildingState): BuildingView {
    const fw = Math.max(1, b.footprint?.x || 1);
    const fh = Math.max(1, b.footprint?.y || 1);
    // Centre du footprint en monde (pour que zIndex = screenY corresponde au « pied » sud).
    const cx = b.pos.x + fw / 2 - 0.5;
    const cy = b.pos.y + fh / 2 - 0.5;
    const south = isoToScreen(cx, cy + fh / 2);
    const sCenter = isoToScreen(cx, cy);

    const { lower, upper, baseY } = drawBuilding(b.kind, fw, fh);
    // Position commune : ancrée sur le centre du footprint.
    lower.x = sCenter.x;
    lower.y = sCenter.y;
    upper.x = sCenter.x;
    upper.y = sCenter.y;
    // Le tri Y se fait sur le « pied sud » du bâtiment : il passe derrière un agent
    // plus au sud, et devant un agent plus au nord (cohérent avec son ombre au sol).
    lower.zIndex = south.y;
    // Le toit, lui, est trié entre éléments overhead par sa base également.
    upper.zIndex = south.y;
    this.propLayer.addChild(lower);
    this.overheadLayer.addChild(upper);

    // Marqueur de porte : petit losange clair posé au sol pour la lisibilité.
    let doorMarker: Graphics | null = null;
    if (b.door) {
      const doorScreen = isoToScreen(b.door.x, b.door.y);
      doorMarker = new Graphics()
        .poly([
          doorScreen.x, doorScreen.y - TILE_H / 4,
          doorScreen.x + TILE_W / 4, doorScreen.y,
          doorScreen.x, doorScreen.y + TILE_H / 4,
          doorScreen.x - TILE_W / 4, doorScreen.y,
        ])
        .fill({ color: 0xf2e1b5, alpha: 0.65 });
      // Rangé bas dans propLayer pour passer sous les agents et sous le bâtiment.
      doorMarker.zIndex = doorScreen.y - 10_000;
      this.propLayer.addChild(doorMarker);
    }
    void baseY;
    return { lower, upper, doorMarker, kind: b.kind };
  }

  private drawTiles(w: number, h: number, tiles: TileType[]): void {
    this.tileLayer.clear();
    // Détruit les anciennes vues d'arbres (le chunk peut changer : forêt épuisée → grass).
    for (const v of this.treeViews.values()) {
      v.lower.destroy({ children: true });
      v.upper.destroy({ children: true });
    }
    this.treeViews.clear();
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const s = isoToScreen(x, y);
        const tile = tiles[y * w + x] ?? 'grass';
        const color = TILE_COLOR[tile];
        this.tileLayer
          .poly([s.x, s.y - TILE_H / 2, s.x + TILE_W / 2, s.y, s.x, s.y + TILE_H / 2, s.x - TILE_W / 2, s.y])
          .fill({ color })
          .stroke({ color: 0x000000, alpha: 0.08, width: 1 });
        if (tile === 'forest') this.spawnTree(x, y, w);
      }
  }

  /** Crée la vue d'un arbre (tronc trié Y + frondaison toujours par-dessus). */
  private spawnTree(x: number, y: number, w: number): void {
    const s = isoToScreen(x, y);
    const lower = new Graphics();
    // Tronc : petit rectangle iso, ancré sur la tuile.
    lower.rect(-3, -16, 6, 16).fill({ color: 0x6b3d1f }).stroke({ color: 0x3d2010, width: 1, alpha: 0.6 });
    lower.x = s.x;
    lower.y = s.y;
    lower.zIndex = s.y;

    const upper = new Graphics();
    // Frondaison : disque vert sombre, offset d'~1 tuile vers le haut.
    upper.circle(0, -32, 14).fill({ color: 0x1f5a2a }).stroke({ color: 0x0d2f15, width: 1, alpha: 0.6 });
    upper.circle(-8, -28, 10).fill({ color: 0x2a6d35 });
    upper.circle(7, -30, 11).fill({ color: 0x2a6d35 });
    upper.x = s.x;
    upper.y = s.y;
    upper.zIndex = s.y;

    this.propLayer.addChild(lower);
    this.overheadLayer.addChild(upper);
    this.treeViews.set(y * w + x, { lower, upper });
  }

  private syncAgents(agents: AgentState[]): void {
    const seen = new Set<number>();
    for (const a of agents) {
      seen.add(a.id);
      let v = this.views.get(a.id);
      if (!v) v = this.createAgentView(a);
      v.state = a;
      if (a.move) {
        v.moveTo = a.move.to;
        v.speedTPS = a.move.speed;
        // Si le rendu a beaucoup divergé de la vérité serveur (onglet en
        // arrière-plan, gros lag), on snap pour rattraper proprement.
        const dx = a.pos.x - v.tilePos.x;
        const dy = a.pos.y - v.tilePos.y;
        if (Math.hypot(dx, dy) > 1.5) {
          v.tilePos.x = a.pos.x;
          v.tilePos.y = a.pos.y;
        }
      } else {
        v.moveTo = null;
        v.tilePos.x = a.pos.x;
        v.tilePos.y = a.pos.y;
      }
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
    const v: AgentView = {
      container,
      body,
      label,
      bubble,
      tilePos: { x: a.pos.x, y: a.pos.y },
      moveTo: a.move ? a.move.to : null,
      speedTPS: a.move ? a.move.speed : 0,
      state: a,
    };
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
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    for (const v of this.views.values()) {
      if (v.moveTo && v.speedTPS > 0) {
        const dx = v.moveTo.x - v.tilePos.x;
        const dy = v.moveTo.y - v.tilePos.y;
        const d = Math.hypot(dx, dy);
        if (d > 1e-4) {
          const step = Math.min(v.speedTPS * dt, d);
          v.tilePos.x += (dx / d) * step;
          v.tilePos.y += (dy / d) * step;
        }
      }
      const s = isoToScreen(v.tilePos.x, v.tilePos.y);
      v.container.x = s.x;
      v.container.y = s.y;
      v.container.zIndex = s.y;
    }
  }

  /** Sélectionne l'agent le plus proche d'un point écran (déclenché par un *tap*).
   *  La tolérance de pick (en pixels écran) est plus large sur mobile pour permettre une
   *  sélection au doigt sans précision millimétrique. */
  pickAt(clientX: number, clientY: number): void {
    if (!this.latest) return;
    const rect = this.app.canvas.getBoundingClientRect();
    const lx = clientX - rect.left - this.world.x;
    const ly = clientY - rect.top - this.world.y;
    const coarse = matchMedia('(pointer: coarse)').matches; // doigt vs souris
    let best: AgentState | null = null;
    let bestD = coarse ? 48 : 28;
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

/** Dessine un bâtiment isométrique scalé sur (fw, fh) tuiles : volume bas (murs + faces)
 *  dans `lower`, toit en losange dans `upper`. `baseY` = altitude au pied du bâtiment. */
function drawBuilding(kind: string, fw: number, fh: number): { lower: Container; upper: Container; baseY: number } {
  const col = BUILDING_COLOR[kind] ?? { roof: 0xcccccc, wall: 0x999999 };
  const alpha = col.alpha ?? 1;
  // Hauteur du volume (en pixels écran) : un peu plus haute pour les grands bâtiments.
  const H = kind === 'chantier' ? 10 : kind === 'puits' ? 14 : 22 + Math.min(fw, fh) * 6;
  // Demi-largeur/demi-hauteur du losange de base, dépend du footprint.
  const hw = (TILE_W / 2) * Math.max(fw, fh) * 0.85;
  const hh = (TILE_H / 2) * Math.max(fw, fh) * 0.85;
  const dark = (hex: number) => {
    const r = ((hex >> 16) & 0xff) * 0.72;
    const g = ((hex >> 8) & 0xff) * 0.72;
    const b = (hex & 0xff) * 0.72;
    return ((r & 0xff) << 16) | ((g & 0xff) << 8) | (b & 0xff);
  };

  // Lower = faces visibles (gauche + droite). Les faces partent du sol (y=0) vers -H.
  const lower = new Container();
  const g = new Graphics();
  // Face gauche (assombrie).
  g.poly([-hw, 0, 0, hh, 0, -H + hh, -hw, -H]).fill({ color: dark(col.wall), alpha });
  // Face droite (couleur pleine).
  g.poly([hw, 0, 0, hh, 0, -H + hh, hw, -H]).fill({ color: col.wall, alpha });
  // Quelques lignes d'aspect (planches/joints) sur la face avant pour la lisibilité.
  g.moveTo(-hw + 2, -H + hh / 2).lineTo(0, hh / 2).stroke({ color: 0x000000, alpha: 0.15, width: 1 });
  lower.addChild(g);

  // Upper = toit (losange surélevé). Va dans overheadLayer → toujours par-dessus agents.
  const upper = new Container();
  const r = new Graphics();
  r.poly([0, -H - hh, hw, -H, 0, -H + hh, -hw, -H]).fill({ color: col.roof, alpha });
  // Petite cheminée pour les maisons / fours, pour le charme.
  if ((kind === 'maison' || kind === 'four') && fh >= 2) {
    r.rect(hw * 0.35, -H - hh - 6, 6, 8).fill({ color: 0x4a3a30, alpha });
  }
  upper.addChild(r);
  return { lower, upper, baseY: hh };
}

function agentColor(id: number): number {
  const palette = [0xff6b6b, 0xffd166, 0x06d6a0, 0x4d96ff, 0xc77dff, 0xff9f1c, 0x8ac926, 0xff5d8f];
  return palette[id % palette.length]!;
}

const nameStyle = new TextStyle({ fontFamily: 'sans-serif', fontSize: 11, fill: 0xffffff, stroke: { color: 0x000000, width: 3 } });
const bubbleStyle = new TextStyle({ fontFamily: 'sans-serif', fontSize: 11, fill: 0xfff3b0, stroke: { color: 0x000000, width: 3 }, wordWrap: true, wordWrapWidth: 160, align: 'center' });
