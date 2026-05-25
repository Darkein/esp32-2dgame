# CLAUDE.md — Village d'IA (jeu de vie isométrique 2D)

Guide pour reprendre le développement. Lis aussi `ROADMAP.md` pour l'état d'avancement.

## Vision

Jeu 2D isométrique dans l'esprit Minecraft, **peuplé uniquement d'IA** (pas de joueur dans
le monde). Les IA ont des besoins (dormir, manger, travailler, se loger), des aspirations,
craftent, et **dialoguent en français**. Architecture **type MMO** : le monde + les IA
tournent côté serveur ; les clients (**web/PC** et **ESP32-S3 Touch**) ne font qu'afficher
et contrôler. L'utilisateur peut parler aux IA (texte / voix) et leur donner des ordres
qu'elles suivent *ou non* selon leur personnalité.

## Décisions d'architecture (importantes)

1. **IA hybride** (modèle Generative Agents). La latence « < 0,5 s par action » est garantie
   par une **couche rapide déterministe** (besoins + utilité/GOAP, sub-ms). Le **LLM est
   asynchrone et jamais bloquant** : il fixe objectifs/aspirations et génère les dialogues.
   → `packages/sim-core/src/ai/{needs,utility,orchestrator,memory}.ts`.
2. **Cœur de simulation runtime-agnostique** (`@game/sim-core`) : tourne **à l'identique**
   côté serveur Node **et** dans un **Web Worker du navigateur**. C'est ce qui permet de
   tester le jeu **entièrement depuis GitHub Pages, sans rien lancer en local**.
3. **Protocole** : `packages/protocol/schema/world.fbs` (FlatBuffers) est la **source de
   vérité cross-langage**, d'où l'on génère le TS (web/serveur) et le **C++ (ESP32)** via
   `pnpm codegen`. Au runtime v1, les messages transitent en JSON (types miroir dans
   `protocol/src/types.ts`) ; la migration vers le binaire FlatBuffers sur WebSocket est un
   item de la ROADMAP (utile surtout pour l'ESP32).
4. **LLM pluggable** (`@game/llm`) : `OllamaProvider` (local, défaut) ou `CloudProvider`
   (API compatible OpenAI). `resolveProvider()` choisit le meilleur dispo, sinon `null`
   (le jeu reste jouable, fast-layer seul). Le worker navigateur tourne sans LLM.
5. **Voix par IA** : chaque agent a un `voiceProfile`. Web (démo) : Web Speech, voix FR
   distinctes. Serveur/ESP32 : **Piper** (PCM, lecture multi-canaux, vraie simultanéité) —
   phase 6.

## Structure

- `packages/protocol` — schéma `.fbs` + code généré (`src/gen`, `firmware/esp32/src/gen`) +
  types de domaine TS (`src/types.ts`) + profils vocaux + version protocole.
- `packages/sim-core` — monde, horloge jour/nuit, entités, besoins, IA hybride, `Simulation`.
- `packages/llm` — interface `LLMProvider` + Ollama + cloud + `resolveProvider`.
- `packages/server` — héberge `sim-core`, serveur WebSocket, boucle de tick, (futur) voix.
- `packages/web-client` — client thin PixiJS : rendu iso, caméra, HUD, chat, voix. Transport
  `WorkerTransport` (sim locale) ou `WebSocketTransport` (serveur distant, `?server=ws://…`).
- `firmware/esp32` — client embarqué (stub + code C++ généré). Phase 8.

## Commandes

```bash
pnpm install
pnpm codegen        # régénère TS + C++ depuis world.fbs (nécessite flatc)
pnpm typecheck      # tsc --noEmit sur tout le monorepo
pnpm test           # Vitest (sim-core)
pnpm dev:web        # client web en dev (mode worker par défaut) -> http://localhost:5173
pnpm build:web      # build statique (-> packages/web-client/dist), base /esp32-2dgame/
pnpm dev:server     # serveur WebSocket (port 8787) ; relit OLLAMA_URL / LLM_API_KEY
```

Tester le client contre le serveur : lancer `pnpm dev:server` puis ouvrir
`http://localhost:5173/?server=ws://localhost:8787`.

Variables d'env serveur : `PORT`, `TPS`, `AGENTS`, `OLLAMA_URL`, `OLLAMA_MODEL`,
`LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL`.

## CI / Déploiement

- `.github/workflows/ci.yml` : typecheck + tests + build à chaque push/PR.
- `.github/workflows/deploy-pages.yml` : build + **déploiement GitHub Pages automatique**
  (échoue si typecheck/tests rouges). **À configurer une fois** : repo Settings → Pages →
  Source = « GitHub Actions ». URL : `https://darkein.github.io/esp32-2dgame/`.

## Conventions

- TypeScript strict, ESM, `verbatimModuleSyntax`. Imports cross-package via `@game/*`
  (résolus en source, pas de build intermédiaire).
- Les paquets `@game/*` sont consommés en **source** (tsx/vite/vitest) ; pas d'émission TS.
- Commentaires en français, sobres (le « pourquoi », pas le « quoi »).
- Le cœur de sim doit rester **sans dépendance Node/DOM** (il tourne dans un Worker).

## Monde, bâtiments & marche (phase 7.5)

- **Monde** : 128×128 côté web/serveur, 48×48 par défaut dans `sim-core` (tests rapides).
  3 hameaux pré-amorcés (`Simulation.seedVillages`) ; chaque agent appartient à un village
  (`Agent.village`), s'y installe et y bâtit.
- **Bâtiments multi-tuiles** : `BuildingState.footprint` (w,h) + `BuildingState.door` (tuile
  d'entrée monde). Les formes vivent dans `catalog.BUILDING_SHAPES`. Au sein du footprint,
  **toutes les tuiles sont bloquantes sauf la porte**. Un chantier réserve d'emblée la
  forme finale (`World.addBuilding(kind, pos, owner, asShapeOf)`).
- **`World.walkable`** lit un bitset `blocked[]` mis à jour à chaque pose/finition de
  bâtiment ; `buildingAt(x,y)` est O(1) via un index tuile → id.
- **Pathfinding** : `findPath(world, from, to)` (A* 8 directions, coût par
  `TILE_MOVE_COST`, borné ~5000 nœuds). Les agents stockent leur chemin (`Agent.path` +
  `pathIdx`) et le rejouent waypoint par waypoint dans `Simulation.stepMovement`.
- **Chemins émergents** : à chaque changement de tuile entière, `World.stampWear`
  incrémente un compteur sur grass/dirt ; au seuil (`PATH_WEAR_THRESHOLD`), la tuile
  bascule en `path` (coût de marche divisé). `World.pavePath(x,y)` reste disponible pour
  une pose explicite (recette future).
- **Rendu** : 4 calques `tileLayer` → `propLayer` → `agentLayer` → `overheadLayer`.
  Arbres et bâtiments suivent le **flag ★ de RPG Maker** : partie basse (tronc / murs)
  triée Y comme les agents, partie haute (frondaison / toit) toujours dessinée
  **par-dessus**. La collision est régie par le footprint ; le découpage haut/bas est
  purement visuel.

## Faune (phase 15)

- **Animaux** (`packages/sim-core/src/wildlife.ts`) : `Animal` léger (pos, hp, fuite,
  cooldown morsure). 5 espèces — cerf/lapin/sanglier/loup (forêt + grass) et poisson
  (eau). Spawnés au boot selon `WILDLIFE_DENSITY`, plafonnés par `WILDLIFE_HARD_CAP`,
  respawn périodique via `maintainWildlife`. RNG dédié (`wildlifeRng`) pour ne pas
  perturber les autres sous-systèmes (déterminisme préservé).
- **Chasse / pêche** : nouveaux métiers `chasseur` / `pecheur` (`assignJob` les attribue
  selon la personnalité). Activités dédiées `hunting` / `fishing` (cf. `ActivityKind`),
  drop `viande`/`peau`/`poisson` — déclarés dans `BASE_PRICE` et `FOOD_SATIETY`.
- **Loup** : modèle d'attaque *discret* (morsure unique `WOLF_BITE_DAMAGE` + cooldown
  `WOLF_BITE_COOLDOWN_SECONDS`) — robuste à la compression du temps. N'attaque que la
  nuit, uniquement un agent isolé (aucun voisin dans `ISOLATION_RADIUS`) et éveillé.
- **Sprites** : système 4-directionnel générique dans `packages/web-client/src/sprites/`
  (`character-sprite.ts` + `character-view.ts`). Pixel-art authoré comme palette + grilles
  de chars hex ; `compile` rend les `Texture` PixiJS au boot via `initAnimalSprites`.
  L'API (`CharacterView`, `inferDirection`, `mirrorLeftRight`) est conçue pour servir
  aussi aux agents lors d'une future migration.

## Pièges connus

- `pnpm codegen` requiert `flatc` (apt : `flatbuffers-compiler`). Le code généré est commité.
- Le LLM en navigateur est volontairement désactivé (CORS/clé) : la qualité « dialogues »
  se teste via le serveur + Ollama. Le worker reste pleinement jouable sans LLM.
- `vite.config.ts` `base` doit matcher le nom du dépôt pour Pages.
