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

## Pièges connus

- `pnpm codegen` requiert `flatc` (apt : `flatbuffers-compiler`). Le code généré est commité.
- Le LLM en navigateur est volontairement désactivé (CORS/clé) : la qualité « dialogues »
  se teste via le serveur + Ollama. Le worker reste pleinement jouable sans LLM.
- `vite.config.ts` `base` doit matcher le nom du dépôt pour Pages.
