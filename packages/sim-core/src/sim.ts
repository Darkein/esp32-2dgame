import type { DialogueEvent, WorldSnapshot, Vec2, TileType, Gender } from '@game/protocol';
import type { LLMProvider } from '@game/llm';
import { World } from './world';
import { SimClock, GAME_SECONDS_PER_DAY } from './clock';
import { Rng } from './rng';
import { type Agent, type ActivePlan, type Personality, assignJob, makeNeeds, distance, lifeStageFor } from './entities';
import { MemoryStream } from './ai/memory';
import { stepNeeds } from './ai/needs';
import { decideAction } from './ai/utility';
import { choosePlan } from './ai/planner';
import { Orchestrator } from './ai/orchestrator';
import { Market } from './market';
import { add, count, inventoryToStacks, pay, take } from './crafting';
import {
  BUILD_BY_KIND,
  CONCEPTION_RATE_PER_YEAR,
  COUPLE_THRESHOLD,
  DECISION_INTERVAL_SECONDS,
  FERTILE_MAX,
  FERTILE_MIN,
  FOOD_SATIETY,
  GATHER_CADENCE_SECONDS,
  GESTATION_SECONDS,
  JOB_PROFILES,
  LIFESPAN_MAX,
  LIFESPAN_MIN,
  MAX_ACTIONS_PER_TICK,
  MAX_FARMS_PER_AGENT,
  MAX_POP,
  MAX_SUBSTEPS_PER_TICK,
  RECIPE_BY_ID,
  RELATIONSHIP_GAIN_PER_GAME_SEC,
  STARTING_COINS,
  STARTING_INVENTORY,
  WALK_TILES_PER_GAME_SEC,
  YEAR_SECONDS,
  type Job,
} from './catalog';

// Prénoms par sexe (Camille → fille, Sacha → garçon par convention de ce village).
const NAMES_M = ['Hugo', 'Noé', 'Lucas', 'Théo', 'Gabriel', 'Raphaël', 'Sacha', 'Eliott'];
const NAMES_F = ['Camille', 'Léa', 'Jade', 'Manon', 'Inès', 'Zoé', 'Alice', 'Rose'];

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
  /** Multiplicateur de vitesse du temps (0 = pause, 1 = base, >1 = accéléré). */
  private speed = 1;

  constructor(opts: SimOptions = {}) {
    const seed = opts.seed ?? 1234;
    this.rng = new Rng(seed);
    this.clock = new SimClock(opts.ticksPerSecond ?? 15);
    this.world = new World(opts.width ?? 48, opts.height ?? 48, this.rng, GAME_SECONDS_PER_DAY);
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

  /** Règle la vitesse d'écoulement du temps (0 = pause, ≥1 = base/accéléré). */
  setSpeed(scale: number): void {
    this.speed = Math.max(0, scale);
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

  /** Personnalité d'un enfant : moyenne des parents + légère mutation, bornée 0..1. */
  private mixPersonality(a: Personality, b: Personality): Personality {
    const c01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
    const mix = (x: number, y: number) => c01((x + y) / 2 + (this.rng.next() - 0.5) * 0.2);
    return {
      openness: mix(a.openness, b.openness),
      conscientiousness: mix(a.conscientiousness, b.conscientiousness),
      extraversion: mix(a.extraversion, b.extraversion),
      agreeableness: mix(a.agreeableness, b.agreeableness),
      neuroticism: mix(a.neuroticism, b.neuroticism),
      industriousness: mix(a.industriousness, b.industriousness),
    };
  }

  /** Profil vocal selon le sexe et l'âge (les enfants ont une voix plus aiguë). */
  private voiceFor(gender: Gender, child: boolean): number {
    if (child) return 2; // aigu-vif
    return gender === 'M' ? this.rng.pick([0, 3, 5]) : this.rng.pick([2, 4, 1]);
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
      const gender: Gender = this.rng.chance(0.5) ? 'M' : 'F';
      // Population initiale d'âges variés (18..60 ans) : on situe la naissance dans le passé.
      const ageYears = this.rng.range(18, 60);
      const birthGameTime = this.clock.gameTime - ageYears * YEAR_SECONDS;

      const agent: Agent = {
        state: {
          id,
          name: this.rng.pick(gender === 'M' ? NAMES_M : NAMES_F),
          pos: { ...home },
          activity: 'idle',
          needs: makeNeeds({
            energy: this.rng.range(50, 90),
            hunger: this.rng.range(50, 90),
          }),
          voiceProfile: this.voiceFor(gender, false),
          goal: 'commencer la journée',
          saying: '',
          inventory: [],
          houses: 0,
          job,
          coins: STARTING_COINS,
          gender,
          ageYears: Math.floor(ageYears),
          lifeStage: lifeStageFor(ageYears),
          partnerId: 0,
        },
        plan: null,
        personality,
        aspirations,
        home,
        workplace,
        target: null,
        intent: 'idle',
        actionUntilGameTime: 0,
        relationships: new Map(),
        memory: new MemoryStream(),
        nextThinkTick: this.rng.int(300),
        thinking: false,
        sayingUntilTick: 0,
        inventory: new Map(Object.entries(STARTING_INVENTORY)),
        houses: 0,
        nextGatherGameTime: 0,
        birthGameTime,
        lifespanYears: this.rng.range(LIFESPAN_MIN, LIFESPAN_MAX),
        parents: null,
        pregnant: null,
      };
      this.agents.push(agent);
    }
  }

  /** Avance la simulation d'un tick réel. Retourne les dialogues émis ce tick.
   *  À haute vitesse, un tick couvre plusieurs heures de jeu : on subdivise alors en
   *  sous-étapes décisionnelles (≈ 15 min de jeu chacune) pour que les agents puissent
   *  enchaîner plusieurs activités au fil de cette tranche. */
  tick(): DialogueEvent[] {
    const dtTotal = this.clock.advance(this.speed);
    const endTime = this.clock.gameTime;

    // Découpage : au moins 1 sous-étape, plafonnée à MAX_SUBSTEPS_PER_TICK.
    const nSubsteps = dtTotal > 0
      ? Math.max(1, Math.min(MAX_SUBSTEPS_PER_TICK, Math.ceil(dtTotal / DECISION_INTERVAL_SECONDS)))
      : 1;
    const subDt = nSubsteps > 0 ? dtTotal / nSubsteps : 0;

    for (let s = 0; s < nSubsteps; s++) {
      // Temps de jeu « courant » à la fin de cette sous-étape.
      const subEnd = endTime - (nSubsteps - 1 - s) * subDt;
      // Échéances de tuiles arrivées à terme dans cette tranche (cultures, gisements).
      this.world.regrow(subEnd);
      for (const agent of this.agents) {
        stepNeeds(agent.state.needs, agent.state.activity, subDt);

        // Re-décision cadencée en temps de jeu (≈ toutes les 15 min de jeu) : permet à
        // un agent de changer d'activité plusieurs fois quand un tick couvre des heures.
        if (subEnd >= agent.actionUntilGameTime) {
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
          agent.actionUntilGameTime = subEnd + DECISION_INTERVAL_SECONDS;
        }

        this.stepMovement(agent, subDt, subEnd);
      }
    }

    // Une fois par tick réel : couche lente (LLM, ticks réels) + expiration des répliques.
    for (const agent of this.agents) {
      this.orchestrator.maybeThink(agent, this.clock);
      if (agent.state.saying && this.clock.tick >= agent.sayingUntilTick) agent.state.saying = '';
    }

    // Cycle de la vie : vieillissement, couples, grossesses, naissances, morts.
    this.stepLife(dtTotal);

    return this.drainDialogues();
  }

  private stepMovement(agent: Agent, dt: number, now: number): void {
    const pos = agent.state.pos;
    const target = agent.target;
    if (target && distance(pos, target) > 0.4) {
      const dx = target.x - pos.x;
      const dy = target.y - pos.y;
      const d = Math.hypot(dx, dy) || 1;
      // Pas borné à la distance restante (évite le dépassement en avance rapide).
      const step = Math.min(WALK_TILES_PER_GAME_SEC * dt, d);
      pos.x += (dx / d) * step;
      pos.y += (dy / d) * step;
      agent.state.activity = 'walking';
      return;
    }
    // Arrivé : exécuter l'intention.
    agent.state.activity = agent.intent;
    if (agent.intent === 'socializing') this.trySocialize(agent, dt);
    else if (agent.intent === 'working') this.advanceWork(agent, now);
    else if (agent.intent === 'crafting') this.advancePlan(agent, dt);
    else if (agent.intent === 'eating') this.tryEat(agent, now);
    else if (agent.intent === 'trading') this.tryTrade(agent, now);
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

  /** Travail sur place : cultiver/semer/récolter son champ, ou exploiter un gisement.
   *  À haute vitesse un tick peut couvrir plusieurs heures de jeu : on enchaîne donc
   *  toutes les actions cadencées qui « tiennent » dans cet intervalle (jusqu'à un cap). */
  private advanceWork(agent: Agent, now: number): void {
    if (now < agent.nextGatherGameTime) return;
    const x = Math.round(agent.state.pos.x);
    const y = Math.round(agent.state.pos.y);
    const id = agent.state.id;
    const profile = JOB_PROFILES[agent.state.job as Job] ?? JOB_PROFILES.bucheron;

    for (let iter = 0; iter < MAX_ACTIONS_PER_TICK && now >= agent.nextGatherGameTime; iter++) {
      const tile = this.world.tileAt(x, y);
      let acted = false;
      if (tile === 'champ_mur' && this.world.farmOwnerAt(x, y) === id) {
        const ble = this.world.reap(x, y);
        if (ble > 0) {
          add(agent.inventory, 'ble', ble);
          agent.memory.add(this.clock.tick, `J'ai récolté ${ble} blé`, 3);
          acted = true;
        }
      } else if (tile === 'farm' && this.world.farmOwnerAt(x, y) === id && count(agent.inventory, 'graine') >= 1) {
        if (this.world.plant(x, y, now)) {
          take(agent.inventory, 'graine', 1);
          agent.memory.add(this.clock.tick, "J'ai semé un champ", 2);
          acted = true;
        }
      } else if (profile.farms && (tile === 'grass' || tile === 'dirt') && this.world.countFarms(id) < MAX_FARMS_PER_AGENT) {
        if (this.world.cultivate(x, y, id)) {
          agent.memory.add(this.clock.tick, "J'ai labouré un nouveau champ", 4);
          acted = true;
        }
      } else {
        const res = this.world.harvest(x, y, now);
        if (res) {
          add(agent.inventory, res, 1);
          agent.memory.add(this.clock.tick, `J'ai récolté du ${res}`, 2);
          acted = true;
        }
      }
      if (!acted) return; // rien à faire ici : on n'avance pas la cadence non plus
      agent.nextGatherGameTime += GATHER_CADENCE_SECONDS;
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

  /** Avance le plan courant (fabrication ou construction) dans le temps de jeu. */
  private advancePlan(agent: Agent, dt: number): void {
    if (!agent.plan) agent.plan = this.materializePlan(agent);
    const plan = agent.plan;
    if (!plan) return;
    if (!this.atPlanStation(agent, plan)) return; // pas encore au bon endroit

    // `progress` accumule des secondes de jeu ; les durées du catalogue sont en s de jeu.
    plan.progress += dt;
    if (plan.type === 'craft') {
      const r = RECIPE_BY_ID[plan.recipeId]!;
      if (plan.progress < r.durationSeconds) return;
      add(agent.inventory, r.output.kind, r.output.qty);
      agent.memory.add(this.clock.tick, `J'ai fabriqué : ${r.output.kind}`, 3);
      agent.plan = null;
    } else {
      const b = BUILD_BY_KIND[plan.kind]!;
      if (plan.progress < b.durationSeconds) return;
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

  /** Échange au marché : vend les surplus, achète de quoi manger si la faim presse.
   *  À haute vitesse, on enchaîne les rounds de troc tant que la cadence le permet. */
  private tryTrade(agent: Agent, now: number): void {
    if (now < agent.nextGatherGameTime) return;
    const marche = this.world.findBuilding('marche', agent.state.pos);
    if (!marche || distance(agent.state.pos, marche.pos) > 1.6) return;

    const inv = agent.inventory;
    const profile = JOB_PROFILES[agent.state.job as Job] ?? JOB_PROFILES.bucheron;
    for (let iter = 0; iter < MAX_ACTIONS_PER_TICK && now >= agent.nextGatherGameTime; iter++) {
      let progressed = false;
      // Vendre le surplus (réserve de pain plus petite pour alimenter le village).
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
        progressed = true;
      }
      // Acheter de quoi manger si la faim monte (pain de préférence, sinon blé).
      if (agent.state.needs.hunger < 50 && count(inv, 'pain') < 1 && count(inv, 'ble') < 2) {
        let spent = this.market.buy(inv, 'pain', 1, agent.state.coins);
        if (spent === 0) spent = this.market.buy(inv, 'ble', 3, agent.state.coins);
        if (spent > 0) {
          agent.state.coins -= spent;
          progressed = true;
        }
      }
      // Acheter les intrants que le métier ne produit pas lui-même.
      for (const kind of profile.buys) {
        if (count(inv, kind) >= 2) continue;
        const spent = this.market.buy(inv, kind, 3, agent.state.coins);
        if (spent > 0) {
          agent.state.coins -= spent;
          progressed = true;
        }
      }
      if (!progressed) return; // plus rien à échanger : la cadence reste où elle est
      agent.nextGatherGameTime += GATHER_CADENCE_SECONDS;
    }
  }

  /** Manger : consomme le meilleur aliment disponible (cf. table de rassasiement).
   *  À haute vitesse, on prend plusieurs repas dans un même tick tant que la faim monte. */
  private tryEat(agent: Agent, now: number): void {
    if (now < agent.nextGatherGameTime) return;
    for (let iter = 0; iter < MAX_ACTIONS_PER_TICK && now >= agent.nextGatherGameTime; iter++) {
      if (agent.state.needs.hunger > 95) return;
      let best: string | null = null;
      for (const food of Object.keys(FOOD_SATIETY))
        if (count(agent.inventory, food) > 0 && (!best || FOOD_SATIETY[food]! > FOOD_SATIETY[best]!))
          best = food;
      if (!best || !take(agent.inventory, best, 1)) return;
      agent.state.needs.hunger = Math.min(100, agent.state.needs.hunger + FOOD_SATIETY[best]!);
      agent.nextGatherGameTime += GATHER_CADENCE_SECONDS;
    }
  }

  private trySocialize(agent: Agent, dt: number): void {
    if (agent.state.saying || agent.thinking) return;
    const other = this.agents.find(
      (a) => a !== agent && distance(a.state.pos, agent.state.pos) < 2.2,
    );
    if (!other) return;
    // L'affinité monte au prorata du temps de jeu passé ensemble (donc avec dt).
    const rel = (agent.relationships.get(other.state.id) ?? 0) + RELATIONSHIP_GAIN_PER_GAME_SEC * dt;
    agent.relationships.set(other.state.id, Math.min(100, rel));
    other.state.activity = 'talking';
    this.tryFormCouple(agent, other);
    if (this.rng.chance(0.04)) this.orchestrator.converse(agent, other, this.clock);
  }

  /** Deux adultes célibataires de sexe opposé, mutuellement attachés, se mettent en couple. */
  private tryFormCouple(a: Agent, b: Agent): void {
    if (a.state.partnerId || b.state.partnerId) return;
    if (a.state.lifeStage === 'enfant' || b.state.lifeStage === 'enfant') return;
    if (a.state.gender === b.state.gender) return;
    const relA = a.relationships.get(b.state.id) ?? 0;
    const relB = b.relationships.get(a.state.id) ?? 0;
    if (relA < COUPLE_THRESHOLD || relB < COUPLE_THRESHOLD) return;
    a.state.partnerId = b.state.id;
    b.state.partnerId = a.state.id;
    const now = this.clock.gameTime;
    a.memory.add(now, `Je me suis mis(e) en couple avec ${b.state.name}`, 8);
    b.memory.add(now, `Je me suis mis(e) en couple avec ${a.state.name}`, 8);
    this.dialogueQueue.push({
      speakerId: a.state.id,
      listenerId: b.state.id,
      text: `${b.state.name}, je crois que je t'aime.`,
      voiceProfile: a.state.voiceProfile,
    });
  }

  /** Cycle de la vie : vieillissement, passage à l'âge adulte, grossesses → naissances, morts. */
  private stepLife(dt: number): void {
    if (dt <= 0) return; // en pause, le temps de jeu ne s'écoule pas
    const now = this.clock.gameTime;
    const dead: number[] = [];
    for (const a of this.agents) {
      const age = (now - a.birthGameTime) / YEAR_SECONDS;
      a.state.ageYears = Math.floor(age);
      const stage = lifeStageFor(age);
      // Passage à l'âge adulte : on attribue un métier et une voix d'adulte.
      if (a.state.lifeStage === 'enfant' && stage !== 'enfant') {
        a.state.job = assignJob(a.aspirations, a.personality);
        a.state.voiceProfile = this.voiceFor(a.state.gender, false);
      }
      a.state.lifeStage = stage;

      // Mort de vieillesse.
      if (age > a.lifespanYears) {
        dead.push(a.state.id);
        continue;
      }

      // Grossesse en cours → naissance à terme.
      if (a.pregnant) {
        if (now - a.pregnant.sinceGameTime >= GESTATION_SECONDS) {
          const father = this.agents.find((x) => x.state.id === a.pregnant!.fatherId);
          this.spawnChild(a, father ?? a);
          a.pregnant = null;
        }
        continue;
      }

      // Conception : femme adulte fertile en couple avec un homme adulte.
      if (
        a.state.gender === 'F' &&
        a.state.partnerId &&
        age >= FERTILE_MIN &&
        age <= FERTILE_MAX &&
        this.agents.length < MAX_POP
      ) {
        const partner = this.agents.find((x) => x.state.id === a.state.partnerId);
        if (partner && partner.state.gender === 'M' && partner.state.lifeStage !== 'enfant') {
          const prob = (CONCEPTION_RATE_PER_YEAR * dt) / YEAR_SECONDS;
          if (this.rng.chance(prob)) a.pregnant = { sinceGameTime: now, fatherId: partner.state.id };
        }
      }
    }
    if (dead.length) this.removeAgents(dead);
  }

  /** Fait naître un enfant des deux parents (personnalité héritée, voix enfantine). */
  private spawnChild(mother: Agent, father: Agent): void {
    const now = this.clock.gameTime;
    const id = this.nextId++;
    const gender: Gender = this.rng.chance(0.5) ? 'M' : 'F';
    const name = this.rng.pick(gender === 'M' ? NAMES_M : NAMES_F);
    const personality = this.mixPersonality(mother.personality, father.personality);
    const home = { ...mother.home };
    const agent: Agent = {
      state: {
        id,
        name,
        pos: { ...home },
        activity: 'idle',
        needs: makeNeeds(),
        voiceProfile: this.voiceFor(gender, true),
        goal: 'grandir',
        saying: '',
        inventory: [],
        houses: 0,
        job: '',
        coins: 0,
        gender,
        ageYears: 0,
        lifeStage: 'enfant',
        partnerId: 0,
      },
      plan: null,
      personality,
      aspirations: [this.rng.pick(ASPIRATIONS)],
      home,
      workplace: { ...mother.workplace },
      target: null,
      intent: 'idle',
      actionUntilGameTime: 0,
      relationships: new Map(),
      memory: new MemoryStream(),
      nextThinkTick: this.rng.int(300),
      thinking: false,
      sayingUntilTick: 0,
      inventory: new Map(),
      houses: 0,
      nextGatherGameTime: 0,
      birthGameTime: now,
      lifespanYears: this.rng.range(LIFESPAN_MIN, LIFESPAN_MAX),
      parents: [mother.state.id, father.state.id],
      pregnant: null,
    };
    this.agents.push(agent);
    mother.memory.add(now, `Naissance de ${name}`, 9);
    father.memory.add(now, `Naissance de ${name}`, 9);
    this.dialogueQueue.push({
      speakerId: mother.state.id,
      listenerId: 0,
      text: `Nous avons un enfant : ${name} !`,
      voiceProfile: mother.state.voiceProfile,
    });
  }

  /** Retire des agents morts : libère les conjoints et transmet leurs biens (héritage). */
  private removeAgents(ids: number[]): void {
    for (const id of ids) {
      const idx = this.agents.findIndex((a) => a.state.id === id);
      if (idx < 0) continue;
      const a = this.agents[idx]!;
      if (a.state.partnerId) {
        const p = this.agents.find((x) => x.state.id === a.state.partnerId);
        if (p) p.state.partnerId = 0;
      }
      // Héritage : un enfant vivant récupère les biens, sinon ils deviennent publics.
      const heir = this.agents.find((x) => x.parents?.includes(id) && !ids.includes(x.state.id));
      this.world.reassignOwner(id, heir ? heir.state.id : 0);
      this.agents.splice(idx, 1);
    }
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
      gameTime: this.clock.gameTime,
      dayCount: this.clock.dayCount,
      date: this.clock.date,
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
