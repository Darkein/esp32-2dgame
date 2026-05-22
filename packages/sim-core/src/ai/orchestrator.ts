import type { ActivityKind, DialogueEvent } from '@game/protocol';
import type { LLMProvider } from '@game/llm';
import type { Agent } from '../entities';
import type { SimClock } from '../clock';

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
    return (
      `Nom: ${agent.state.name}. ` +
      `Ouverture ${t(p.openness)}, application ${t(p.conscientiousness)}, ` +
      `extraversion ${t(p.extraversion)}, amabilité ${t(p.agreeableness)}, ` +
      `assiduité ${t(p.industriousness)}. ` +
      `Aspirations: ${agent.aspirations.join(', ')}.`
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
