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

## ✅ Phase 7 — Profondeur gameplay
- [x] Génération **par biomes** (bruit élévation/humidité) : eau, rivages, forêts, montagnes,
  plaines + champs groupés (`world.ts`)
- [x] Inventaire par agent + **ressources brutes variées** : bois (forêt), pierre, argile (terre),
  sable, eau (puisée au bord de l'eau) — catalogue data-driven (`catalog.ts`)
- [x] **Gisements épuisables puis repousse** (forêt/pierre/argile/sable) ; renvoi du chunk au
  changement de tuile (`world.ts`, `sim.snapshot`)
- [x] **Agriculture** : le champ ne produit que si on **sème une graine** ; cycle visible
  semé → pousse → mûr → récolte (3 stades, nouveaux types de tuiles via `flatc`)
- [x] **Champs = générateurs créés et possédés** : aucun champ posé d'office ; un **fermier
  laboure** une parcelle (`world.cultivate`), et seul le **propriétaire** la cultive/récolte
  (usage exclusif). Maisons/ateliers ont aussi un propriétaire (`BuildingState.owner`)
- [x] **Graines par battage du blé** ; le blé s'obtient en récoltant un champ mûr
- [x] Recettes profondes (`catalog.ts`) : planche, farine, pain (four), outil, meuble, brique,
  verre, poterie, graine — le **craft prend du temps**
- [x] **Plans pilotés par besoin/aspiration** (`ai/planner.ts`) : faim → filière pain,
  aspirations → maison/outil/meuble/ferme
- [x] **Construction = vrai bâtiment** (maison, four, atelier, puits, entrepôt) : chantier
  visible → bâtiment fini (`sim.advancePlan`)
- [x] **Rendu des bâtiments** (formes iso) + couleurs des cultures (`renderer.ts`)
- [x] **Métiers spécialisés** (fermier, bûcheron, mineur, artisan, boulanger) déduits de la
  personnalité/aspiration, orientant récolte/craft/construction (`catalog.ts`, `entities.ts`)
- [x] **Économie monétaire** : marché central à prix dynamiques (offre/demande), les IA vendent
  leurs surplus et achètent ce qui leur manque (`market.ts`, activité `trading`)
- [x] **Placement intelligent** des bâtiments par les IA (puits près de l'eau, four/atelier/
  entrepôt autour du marché, maison près du domicile) (`sim.pickBuildSite`)

## ⬜ Phase 8 — Client ESP32-S3 Touch
- [ ] Projet PlatformIO (LovyanGFX/LVGL), rendu tuiles + UI tactile
- [ ] Client WebSocket + décodage FlatBuffers C++ (code généré présent)
- [ ] Audio I2S (TTS) + micro (STT)
- [ ] Optimisations RAM/PSRAM, zone visible réduite

## Dette / migrations
- [x] Passer le transport WebSocket au **binaire FlatBuffers** (au lieu de JSON) — clé pour l'ESP32
  → `packages/protocol/src/wire.ts` (encode/decode), branché serveur + `WebSocketTransport`.
  Worker inchangé. Round-trips testés (`protocol/test/wire.test.ts`). Interop C++/ESP32 réelle
  reste à valider en phase 8 (pas de carte ici).
- [x] Déploiement d'un serveur hébergé (Render.com, blueprint `render.yaml`) → `wss://` public,
  health check `/health`, LLM cloud via secrets Render. Le client web (Pages) propose au
  démarrage le choix **local (worker) ↔ serveur distant** (URL injectée via `VITE_SERVER_URL`).
  Reste : génération audio/voix côté serveur (TTS cloud, le free tier ne tient pas Piper).
