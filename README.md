# Village d'IA — jeu de vie isométrique 2D

Un monde 2D isométrique (esprit Minecraft) **peuplé uniquement d'IA** : elles dorment,
mangent, travaillent, socialisent, ont des aspirations et **dialoguent en français**.
Architecture type MMO : le monde et les IA tournent sur un serveur ; les clients
(**web/PC** et **ESP32-S3 Touch**) ne font qu'afficher et contrôler.

▶ **Démo web** (zéro infra, simulation dans le navigateur) :
`https://darkein.github.io/esp32-2dgame/`

## Démarrage rapide

```bash
pnpm install
pnpm dev:web        # http://localhost:5173  (simulation locale dans un Web Worker)
# IA réalistes (LLM) + multi-clients :
pnpm dev:server     # serveur WebSocket :8787  (LLM via Ollama/cloud si configuré)
# puis ouvrir  http://localhost:5173/?server=ws://localhost:8787
```

Voir **[CLAUDE.md](./CLAUDE.md)** (architecture, commandes) et **[ROADMAP.md](./ROADMAP.md)**
(état d'avancement).
