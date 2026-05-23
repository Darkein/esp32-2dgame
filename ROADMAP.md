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

## ✅ Phase 7.5 — Échelle & monde « Stardew »
- [x] Monde **128×128** côté runtime (web/serveur) ; le défaut `sim-core` reste 48×48 pour
  garder les tests rapides
- [x] **Bâtiments multi-tuiles** : chaque type a un `footprint` (maison 3×3, atelier/four 2×2,
  entrepôt 3×2, marché 4×4, puits 1×1) et une **tuile-porte** unique (`catalog.BUILDING_SHAPES`)
- [x] Protocole étendu : `BuildingState.footprint`/`door`, nouveau `TileType.Path`
  (`world.fbs` + `pnpm codegen` → TS/C++)
- [x] `World.walkable` tient compte d'un bitset `blocked[]` mis à jour à chaque construction
  (porte = seul accès au footprint) ; `buildingAt` indexé par tuile
- [x] **Pathfinding A\*** sur tuiles, 8 directions, **coûts par terrain** (`TILE_MOVE_COST`)
  → `packages/sim-core/src/ai/pathfind.ts`. Les agents contournent forêts/eau/footprints.
- [x] **Chemins émergents** : `World.stampWear` accumule les passages ; au seuil
  (`PATH_WEAR_THRESHOLD`), grass/dirt → `path` (vitesse boostée). `pavePath` reste dispo
  pour une pose explicite (recettes futures).
- [x] **Agrégation villageoise** : 2-3 centres pré-amorcés (`Simulation.seedVillages`),
  spawn des agents et `pickBuildSite` ancrés sur le village d'appartenance
- [x] **Calques de rendu façon RPG Maker** (`renderer.ts`) :
  `tileLayer` → `propLayer` (troncs, murs, triés Y) → `agentLayer` (Y) → `overheadLayer`
  (frondaisons, toits, **toujours par-dessus** les agents). Bâtiment et arbre partagent le
  même mécanisme (flag ★) ; seule la collision diffère (footprint bloquant vs tuile basse).

## ⬜ Phase 8 — Client ESP32-S3 Touch
- [ ] Projet PlatformIO (LovyanGFX/LVGL), rendu tuiles + UI tactile
- [ ] Client WebSocket + décodage FlatBuffers C++ (code généré présent)
- [ ] Audio I2S (TTS) + micro (STT)
- [ ] Optimisations RAM/PSRAM, zone visible réduite

---

# Réalisme de la simulation (phases 9–21)

Phases conçues pour rendre la vie villageoise crédible. Le `sim-core` actuel contient déjà
des **scaffolds non exploités** (grossesse, longévité, traits Big Five, statut de couple,
constantes `COUPLE_THRESHOLD` / `CONCEPTION_RATE_PER_YEAR` / `GESTATION_SECONDS` /
`LIFESPAN_MIN/MAX` / `FERTILE_MIN/MAX` dans `catalog.ts`) qui ne sont jamais lus dans la
boucle de tick. Ces phases activent et étendent ces fondations.

**Priorités** : **P1** indispensable au réalisme de base · **P2** profondeur · **P3** raffinement / civilisation.

### Ordre suggéré
- **P1 — Fondations** : Phase 9 (démographie), 11 (météo/saisons), 10 (santé), 12 (émotions), 13 (relations)
- **P2 — Profondeur** : Phase 14 (compétences), 15 (faune), 19 (entretien), 20 (cognition IA), 21 (UX joueur)
- **P3 — Civilisation** : Phase 16 (politique), 17 (culture), 18 (économie avancée)

## 🟦 Phase 9 — Démographie & cycle de vie *(P1)*
Activer le scaffold existant (`Agent.age`, `lifeStage`, `pregnant`, `partnerId`).
- [x] Vieillissement effectif : `ageYears` recalculé à chaque tick (`Simulation.stepLife`)
- [x] **Conception** : femme en couple, fertile → tirage `CONCEPTION_RATE_PER_YEAR`
- [x] **Gestation** : décompte `GESTATION_SECONDS` puis naissance
- [x] **Naissance** : nouvel agent avec parents, voix enfantine, personnalité héritée
- [x] **Enfance** : ne travaille ni ne commerce (`utility.ts` filtre `isChild`)
- [x] **Adolescence / apprentissage** : observation d'un adulte au travail à proximité
  (`APPRENTICE_PROXIMITY_TILES`) → `apprenticeXp` par métier, `learnedJob` adopté à la
  majorité (`Simulation.observeMentor`)
- [x] **Aînés** : énergie plafonnée à `ELDER_ENERGY_CAP` (fatigue plus rapide)
- [x] **Mort** à `lifespan` (tiré entre `LIFESPAN_MIN/MAX`)
- [x] **Sépulture / souvenir partagé** : tous les villageois proches gagnent un souvenir
  d'importance 9 (10 pour la famille), dialogue funéraire émis
- [x] **Héritage** : biens transmis à un enfant survivant, sinon publics
- [ ] Sagesse des aînés : poids mémoire renforcé / boost importance — *à faire (Phase 20)*
- Fichiers : `sim-core/src/sim.ts` (`stepLife`, `observeMentor`, `removeAgents`),
  `sim-core/src/entities.ts` (`isTeen`, champs `mentorId`/`learnedJob`/`apprenticeXp`),
  `sim-core/src/catalog.ts` (`TEEN_AGE`, `ELDER_ENERGY_CAP`, `FUNERAL_MEMORY_RADIUS`)

## ⬜ Phase 10 — Santé, blessures, maladies *(P1)*
- [ ] Stat `health` (0..1) par agent, séparée des besoins
- [ ] **Maladies** transmissibles (rhume, fièvre) avec incubation et contagion par proximité
- [ ] **Blessures** (accidents de craft/chute) → soins requis
- [ ] Effet **hygiène → santé** (besoin déjà présent, à brancher)
- [ ] **Mortalité non vieillesse** : maladies graves chez aînés/enfants, accidents
- [ ] Métier **soigneur/herboriste** : récolte plantes médicinales, prépare remèdes
- [ ] Bâtiment **infirmerie**
- [ ] Épidémies saisonnières (couplage Phase 11)
- Fichiers : `sim-core/src/health.ts`, recettes plantes dans `catalog.ts`

## ⬜ Phase 11 — Météo, saisons, climat *(P1)*
- [ ] 4 saisons (printemps/été/automne/hiver) dérivées de `SimClock.month`
- [ ] Cultures dépendantes : blé pousse printemps→été, dort hiver
- [ ] **Météo** stochastique journalière : ensoleillé, pluie, orage, neige, brouillard, canicule
- [ ] Pluie → arrose champs (compteur d'eau de la tuile), ralentit déplacements
- [ ] Sécheresse → cultures meurent, marché en tension
- [ ] Hiver → besoin chauffage (consomme bois), pas de récolte, stocks vitaux
- [ ] Tempête / foudre → dégâts ponctuels à bâtiments en bois
- [ ] Rendu : teinte globale + particules pluie/neige (`web-client/src/renderer.ts`)
- [ ] Protocole : `WeatherState` dans `world.fbs` (codegen)
- Fichiers : `sim-core/src/weather.ts`, extension `clock.ts`, `world.fbs`

## ⬜ Phase 12 — Émotions & psychologie *(P1)*
Au-dessus des besoins, un état affectif lu par l'orchestrateur LLM (ton du dialogue).
- [ ] Humeurs : joie, tristesse, colère, peur, dégoût, surprise (vecteur 6D, décroissance)
- [ ] **Stress** cumulatif (faim chronique, conflits, surcharge de travail)
- [ ] **Trauma** : événement à très forte importance dans la mémoire (deuil, agression)
- [ ] Neuroticism / extraversion (déjà présents) modulent amplitude et décroissance
- [ ] Ambitions évolutives : succès accomplit l'aspiration → nouvelle ; échec → résignation
- Fichiers : `sim-core/src/ai/emotion.ts`, lecture dans `orchestrator.ts` (prompt)

## ⬜ Phase 13 — Relations sociales avancées *(P1)*
- [ ] **Cour** : montée d'affinité → invitations, cadeaux, déclarations
- [ ] **Couple officiel** : statut posé, cohabitation, partage d'inventaire/maison
- [ ] **Mariage** (cérémonie collective, fête du village)
- [ ] **Jalousie / rupture / divorce** si affinité d'un partenaire monte avec un tiers
- [ ] Famille : `parents[]`, `children[]`, `siblings[]` — visibilité dans HUD
- [ ] **Amitiés / rivalités** : seuils négatifs déclenchent évitement, disputes
- [ ] **Réputation** : score public agrégé (vu par tout le village)
- Fichiers : extension `entities.ts`, nouveau `sim-core/src/social.ts`

## ⬜ Phase 14 — Compétences & apprentissage *(P2)*
- [ ] Tableau de skills par métier (fermier, bûcheron, mineur, artisan, boulanger, soigneur…)
- [ ] Gain d'XP par action ; niveau → vitesse/qualité du craft, taux d'échec
- [ ] **Apprentissage** : enfant proche d'un adulte travaillant → XP gratuit dans son métier
- [ ] **Mentorat** explicite (Phase 9) : aîné enseigne à jeune
- [ ] **Recettes débloquables** : certaines connues uniquement après XP minimum
- [ ] Transmission culturelle : recettes peuvent disparaître si plus personne ne les connaît
- Fichiers : extension `entities.ts`, `crafting.ts`, `planner.ts`

## ⬜ Phase 15 — Faune & écosystème *(P2)*
- [ ] Animaux sauvages : cerfs, lapins, sangliers, loups, poissons (entités légères)
- [ ] **Chasse** (métier chasseur) → viande, peaux ; risque blessure
- [ ] **Pêche** au bord de l'eau
- [ ] **Élevage** : poules (œufs), vaches (lait), porcs (viande) ; enclos, fourrage
- [ ] **Prédateurs** nocturnes (loups attaquent isolés / élevage non protégé)
- [ ] Cycle proies/prédateurs (sur-chasse → effondrement → repousse)
- Fichiers : `sim-core/src/wildlife.ts`, extensions `world.ts` / `catalog.ts`

## ⬜ Phase 16 — Société, politique & justice *(P3)*
- [ ] **Leader de village** : élu (vote pondéré par réputation) ou auto-proclamé
- [ ] **Lois simples** : interdit voler, frapper ; sanctions (amende, exil)
- [ ] **Crimes** : vol (prise sans paiement), agression (en cas de colère / faim extrême)
- [ ] **Garde** (nouveau métier) : patrouille, intervient sur crime
- [ ] **Impôts** : prélèvement marché → fonds communs (entretien bâtiments publics)
- [ ] Conflits inter-villages possibles (négociation, accord, embargo)
- Fichiers : `sim-core/src/polity.ts`

## ⬜ Phase 17 — Culture, rituels & art *(P3)*
- [ ] **Fêtes saisonnières** (équinoxes, moissons) : tout le village se regroupe, +humeur
- [ ] **Croyances** locales : esprits de la forêt, totems ; lieux sacrés sur la carte
- [ ] **Mythes partagés** : souvenirs collectifs (haute importance, transmis par récit)
- [ ] **Art** : musique (joue d'un instrument crafté), sculpture, peinture sur murs
- [ ] Calendrier rituel — `SimClock` émet des « événements de fête »
- Fichiers : `sim-core/src/culture.ts`, recettes instruments

## ⬜ Phase 18 — Économie avancée *(P3)*
- [ ] **Salaires** : un agent peut employer un autre (artisan embauche apprenti)
- [ ] **Endettement** : prêts entre agents, intérêts simples
- [ ] **Spécialisation par village** : un village agricole, un minier, un artisan
- [ ] Commerce inter-village (caravane d'IA), différentiels de prix
- [ ] **Pénuries locales** → différentiel de prix → opportunité marchande
- [ ] Métiers de service : médecin, prêtre, garde, conteur, musicien
- Fichiers : extensions `market.ts`, nouveau `sim-core/src/trade-caravan.ts`

## ⬜ Phase 19 — Environnement dynamique & entretien *(P2)*
- [ ] Bâtiments **vieillissent** : besoin de réparation (bois/pierre), sinon ruine
- [ ] **Outils s'usent** : durabilité, doivent être reforgés
- [ ] **Incendies** (foudre, four mal géré) → propagation tuile à tuile
- [ ] **Inondations** (crues de rivière en saison des pluies)
- [ ] Pollution / déchets autour des ateliers (effet humeur, hygiène)
- Fichiers : extensions `world.ts`, `crafting.ts`, `weather.ts`

## ⬜ Phase 20 — Cognition IA approfondie *(P2)*
Compléter les items déjà listés en Phase 4.
- [ ] **Embeddings** locaux (Ollama `nomic-embed-text`) pour retrieval sémantique
- [ ] **Réflexions périodiques** : synthèse nocturne de souvenirs → croyances/objectifs
- [ ] **Théorie de l'esprit** : modèle simple des autres (humeur supposée, métier, affinité)
- [ ] **Planification longue durée** : objectifs hebdo/mensuels (épargner pour maison,
  semer avant l'hiver) en plus du plan immédiat
- [ ] **Apprentissage par l'expérience** : pondération des actions selon succès/échec passés
- Fichiers : `sim-core/src/ai/orchestrator.ts`, nouveaux
  `sim-core/src/ai/{reflection,theory-of-mind,long-term-plan}.ts`

## ⬜ Phase 21 — UX joueur enrichi *(P2)*
- [ ] Mémoire de la relation joueur↔IA persistante (déjà TODO Phase 5)
- [ ] **Arbres généalogiques** consultables
- [ ] **Carte du monde** avec villages, routes, événements en cours
- [ ] **Journal** du village : naissances, morts, fêtes, crimes
- [ ] **Vue d'une IA** : besoins, humeur, souvenirs, ambitions, famille
- Fichiers : `web-client/src/ui/{family-tree,journal,worldmap}.tsx`

## Réglages transverses (à appliquer dans chaque phase ci-dessus)
- **Échelle temps** : taux naissance/mort/croissance proportionnés à `BASE_SCALE` pour
  qu'une heure réelle (= 1 jour-jeu) reste lisible
- **Snapshot protocole** : étendre `world.fbs` (saison, météo, santé, statut social) puis
  `pnpm codegen`
- **Tests Vitest** : un test par sous-système (conception, saison→culture, contagion,
  jalousie, héritage)
- **Déterminisme** : tout aléa via `rng.ts` (reproductibilité)
- **Performance** : la couche rapide reste < 0,5 s ; les calculs lourds (épidémie,
  économie inter-village) passent en jobs périodiques

---

## Dette / migrations
- [x] Passer le transport WebSocket au **binaire FlatBuffers** (au lieu de JSON) — clé pour l'ESP32
  → `packages/protocol/src/wire.ts` (encode/decode), branché serveur + `WebSocketTransport`.
  Worker inchangé. Round-trips testés (`protocol/test/wire.test.ts`). Interop C++/ESP32 réelle
  reste à valider en phase 8 (pas de carte ici).
- [x] Déploiement d'un serveur hébergé (Render.com, blueprint `render.yaml`) → `wss://` public,
  health check `/health`, LLM cloud via secrets Render. Le client web (Pages) propose au
  démarrage le choix **local (worker) ↔ serveur distant** (URL injectée via `VITE_SERVER_URL`).
  Reste : génération audio/voix côté serveur (TTS cloud, le free tier ne tient pas Piper).
