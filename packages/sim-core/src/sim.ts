import type { DialogueEvent, WorldSnapshot, Vec2 } from '@game/protocol';
import { VOICE_PROFILES } from '@game/protocol';
import type { LLMProvider } from '@game/llm';
import { World } from './world';
import { SimClock } from './clock';
import { Rng } from './rng';
import { type Agent, type Personality, makeNeeds, distance } from './entities';
import { MemoryStream } from './ai/memory';
import { stepNeeds } from './ai/needs';
import { decideAction } from './ai/utility';
import { Orchestrator } from './ai/orchestrator';

const NAMES = [
  'Camille', 'Hugo', 'Léa', 'Noé', 'Jade', 'Lucas', 'Manon', 'Théo',
  'Inès', 'Gabriel', 'Zoé', 'Raphaël', 'Alice', 'Sacha', 'Rose', 'Eliott',
];

const ASPIRATIONS = [
  'devenir le meilleur fermier du village',
  'construire une grande maison',
  'se faire beaucoup d\'amis',
  'explorer tout le monde',
  'maîtriser le crafting',
  'vivre une vie paisible',
  'fonder une famille',
  'amasser des richesses',
];

export interface SimOptions {
  width?: number;
  height?: number;
  agentCount?: number;
  seed?: number;
  provider?: LLMProvider | null;
  ticksPerSecond?: number;
}

export class Simulation {
  readonly world: World;
  readonly clock: SimClock;
  readonly agents: Agent[] = [];
  private readonly rng: Rng;
  private readonly orchestrator: Orchestrator;
  private readonly dialogueQueue: DialogueEvent[] = [];
  private nextId = 1;

  constructor(opts: SimOptions = {}) {
    const seed = opts.seed ?? 1234;
    this.rng = new Rng(seed);
    this.clock = new SimClock(opts.ticksPerSecond ?? 15);
    this.world = new World(opts.width ?? 48, opts.height ?? 48, this.rng);
    this.orchestrator = new Orchestrator(opts.provider ?? null, 600, (e) => this.dialogueQueue.push(e));
    this.spawnAgents(opts.agentCount ?? 8);
  }

  get llmEnabled(): boolean {
    return this.orchestrator.enabled;
  }

  private randomPersonality(): Personality {
    const r = () => this.rng.next();
    return {
      openness: r(),
      conscientiousness: r(),
      extraversion: r(),
      agreeableness: r(),
      neuroticism: r(),
      industriousness: r(),
    };
  }

  private spawnAgents(n: number): void {
    for (let i = 0; i < n; i++) {
      const home = this.world.nearestWalkable(
        4 + this.rng.int(this.world.width - 8),
        4 + this.rng.int(this.world.height - 8),
      );
      const workplace = this.world.nearestWalkable(
        4 + this.rng.int(this.world.width - 8),
        4 + this.rng.int(this.world.height - 8),
      );
      this.world.addBuilding('maison', home);
      this.world.addBuilding('atelier', workplace);

      const aspirations = [this.rng.pick(ASPIRATIONS), this.rng.pick(ASPIRATIONS)].filter(
        (v, idx, a) => a.indexOf(v) === idx,
      );

      const agent: Agent = {
        state: {
          id: this.nextId++,
          name: this.rng.pick(NAMES),
          pos: { ...home },
          activity: 'idle',
          needs: makeNeeds({
            energy: this.rng.range(50, 90),
            hunger: this.rng.range(50, 90),
          }),
          voiceProfile: i % VOICE_PROFILES.length,
          goal: 'commencer la journée',
          saying: '',
        },
        personality: this.randomPersonality(),
        aspirations,
        home,
        workplace,
        target: null,
        intent: 'idle',
        actionUntilTick: 0,
        relationships: new Map(),
        memory: new MemoryStream(),
        nextThinkTick: this.rng.int(300),
        thinking: false,
        sayingUntilTick: 0,
      };
      this.agents.push(agent);
    }
  }

  /** Avance la simulation d'un tick. Retourne les dialogues émis ce tick. */
  tick(): DialogueEvent[] {
    this.clock.advance();
    const speed = 2.5 / this.clock.ticksPerSecond;

    for (const agent of this.agents) {
      stepNeeds(agent.state.needs, agent.state.activity);

      // Couche lente (LLM) : non bloquante.
      this.orchestrator.maybeThink(agent, this.clock);

      // Couche rapide : (re)décision périodique.
      if (this.clock.tick >= agent.actionUntilTick) {
        const decision = decideAction(
          agent,
          this.world,
          this.clock,
          this.agents,
          this.orchestrator.bias.get(agent.state.id) ?? null,
        );
        agent.intent = decision.activity;
        agent.target = this.world.nearestWalkable(Math.round(decision.target.x), Math.round(decision.target.y));
        agent.actionUntilTick = this.clock.tick + this.clock.ticksPerSecond;
      }

      this.stepMovement(agent, speed);

      // Expiration de la réplique affichée.
      if (agent.state.saying && this.clock.tick >= agent.sayingUntilTick) agent.state.saying = '';
    }

    return this.drainDialogues();
  }

  private stepMovement(agent: Agent, speed: number): void {
    const pos = agent.state.pos;
    const target = agent.target;
    if (target && distance(pos, target) > 0.4) {
      const dx = target.x - pos.x;
      const dy = target.y - pos.y;
      const d = Math.hypot(dx, dy) || 1;
      pos.x += (dx / d) * speed;
      pos.y += (dy / d) * speed;
      agent.state.activity = 'walking';
      return;
    }
    // Arrivé : exécuter l'intention.
    agent.state.activity = agent.intent;
    if (agent.intent === 'socializing') this.trySocialize(agent);
  }

  private trySocialize(agent: Agent): void {
    if (agent.state.saying || agent.thinking) return;
    const other = this.agents.find(
      (a) => a !== agent && distance(a.state.pos, agent.state.pos) < 2.2,
    );
    if (!other) return;
    // Renforce la relation.
    const rel = (agent.relationships.get(other.state.id) ?? 0) + 1;
    agent.relationships.set(other.state.id, Math.min(100, rel));
    other.state.activity = 'talking';
    if (this.rng.chance(0.04)) this.orchestrator.converse(agent, other, this.clock);
  }

  private drainDialogues(): DialogueEvent[] {
    if (this.dialogueQueue.length === 0) return [];
    const out = this.dialogueQueue.splice(0, this.dialogueQueue.length);
    return out;
  }

  /** Message du joueur vers une IA (texte ou ordre). Réponse asynchrone via dialogue. */
  handleChat(agentId: number, text: string, isOrder: boolean): void {
    const agent = this.agents.find((a) => a.state.id === agentId);
    if (!agent) return;
    agent.memory.add(this.clock.tick, `Le joueur m'a ${isOrder ? 'ordonné' : 'dit'}: ${text}`, 6);
    // Phase 5 : l'orchestrateur évaluera l'ordre selon la personnalité. Pour l'instant,
    // on déclenche une réflexion immédiate qui prendra en compte le nouveau souvenir.
    agent.nextThinkTick = this.clock.tick;
  }

  snapshot(includeChunk = false): WorldSnapshot {
    return {
      tick: this.clock.tick,
      timeOfDay: this.clock.timeOfDay,
      agents: this.agents.map((a) => ({
        ...a.state,
        pos: { x: a.state.pos.x, y: a.state.pos.y },
        needs: { ...a.state.needs },
      })),
      items: this.world.items.map((i) => ({ ...i })),
      buildings: this.world.buildings.map((b) => ({ ...b })),
      chunk: includeChunk
        ? { width: this.world.width, height: this.world.height, tiles: [...this.world.tiles] }
        : undefined,
    };
  }

  spawnPoint(): Vec2 {
    return { x: this.world.width / 2, y: this.world.height / 2 };
  }
}
