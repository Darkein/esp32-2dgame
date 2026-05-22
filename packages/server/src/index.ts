import { WebSocketServer, WebSocket } from 'ws';
import { Simulation } from '@game/sim-core';
import { resolveProvider } from '@game/llm';
import type { ClientMessage, ServerMessage } from '@game/protocol';

const PORT = Number(process.env.PORT ?? 8787);
const TPS = Number(process.env.TPS ?? 15);

async function main() {
  const provider = await resolveProvider({
    ollamaUrl: process.env.OLLAMA_URL,
    ollamaModel: process.env.OLLAMA_MODEL,
    cloudApiKey: process.env.LLM_API_KEY,
    cloudBaseUrl: process.env.LLM_BASE_URL,
    cloudModel: process.env.LLM_MODEL,
  });
  console.log(`[serveur] LLM: ${provider ? provider.name : 'aucun (fast-layer seul)'}`);

  const sim = new Simulation({ provider, agentCount: Number(process.env.AGENTS ?? 10), ticksPerSecond: TPS });
  const wss = new WebSocketServer({ port: PORT });
  console.log(`[serveur] WebSocket sur ws://localhost:${PORT}`);

  const send = (ws: WebSocket, msg: ServerMessage) => {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
  };
  const broadcast = (msg: ServerMessage) => {
    for (const ws of wss.clients) send(ws, msg);
  };

  wss.on('connection', (ws) => {
    send(ws, { t: 'snapshot', snapshot: sim.snapshot(true) });
    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(String(raw)) as ClientMessage;
        if (msg.t === 'chat') sim.handleChat(msg.agentId, msg.text, msg.isOrder);
      } catch {
        /* message invalide ignoré */
      }
    });
  });

  // Boucle de simulation à TPS Hz, diffusion d'instantanés ~10 Hz.
  let acc = 0;
  const tickMs = 1000 / TPS;
  setInterval(() => {
    const dialogues = sim.tick();
    for (const event of dialogues) broadcast({ t: 'dialogue', event });
    acc += tickMs;
    if (acc >= 100) {
      acc = 0;
      broadcast({ t: 'snapshot', snapshot: sim.snapshot(false) });
    }
  }, tickMs);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
