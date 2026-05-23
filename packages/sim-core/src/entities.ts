import type { ActivityKind, AgentState, Emotions, LifeStage, Needs, Vec2 } from '@game/protocol';
import type { Job } from './catalog';
import { ADULT_AGE, ELDER_AGE, TEEN_AGE } from './catalog';
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

/** Grossesse en cours (femmes uniquement). */
export interface Pregnancy {
  /** Temps de jeu (secondes) du début de la grossesse. */
  sinceGameTime: number;
  /** Id du père. */
  fatherId: number;
}

/** Maladie en cours sur un agent (Phase 10). */
export interface Illness {
  /** Étiquette interne (rhume, fièvre…). */
  kind: string;
  /** Temps de jeu (s) du début de l'infection. */
  sinceGameTime: number;
  /** Durée prévue (s) après laquelle la guérison est tentée. */
  durationSeconds: number;
  /** Vrai après la fin de l'incubation (l'agent peut contaminer autrui). */
  contagious: boolean;
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
  /** Chemin tuile-à-tuile vers `target` (A*), null si pas calculé / pas nécessaire. */
  path: Vec2[] | null;
  /** Indice du prochain waypoint dans `path`. */
  pathIdx: number;
  /** Centre du village d'appartenance (spawn + ancrage des constructions). */
  village: Vec2;
  /** Activité à exécuter une fois la cible atteinte. */
  intent: ActivityKind;
  /** Temps de jeu (s) jusqu'auquel la décision courante tient (re-décision ensuite). */
  actionUntilGameTime: number;
  /** Relations : id d'agent -> affinité (-100..100). */
  relationships: Map<number, number>;
  memory: MemoryStream;
  /** Anti-rebond : prochain tick (réel) où une décision LLM peut être relancée. */
  nextThinkTick: number;
  /** Vrai pendant qu'une requête LLM est en vol (évite les appels concurrents). */
  thinking: boolean;
  /** Tick (réel) jusqu'auquel l'agent « parle » (réplique affichée). */
  sayingUntilTick: number;
  /** Ressources brutes + objets craftés portés. */
  inventory: Map<string, number>;
  /** Bâtiments construits par l'agent. */
  houses: number;
  /** Temps de jeu (s) autorisant la prochaine action de récolte/craft (cadence). */
  nextGatherGameTime: number;
  /** Projet courant (craft/construction/agriculture), null si aucun. */
  plan: ActivePlan | null;
  /** Temps de jeu (s) de naissance (peut être négatif pour la population initiale). */
  birthGameTime: number;
  /** Espérance de vie de l'agent, en années de jeu. */
  lifespanYears: number;
  /** Ids des parents biologiques, ou null (population initiale / nés hors simulation). */
  parents: [number, number] | null;
  /** Grossesse en cours, ou null. */
  pregnant: Pregnancy | null;
  /** Mentor observé pendant l'adolescence (Phase 9). Détermine le métier à l'âge adulte. */
  mentorId: number | null;
  /** Métier appris auprès d'un mentor adolescent. `null` = pas d'apprentissage encore acquis. */
  learnedJob: Job | null;
  /** Temps (s de jeu) cumulé en observation d'un mentor au travail, par métier. */
  apprenticeXp: Map<Job, number>;
  /** Santé courante 0..HEALTH_MAX. 0 = mort (Phase 10). */
  health: number;
  /** Maladie en cours, ou null. */
  illness: Illness | null;
  /** Humeurs courantes 0..100 (Phase 12). */
  emotions: Emotions;
  /** Stress cumulé 0..100 (Phase 12). Au-dessus de 80 → fragilité et dialogue altéré. */
  stress: number;
}

/** Déduit le métier d'un agent de ses aspirations puis, à défaut, de sa personnalité. */
export function assignJob(aspirations: string[], p: Personality): Job {
  const a = aspirations.join(' ');
  if (a.includes('fermier')) return 'fermier';
  if (a.includes('crafting') || a.includes('richesse')) return 'artisan';
  if (p.industriousness > 0.6 && p.conscientiousness > 0.5) return 'bucheron';
  if (p.openness > 0.6) return 'boulanger';
  if (p.conscientiousness > 0.55) return 'mineur';
  const r = (p.openness + p.industriousness + p.conscientiousness) / 3;
  return r < 0.34 ? 'mineur' : r < 0.67 ? 'bucheron' : 'boulanger';
}

export function makeNeeds(partial?: Partial<Needs>): Needs {
  return { energy: 80, hunger: 80, social: 70, hygiene: 80, fun: 70, ...partial };
}

/** Étape de vie déduite de l'âge (années de jeu). */
export function lifeStageFor(ageYears: number): LifeStage {
  if (ageYears < ADULT_AGE) return 'enfant';
  if (ageYears < ELDER_AGE) return 'adulte';
  return 'aine';
}

/** Vrai si l'agent est en âge d'apprendre un métier (adolescence, < majorité). */
export function isTeen(ageYears: number): boolean {
  return ageYears >= TEEN_AGE && ageYears < ADULT_AGE;
}

export function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function setActivity(agent: Agent, activity: ActivityKind): void {
  agent.state.activity = activity;
}
