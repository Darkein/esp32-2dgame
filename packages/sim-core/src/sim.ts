import type { DialogueEvent, WorldSnapshot, Vec2, TileType } from '@game/protocol';
import { VOICE_PROFILES } from '@game/protocol';
import type { LLMProvider } from '@game/llm';
import { World } from './world';
import { SimClock } from './clock';
import { Rng } from './rng';
import { type Agent, type ActivePlan, type Personality, assignJob, makeNeeds, distance } from './entities';
import { MemoryStream } from './ai/memory';
import { stepNeeds } from './ai/needs';
import { decideAction } from './ai/utility';
import { choosePlan } from './ai/planner';
import { Orchestrator } from './ai/orchestrator';
import { Market } from './market';
import { add, count, inventoryToStacks, pay, take } from './crafting';
import {
  BUILD_BY_KIND,
  FOOD_SATIETY,
  JOB_PROFILES,
  MAX_FARMS_PER_AGENT,
  RECIPE_BY_ID,
  STARTING_COINS,
  STARTING_INVENTORY,
  type Job,
} from './catalog';

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
  readonly market = new Market();
  private readonly rng: Rng;
  private readonly orchestrator: Orchestrator;
  private readonly dialogueQueue: DialogueEvent[] = [];
  private nextId = 1;

  constructor(opts: SimOptions = {}) {
    const seed = opts.seed ?? 1234;
    this.rng = new Rng(seed);
    this.clock = new SimClock(opts.ticksPerSecond ?? 15);
    this.world = new World(opts.width ?? 48, opts.height ?? 48, this.rng, this.clock.ticksPerDay);
    this.orchestrator = new Orchestrator(opts.provider ?? null, 600, (e) => this.dialogueQueue.push(e));
    // Marché central : place d'échange unique du village.
    this.world.addBuilding('marche', this.world.nearestWalkable(
      Math.floor(this.world.width / 2),
      Math.floor(this.world.height / 2),
    ));
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
      const id = this.nextId++;
      // La maison et l'atelier de départ appartiennent à l'agent (usage exclusif).
      this.world.addBuilding('maison', home, id);
      this.world.addBuilding('atelier', workplace, id);

      const aspirations = [this.rng.pick(ASPIRATIONS), this.rng.pick(ASPIRATIONS)].filter(
        (v, idx, a) => a.indexOf(v) === idx,
      );
      const personality = this.randomPersonality();
      const job = assignJob(aspirations, personality);

      const agent: Agent = {
        state: {
          id,
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
          inventory: [],
          houses: 0,
          job,
          coins: STARTING_COINS,
        },
        plan: null,
        personality,
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
        inventory: new Map(Object.entries(STARTING_INVENTORY)),
        houses: 0,
        nextGatherTick: 0,
      };
      this.agents.push(agent);
    }
  }

  /** Avance la simulation d'un tick. Retourne les dialogues émis ce tick. */
  tick(): DialogueEvent[] {
    this.clock.advance();
    const speed = 2.5 / this.clock.ticksPerSecond;

    // Croissance des cultures + repousse des gisements (échéances arrivées à terme).
    this.world.regrow(this.clock.tick);

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
        const target = this.resolveTarget(agent, decision.activity, decision.target);
        agent.target = this.world.nearestWalkable(Math.round(target.x), Math.round(target.y));
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
    else if (agent.intent === 'working') this.advanceWork(agent);
    else if (agent.intent === 'crafting') this.advancePlan(agent);
    else if (agent.intent === 'eating') this.tryEat(agent);
    else if (agent.intent === 'trading') this.tryTrade(agent);
  }

  /** Cible de déplacement selon l'activité : poste de craft, chantier, marché ou gisement. */
  private resolveTarget(agent: Agent, activity: string, fallback: Vec2): Vec2 {
    if (activity === 'crafting') return this.planTarget(agent) ?? fallback;
    if (activity === 'working') return this.workTarget(agent) ?? fallback;
    if (activity === 'trading') return this.world.findBuilding('marche', agent.state.pos)?.pos ?? fallback;
    return fallback;
  }

  /** Où l'agent doit se rendre pour avancer son plan (poste requis ou chantier). */
  private planTarget(agent: Agent): Vec2 | null {
    if (!agent.plan) agent.plan = this.materializePlan(agent);
    const plan = agent.plan;
    if (!plan) return null;
    if (plan.type === 'build') return plan.site;
    const station = RECIPE_BY_ID[plan.recipeId]?.station ?? null;
    if (!station) return agent.home;
    // L'atelier est personnel (usage exclusif) ; le four est un bien partagé du village.
    if (station === 'atelier') return agent.workplace;
    const b = this.world.findBuilding(station, agent.state.pos);
    return b ? b.pos : null;
  }

  /** Tuile à exploiter, orientée par le métier. L'agriculture ne porte que sur les
   *  champs possédés par l'agent (usage exclusif) ; les fermiers en créent au besoin. */
  private workTarget(agent: Agent): Vec2 | null {
    const pos = agent.state.pos;
    const id = agent.state.id;
    const has = (k: string) => count(agent.inventory, k);
    const profile = JOB_PROFILES[agent.state.job as Job] ?? JOB_PROFILES.bucheron;

    if (profile.farms) {
      // Récolter son propre champ mûr, sinon semer sur son champ libre.
      const ripe = this.world.findOwnedFarm(pos, 'champ_mur', id);
      if (ripe) return ripe;
      if (has('graine') >= 1) {
        const empty = this.world.findOwnedFarm(pos, 'farm', id);
        if (empty) return empty;
      }
      // Étendre son exploitation : labourer une nouvelle parcelle proche du domicile.
      if (this.world.countFarms(id) < MAX_FARMS_PER_AGENT) {
        const spot = this.world.findCultivable(agent.home);
        if (spot) return spot;
      }
    }

    // Besoin d'eau pour la filière pain : aller au bord de l'eau.
    if (has('farine') >= 1 && has('eau') < 1) {
      const edge = this.world.findWaterEdge(pos);
      if (edge) return edge;
    }
    // Gisement privilégié par le métier, sinon celui dont l'agent manque le plus.
    for (const t of profile.gather) {
      const spot = this.world.findTile(pos, t);
      if (spot) return spot;
    }
    const deficits: [TileType, number][] = [
      ['forest', 8 - has('bois')],
      ['stone', 5 - has('pierre')],
      ['dirt', 4 - has('argile')],
      ['sand', 3 - has('sable')],
    ];
    deficits.sort((a, b) => b[1] - a[1]);
    const wantTile = deficits[0]![1] > 0 ? deficits[0]![0] : 'forest';
    return this.world.findTile(pos, wantTile) ?? this.world.findTile(pos, 'forest') ?? agent.workplace;
  }

  /** Travail sur place : cultiver/semer/récolter son champ, ou exploiter un gisement. */
  private advanceWork(agent: Agent): void {
    if (this.clock.tick < agent.nextGatherTick) return;
    const x = Math.round(agent.state.pos.x);
    const y = Math.round(agent.state.pos.y);
    const id = agent.state.id;
    const cadence = () => (agent.nextGatherTick = this.clock.tick + this.clock.ticksPerSecond * 2);
    const tile = this.world.tileAt(x, y);
    const profile = JOB_PROFILES[agent.state.job as Job] ?? JOB_PROFILES.bucheron;

    // Récolter / semer uniquement sur ses propres champs.
    if (tile === 'champ_mur' && this.world.farmOwnerAt(x, y) === id) {
      const ble = this.world.reap(x, y);
      if (ble > 0) {
        add(agent.inventory, 'ble', ble);
        agent.memory.add(this.clock.tick, `J'ai récolté ${ble} blé`, 3);
        cadence();
      }
      return;
    }
    if (tile === 'farm' && this.world.farmOwnerAt(x, y) === id && count(agent.inventory, 'graine') >= 1) {
      if (this.world.plant(x, y, this.clock.tick)) {
        take(agent.inventory, 'graine', 1);
        agent.memory.add(this.clock.tick, 'J\'ai semé un champ', 2);
        cadence();
      }
      return;
    }
    // Le fermier laboure une nouvelle parcelle pour créer un champ qui lui appartient.
    if (profile.farms && (tile === 'grass' || tile === 'dirt') && this.world.countFarms(id) < MAX_FARMS_PER_AGENT) {
      if (this.world.cultivate(x, y, id)) {
        agent.memory.add(this.clock.tick, 'J\'ai labouré un nouveau champ', 4);
        cadence();
      }
      return;
    }
    const res = this.world.harvest(x, y, this.clock.tick);
    if (res) {
      add(agent.inventory, res, 1);
      agent.memory.add(this.clock.tick, `J'ai récolté du ${res}`, 2);
      cadence();
    }
  }

  /** Crée le plan concret (paie les matériaux, pose le chantier) à partir de l'intention. */
  private materializePlan(agent: Agent): ActivePlan | null {
    const intent = choosePlan(agent, this.world);
    if (!intent) return null;
    if (intent.kind === 'craft') {
      const r = RECIPE_BY_ID[intent.recipeId]!;
      if (!pay(agent.inventory, r.inputs)) return null;
      return { type: 'craft', recipeId: intent.recipeId, progress: 0 };
    }
    const b = BUILD_BY_KIND[intent.buildKind]!;
    if (!pay(agent.inventory, b.inputs)) return null;
    const site = this.pickBuildSite(agent, intent.buildKind);
    const chantier = this.world.addBuilding('chantier', site, agent.state.id);
    return { type: 'build', kind: intent.buildKind, site, buildingId: chantier.id, progress: 0 };
  }

  /** Avance le plan courant (fabrication ou construction) dans le temps. */
  private advancePlan(agent: Agent): void {
    if (!agent.plan) agent.plan = this.materializePlan(agent);
    const plan = agent.plan;
    if (!plan) return;
    if (!this.atPlanStation(agent, plan)) return; // pas encore au bon endroit

    plan.progress++;
    const tps = this.clock.ticksPerSecond;
    if (plan.type === 'craft') {
      const r = RECIPE_BY_ID[plan.recipeId]!;
      if (plan.progress < r.durationSeconds * tps) return;
      add(agent.inventory, r.output.kind, r.output.qty);
      agent.memory.add(this.clock.tick, `J'ai fabriqué : ${r.output.kind}`, 3);
      agent.plan = null;
    } else {
      const b = BUILD_BY_KIND[plan.kind]!;
      if (plan.progress < b.durationSeconds * tps) return;
      this.world.finishBuilding(plan.buildingId, plan.kind);
      agent.houses++;
      agent.state.houses = agent.houses;
      agent.memory.add(this.clock.tick, `J'ai construit : ${plan.kind}`, 8);
      agent.plan = null;
    }
  }

  /** L'agent est-il au bon poste / sur le chantier pour avancer son plan ? */
  private atPlanStation(agent: Agent, plan: ActivePlan): boolean {
    const pos = agent.state.pos;
    if (plan.type === 'build') return distance(pos, plan.site) < 1.4;
    const station = RECIPE_BY_ID[plan.recipeId]?.station ?? null;
    if (!station) return true; // craftable n'importe où
    if (station === 'atelier') return distance(pos, agent.workplace) < 1.6;
    const b = this.world.findBuilding(station, pos);
    return b != null && distance(pos, b.pos) < 1.6;
  }

  /** Emplacement de construction intelligent selon le type de bâtiment. */
  private pickBuildSite(agent: Agent, kind: string): Vec2 {
    // Le puits se place au plus près de l'eau ; le four/atelier/entrepôt se regroupent
    // autour du marché (cœur du village) ; la maison reste près du domicile.
    let anchor: Vec2;
    if (kind === 'puits') {
      anchor = this.world.findWaterEdge(agent.state.pos) ?? agent.home;
    } else if (kind === 'four' || kind === 'atelier' || kind === 'entrepot') {
      anchor = this.world.findBuilding('marche', agent.state.pos)?.pos ?? agent.home;
    } else {
      anchor = agent.home;
    }
    const ax = Math.round(anchor.x);
    const ay = Math.round(anchor.y);
    const offsets: [number, number][] = [
      [0, 0], [2, 0], [-2, 0], [0, 2], [0, -2], [2, 2], [-2, -2], [3, 0], [0, 3], [-3, 1], [1, -3],
    ];
    for (const [dx, dy] of offsets) {
      const spot = this.world.nearestWalkable(ax + dx, ay + dy);
      if (!this.world.buildingAt(spot.x, spot.y)) return spot;
    }
    return this.world.nearestWalkable(ax + 1, ay + 1);
  }

  /** Échange au marché : vend les surplus, achète de quoi manger si la faim presse. */
  private tryTrade(agent: Agent): void {
    if (this.clock.tick < agent.nextGatherTick) return;
    const marche = this.world.findBuilding('marche', agent.state.pos);
    if (!marche || distance(agent.state.pos, marche.pos) > 1.6) return;
    agent.nextGatherTick = this.clock.tick + this.clock.ticksPerSecond * 2;

    const inv = agent.inventory;
    const profile = JOB_PROFILES[agent.state.job as Job] ?? JOB_PROFILES.bucheron;
    // On garde quelques unités de tout, on vend le surplus (réserve de pain plus petite,
    // pour que le boulanger en mette en vente et nourrisse le village).
    let earned = 0;
    for (const [kind, qty] of [...inv.entries()]) {
      if (!this.market.tradable(kind)) continue;
      const keep = kind === 'pain' ? 2 : 4;
      if (qty <= keep) continue;
      earned += this.market.sell(inv, kind, qty - keep);
    }
    if (earned > 0) {
      agent.state.coins += earned;
      agent.memory.add(this.clock.tick, `J'ai vendu des biens (+${earned} pièces)`, 3);
    }

    // Achats : se nourrir si la faim monte (pain de préférence, sinon blé)…
    if (agent.state.needs.hunger < 50 && count(inv, 'pain') < 1 && count(inv, 'ble') < 2) {
      let spent = this.market.buy(inv, 'pain', 1, agent.state.coins);
      if (spent === 0) spent = this.market.buy(inv, 'ble', 3, agent.state.coins);
      agent.state.coins -= spent;
    }
    // …puis acheter les intrants que le métier ne produit pas lui-même.
    for (const kind of profile.buys) {
      if (count(inv, kind) >= 2) continue;
      agent.state.coins -= this.market.buy(inv, kind, 3, agent.state.coins);
    }
  }

  /** Manger : consomme le meilleur aliment disponible (cf. table de rassasiement). */
  private tryEat(agent: Agent): void {
    if (agent.state.needs.hunger > 95) return;
    if (this.clock.tick < agent.nextGatherTick) return;
    let best: string | null = null;
    for (const food of Object.keys(FOOD_SATIETY))
      if (count(agent.inventory, food) > 0 && (!best || FOOD_SATIETY[food]! > FOOD_SATIETY[best]!))
        best = food;
    if (best && take(agent.inventory, best, 1)) {
      agent.state.needs.hunger = Math.min(100, agent.state.needs.hunger + FOOD_SATIETY[best]!);
      agent.nextGatherTick = this.clock.tick + this.clock.ticksPerSecond * 2;
    }
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
    // L'IA décide elle-même d'obéir ou non (cf. Orchestrator.respondToPlayer).
    this.orchestrator.respondToPlayer(agent, text, isOrder, this.clock);
  }

  snapshot(includeChunk = false): WorldSnapshot {
    // Renvoie aussi le chunk si des tuiles ont changé (croissance/épuisement/repousse),
    // pour que le client redessine la carte sans nouveau type de message.
    const withChunk = includeChunk || this.world.consumeTilesDirty();
    return {
      tick: this.clock.tick,
      timeOfDay: this.clock.timeOfDay,
      agents: this.agents.map((a) => ({
        ...a.state,
        pos: { x: a.state.pos.x, y: a.state.pos.y },
        needs: { ...a.state.needs },
        inventory: inventoryToStacks(a.inventory),
        houses: a.houses,
      })),
      items: this.world.items.map((i) => ({ ...i })),
      buildings: this.world.buildings.map((b) => ({ ...b })),
      chunk: withChunk
        ? { width: this.world.width, height: this.world.height, tiles: [...this.world.tiles] }
        : undefined,
    };
  }

  spawnPoint(): Vec2 {
    return { x: this.world.width / 2, y: this.world.height / 2 };
  }
}
