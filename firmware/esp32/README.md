# Client ESP32-S3 Touch (Phase 8 — non encore implémenté)

Client *thin* embarqué : affichage isométrique + contrôles tactiles + audio. Toute la
logique de jeu reste côté serveur (cf. architecture MMO dans `../../CLAUDE.md`).

## Prévu
- **PlatformIO / ESP-IDF** (carte ESP32-S3-Touch-LCD).
- **LovyanGFX** ou **LVGL** pour le rendu des tuiles et l'UI tactile.
- Client **WebSocket** vers le serveur (`packages/server`).
- Décodage du protocole via **FlatBuffers C++** — l'en-tête généré est déjà présent dans
  `src/gen/world_generated.h` (régénéré par `pnpm codegen` depuis `world.fbs`).
- Audio **I2S** pour jouer le PCM TTS (Piper) ; micro pour le STT.

## Contraintes
- RAM limitée : ne garder que la zone visible, rendre par sprites, pas de monde complet.
- Le passage du transport WebSocket en **binaire FlatBuffers** (cf. ROADMAP) est un
  prérequis pratique pour limiter la bande passante et la conso mémoire ici.

> Le code généré `src/gen/` est commité ; ne pas l'éditer à la main.
