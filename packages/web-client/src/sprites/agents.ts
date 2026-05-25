// Sprite « villageois » pixel-art 4-directionnel pour les agents. Un seul modèle
// (silhouette neutre) ; la couleur d'agent est appliquée en `tint` sur le sprite
// entier (tons de vêtements différents par individu).
//
// Animations livrées :
// - `idle`  : 1 frame/direction (debout). Utilisée aussi pour talking/socializing/trading.
// - `walk`  : 4 frames/direction (cycle de jambes). Pour `walking`.
// - `busy`  : 2 frames/direction (bras qui s'agitent). Pour
//             working/crafting/eating/washing/hunting/fishing.
// - `sleep` : 1 frame *non* orientée (pose allongée, vue de dessus). Pour `sleeping`.
//
// Convention palette (10 couleurs max — chars `0-9`) :
//  0 transparent · 1 peau · 2 cheveux · 3 tunique · 4 pantalon · 5 bottes ·
//  6 yeux · 7 ceinture · 8 ombre cheveux · 9 reflet tunique

import type { ActivityKind } from '@game/protocol';
import { compile, type CharacterSpriteDef, type CompiledSprite } from './character-sprite';

const W = 10;
const H = 14;

const PALETTE = [
  0x000000, // 0 transparent
  0xeac7a2, // 1 peau
  0x6b3f1c, // 2 cheveux
  0xffffff, // 3 tunique (sera tintée par agent)
  0x2e3d68, // 4 pantalon
  0x2a1f15, // 5 bottes
  0x202020, // 6 yeux
  0x6b4a26, // 7 ceinture
  0x4a2a10, // 8 ombre cheveux
  0xd0d0d0, // 9 reflet tunique
];

// --- DOWN (face caméra) ----------------------------------------------------

const DOWN_IDLE = [
  '  2222    ',
  ' 822228   ',
  ' 211112   ',
  ' 266162   ',
  ' 211112   ',
  '  1111    ',
  '  3333    ',
  ' 333333   ',
  ' 933339   ',
  '  7777    ',
  '  4444    ',
  '  4  4    ',
  '  5  5    ',
  ' 55  55   ',
];
const DOWN_WALK_A = [
  '  2222    ',
  ' 822228   ',
  ' 211112   ',
  ' 266162   ',
  ' 211112   ',
  '  1111    ',
  '  3333    ',
  ' 333333   ',
  ' 933339   ',
  '  7777    ',
  '  4444    ',
  '  4  4    ',
  '  5   5   ',
  ' 55  55   ',
];
const DOWN_WALK_B = [
  '  2222    ',
  ' 822228   ',
  ' 211112   ',
  ' 266162   ',
  ' 211112   ',
  '  1111    ',
  '  3333    ',
  ' 333333   ',
  ' 933339   ',
  '  7777    ',
  '  4444    ',
  '  4  4    ',
  '   4  4   ',
  '  55  55  ',
];
const DOWN_BUSY_A = [
  '  2222    ',
  ' 822228   ',
  ' 211112   ',
  ' 266162   ',
  ' 211112   ',
  ' 1 11 1   ',
  ' 333333   ',
  ' 933339   ',
  '  7777    ',
  '  4444    ',
  '  4  4    ',
  '  4  4    ',
  '  5  5    ',
  ' 55  55   ',
];
const DOWN_BUSY_B = [
  '  2222    ',
  ' 822228   ',
  ' 211112   ',
  ' 266162   ',
  ' 211112   ',
  '  1111    ',
  ' 133331   ',
  '  3333    ',
  ' 933339   ',
  '  7777    ',
  '  4444    ',
  '  4  4    ',
  '  5  5    ',
  ' 55  55   ',
];

// --- UP (dos) --------------------------------------------------------------

const UP_IDLE = [
  '  2222    ',
  ' 822228   ',
  ' 222222   ',
  ' 282282   ',
  ' 222222   ',
  '  1111    ',
  '  3333    ',
  ' 333333   ',
  ' 933339   ',
  '  7777    ',
  '  4444    ',
  '  4  4    ',
  '  5  5    ',
  ' 55  55   ',
];
const UP_WALK_A = [
  '  2222    ',
  ' 822228   ',
  ' 222222   ',
  ' 282282   ',
  ' 222222   ',
  '  1111    ',
  '  3333    ',
  ' 333333   ',
  ' 933339   ',
  '  7777    ',
  '  4444    ',
  '  4  4    ',
  '  5   5   ',
  ' 55  55   ',
];
const UP_WALK_B = [
  '  2222    ',
  ' 822228   ',
  ' 222222   ',
  ' 282282   ',
  ' 222222   ',
  '  1111    ',
  '  3333    ',
  ' 333333   ',
  ' 933339   ',
  '  7777    ',
  '  4444    ',
  '  4  4    ',
  '   4  4   ',
  '  55  55  ',
];
const UP_BUSY_A = [
  '  2222    ',
  ' 822228   ',
  ' 222222   ',
  ' 282282   ',
  ' 222222   ',
  ' 1 11 1   ',
  ' 333333   ',
  ' 933339   ',
  '  7777    ',
  '  4444    ',
  '  4  4    ',
  '  4  4    ',
  '  5  5    ',
  ' 55  55   ',
];
const UP_BUSY_B = [
  '  2222    ',
  ' 822228   ',
  ' 222222   ',
  ' 282282   ',
  ' 222222   ',
  '  1111    ',
  ' 133331   ',
  '  3333    ',
  ' 933339   ',
  '  7777    ',
  '  4444    ',
  '  4  4    ',
  '  5  5    ',
  ' 55  55   ',
];

// --- RIGHT (profil) --------------------------------------------------------
// (left est généré par miroir horizontal — `mirrorLeftRight: true`)

const RIGHT_IDLE = [
  '   2222   ',
  '  82228   ',
  '  21112   ',
  '  2166 2  ',
  '  21112   ',
  '   111    ',
  '   333    ',
  '  3333    ',
  '  93333   ',
  '   77     ',
  '   44     ',
  '   44     ',
  '   55     ',
  '   55     ',
];
const RIGHT_WALK_A = [
  '   2222   ',
  '  82228   ',
  '  21112   ',
  '  2166 2  ',
  '  21112   ',
  '   111    ',
  '   333    ',
  '  3333    ',
  '  93333   ',
  '   77     ',
  '   44     ',
  '   44     ',
  '   5      ',
  '   555    ',
];
const RIGHT_WALK_B = [
  '   2222   ',
  '  82228   ',
  '  21112   ',
  '  2166 2  ',
  '  21112   ',
  '   111    ',
  '   333    ',
  '  3333    ',
  '  93333   ',
  '   77     ',
  '   44     ',
  '   44     ',
  '     5    ',
  '   555    ',
];
const RIGHT_BUSY_A = [
  '   2222   ',
  '  82228   ',
  '  21112   ',
  '  2166 2  ',
  '  21112   ',
  '   111 1  ',
  '   33333  ',
  '  3333    ',
  '  93333   ',
  '   77     ',
  '   44     ',
  '   44     ',
  '   55     ',
  '   55     ',
];
const RIGHT_BUSY_B = [
  '   2222   ',
  '  82228   ',
  '  21112   ',
  '  2166 2  ',
  '  21112   ',
  '   111    ',
  '   333    ',
  '  3333    ',
  '  93333   ',
  '   771    ',
  '   44     ',
  '   44     ',
  '   55     ',
  '   55     ',
];

// --- SLEEP (allongé, vue de dessus) ---------------------------------------
// 1 frame, identique pour les 4 directions. L'agent est posé sur le sol/lit,
// pieds à gauche, tête à droite ; le tri Y reste géré par le calque.

const SLEEP = [
  '          ',
  '          ',
  '          ',
  '          ',
  '          ',
  '          ',
  '   2222   ',
  ' 5544933  ',
  ' 5544933  ',
  '   3333   ',
  '          ',
  '          ',
  '          ',
  '          ',
];

export const VILLAGER: CharacterSpriteDef = {
  palette: PALETTE,
  fps: { walk: 6, busy: 4, idle: 2, sleep: 1 },
  anchorY: 0.92,
  width: W,
  height: H,
  mirrorLeftRight: true,
  defaultAnimation: 'idle',
  animations: {
    idle: {
      up: [UP_IDLE],
      down: [DOWN_IDLE],
      right: [RIGHT_IDLE],
      left: [],
    },
    walk: {
      up: [UP_IDLE, UP_WALK_A, UP_IDLE, UP_WALK_B],
      down: [DOWN_IDLE, DOWN_WALK_A, DOWN_IDLE, DOWN_WALK_B],
      right: [RIGHT_IDLE, RIGHT_WALK_A, RIGHT_IDLE, RIGHT_WALK_B],
      left: [],
    },
    busy: {
      up: [UP_BUSY_A, UP_BUSY_B],
      down: [DOWN_BUSY_A, DOWN_BUSY_B],
      right: [RIGHT_BUSY_A, RIGHT_BUSY_B],
      left: [],
    },
    sleep: {
      up: [SLEEP],
      down: [SLEEP],
      right: [SLEEP],
      left: [SLEEP],
    },
  },
};

let compiled: CompiledSprite | null = null;

export function initAgentSprites(): CompiledSprite {
  if (!compiled) compiled = compile(VILLAGER);
  return compiled;
}

export function agentSprite(): CompiledSprite {
  if (!compiled) throw new Error('initAgentSprites() doit être appelé une fois au boot.');
  return compiled;
}

/** Mappe une `ActivityKind` à l'animation à jouer. */
export function animationForActivity(activity: ActivityKind): {
  name: string;
  /** Si défini, force une direction fixe (utile pour `sleep` qui n'a qu'une pose). */
  lockedDirection: null;
} {
  switch (activity) {
    case 'walking':
      return { name: 'walk', lockedDirection: null };
    case 'sleeping':
      return { name: 'sleep', lockedDirection: null };
    case 'working':
    case 'crafting':
    case 'eating':
    case 'washing':
    case 'hunting':
    case 'fishing':
    case 'trading':
      return { name: 'busy', lockedDirection: null };
    case 'talking':
    case 'socializing':
    case 'idle':
    default:
      return { name: 'idle', lockedDirection: null };
  }
}

/** Palette de tints par id d'agent (cf. ancienne `agentColor`) — chaque villageois
 *  porte sa propre nuance de tunique. La palette est la même qu'avant pour la
 *  cohérence avec les anciennes captures d'écran / le panneau agent. */
export function agentTint(id: number): number {
  const palette = [0xff6b6b, 0xffd166, 0x06d6a0, 0x4d96ff, 0xc77dff, 0xff9f1c, 0x8ac926, 0xff5d8f];
  return palette[id % palette.length]!;
}
