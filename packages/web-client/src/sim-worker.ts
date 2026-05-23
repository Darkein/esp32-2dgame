/// <reference lib="webworker" />
// Worker : exécute le MÊME cœur de simulation que le serveur, dans le navigateur.
// Permet de tester le jeu entièrement depuis GitHub Pages, sans aucune infra.
import { Simulation } from '@game/sim-core';
import type { ClientMessage, ServerMessage } from '@game/protocol';

let sim: Simulation | null = null;

function post(msg: ServerMessage) {
  (self as unknown as Worker).postMessage(msg);
}

self.onmessage = (ev: MessageEvent) => {
  const data = ev.data as { t: 'init'; agentCount?: number } | ClientMessage;

  if (data.t === 'init') {
    // LLM désactivé dans le worker (pas d'accès Ollama/cloud depuis le navigateur) :
    // le jeu reste pleinement jouable via la couche rapide. Le LLM s'active côté serveur.
    // Monde 128×128 « Stardew » : laisse la place à plusieurs hameaux et aux chemins
    // émergents. Les tests utilisent la taille par défaut de Simulation, plus petite.
    sim = new Simulation({ provider: null, agentCount: data.agentCount ?? 10, ticksPerSecond: 15, width: 128, height: 128 });
    post({ t: 'snapshot', snapshot: sim.snapshot(true) });

    const tps = 15;
    let acc = 0;
    setInterval(() => {
      if (!sim) return;
      const dialogues = sim.tick();
      for (const event of dialogues) post({ t: 'dialogue', event });
      acc += 1000 / tps;
      if (acc >= 100) {
        acc = 0;
        post({ t: 'snapshot', snapshot: sim.snapshot(false) });
      }
    }, 1000 / tps);
    return;
  }

  if (!sim) return;
  if (data.t === 'chat') sim.handleChat(data.agentId, data.text, data.isOrder);
  else if (data.t === 'speed') sim.setSpeed(data.scale);
};
