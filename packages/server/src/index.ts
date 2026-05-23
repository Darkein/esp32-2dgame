import { createServer } from 'node:http';
import { WebSocketServer, WebSocket, type RawData } from 'ws';
import { Simulation } from '@game/sim-core';
import { resolveProvider } from '@game/llm';
import { decodeClientMessage, encodeServerMessage, type ServerMessage } from '@game/protocol';

/** Normalise la donnée WS entrante en Uint8Array (les trames sont binaires). */
function toBytes(raw: RawData): Uint8Array {
  if (Buffer.isBuffer(raw)) return new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength);
  if (raw instanceof ArrayBuffer) return new Uint8Array(raw);
  return new Uint8Array(Buffer.concat(raw as Buffer[]));
}

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

  const sim = new Simulation({
    provider,
    agentCount: Number(process.env.AGENTS ?? 10),
    ticksPerSecond: TPS,
    width: Number(process.env.WORLD_W ?? 128),
    height: Number(process.env.WORLD_H ?? 128),
  });

  // Serveur HTTP minimal : sert le health check (sondé par l'hébergeur) ; le WebSocket s'y greffe.
  const http = createServer((req, res) => {
    if (req.url === '/health' || req.url === '/') {
      res.writeHead(200, { 'content-type': 'text/plain' }).end('ok');
    } else {
      res.writeHead(404).end();
    }
  });
  const wss = new WebSocketServer({ server: http });
  http.listen(PORT, '0.0.0.0', () => console.log(`[serveur] WebSocket+HTTP sur :${PORT}`));

  const send = (ws: WebSocket, msg: ServerMessage) => {
    if (ws.readyState === ws.OPEN) ws.send(encodeServerMessage(msg));
  };
  const broadcast = (msg: ServerMessage) => {
    for (const ws of wss.clients) send(ws, msg);
  };

  wss.on('connection', (ws) => {
    send(ws, { t: 'snapshot', snapshot: sim.snapshot(true) });
    ws.on('message', (raw) => {
      try {
        const msg = decodeClientMessage(toBytes(raw));
        if (msg?.t === 'chat') sim.handleChat(msg.agentId, msg.text, msg.isOrder);
        else if (msg?.t === 'speed') sim.setSpeed(msg.scale);
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
