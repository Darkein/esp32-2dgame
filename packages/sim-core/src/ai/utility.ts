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

/** Vrai si un besoin urgent doit pouvoir interrompre une tâche non-essentielle.
 *  Seuils délibérément bas pour ne pas faire osciller les agents. */
export function needsCritical(a: Agent): boolean {
  const n = a.state.needs;
  return n.hunger < 15 || n.energy < 8;
}

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
  // Les enfants ne travaillent ni ne commercent : ils mangent, dorment, jouent, socialisent.
  const isChild = agent.state.lifeStage === 'enfant';

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
  // Les chasseurs/pêcheurs ont leur propre activité (`hunting`/`fishing`) pour éviter
  // le doublon : leur boucle ne passe pas par les gisements.
  const workHours = clock.timeOfDay >= 8 && clock.timeOfDay <= 18;
  const job = agent.state.job;
  const isHunterJob = job === 'chasseur';
  const isFisherJob = job === 'pecheur';
  if (!isChild && !isHunterJob && !isFisherJob) {
    candidates.push({
      score:
        (workHours ? 0.9 : 0.05) * (0.5 + p.industriousness) * (0.5 + p.conscientiousness) -
        norm(n.energy) * 0.5 -
        norm(n.hunger) * 0.5,
      decision: { activity: 'working', target: agent.workplace, reason: 'récolter des ressources' },
    });
  }
  // Chasse / pêche (Phase 15) : remplace le candidat « working » pour ces métiers.
  // Score calqué sur celui du travail, plus une pointe d'extraversion (chasseur)
  // ou d'ouverture (pêcheur). La nuit pénalise fortement la chasse (les loups
  // rôdent — implicite via le facteur jour/nuit).
  if (!isChild && isHunterJob) {
    candidates.push({
      score:
        (workHours ? 0.95 : 0.02) * (0.5 + p.industriousness) * (0.6 + p.extraversion) -
        norm(n.energy) * 0.5 -
        norm(n.hunger) * 0.5,
      decision: { activity: 'hunting', target: agent.workplace, reason: 'chasser du gibier' },
    });
  }
  if (!isChild && isFisherJob) {
    candidates.push({
      score:
        (workHours ? 0.9 : 0.05) * (0.5 + p.industriousness) * (0.6 + p.openness) -
        norm(n.energy) * 0.4 -
        norm(n.hunger) * 0.4,
      decision: { activity: 'fishing', target: agent.workplace, reason: 'aller pêcher' },
    });
  }

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

  // Se laver — puits du village en priorité, sinon bord d'eau le plus proche.
  // Les enfants se lavent aussi (l'hygiène concerne tout le monde).
  // Sous le seuil santé (~30), l'urgence enfle pour passer devant le travail.
  const wellDoor = world.findBuilding('puits', agent.state.pos)?.door ?? null;
  const waterEdge = wellDoor ?? world.findWaterEdge(agent.state.pos);
  if (waterEdge) {
    const urgency = Math.max(0, 1 - n.hygiene / 30); // 0 si propre, 1 si effondré
    candidates.push({
      score: norm(n.hygiene) * (1.1 + urgency * 1.5) * (0.7 + p.conscientiousness * 0.4),
      decision: { activity: 'washing', target: waterEdge, reason: 'se laver' },
    });
  }

  // Commercer — aller au marché si l'on a des surplus à vendre ou faim sans nourriture.
  const market = isChild ? null : world.findBuilding('marche', agent.state.pos);
  if (market) {
    let surplus = 0;
    for (const [k, q] of agent.inventory) if (k !== 'pain' && k !== 'ble') surplus += Math.max(0, q - 4);
    const hungryNoFood = n.hunger < 50 && (agent.inventory.get('pain') ?? 0) < 1 && agent.state.coins > 3;
    const desire = Math.min(1, surplus / 8) + (hungryNoFood ? 0.5 : 0);
    candidates.push({
      score: (workHours ? 0.8 : 0.2) * desire * (0.6 + p.conscientiousness * 0.6),
      decision: { activity: 'trading', target: market.pos, reason: 'aller au marché' },
    });
  }

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
