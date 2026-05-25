// Tâches multi-phases pour la couche rapide. `decideAction` choisit toujours un
// `ActivityKind` ; `buildTask` le développe en une séquence visible (déplacement,
// préparation, exécution, pause) que `Simulation.stepTask` joue waypoint par
// waypoint. Le but : agents lisibles à 1×, désynchronisés naturellement par la
// dispersion des durées de phase.

import type { ActivityKind, Vec2 } from '@game/protocol';
import type { Agent } from '../entities';
import type { Rng } from '../rng';
import type { SimClock } from '../clock';
import { DECISION_INTERVAL_SECONDS } from '../catalog';

export type PhaseKind = 'travel' | 'execute' | 'wait' | 'wander';

export interface Phase {
  kind: PhaseKind;
  /** Activité exposée sur `state.activity` pendant la phase (utilisée par `stepNeeds`,
   *  les animations client, l'observation du mentorat, etc.). */
  activity: ActivityKind;
  /** Tuile cible (travel/wander uniquement). */
  target?: Vec2;
  /** Durée nominale, en secondes de jeu (execute/wait, et wander pour la pause). */
  durationSeconds?: number;
  /** Temps de jeu (s) d'entrée dans la phase. Rempli par `enterPhase`. */
  startedAt?: number;
  /** Étiquette courte pour le HUD/debug (snapshot). */
  label?: string;
}

export interface Task {
  /** Activité « racine » (ancien `intent`) ; reflète l'objectif global de la tâche. */
  goal: ActivityKind;
  phases: Phase[];
  idx: number;
  /** Filet de sécurité (temps de jeu) ; si dépassé, on rappelle `decideAction`. */
  hardDeadlineAt: number;
}

/** Filet de sécurité large par défaut. Très supérieur à la durée typique d'une
 *  tâche pour ne déclencher une re-décision que si l'agent est vraiment bloqué. */
const HARD_DEADLINE_SECONDS = 60 * 60; // 1 h jeu

const HOUR = 3600;
const MIN = 60;

export interface TaskContext {
  agent: Agent;
  rng: Rng;
  clock: SimClock;
  /** Résolution de la cible « réelle » selon l'activité (déléguée à la sim :
   *  workTarget, planTarget, marché, eau, etc.). */
  resolveTarget: (activity: ActivityKind, fallback: Vec2) => Vec2;
}

/** Construit la séquence de phases pour `activity`. `fallback` est la cible
 *  suggérée par `decideAction` (utile pour socialiser : position d'autrui). */
export function buildTask(activity: ActivityKind, fallback: Vec2, ctx: TaskContext): Task {
  const { agent, rng, clock } = ctx;
  const home = agent.home;
  const phases: Phase[] = [];
  const range = (a: number, b: number) => a + rng.next() * (b - a);

  switch (activity) {
    case 'sleeping': {
      phases.push({ kind: 'travel', activity: 'walking', target: home, label: 'rentrer dormir' });
      // La condition de fin réelle (énergie pleine ou aube) est gérée dans `stepTask` ;
      // `durationSeconds` n'est qu'une borne haute.
      phases.push({ kind: 'wait', activity: 'sleeping', durationSeconds: range(2, 6) * HOUR, label: 'dormir' });
      break;
    }
    case 'eating': {
      const t = ctx.resolveTarget(activity, home);
      phases.push({ kind: 'travel', activity: 'walking', target: t, label: 'rentrer manger' });
      phases.push({ kind: 'execute', activity: 'eating', durationSeconds: range(2 * MIN, 5 * MIN), label: 'préparer' });
      phases.push({ kind: 'execute', activity: 'eating', durationSeconds: range(5 * MIN, 15 * MIN), label: 'manger' });
      break;
    }
    case 'working': {
      const t = ctx.resolveTarget(activity, agent.workplace);
      phases.push({ kind: 'travel', activity: 'walking', target: t, label: 'aller au travail' });
      // Sessions de travail longues (1-3 h jeu) : préserve la productivité tout en
      // laissant des fenêtres régulières pour manger, dormir, socialiser.
      phases.push({ kind: 'execute', activity: 'working', durationSeconds: range(1 * HOUR, 3 * HOUR), label: 'travailler' });
      break;
    }
    case 'crafting': {
      const t = ctx.resolveTarget(activity, home);
      phases.push({ kind: 'travel', activity: 'walking', target: t, label: 'aller bricoler' });
      // Sessions de craft/construction longues — un gros chantier dure plusieurs heures
      // jeu. La phase se termine plus tôt si `agent.plan` est complété (cf. `stepTask`).
      phases.push({ kind: 'execute', activity: 'crafting', durationSeconds: range(1 * HOUR, 4 * HOUR), label: 'bricoler' });
      break;
    }
    case 'socializing': {
      const t = ctx.resolveTarget(activity, fallback);
      phases.push({ kind: 'travel', activity: 'walking', target: t, label: 'rejoindre quelqu\'un' });
      phases.push({ kind: 'execute', activity: 'socializing', durationSeconds: range(3 * MIN, 8 * MIN), label: 'discuter' });
      break;
    }
    case 'washing': {
      const t = ctx.resolveTarget(activity, fallback);
      phases.push({ kind: 'travel', activity: 'walking', target: t, label: 'aller se laver' });
      phases.push({ kind: 'execute', activity: 'washing', durationSeconds: range(2 * MIN, 4 * MIN), label: 'se laver' });
      break;
    }
    case 'trading': {
      const t = ctx.resolveTarget(activity, fallback);
      phases.push({ kind: 'travel', activity: 'walking', target: t, label: 'aller au marché' });
      phases.push({ kind: 'execute', activity: 'trading', durationSeconds: range(2 * MIN, 5 * MIN), label: 'commercer' });
      break;
    }
    case 'hunting': {
      const t = ctx.resolveTarget(activity, fallback);
      phases.push({ kind: 'travel', activity: 'walking', target: t, label: 'pister le gibier' });
      // Sessions de chasse : on reste actif tant qu'il y a une proie à portée ;
      // la borne haute est large (la phase finit plus tôt si plus de proie / inventaire plein).
      phases.push({ kind: 'execute', activity: 'hunting', durationSeconds: range(30 * MIN, 2 * HOUR), label: 'chasser' });
      break;
    }
    case 'fishing': {
      const t = ctx.resolveTarget(activity, fallback);
      phases.push({ kind: 'travel', activity: 'walking', target: t, label: 'aller à la pêche' });
      phases.push({ kind: 'execute', activity: 'fishing', durationSeconds: range(30 * MIN, 2 * HOUR), label: 'pêcher' });
      break;
    }
    default: {
      // Flânerie : une petite cible aléatoire autour de la maison, suivie d'une pause.
      // Crée le mouvement de fond visible quand aucun besoin n'est urgent.
      const cx = home.x + (rng.next() - 0.5) * 8;
      const cy = home.y + (rng.next() - 0.5) * 8;
      phases.push({ kind: 'wander', activity: 'walking', target: { x: cx, y: cy }, label: 'flâner' });
      phases.push({ kind: 'wait', activity: 'idle', durationSeconds: range(30, 120), label: 'pause' });
      break;
    }
  }

  return {
    goal: activity,
    phases,
    idx: 0,
    hardDeadlineAt: clock.gameTime + Math.max(HARD_DEADLINE_SECONDS, 2 * DECISION_INTERVAL_SECONDS),
  };
}

/** Étiquette de la phase courante (HUD/snapshot). */
export function currentPhaseLabel(task: Task | null): string | undefined {
  if (!task || task.idx >= task.phases.length) return undefined;
  return task.phases[task.idx]!.label;
}
