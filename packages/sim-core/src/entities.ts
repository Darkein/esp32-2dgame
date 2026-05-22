import type { ActivityKind, AgentState, Needs, Vec2 } from '@game/protocol';
import type { MemoryStream } from './ai/memory';

/** Projet en cours d'un agent (fabrication ou construction). Le travail agricole
 *  (semer/récolter) et la récolte des gisements sont gérés dans l'activité `working`. */
export type ActivePlan =
  | { type: 'craft'; recipeId: string; progress: number }
  | { type: 'build'; kind: string; site: Vec2; buildingId: number; progress: number };

/** Traits de personnalité (Big Five + entrain), 0..1. Biaisent les choix d'action. */
export interface Personality {
  openness: number;
  conscientiousness: number;
  extraversion: number;
  agreeableness: number;
  neuroticism: number;
  industriousness: number;
}

/** Données internes d'un agent (le wire `AgentState` n'en expose qu'une partie). */
export interface Agent {
  state: AgentState;
  personality: Personality;
  aspirations: string[];
  home: Vec2;
  workplace: Vec2;
  /** Cible de déplacement courante (null = sur place). */
  target: Vec2 | null;
  /** Activité à exécuter une fois la cible atteinte. */
  intent: ActivityKind;
  /** Tick jusqu'auquel la décision courante tient (re-décision ensuite). */
  actionUntilTick: number;
  /** Relations : id d'agent -> affinité (-100..100). */
  relationships: Map<number, number>;
  memory: MemoryStream;
  /** Anti-rebond : prochain tick où une décision LLM peut être relancée. */
  nextThinkTick: number;
  /** Vrai pendant qu'une requête LLM est en vol (évite les appels concurrents). */
  thinking: boolean;
  /** Tick jusqu'auquel l'agent « parle » (réplique affichée). */
  sayingUntilTick: number;
  /** Ressources brutes + objets craftés portés. */
  inventory: Map<string, number>;
  /** Bâtiments construits par l'agent. */
  houses: number;
  /** Prochain tick autorisé pour une action de récolte/craft (cadence). */
  nextGatherTick: number;
  /** Projet courant (craft/construction/agriculture), null si aucun. */
  plan: ActivePlan | null;
}

export function makeNeeds(partial?: Partial<Needs>): Needs {
  return { energy: 80, hunger: 80, social: 70, hygiene: 80, fun: 70, ...partial };
}

export function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function setActivity(agent: Agent, activity: ActivityKind): void {
  agent.state.activity = activity;
}
