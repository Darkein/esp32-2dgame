import type { ActivityKind, Vec2 } from '@game/protocol';
import type { Agent } from '../entities';
import { distance } from '../entities';
import type { World } from '../world';
import type { SimClock } from '../clock';

export interface Decision {
  activity: ActivityKind;
  target: Vec2;
  /** Action retenue (clé interne, pour journalisation/objectif). */
  reason: string;
}

interface Candidate {
  score: number;
  decision: Decision;
}

function nearestAgent(self: Agent, agents: Agent[]): Agent | null {
  let best: Agent | null = null;
  let bestD = Infinity;
  for (const a of agents) {
    if (a === self) continue;
    const d = distance(self.state.pos, a.state.pos);
    if (d < bestD) {
      bestD = d;
      best = a;
    }
  }
  return best;
}

const norm = (need: number) => 1 - need / 100; // 0 (rassasié) .. 1 (urgent)

/**
 * Couche rapide : choisit l'action de plus forte utilité. Purement déterministe,
 * sub-milliseconde — c'est elle qui garantit le « < 0,5 s par décision ».
 * `goalBias` permet à l'orchestrateur LLM d'influencer (sans bloquer) le choix.
 */
export function decideAction(
  agent: Agent,
  world: World,
  clock: SimClock,
  agents: Agent[],
  goalBias: ActivityKind | null,
): Decision {
  const n = agent.state.needs;
  const p = agent.personality;
  const candidates: Candidate[] = [];

  // Dormir — fort la nuit et quand l'énergie est basse.
  candidates.push({
    score: norm(n.energy) * (clock.isNight ? 1.6 : 0.7) + (clock.isNight ? 0.2 : 0),
    decision: { activity: 'sleeping', target: agent.home, reason: 'dormir' },
  });

  // Manger (depuis l'inventaire, où qu'on soit — on rentre simplement chez soi).
  candidates.push({
    score: norm(n.hunger) * 1.4,
    decision: { activity: 'eating', target: agent.home, reason: 'manger' },
  });

  // Travailler — récolter/cultiver. La cible précise (gisement, champ) est résolue par
  // la simulation (`sim.workTarget`) ; ici on ne fait que pondérer l'envie de travailler.
  const workHours = clock.timeOfDay >= 8 && clock.timeOfDay <= 18;
  candidates.push({
    score:
      (workHours ? 0.9 : 0.05) * (0.5 + p.industriousness) * (0.5 + p.conscientiousness) -
      norm(n.energy) * 0.5 -
      norm(n.hunger) * 0.5,
    decision: { activity: 'working', target: agent.workplace, reason: 'récolter des ressources' },
  });

  // Socialiser — selon l'extraversion et le besoin social.
  const other = nearestAgent(agent, agents);
  if (other) {
    candidates.push({
      score: norm(n.social) * (0.6 + p.extraversion) * (clock.isNight ? 0.6 : 1),
      decision: { activity: 'socializing', target: other.state.pos, reason: 'socialiser' },
    });
  }

  // Se détendre.
  candidates.push({
    score: norm(n.fun) * (0.6 + p.openness * 0.5),
    decision: { activity: 'crafting', target: agent.home, reason: 'se détendre / bricoler' },
  });

  // Repli : flâner.
  candidates.push({
    score: 0.15,
    decision: { activity: 'idle', target: agent.state.pos, reason: 'flâner' },
  });

  // Coup de pouce de l'objectif fixé par le LLM (jamais bloquant).
  if (goalBias) {
    for (const c of candidates) if (c.decision.activity === goalBias) c.score += 0.4;
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates[0]!.decision;
}
