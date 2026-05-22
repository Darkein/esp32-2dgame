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

Au démarrage, le client web propose **Jeu local** (Web Worker, zéro infra) ou
**Serveur distant** (monde partagé). Le paramètre d'URL `?server=ws://…` force le mode serveur
(pratique en local).

## Serveur hébergé (Render.com, gratuit)

Le serveur WebSocket se déploie automatiquement sur Render via le blueprint
[`render.yaml`](./render.yaml) (exposé en `wss://`, health check `/health`).

Mise en place **une seule fois** :
1. Sur [render.com](https://render.com) : **New → Blueprint**, connecter ce dépôt et choisir
   la branche → Render lit `render.yaml` et crée le service `esp32-2dgame-server`.
2. (Optionnel) renseigner les secrets LLM dans le dashboard Render (`LLM_API_KEY`,
   `LLM_BASE_URL`, `LLM_MODEL`) — laissés vides, le serveur reste jouable en *fast-layer* seul.
3. L'URL publique (`wss://esp32-2dgame-server.onrender.com`) est déjà injectée dans le build
   Pages via `VITE_SERVER_URL` ; le bouton « Serveur distant » la pré-remplit.

> Le free tier s'endort après ~15 min sans client (cold start ~50 s à la reconnexion,
> la simulation repart à zéro — l'état n'est pas persisté).

Voir **[CLAUDE.md](./CLAUDE.md)** (architecture, commandes) et **[ROADMAP.md](./ROADMAP.md)**
(état d'avancement).
