// Définitions pixel-art 4-directionnelles pour les 5 espèces de la Phase 15.
// Chaque sprite est authoré ici (palette + frames sous forme de grilles de chars
// hex). `compile()` les transforme en textures PixiJS au boot du renderer.
//
// Convention de la palette : 16 indices max (chars `0-9a-f`), index 0 = transparent
// (les frames utilisent `' '` pour la transparence, jamais `'0'`).
//
// Mirror : pour des silhouettes symétriques (cerf, lapin, sanglier, loup), on
// n'authore que `right` et `compile()` génère `left` en miroir horizontal. Les
// vues `up` et `down` sont distinctes (dos vs face).

import type { AnimalKind } from '@game/protocol';
import { compile, type CharacterSpriteDef, type CompiledSprite } from './character-sprite';

// --- Cerf ------------------------------------------------------------------
// 14x12. Brun corps + ventre clair + bois sombre. Walk = oscillation des pattes
// d'1 pixel entre frames 0/2 (alignées) et 1/3 (écartées).

const CERF_PALETTE = [
  0x000000, // 0 transparent
  0x7a4a23, // 1 brun corps
  0xb88860, // 2 ventre clair
  0x3a2410, // 3 bois sombre
  0x000000, // 4 contour noir
  0xeae0c4, // 5 museau / sabots clairs (peu utilisé)
];

const CERF: CharacterSpriteDef = {
  palette: CERF_PALETTE,
  fps: { walk: 6 },
  anchorY: 0.95,
  width: 14,
  height: 12,
  mirrorLeftRight: true,
  defaultAnimation: 'walk',
  animations: {
    walk: {
    right: [
      [
        '            33',
        '          3333',
        '      11111111',
        '    1111111111',
        '   111122211111',
        '   122222222211',
        '    222222222 ',
        '    22  22 22 ',
        '    44  44  4 ',
        '    44  44  4 ',
        '              ',
        '              ',
      ],
      [
        '            33',
        '          3333',
        '      11111111',
        '    1111111111',
        '   111122211111',
        '   122222222211',
        '    222222222 ',
        '    2 2 2 22 ',
        '    4 4 4  4 ',
        '    4 4 4  4 ',
        '              ',
        '              ',
      ],
      [
        '            33',
        '          3333',
        '      11111111',
        '    1111111111',
        '   111122211111',
        '   122222222211',
        '    222222222 ',
        '    22  22 22 ',
        '    44  44  4 ',
        '    44  44  4 ',
        '              ',
        '              ',
      ],
      [
        '            33',
        '          3333',
        '      11111111',
        '    1111111111',
        '   111122211111',
        '   122222222211',
        '    222222222 ',
        '     22 22 2  ',
        '     4 4 4  4 ',
        '     4 4 4  4 ',
        '              ',
        '              ',
      ],
    ],
    left: [], // généré par mirror
    up: [
      [
        '     3  3    ',
        '    33  33   ',
        '     1111    ',
        '    111111   ',
        '   11111111  ',
        '   11111111  ',
        '   11111111  ',
        '   11111111  ',
        '    4    4   ',
        '    4    4   ',
        '             ',
        '             ',
      ],
      [
        '     3  3    ',
        '    33  33   ',
        '     1111    ',
        '    111111   ',
        '   11111111  ',
        '   11111111  ',
        '   11111111  ',
        '   11111111  ',
        '    4 4 4    ',
        '    4 4 4    ',
        '             ',
        '             ',
      ],
      [
        '     3  3    ',
        '    33  33   ',
        '     1111    ',
        '    111111   ',
        '   11111111  ',
        '   11111111  ',
        '   11111111  ',
        '   11111111  ',
        '    4    4   ',
        '    4    4   ',
        '             ',
        '             ',
      ],
      [
        '     3  3    ',
        '    33  33   ',
        '     1111    ',
        '    111111   ',
        '   11111111  ',
        '   11111111  ',
        '   11111111  ',
        '   11111111  ',
        '     4  4    ',
        '     4  4    ',
        '             ',
        '             ',
      ],
    ],
    down: [
      [
        '     3  3    ',
        '    33  33   ',
        '    144441   ',
        '   14444441  ',
        '  111554441  ',
        '  111111111  ',
        '   1111111   ',
        '   2222222   ',
        '    4    4   ',
        '    4    4   ',
        '             ',
        '             ',
      ],
      [
        '     3  3    ',
        '    33  33   ',
        '    144441   ',
        '   14444441  ',
        '  111554441  ',
        '  111111111  ',
        '   1111111   ',
        '   2222222   ',
        '    4 4 4    ',
        '    4 4 4    ',
        '             ',
        '             ',
      ],
      [
        '     3  3    ',
        '    33  33   ',
        '    144441   ',
        '   14444441  ',
        '  111554441  ',
        '  111111111  ',
        '   1111111   ',
        '   2222222   ',
        '    4    4   ',
        '    4    4   ',
        '             ',
        '             ',
      ],
      [
        '     3  3    ',
        '    33  33   ',
        '    144441   ',
        '   14444441  ',
        '  111554441  ',
        '  111111111  ',
        '   1111111   ',
        '   2222222   ',
        '     4  4    ',
        '     4  4    ',
        '             ',
        '             ',
      ],
    ],
    },
  },
};

// --- Lapin -----------------------------------------------------------------
// 10x10. Blanc cassé, longues oreilles, animation de saut.

const LAPIN_PALETTE = [
  0x000000, // 0 transparent
  0xe0d6c4, // 1 corps
  0xb8a890, // 2 ombre
  0xff6f8a, // 3 nez rose
  0x222222, // 4 œil
];

const LAPIN: CharacterSpriteDef = {
  palette: LAPIN_PALETTE,
  fps: { walk: 6 },
  anchorY: 0.95,
  width: 10,
  height: 10,
  mirrorLeftRight: true,
  defaultAnimation: 'walk',
  animations: {
    walk: {
    right: [
      [ // au sol
        '          ',
        ' 11    1  ',
        ' 11   11  ',
        '   1111   ',
        '  111111  ',
        ' 11111114 ',
        ' 22222222 ',
        '  2    2  ',
        '  2    2  ',
        '          ',
      ],
      [ // saut bas
        '          ',
        ' 11    1  ',
        ' 11   11  ',
        '   1111   ',
        '  111111  ',
        ' 11111114 ',
        ' 22222222 ',
        '  22  22  ',
        '          ',
        '          ',
      ],
      [
        '          ',
        ' 11    1  ',
        ' 11   11  ',
        '   1111   ',
        '  111111  ',
        ' 11111114 ',
        ' 22222222 ',
        '  2    2  ',
        '  2    2  ',
        '          ',
      ],
      [ // saut haut
        ' 11    1  ',
        ' 11   11  ',
        '   1111   ',
        '  111111  ',
        ' 11111114 ',
        ' 22222222 ',
        '   2  2   ',
        '          ',
        '          ',
        '          ',
      ],
    ],
    left: [],
    up: [
      [
        ' 1    1   ',
        ' 1    1   ',
        '  1111    ',
        ' 111111   ',
        ' 111111   ',
        '  2222    ',
        '  2  2    ',
        '          ',
        '          ',
        '          ',
      ],
      [
        ' 1    1   ',
        ' 1    1   ',
        '  1111    ',
        ' 111111   ',
        ' 111111   ',
        '  2222    ',
        '  2  2    ',
        '   22     ',
        '          ',
        '          ',
      ],
      [
        ' 1    1   ',
        ' 1    1   ',
        '  1111    ',
        ' 111111   ',
        ' 111111   ',
        '  2222    ',
        '  2  2    ',
        '          ',
        '          ',
        '          ',
      ],
      [
        ' 1    1   ',
        ' 1    1   ',
        '  1111    ',
        ' 111111   ',
        ' 111111   ',
        '  2222    ',
        '   22     ',
        '          ',
        '          ',
        '          ',
      ],
    ],
    down: [
      [
        ' 1    1   ',
        ' 1    1   ',
        '  4114    ',
        ' 113311   ',
        ' 111111   ',
        '  2222    ',
        '  2  2    ',
        '          ',
        '          ',
        '          ',
      ],
      [
        ' 1    1   ',
        ' 1    1   ',
        '  4114    ',
        ' 113311   ',
        ' 111111   ',
        '  2222    ',
        '   22     ',
        '          ',
        '          ',
        '          ',
      ],
      [
        ' 1    1   ',
        ' 1    1   ',
        '  4114    ',
        ' 113311   ',
        ' 111111   ',
        '  2222    ',
        '  2  2    ',
        '          ',
        '          ',
        '          ',
      ],
      [
        ' 1    1   ',
        ' 1    1   ',
        '  4114    ',
        ' 113311   ',
        ' 111111   ',
        '  2222    ',
        '   22     ',
        '          ',
        '          ',
        '          ',
      ],
    ],
    },
  },
};

// --- Sanglier --------------------------------------------------------------
// 14x10. Dos sombre + ventre roux + défenses claires.

const SANGLIER_PALETTE = [
  0x000000, // 0 transparent
  0x3a2418, // 1 dos sombre
  0x6e3a1a, // 2 ventre roux
  0xd8c89a, // 3 défense ivoire
  0x000000, // 4 contour
  0xa86a32, // 5 crinière dorsale
];

const SANGLIER: CharacterSpriteDef = {
  palette: SANGLIER_PALETTE,
  fps: { walk: 5 },
  anchorY: 0.95,
  width: 14,
  height: 10,
  mirrorLeftRight: true,
  defaultAnimation: 'walk',
  animations: {
    walk: {
    right: [
      [
        '              ',
        '     555555   ',
        '    1111111133',
        '   1111111111 ',
        '   2222222222 ',
        '   2222222222 ',
        '   44  44 44  ',
        '   44  44 44  ',
        '              ',
        '              ',
      ],
      [
        '              ',
        '     555555   ',
        '    1111111133',
        '   1111111111 ',
        '   2222222222 ',
        '   2222222222 ',
        '    4 4 4 4   ',
        '    4 4 4 4   ',
        '              ',
        '              ',
      ],
      [
        '              ',
        '     555555   ',
        '    1111111133',
        '   1111111111 ',
        '   2222222222 ',
        '   2222222222 ',
        '   44  44 44  ',
        '   44  44 44  ',
        '              ',
        '              ',
      ],
      [
        '              ',
        '     555555   ',
        '    1111111133',
        '   1111111111 ',
        '   2222222222 ',
        '   2222222222 ',
        '    4 4 4 4   ',
        '    4 4 4 4   ',
        '              ',
        '              ',
      ],
    ],
    left: [],
    up: [
      [
        '              ',
        '    555555    ',
        '   11111111   ',
        '  1111111111  ',
        '  1111111111  ',
        '  2222222222  ',
        '   4      4   ',
        '   4      4   ',
        '              ',
        '              ',
      ],
      [
        '              ',
        '    555555    ',
        '   11111111   ',
        '  1111111111  ',
        '  1111111111  ',
        '  2222222222  ',
        '    4    4    ',
        '    4    4    ',
        '              ',
        '              ',
      ],
      [
        '              ',
        '    555555    ',
        '   11111111   ',
        '  1111111111  ',
        '  1111111111  ',
        '  2222222222  ',
        '   4      4   ',
        '   4      4   ',
        '              ',
        '              ',
      ],
      [
        '              ',
        '    555555    ',
        '   11111111   ',
        '  1111111111  ',
        '  1111111111  ',
        '  2222222222  ',
        '    4    4    ',
        '    4    4    ',
        '              ',
        '              ',
      ],
    ],
    down: [
      [
        '              ',
        '    555555    ',
        '   11111111   ',
        '  1133333311  ',
        '  1144114411  ',
        '  2222222222  ',
        '   4      4   ',
        '   4      4   ',
        '              ',
        '              ',
      ],
      [
        '              ',
        '    555555    ',
        '   11111111   ',
        '  1133333311  ',
        '  1144114411  ',
        '  2222222222  ',
        '    4    4    ',
        '    4    4    ',
        '              ',
        '              ',
      ],
      [
        '              ',
        '    555555    ',
        '   11111111   ',
        '  1133333311  ',
        '  1144114411  ',
        '  2222222222  ',
        '   4      4   ',
        '   4      4   ',
        '              ',
        '              ',
      ],
      [
        '              ',
        '    555555    ',
        '   11111111   ',
        '  1133333311  ',
        '  1144114411  ',
        '  2222222222  ',
        '    4    4    ',
        '    4    4    ',
        '              ',
        '              ',
      ],
    ],
    },
  },
};

// --- Loup ------------------------------------------------------------------
// 14x10. Gris foncé + ventre gris clair, queue plumée, museau pointu.

const LOUP_PALETTE = [
  0x000000, // 0 transparent
  0x4a4a4a, // 1 dos gris foncé
  0x7a7a7a, // 2 ventre gris clair
  0xf0e066, // 3 œil jaune
  0x000000, // 4 contour
  0xc7c7c7, // 5 dents claires
];

const LOUP: CharacterSpriteDef = {
  palette: LOUP_PALETTE,
  fps: { walk: 6 },
  anchorY: 0.95,
  width: 14,
  height: 10,
  mirrorLeftRight: true,
  defaultAnimation: 'walk',
  animations: {
    walk: {
    right: [
      [
        '              ',
        '11           1',
        '111111111111  ',
        ' 111111111111 ',
        ' 122222222221 ',
        '  2222222222  ',
        '  44  44 4 4  ',
        '  44  44 4 4  ',
        '              ',
        '              ',
      ],
      [
        '              ',
        '11            ',
        '111111111111 1',
        ' 1111111111111',
        ' 122222222221 ',
        '  2222222222  ',
        '   4 4 4  4   ',
        '   4 4 4  4   ',
        '              ',
        '              ',
      ],
      [
        '              ',
        '11           1',
        '111111111111  ',
        ' 111111111111 ',
        ' 122222222221 ',
        '  2222222222  ',
        '  44  44 4 4  ',
        '  44  44 4 4  ',
        '              ',
        '              ',
      ],
      [
        '              ',
        '11            ',
        '111111111111 1',
        ' 1111111111111',
        ' 122222222221 ',
        '  2222222222  ',
        '   4 4 4  4   ',
        '   4 4 4  4   ',
        '              ',
        '              ',
      ],
    ],
    left: [],
    up: [
      [
        '   1      1   ',
        '   11    11   ',
        '   11111111   ',
        '  1111111111  ',
        '  1111111111  ',
        '  2222222222  ',
        '   4      4   ',
        '   4      4   ',
        '              ',
        '              ',
      ],
      [
        '   1      1   ',
        '   11    11   ',
        '   11111111   ',
        '  1111111111  ',
        '  1111111111  ',
        '  2222222222  ',
        '    4    4    ',
        '    4    4    ',
        '              ',
        '              ',
      ],
      [
        '   1      1   ',
        '   11    11   ',
        '   11111111   ',
        '  1111111111  ',
        '  1111111111  ',
        '  2222222222  ',
        '   4      4   ',
        '   4      4   ',
        '              ',
        '              ',
      ],
      [
        '   1      1   ',
        '   11    11   ',
        '   11111111   ',
        '  1111111111  ',
        '  1111111111  ',
        '  2222222222  ',
        '    4    4    ',
        '    4    4    ',
        '              ',
        '              ',
      ],
    ],
    down: [
      [
        '   1      1   ',
        '   11    11   ',
        '   13    31   ',
        '  1111111111  ',
        '  1155551111  ',
        '  2222222222  ',
        '   4      4   ',
        '   4      4   ',
        '              ',
        '              ',
      ],
      [
        '   1      1   ',
        '   11    11   ',
        '   13    31   ',
        '  1111111111  ',
        '  1155551111  ',
        '  2222222222  ',
        '    4    4    ',
        '    4    4    ',
        '              ',
        '              ',
      ],
      [
        '   1      1   ',
        '   11    11   ',
        '   13    31   ',
        '  1111111111  ',
        '  1155551111  ',
        '  2222222222  ',
        '   4      4   ',
        '   4      4   ',
        '              ',
        '              ',
      ],
      [
        '   1      1   ',
        '   11    11   ',
        '   13    31   ',
        '  1111111111  ',
        '  1155551111  ',
        '  2222222222  ',
        '    4    4    ',
        '    4    4    ',
        '              ',
        '              ',
      ],
    ],
    },
  },
};

// --- Poisson ---------------------------------------------------------------
// 12x6. Bleu argent, nageoires asymétriques entre 2 frames. Vit en eau : pas de
// notion réelle de direction haut/bas — on duplique sur up/down.

const POISSON_PALETTE = [
  0x000000, // 0 transparent
  0x6aa9d6, // 1 bleu
  0xc0d4e5, // 2 ventre argenté
  0x222222, // 3 œil
];

const POISSON_RIGHT_0 = [
  '            ',
  '   11111    ',
  '  11111111  ',
  ' 211111113 1',
  '  22222221  ',
  '   222      ',
];
const POISSON_RIGHT_1 = [
  '            ',
  '  11111  1  ',
  '  11111111  ',
  ' 211111113 1',
  '  222222111 ',
  '   2222     ',
];
const POISSON_UP = [
  '            ',
  '    1111    ',
  '   111111   ',
  '   113311   ',
  '   222222   ',
  '   2    2   ',
];

const POISSON: CharacterSpriteDef = {
  palette: POISSON_PALETTE,
  fps: { walk: 4 },
  anchorY: 0.7,
  width: 12,
  height: 6,
  mirrorLeftRight: true,
  defaultAnimation: 'walk',
  animations: {
    walk: {
      right: [POISSON_RIGHT_0, POISSON_RIGHT_1],
      left: [],
      up: [POISSON_UP, POISSON_UP],
      down: [POISSON_UP, POISSON_UP],
    },
  },
};

export const ANIMAL_SPRITE_DEFS: Record<AnimalKind, CharacterSpriteDef> = {
  cerf: CERF,
  lapin: LAPIN,
  sanglier: SANGLIER,
  loup: LOUP,
  poisson: POISSON,
};

let compiled: Record<AnimalKind, CompiledSprite> | null = null;

/** Compile toutes les définitions en `Texture`. À appeler une fois côté navigateur. */
export function initAnimalSprites(): Record<AnimalKind, CompiledSprite> {
  if (compiled) return compiled;
  compiled = {
    cerf: compile(CERF),
    lapin: compile(LAPIN),
    sanglier: compile(SANGLIER),
    loup: compile(LOUP),
    poisson: compile(POISSON),
  };
  return compiled;
}

export function animalSprites(): Record<AnimalKind, CompiledSprite> {
  if (!compiled) throw new Error('initAnimalSprites() doit être appelé une fois au boot.');
  return compiled;
}
