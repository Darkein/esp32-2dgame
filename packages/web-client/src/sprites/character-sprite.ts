// Système de sprites pixel-art 4-directionnels, générique (faune + agents). Une
// définition = une palette indexée + un ensemble d'animations nommées (idle, walk,
// busy, sleep…), chaque animation contenant des frames par direction. La compilation
// produit des `Texture` PixiJS (NEAREST, sans mipmap). Aucun asset externe.

import { Texture } from 'pixi.js';

export type Direction = 'up' | 'down' | 'left' | 'right';

export const DIRECTIONS: Direction[] = ['up', 'down', 'left', 'right'];

export type AnimationFrames = Record<Direction, string[][]>;

export interface CharacterSpriteDef {
  /** Palette indexée. L'index 0 est toujours transparent (`' '` dans les frames). */
  palette: number[];
  /** Ensemble d'animations nommées (`walk`, `idle`, `busy`, `sleep`, …).
   *  Chaque animation a ses frames pour les 4 directions. */
  animations: Record<string, AnimationFrames>;
  /** Cadence (fps) par animation. Une animation absente de cette table tournera à 6 fps. */
  fps?: Partial<Record<string, number>>;
  /** Si vrai, les frames `left` de chaque animation sont générées en miroir des `right`. */
  mirrorLeftRight?: boolean;
  /** Ancre verticale 0..1 du sprite : 1 = pied posé sur la tuile, 0.5 = centre. */
  anchorY: number;
  /** Largeur en pixels d'une frame. */
  width: number;
  /** Hauteur en pixels d'une frame. */
  height: number;
  /** Nom de l'animation par défaut au démarrage. */
  defaultAnimation: string;
}

export interface CompiledAnimation {
  textures: Record<Direction, Texture[]>;
  fps: number;
}

export interface CompiledSprite {
  animations: Record<string, CompiledAnimation>;
  defaultAnimation: string;
  anchorY: number;
  width: number;
  height: number;
}

const DEFAULT_FPS = 6;

/** Compile une définition en textures PixiJS prêtes à être passées à `AnimatedSprite`. */
export function compile(def: CharacterSpriteDef): CompiledSprite {
  const out: Record<string, CompiledAnimation> = {};
  for (const [name, frames] of Object.entries(def.animations)) {
    out[name] = compileAnimation(def, frames);
    out[name].fps = def.fps?.[name] ?? DEFAULT_FPS;
  }
  return {
    animations: out,
    defaultAnimation: def.defaultAnimation,
    anchorY: def.anchorY,
    width: def.width,
    height: def.height,
  };
}

function compileAnimation(def: CharacterSpriteDef, frames: AnimationFrames): CompiledAnimation {
  const textures: Record<Direction, Texture[]> = {
    up: [], down: [], left: [], right: [],
  };
  for (const dir of DIRECTIONS) {
    let src = frames[dir];
    if (def.mirrorLeftRight && dir === 'left' && (src?.length ?? 0) === 0) {
      src = (frames.right ?? []).map((f) => f.map((row) => row.split('').reverse().join('')));
    } else if (def.mirrorLeftRight && dir === 'right' && (src?.length ?? 0) === 0) {
      src = (frames.left ?? []).map((f) => f.map((row) => row.split('').reverse().join('')));
    }
    for (const frame of src ?? []) {
      textures[dir].push(gridToTexture(def.palette, frame, def.width, def.height));
    }
  }
  return { textures, fps: DEFAULT_FPS };
}

/** Convertit une grille (lignes de caractères) en `Texture` NEAREST. Convention :
 *  chaque caractère `0-9a-f` est un index de palette (0..15) ; `' '` et `'.'` sont
 *  transparents. */
function gridToTexture(palette: number[], grid: string[], w: number, h: number): Texture {
  const canvas = makeCanvas(w, h);
  const ctx = canvas.getContext('2d')! as CanvasRenderingContext2D;
  ctx.clearRect(0, 0, w, h);
  for (let y = 0; y < grid.length && y < h; y++) {
    const row = grid[y]!;
    for (let x = 0; x < row.length && x < w; x++) {
      const idx = paletteIndex(row[x]!);
      if (idx < 0) continue;
      const color = palette[idx];
      if (color == null) continue;
      ctx.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  const tex = Texture.from(canvas as HTMLCanvasElement);
  tex.source.scaleMode = 'nearest';
  return tex;
}

/** Index palette à partir d'un caractère `0-9a-f` (0..15) ; -1 = transparent. */
function paletteIndex(ch: string): number {
  const c = ch.charCodeAt(0);
  if (c >= 48 && c <= 57) return c - 48;           // '0'..'9' → 0..9
  if (c >= 97 && c <= 102) return c - 97 + 10;     // 'a'..'f' → 10..15
  if (c >= 65 && c <= 70) return c - 65 + 10;      // 'A'..'F' → 10..15
  return -1;                                       // ' ', '.', tout le reste
}

/** Bascule OffscreenCanvas (si dispo) → HTMLCanvasElement (test/node-less DOM). */
function makeCanvas(w: number, h: number): HTMLCanvasElement | OffscreenCanvas {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/** Déduit la direction d'un déplacement (delta tuiles). Préserve la précédente sous
 *  un petit seuil pour éviter le scintillement (anti-jitter). */
export function inferDirection(dx: number, dy: number, fallback: Direction): Direction {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (ax < 0.02 && ay < 0.02) return fallback;
  if (ax > ay) return dx > 0 ? 'right' : 'left';
  return dy > 0 ? 'down' : 'up';
}
