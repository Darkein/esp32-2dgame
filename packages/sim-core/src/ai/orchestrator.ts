import type { ActivityKind, DialogueEvent } from '@game/protocol';
import type { LLMProvider } from '@game/llm';
import type { Agent } from '../entities';
import type { SimClock } from '../clock';
import { dominantEmotion } from './emotion';

const ACTION_MAP: Record<string, ActivityKind> = {
  dormir: 'sleeping',
  manger: 'eating',
  travailler: 'working',
  socialiser: 'socializing',
  detente: 'crafting',
  'se détendre': 'crafting',
};

/** Biais d'activité courant fixé par le LLM pour chaque agent (id -> activité). */
export type GoalBias = Map<number, ActivityKind | null>;

/**
 * Couche lente : un orchestrateur LLM par agent, appelé en ASYNCHRONE et jamais
 * bloquant. Il fixe l'objectif (texte lisible) + un biais d'action, et génère les
 * dialogues FR. Si aucun provider n'est disponible, le jeu fonctionne quand même.
 */
export class Orchestrator {
  readonly bias: GoalBias = new Map();
  private readonly thinkInterval: number;

  constructor(
    private readonly provider: LLMProvider | null,
    /** Intervalle minimal (ticks) entre deux réflexions d'un même agent. */
    thinkIntervalTicks = 600,
    /** Émet un dialogue vers les clients (rempli de façon asynchrone). */
    private readonly onDialogue: (e: DialogueEvent) => void = () => {},
  ) {
    this.thinkInterval = thinkIntervalTicks;
  }

  get enabled(): boolean {
    return this.provider !== null;
  }

  personaSummary(agent: Agent): string {
    const p = agent.personality;
    const t = (v: number) => (v > 0.66 ? 'élevé' : v > 0.33 ? 'moyen' : 'faible');
    const mood = dominantEmotion(agent.emotions);
    // Humeur seulement si nettement marquée (sinon ton neutre).
    const moodTag = mood.value > 35 ? ` Humeur: ${mood.key} (${mood.value | 0}/100).` : '';
    const stressTag = agent.stress > 60 ? ` Tu te sens très stressé(e).` : '';
    return (
      `Nom: ${agent.state.name}. ` +
      `Ouverture ${t(p.openness)}, application ${t(p.conscientiousness)}, ` +
      `extraversion ${t(p.extraversion)}, amabilité ${t(p.agreeableness)}, ` +
      `assiduité ${t(p.industriousness)}. ` +
      `Aspirations: ${agent.aspirations.join(', ')}.${moodTag}${stressTag}`
    );
  }

  /** Déclenche une réflexion si c'est le moment ; non bloquant. */
  maybeThink(agent: Agent, clock: SimClock): void {
    if (clock.tick < agent.nextThinkTick || agent.thinking) return;
    agent.nextThinkTick = clock.tick + this.thinkInterval;

    if (!this.provider) {
      agent.state.goal = agent.aspirations[0] ?? 'vivre sa vie';
      return;
    }

    agent.thinking = true;
    const n = agent.state.needs;
    const prompt =
      `${this.personaSummary(agent)}\n` +
      `Heure: ${clock.timeOfDay.toFixed(1)}h. ` +
      `Besoins (0-100): énergie ${n.energy | 0}, faim ${n.hunger | 0}, social ${n.social | 0}, ` +
      `détente ${n.fun | 0}.\n` +
      `Souvenirs récents:\n${agent.memory.recentText(clock.tick)}\n` +
      `Quel est ton objectif pour maintenant ? Réponds en JSON: ` +
      `{"objectif":"phrase courte en français","action":"dormir|manger|travailler|socialiser|detente"}`;

    this.provider
      .complete({ system: 'Tu incarnes un personnage de jeu de vie. Réponds uniquement en JSON.', prompt, maxTokens: 120 })
      .then((raw) => {
        const parsed = parseJson(raw);
        if (parsed?.objectif) agent.state.goal = String(parsed.objectif).slice(0, 120);
        const act = parsed?.action ? ACTION_MAP[String(parsed.action).toLowerCase()] : undefined;
        this.bias.set(agent.state.id, act ?? null);
        agent.memory.add(clock.tick, `J'ai décidé: ${agent.state.goal}`, 4);
      })
      .catch(() => {
        /* dégradation propre : on garde l'objectif précédent */
      })
      .finally(() => {
        agent.thinking = false;
      });
  }

  /** Fait parler `speaker` à `listener` (réplique FR courte), non bloquant. */
  converse(speaker: Agent, listener: Agent, clock: SimClock): void {
    if (!this.provider || speaker.thinking) return;
    speaker.thinking = true;
    const prompt =
      `${this.personaSummary(speaker)}\n` +
      `Tu croises ${listener.state.name}. ` +
      `Souvenirs:\n${speaker.memory.recentText(clock.tick, 3)}\n` +
      `Dis-lui UNE phrase courte, naturelle, en français.`;
    this.provider
      .complete({ system: 'Tu incarnes un villageois. Réponds par une seule réplique en français, sans guillemets.', prompt, maxTokens: 60, temperature: 0.9 })
      .then((line) => {
        const text = line.replace(/^["']|["']$/g, '').slice(0, 160);
        if (!text) return;
        speaker.state.saying = text;
        speaker.sayingUntilTick = clock.tick + clock.ticksPerSecond * 4;
        speaker.memory.add(clock.tick, `J'ai dit à ${listener.state.name}: ${text}`, 3);
        listener.memory.add(clock.tick, `${speaker.state.name} m'a dit: ${text}`, 3);
        this.onDialogue({
          speakerId: speaker.state.id,
          listenerId: listener.state.id,
          text,
          voiceProfile: speaker.state.voiceProfile,
        });
      })
      .catch(() => {})
      .finally(() => {
        speaker.thinking = false;
      });
  }

  /**
   * Réponse de l'IA à un message/ordre du joueur. Pour un ordre, l'IA décide
   * d'obéir OU NON selon sa personnalité (amabilité/application) et ses besoins.
   * Chemin LLM si dispo, sinon repli déterministe (jeu jouable hors-ligne).
   */
  respondToPlayer(agent: Agent, text: string, isOrder: boolean, clock: SimClock): void {
    const orderedActivity = isOrder ? detectOrderActivity(text) : null;

    if (!this.provider) {
      this.respondFallback(agent, text, isOrder, orderedActivity, clock);
      return;
    }
    if (agent.thinking) {
      // LLM occupé : on assure quand même une réponse immédiate.
      this.respondFallback(agent, text, isOrder, orderedActivity, clock);
      return;
    }

    agent.thinking = true;
    const n = agent.state.needs;
    const prompt =
      `${this.personaSummary(agent)}\n` +
      `Tes besoins (0-100): énergie ${n.energy | 0}, faim ${n.hunger | 0}, social ${n.social | 0}.\n` +
      `Le joueur te ${isOrder ? 'donne cet ORDRE' : 'dit'}: "${text}"\n` +
      (isOrder
        ? `Décide librement d'obéir ou non selon ta personnalité et tes besoins. ` +
          `Réponds en JSON: {"accepte":true|false,"reponse":"une phrase en français","action":"dormir|manger|travailler|socialiser|detente|aucune"}`
        : `Réponds-lui par UNE phrase naturelle en français (parle de toi, tes aspirations). ` +
          `JSON: {"accepte":true,"reponse":"...","action":"aucune"}`);

    this.provider
      .complete({ system: 'Tu incarnes un villageois doté de libre arbitre. Réponds uniquement en JSON.', prompt, maxTokens: 120, temperature: 0.85 })
      .then((raw) => {
        const parsed = parsePlayerReply(raw);
        if (!parsed?.reponse) {
          this.respondFallback(agent, text, isOrder, orderedActivity, clock);
          return;
        }
        this.applyPlayerOutcome(agent, parsed.reponse, isOrder, parsed.accepte ?? true, ACTION_MAP[parsed.action ?? ''] ?? orderedActivity, clock);
      })
      .catch(() => this.respondFallback(agent, text, isOrder, orderedActivity, clock))
      .finally(() => {
        agent.thinking = false;
      });
  }

  private respondFallback(
    agent: Agent,
    text: string,
    isOrder: boolean,
    orderedActivity: ActivityKind | null,
    clock: SimClock,
  ): void {
    if (isOrder) {
      const { accept, why } = evaluateOrder(agent, orderedActivity);
      const reply = accept
        ? pick(['D\'accord, je m\'y mets.', 'Bonne idée, j\'y vais.', 'Comme tu veux, je le fais.'], agent)
        : `Non, pas maintenant : ${why}.`;
      this.applyPlayerOutcome(agent, reply, true, accept, accept ? orderedActivity : null, clock);
      return;
    }
    // Conversation libre : aspirations si on l'interroge, sinon humeur du moment.
    const low = text.toLowerCase();
    let reply: string;
    if (/aspir|rêve|reve|objectif|veux|envie|but/.test(low)) {
      reply = `J'aimerais ${agent.aspirations[0] ?? 'vivre tranquillement'}.`;
    } else if (/comment|ça va|ca va|humeur/.test(low)) {
      reply = moodSentence(agent);
    } else {
      reply = `${moodSentence(agent)} En ce moment, je veux ${agent.state.goal || 'vivre ma vie'}.`;
    }
    this.applyPlayerOutcome(agent, reply, false, true, null, clock);
  }

  private applyPlayerOutcome(
    agent: Agent,
    reply: string,
    isOrder: boolean,
    accepted: boolean,
    activity: ActivityKind | null,
    clock: SimClock,
  ): void {
    const text = reply.replace(/^["']|["']$/g, '').slice(0, 200);
    agent.state.saying = text;
    agent.sayingUntilTick = clock.tick + clock.ticksPerSecond * 4;
    agent.memory.add(clock.tick, `J'ai répondu au joueur: ${text}`, 5);
    if (isOrder && accepted && activity) {
      this.bias.set(agent.state.id, activity);
      agent.intent = activity;
      agent.actionUntilGameTime = clock.gameTime; // agit immédiatement
      agent.state.goal = `obéir au joueur (${activity})`;
    }
    this.onDialogue({ speakerId: agent.state.id, listenerId: 0, text, voiceProfile: agent.state.voiceProfile });
  }
}

function parseJson(raw: string): { objectif?: string; action?: string } | null {
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]) as { objectif?: string; action?: string };
  } catch {
    return null;
  }
}

function parsePlayerReply(raw: string): { accepte?: boolean; reponse?: string; action?: string } | null {
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]) as { accepte?: boolean; reponse?: string; action?: string };
  } catch {
    return null;
  }
}

/** Devine l'activité visée par un ordre du joueur (mots-clés FR). */
function detectOrderActivity(text: string): ActivityKind | null {
  const t = text.toLowerCase();
  if (/dor(s|mir)|couche|repose-toi|au lit/.test(t)) return 'sleeping';
  if (/mange|manger|nourri|repas|faim/.test(t)) return 'eating';
  if (/travaill|boss|bosse|boul(o|eau)t/.test(t)) return 'working';
  if (/parl|social|discut|rejoins|va voir/.test(t)) return 'socializing';
  if (/détend|detend|repos|amuse|joue|bricol/.test(t)) return 'crafting';
  return null;
}

/** Décision déterministe d'obéir : personnalité + conflit avec un besoin urgent. */
function evaluateOrder(agent: Agent, activity: ActivityKind | null): { accept: boolean; why: string } {
  const p = agent.personality;
  const n = agent.state.needs;
  let score = 0.25 + p.agreeableness * 0.55 + p.conscientiousness * 0.2;
  let why = 'je n\'en ai pas envie';
  if (activity === 'working' && n.energy < 35) {
    score -= 0.45;
    why = 'je suis épuisé';
  }
  if (activity !== 'eating' && n.hunger < 25) {
    score -= 0.3;
    why = 'j\'ai trop faim';
  }
  if (activity === 'sleeping' && n.energy > 75) {
    score -= 0.25;
    why = 'je n\'ai pas sommeil';
  }
  if (activity === null) {
    score -= 0.2;
    why = 'je ne comprends pas ce que tu veux';
  }
  return { accept: score >= 0.5, why };
}

function moodSentence(agent: Agent): string {
  const n = agent.state.needs;
  if (n.energy < 30) return 'Je suis épuisé.';
  if (n.hunger < 30) return 'J\'ai une faim de loup.';
  if (n.social < 30) return 'Je me sens un peu seul.';
  if (n.fun < 30) return 'Je m\'ennuie un peu.';
  return 'Ça va plutôt bien, merci.';
}

/** Choix stable (sans aléa) d'une phrase, indexé par la personnalité de l'agent. */
function pick(options: string[], agent: Agent): string {
  const i = Math.floor(agent.personality.agreeableness * options.length) % options.length;
  return options[i]!;
}
