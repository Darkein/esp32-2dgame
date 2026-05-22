# ROADMAP

État d'avancement par phases. Cocher au fur et à mesure. Voir `CLAUDE.md` pour l'architecture.

## ✅ Phase 0 — Fondations, outillage & CI
- [x] Monorepo pnpm + TypeScript strict + Vitest
- [x] Schéma `protocol/schema/world.fbs` + codegen `flatc` (TS + C++)
- [x] `CLAUDE.md` + `ROADMAP.md`
- [x] CI : typecheck + tests + build (`ci.yml`)
- [x] Déploiement GitHub Pages automatique (`deploy-pages.yml`)
  - [ ] **À faire une fois côté GitHub** : Settings → Pages → Source = GitHub Actions

## ✅ Phase 1 — Cœur de simulation (`sim-core`, runtime-agnostique)
- [x] Grille isométrique + génération procédurale (eau, forêts, champs)
- [x] Cycle jour/nuit (`SimClock`)
- [x] Entités, boucle de tick, RNG déterministe
- [x] Crafting/récolte minimal (champs = source de nourriture)  ← *à enrichir (Phase 7)*
- [x] Tests unitaires

## ✅ Phase 2 — Client web + transport double + Pages
- [x] Rendu isométrique PixiJS, caméra pan/zoom, tactile
- [x] Transport `WorkerTransport` (démo Pages) et `WebSocketTransport` (serveur)
- [x] Interpolation des positions, éclairage jour/nuit, HUD horloge

## ✅ Phase 3 — IA couche rapide (vie autonome < 0,5 s)
- [x] Besoins décroissants (énergie, faim, social, hygiène, détente)
- [x] Sélection d'action par utilité (dormir la nuit, manger, travailler, socialiser)
- [x] Test de latence de décision

## ✅ Phase 4 — Orchestrateur LLM (objectifs, aspirations, dialogues FR)
- [x] `LLMProvider` pluggable (Ollama local + cloud) + `resolveProvider`
- [x] Orchestrateur par agent, **asynchrone non bloquant** (objectif + biais d'action)
- [x] Flux de mémoire + récupération (récence + importance)
- [x] Dialogues IA↔IA en français (déclenchés par proximité)
- [ ] Embeddings pour la pertinence sémantique du retrieval (amélioration)
- [ ] Réflexions périodiques (synthèse de souvenirs en croyances)

## ✅ Phase 5 — Interaction utilisateur (texte)
- [x] UI chat ciblant une IA + envoi d'ordres
- [x] Évaluation des ordres par l'orchestrateur (accepte/refuse selon personnalité + besoins)
  → `Orchestrator.respondToPlayer` (chemin LLM + repli déterministe hors-ligne)
- [x] Réponse conversationnelle au joueur (`DialogueEvent.listenerId = 0`), questions sur les
  aspirations/humeur, ordre accepté = biais d'action immédiat
- [ ] Mémoire de la relation joueur↔IA dans la durée (affinité persistante)
- [ ] STT pour donner les ordres à la voix (dépend de la Phase 6)

## ⬜ Phase 6 — Voix : par-IA + simultanée (TTS + STT)
- [x] Profils vocaux + Web Speech (démo navigateur, voix FR distinctes)
- [ ] Backend **Piper** côté serveur (PCM) + streaming `AudioEvent`
- [ ] Lecture **multi-canaux** réellement simultanée côté client
- [ ] STT **whisper.cpp** (entrée vocale du joueur)

## ✅ Phase 7 — Profondeur gameplay  *(socle)*
- [x] Inventaire par agent + ressources récoltables (bois/forêt, pierre, blé/champ)
- [x] Récolte ciblée : l'IA va chercher la ressource qui lui manque (`utility.ts`)
- [x] Recettes (`crafting.ts`) : planche, pain, outil ; cuisson du pain mangée pour la faim
- [x] Construction de maisons (coût matériaux) → `AgentState.houses`, affiché au HUD
- [ ] Métiers spécialisés, échanges/économie entre IA, placement libre de bâtiments

## ⬜ Phase 8 — Client ESP32-S3 Touch
- [ ] Projet PlatformIO (LovyanGFX/LVGL), rendu tuiles + UI tactile
- [ ] Client WebSocket + décodage FlatBuffers C++ (code généré présent)
- [ ] Audio I2S (TTS) + micro (STT)
- [ ] Optimisations RAM/PSRAM, zone visible réduite

## Dette / migrations
- [ ] Passer le transport WebSocket au **binaire FlatBuffers** (au lieu de JSON) — clé pour l'ESP32
- [ ] Déploiement d'un serveur hébergé (pour LLM/voix accessibles depuis le web sans poste local)
