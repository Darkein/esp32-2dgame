import type { DialogueEvent, WorldSnapshot, Vec2, TileType, Gender, WeatherState, AnimalSnapshot } from '@game/protocol';
import type { LLMProvider } from '@game/llm';
import { World } from './world';
import { SimClock, GAME_SECONDS_PER_DAY, BASE_SCALE } from './clock';
import { Rng } from './rng';
import { makeWeather, rollWeather, WEATHER_EFFECTS } from './weather';
import { type Agent, type ActivePlan, type Personality, assignJob, makeNeeds, distance, lifeStageFor, isTeen } from './entities';
import { MemoryStream } from './ai/memory';
import { stepNeeds } from './ai/needs';
import { decideAction, needsCritical } from './ai/utility';
import { choosePlan } from './ai/planner';
import { Orchestrator } from './ai/orchestrator';
import { findPath } from './ai/pathfind';
import { buildTask, currentPhaseLabel, type TaskContext } from './ai/tasks';
import { bumpEmotion, decayEmotions, makeEmotions } from './ai/emotion';
import { Market } from './market';
import { add, count, inventoryToStacks, pay, take } from './crafting';
import {
  type Animal,
  findNearestFish,
  findNearestPrey,
  fishingSpot,
  maintainWildlife,
  seedWildlife,
  stepWildlifeAll,
} from './wildlife';
import {
  ANIMAL_PROFILES,
  APPRENTICE_PROXIMITY_TILES,
  APPRENTICE_XP_BONUS,
  BREAKUP_AFFINITY,
  BREAKUP_AFFINITY_SHOCK,
  buildingShape,
  BUILD_BY_KIND,
  CONCEPTION_RATE_PER_YEAR,
  FISH_RANGE,
  HUNT_INJURY_CHANCE,
  HUNT_INJURY_DAMAGE,
  HUNT_RANGE,
  ISOLATION_RADIUS,
  PREY_FLEE_RADIUS,
  WILDLIFE_RESPAWN_INTERVAL_SECONDS,
  WOLF_ATTACK_RADIUS,
  WOLF_BITE_COOLDOWN_SECONDS,
  WOLF_BITE_DAMAGE,
  CONTAGION_RADIUS,
  CONTAGION_RATE_PER_SEC,
  COUPLE_THRESHOLD,
  JEALOUSY_DECAY_PER_SEC,
  JEALOUSY_GAP,
  DECISION_INTERVAL_SECONDS,
  ELDER_ENERGY_CAP,
  FERTILE_MAX,
  FERTILE_MIN,
  FOOD_SATIETY,
  FRAGILE_FACTOR,
  FUNERAL_MEMORY_RADIUS,
  GATHER_CADENCE_SECONDS,
  GESTATION_SECONDS,
  HEALTH_DEATH_THRESHOLD,
  HEALTH_DECAY_FROM_HYGIENE_PER_SEC,
  HEALTH_MAX,
  HEALTH_RECOVERY_PER_SEC,
  HYGIENE_HEALTH_THRESHOLD,
  ILLNESS_DAMAGE_PER_SEC,
  ILLNESS_DURATION_SECONDS,
  ILLNESS_INCUBATION_SECONDS,
  ILLNESS_ONSET_PER_YEAR,
  JOB_PROFILES,
  levelFromXp,
  skillSpeed,
  XP_PER_ACTION,
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
  TILE_MOVE_COST,
  WALK_TILES_PER_REAL_SEC,
  YEAR_SECONDS,
  type Job,
} from './catalog';

/** Décalage initial désynchronisé (en secondes de jeu) pour la première décision
 *  d'un agent. Distribution low-discrepancy basée sur le nombre d'or → spread
 *  régulier sans burn du RNG partagé (la composition des villages reste stable). */
const PHI_INV = 0.6180339887498949;
function staggerOffset(id: number): number {
  return ((id * PHI_INV) - Math.floor(id * PHI_INV)) * DECISION_INTERVAL_SECONDS;
}

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
  /** Centres des hameaux pré-amorcés (spawns + ancrage des constructions). */
  readonly villages: Vec2[] = [];
  /** Faune sauvage (Phase 15). Cerfs/lapins/sangliers/loups/poissons. */
  readonly wildlife: Animal[] = [];
  /** Météo courante (renouvelée chaque jour selon la saison). */
  weather: WeatherState;
  private readonly rng: Rng;
  /** RNG dédié à la faune (spawn + errance). Isolé pour ne pas perturber les
   *  tirages des autres sous-systèmes (couples, maladies, naissances). */
  private readonly wildlifeRng: Rng;
  private readonly orchestrator: Orchestrator;
  private readonly dialogueQueue: DialogueEvent[] = [];
  private nextId = 1;
  /** Ids des animaux : disjoint des agents/bâtiments via un préfixe haut. */
  private nextWildlifeId = 100_000;
  /** Temps de jeu (s) du prochain réajustement de la population. */
  private nextWildlifeMaintenanceAt = 0;
  /** Multiplicateur de vitesse du temps (0 = pause, 1 = base, >1 = accéléré). */
  private speed = 1;

  constructor(opts: SimOptions = {}) {
    const seed = opts.seed ?? 1234;
    this.rng = new Rng(seed);
    // RNG faune dérivé du seed mais indépendant : reproductible et isolé.
    this.wildlifeRng = new Rng(seed ^ 0x9e3779b9);
    this.clock = new SimClock(opts.ticksPerSecond ?? 15);
    this.world = new World(opts.width ?? 48, opts.height ?? 48, this.rng, GAME_SECONDS_PER_DAY);
    this.orchestrator = new Orchestrator(opts.provider ?? null, 600, (e) => this.dialogueQueue.push(e));
    this.seedVillages();
    // Marché central : posé sur le plus gros village (premier dans la liste).
    const center = this.villages[0]!;
    this.placeBuilding('marche', center);
    this.spawnAgents(opts.agentCount ?? 8);
    this.weather = makeWeather(
      rollWeather(this.clock.season, this.rng),
      this.clock.gameTime,
      GAME_SECONDS_PER_DAY,
    );
    // Faune initiale : densité par biome (cf. `WILDLIFE_DENSITY`), cap dur intégré.
    this.wildlife.push(...seedWildlife(this.world, this.wildlifeRng, () => this.nextWildlifeId++, this.clock.gameTime));
    this.nextWildlifeMaintenanceAt = this.clock.gameTime + WILDLIFE_RESPAWN_INTERVAL_SECONDS;
  }

  /** Pré-amorce 2-3 centres de village dispersés (quadrants opposés).
   *  Chaque centre est forcé sur une tuile marchable proche du point choisi. */
  private seedVillages(): void {
    const w = this.world.width;
    const h = this.world.height;
    const candidates: Vec2[] = [
      { x: w / 2, y: h / 2 },
      { x: w / 4, y: h / 4 },
      { x: (3 * w) / 4, y: (3 * h) / 4 },
    ];
    for (const c of candidates) {
      const spot = this.world.nearestWalkable(Math.round(c.x), Math.round(c.y));
      this.villages.push(spot);
    }
  }

  /** Pose un bâtiment public en cherchant un footprint libre proche de `anchor`. */
  private placeBuilding(kind: string, anchor: Vec2, owner = 0) {
    const site = this.findFreeFootprint(kind, anchor) ?? anchor;
    return this.world.addBuilding(kind, site, owner);
  }

  /** Trouve un coin haut-gauche tel que tout le footprint soit libre, en spirale. */
  private findFreeFootprint(kind: string, anchor: Vec2): Vec2 | null {
    const ax = Math.round(anchor.x);
    const ay = Math.round(anchor.y);
    const max = Math.max(this.world.width, this.world.height);
    for (let r = 0; r < max; r++) {
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          if (r > 0 && Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
          const p = { x: ax + dx, y: ay + dy };
          if (this.world.canPlaceBuilding(kind, p)) return p;
        }
    }
    return null;
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
      const id = this.nextId++;
      // Chaque agent appartient à un village (réparti en round-robin pour équilibrer).
      const village = this.villages[i % this.villages.length]!;
      const homeAnchor = this.spreadAround(village, 8);
      const workAnchor = this.spreadAround(village, 6);
      // La maison et l'atelier de départ appartiennent à l'agent (usage exclusif).
      const homeB = this.placeBuilding('maison', homeAnchor, id);
      const workB = this.placeBuilding('atelier', workAnchor, id);
      const home = this.world.nearestWalkable(homeB.door.x, homeB.door.y);
      const workplace = this.world.nearestWalkable(workB.door.x, workB.door.y);

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
        village,
        target: null,
        path: null,
        pathIdx: 0,
        currentTask: null,
        // Décalage initial bien réparti sur [0, DECISION_INTERVAL_SECONDS] via le nombre
        // d'or — évite la vague synchronisée du tout premier choix sans toucher au RNG
        // partagé (la composition des villages reste reproductible).
        firstDecisionAt: this.clock.gameTime + staggerOffset(id),
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
        mentorId: null,
        learnedJob: null,
        apprenticeXp: new Map(),
        health: HEALTH_MAX,
        illness: null,
        emotions: makeEmotions(),
        stress: 0,
        skills: new Map(),
      };
      this.agents.push(agent);
    }
  }

  /** Tire un point marchable dispersé autour de `center` (rayon ~ radius). */
  private spreadAround(center: Vec2, radius: number): Vec2 {
    const r = radius * Math.sqrt(this.rng.next());
    const a = this.rng.next() * Math.PI * 2;
    const x = Math.round(center.x + Math.cos(a) * r);
    const y = Math.round(center.y + Math.sin(a) * r);
    return this.world.nearestWalkable(x, y);
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
      // Santé : exécutée à cette granularité (sinon l'effet hygiène/maladie subit le `dt`
      // entier du tick à grande vitesse et tue tout le monde d'un coup).
      this.stepHealthAll(subDt);
      // Émotions : décroissance fine + impulsions liées aux besoins critiques.
      this.stepEmotionsAll(subDt);
      // Faune : errance, fuite, prédateurs nocturnes. Sous-étape pour éviter qu'une
      // morsure de loup à fort `dt` ne tue d'un coup (cf. `WOLF_ATTACK_DAMAGE_PER_SEC`).
      this.stepWildlife(subEnd);
      this.stepPredators(subDt);
      for (const agent of this.agents) {
        stepNeeds(agent.state.needs, agent.state.activity, subDt);

        // Re-décision événementielle : tâche finie, filet temps de jeu dépassé,
        // ou besoin critique qui doit prendre la main sur une activité non vitale.
        if (subEnd >= agent.firstDecisionAt) {
          const t = agent.currentTask;
          const taskDone = !t || t.idx >= t.phases.length;
          const taskExpired = !!t && subEnd >= t.hardDeadlineAt;
          const criticalSwitch =
            !!t && needsCritical(agent) && t.goal !== 'eating' && t.goal !== 'sleeping';
          if (taskDone || taskExpired || criticalSwitch) {
            this.chooseAndStartTask(agent, subEnd);
          }
        }

        this.stepTask(agent, subDt, subEnd);
      }
    }

    // Une fois par tick réel : couche lente (LLM, ticks réels) + expiration des répliques.
    for (const agent of this.agents) {
      this.orchestrator.maybeThink(agent, this.clock);
      if (agent.state.saying && this.clock.tick >= agent.sayingUntilTick) agent.state.saying = '';
    }

    // Météo : renouvelée à chaque bord de journée (selon la saison courante).
    this.updateWeather();

    // Relations : jalousie, ruptures (lent, une fois par tick réel suffit).
    this.stepRelations(dtTotal);

    // Cycle de la vie : vieillissement, couples, grossesses, naissances, morts.
    this.stepLife(dtTotal);

    return this.drainDialogues();
  }

  /** Renouvelle la météo si la fenêtre courante est expirée. */
  private updateWeather(): void {
    if (this.clock.gameTime < this.weather.untilGameTime) return;
    const kind = rollWeather(this.clock.season, this.rng);
    this.weather = makeWeather(kind, this.clock.gameTime, GAME_SECONDS_PER_DAY);
  }

  /** Construit une nouvelle tâche pour l'agent à partir de `decideAction` puis
   *  configure la première phase (cible, A*, activity). */
  private chooseAndStartTask(agent: Agent, now: number): void {
    const decision = decideAction(
      agent,
      this.world,
      this.clock,
      this.agents,
      this.orchestrator.bias.get(agent.state.id) ?? null,
    );
    const ctx: TaskContext = {
      agent,
      rng: this.rng,
      clock: this.clock,
      resolveTarget: (act, fb) => this.resolveTarget(agent, act, fb),
    };
    agent.currentTask = buildTask(decision.activity, decision.target, ctx);
    this.enterPhase(agent, now);
  }

  /** Initialise la phase courante : pose la cible, calcule un chemin A* (travel/
   *  wander), et synchronise `state.activity`. Saute la phase si déjà sur place. */
  private enterPhase(agent: Agent, now: number): void {
    // À chaque transition de phase on remet le segment de marche à zéro ; il sera
    // re-posé par `stepMovementPhase` si la phase entrante est un déplacement.
    agent.state.move = undefined;
    const task = agent.currentTask;
    if (!task || task.idx >= task.phases.length) {
      agent.target = null;
      agent.path = null;
      agent.pathIdx = 0;
      agent.state.activity = 'idle';
      return;
    }
    const ph = task.phases[task.idx]!;
    ph.startedAt = now;
    if ((ph.kind === 'travel' || ph.kind === 'wander') && ph.target) {
      const t = this.world.nearestWalkable(Math.round(ph.target.x), Math.round(ph.target.y));
      agent.target = t;
      if (distance(agent.state.pos, t) <= 0.4) {
        // Déjà sur place : passe directement à la phase suivante.
        this.advancePhase(agent, now);
        return;
      }
      const path = findPath(this.world, agent.state.pos, t);
      if (!path) {
        // Cible inatteignable (entourée d'eau / bloquée) : on renonce proprement
        // plutôt que de laisser un agent figé avec `target` actif et `path=null`.
        agent.target = null;
        agent.path = null;
        agent.pathIdx = 0;
        agent.state.activity = 'idle';
        this.advancePhase(agent, now);
        return;
      }
      agent.path = path;
      agent.pathIdx = 0;
      agent.state.activity = 'walking';
    } else {
      agent.target = null;
      agent.path = null;
      agent.pathIdx = 0;
      agent.state.activity = ph.activity;
    }
  }

  /** Passe à la phase suivante (ou termine la tâche si plus rien). */
  private advancePhase(agent: Agent, now: number): void {
    if (!agent.currentTask) return;
    agent.currentTask.idx++;
    this.enterPhase(agent, now);
  }

  /** Joue un pas de la phase courante : déplacement, exécution ou attente. */
  private stepTask(agent: Agent, dt: number, now: number): void {
    const task = agent.currentTask;
    if (!task || task.idx >= task.phases.length) {
      agent.state.activity = 'idle';
      return;
    }
    const ph = task.phases[task.idx]!;
    if (ph.kind === 'travel' || ph.kind === 'wander') {
      this.stepMovementPhase(agent, dt, now);
      return;
    }
    if (ph.kind === 'execute') {
      agent.state.activity = ph.activity;
      if (ph.activity === 'socializing') this.trySocialize(agent, dt);
      else if (ph.activity === 'working') this.advanceWork(agent, now);
      else if (ph.activity === 'crafting') this.advancePlan(agent, dt);
      else if (ph.activity === 'eating') this.tryEat(agent, now);
      else if (ph.activity === 'trading') this.tryTrade(agent, now);
      else if (ph.activity === 'washing') this.tryWash(agent, now);
      else if (ph.activity === 'hunting') this.advanceHunt(agent, now);
      else if (ph.activity === 'fishing') this.advanceFish(agent, now);
      const elapsed = now - (ph.startedAt ?? now);
      const duration = ph.durationSeconds ?? 0;
      // Fin anticipée : un craft achevé libère la phase sans attendre le timer.
      const planDone = ph.activity === 'crafting' && agent.plan == null && elapsed > 1;
      if (elapsed >= duration || planDone) this.advancePhase(agent, now);
      return;
    }
    // wait : laisse passer le temps. `stepNeeds` profite déjà de `state.activity`.
    agent.state.activity = ph.activity;
    const elapsed = now - (ph.startedAt ?? now);
    const duration = ph.durationSeconds ?? 0;
    // Sommeil : se réveille tôt si l'énergie est pleine ou si le jour s'est levé.
    const sleepDone =
      ph.activity === 'sleeping' &&
      (agent.state.needs.energy >= 95 ||
        (this.clock.timeOfDay >= 7 && this.clock.timeOfDay < 21));
    if (elapsed >= duration || sleepDone) this.advancePhase(agent, now);
  }

  /** Marche vers `agent.target` pour la phase courante. Sur arrivée → phase suivante.
   *  La vitesse réelle (tuiles/sec) est `WALK_TILES_PER_REAL_SEC * speed * météo /
   *  coût_terrain` ; elle est publiée dans `state.move` pour que le client interpole
   *  exactement le même segment, supprimant l'effet « diagonale au-dessus de l'eau ». */
  private stepMovementPhase(agent: Agent, dt: number, now: number): void {
    const pos = agent.state.pos;
    const target = agent.target;
    if (!target || distance(pos, target) <= 0.4) {
      agent.state.move = undefined;
      this.advancePhase(agent, now);
      return;
    }
    let wp: Vec2 | null = null;
    if (agent.path && agent.path.length > 0) {
      while (agent.pathIdx < agent.path.length && distance(pos, agent.path[agent.pathIdx]!) < 0.4) {
        agent.pathIdx++;
      }
      if (agent.pathIdx < agent.path.length) {
        const next = agent.path[agent.pathIdx]!;
        if (this.world.walkable(Math.round(next.x), Math.round(next.y))) {
          wp = next;
        }
      }
    }
    // Chemin épuisé ou bloqué : replanifier. Pas de fallback « ligne droite vers
    // target » — c'est ce qui faisait couper par-dessus l'eau quand le chemin A*
    // contournait un plan d'eau.
    if (!wp) {
      const fresh = findPath(this.world, pos, target);
      if (!fresh || fresh.length === 0) {
        agent.state.move = undefined;
        this.advancePhase(agent, now);
        return;
      }
      agent.path = fresh;
      agent.pathIdx = 0;
      wp = fresh[0]!;
    }
    const dx = wp.x - pos.x;
    const dy = wp.y - pos.y;
    const d = Math.hypot(dx, dy) || 1;
    const weatherSpeed = WEATHER_EFFECTS[this.weather.kind].walkSpeed;
    const tileHere = this.world.tileAt(Math.round(pos.x), Math.round(pos.y));
    const tileCost = TILE_MOVE_COST[tileHere];
    const terrainFactor = isFinite(tileCost) && tileCost > 0 ? 1 / tileCost : 0;
    // Vitesse réelle (tuiles par seconde réelle, hors accéléré).
    const realTPS = WALK_TILES_PER_REAL_SEC * weatherSpeed * terrainFactor;
    // `dt` est en secondes de jeu ; conversion en secondes réelles.
    const dtReal = this.speed > 0 ? dt / (this.speed * BASE_SCALE) : 0;
    // Pas appliqué dans le monde : on multiplie par `speed` pour conserver l'accéléré.
    const step = Math.min(realTPS * this.speed * dtReal, d);
    const prevTx = Math.round(pos.x);
    const prevTy = Math.round(pos.y);
    pos.x += (dx / d) * step;
    pos.y += (dy / d) * step;
    const nowTx = Math.round(pos.x);
    const nowTy = Math.round(pos.y);
    // Garde-fou : si la tuile atteinte est non walkable (mutation imprévue),
    // on recule sur la dernière tuile valide et on replanifie.
    if (!this.world.walkable(nowTx, nowTy)) {
      pos.x = prevTx;
      pos.y = prevTy;
      agent.path = findPath(this.world, pos, target);
      agent.pathIdx = 0;
      agent.state.move = undefined;
      return;
    }
    // Usure : un passage marqué à chaque changement de tuile entière (chemin émergent).
    if (nowTx !== prevTx || nowTy !== prevTy) this.world.stampWear(nowTx, nowTy, 1);
    agent.state.activity = 'walking';
    // Publie le segment courant pour l'interpolation visuelle côté client.
    agent.state.move = { to: { x: wp.x, y: wp.y }, speed: realTPS * this.speed };
    if (distance(pos, target) <= 0.4) {
      agent.state.move = undefined;
      this.advancePhase(agent, now);
    }
  }

  /** Se laver : pas d'action discrète, le gain d'hygiène est appliqué par `stepNeeds`
   *  tant que `state.activity === 'washing'`. On marque juste un souvenir cadencé. */
  private tryWash(agent: Agent, now: number): void {
    if (now < agent.nextGatherGameTime) return;
    agent.memory.add(this.clock.tick, "Je me suis lavé(e)", 1);
    agent.nextGatherGameTime = now + GATHER_CADENCE_SECONDS;
  }

  // --- Faune (Phase 15) ---------------------------------------------------

  /** Errance/fuite des animaux + réajustement périodique de la population. */
  private stepWildlife(now: number): void {
    stepWildlifeAll(this.world, this.wildlife, this.wildlifeRng, now, (id) => {
      const a = this.agents.find((x) => x.state.id === id);
      return a ? a.state.pos : null;
    });
    // Reset de la fuite si le chasseur n'est plus à portée d'inquiétude.
    for (const a of this.wildlife) {
      if (a.fleeingFrom == null) continue;
      const h = this.agents.find((x) => x.state.id === a.fleeingFrom);
      if (!h || distance(h.state.pos, a.pos) > PREY_FLEE_RADIUS) a.fleeingFrom = null;
    }
    if (now >= this.nextWildlifeMaintenanceAt) {
      maintainWildlife(this.world, this.wildlife, this.wildlifeRng, () => this.nextWildlifeId++, now);
      this.nextWildlifeMaintenanceAt = now + WILDLIFE_RESPAWN_INTERVAL_SECONDS;
    }
  }

  /** Prédateurs nocturnes : un loup à portée d'un agent isolé la nuit le mord par
   *  *événement discret* (dégâts fixes + cooldown sur le loup) — robuste à la
   *  compression du temps. Les agents endormis (chez eux) sont à l'abri. */
  private stepPredators(dt: number): void {
    if (dt <= 0 || !this.clock.isNight) return;
    const now = this.clock.gameTime;
    for (const wolf of this.wildlife) {
      if (wolf.kind !== 'loup' || wolf.hp <= 0) continue;
      if (now < wolf.nextBiteAt) continue;
      for (const victim of this.agents) {
        // Un agent endormi est considéré à l'abri (intérieur de la maison).
        if (victim.state.activity === 'sleeping') continue;
        if (distance(victim.state.pos, wolf.pos) > WOLF_ATTACK_RADIUS) continue;
        // Isolement : aucun autre agent dans le cercle (les loups chassent l'individu).
        const isolated = !this.agents.some(
          (o) => o !== victim && distance(o.state.pos, victim.state.pos) <= ISOLATION_RADIUS,
        );
        if (!isolated) continue;
        victim.health = Math.max(0, victim.health - WOLF_BITE_DAMAGE);
        bumpEmotion(victim.emotions, victim.personality, 'peur', 30);
        wolf.nextBiteAt = now + WOLF_BITE_COOLDOWN_SECONDS;
        if (!victim.state.saying) {
          this.dialogueQueue.push({
            speakerId: victim.state.id,
            listenerId: 0,
            text: 'Un loup ! À l\'aide !',
            voiceProfile: victim.state.voiceProfile,
          });
          victim.state.saying = 'Un loup !';
          victim.sayingUntilTick = this.clock.tick + 60;
          victim.memory.add(this.clock.tick, 'J\'ai été attaqué(e) par un loup', 7);
        }
        break; // une victime par morsure (cooldown du loup engagé)
      }
    }
  }

  /** Chasse : si une proie est à portée, on la frappe à la cadence. Au kill,
   *  drop de viande/peau (selon `ANIMAL_PROFILES`). Risque de blessure réelle
   *  sur les gros gibiers (sanglier, loup) — couvre l'item « risque blessure ». */
  private advanceHunt(agent: Agent, now: number): void {
    if (now < agent.nextGatherGameTime) return;
    const prey = findNearestPrey(this.wildlife, agent.state.pos);
    if (!prey) return;
    if (distance(agent.state.pos, prey.pos) > HUNT_RANGE) {
      // Hors de portée : on marque la fuite pour que la proie s'éloigne effectivement,
      // et on attend le prochain pas (la phase finira sur timer si vraiment rien à faire).
      prey.fleeingFrom = agent.state.id;
      return;
    }
    // Tentative : -1 hp à la proie, fuite, risque de blessure sur gros gibier.
    prey.hp -= 1;
    prey.fleeingFrom = agent.state.id;
    const profile = ANIMAL_PROFILES[prey.kind];
    if ((prey.kind === 'sanglier' || prey.kind === 'loup') && this.rng.chance(HUNT_INJURY_CHANCE)) {
      agent.health = Math.max(0, agent.health - HUNT_INJURY_DAMAGE);
      bumpEmotion(agent.emotions, agent.personality, 'peur', 8);
      agent.memory.add(this.clock.tick, `Blessé(e) par un ${prey.kind} pendant la chasse`, 6);
    }
    if (prey.hp <= 0) {
      if (profile.meat > 0) add(agent.inventory, 'viande', profile.meat);
      if (profile.hide > 0) add(agent.inventory, 'peau', profile.hide);
      agent.memory.add(this.clock.tick, `J'ai abattu un ${prey.kind}`, 4);
      this.gainSkillXp(agent, agent.state.job as Job, XP_PER_ACTION);
      // Retire le cadavre de la faune (la repousse est gérée par `maintainWildlife`).
      const idx = this.wildlife.indexOf(prey);
      if (idx >= 0) this.wildlife.splice(idx, 1);
    } else {
      // Tentative non létale : on compte aussi un peu d'XP (effort qui paie).
      this.gainSkillXp(agent, agent.state.job as Job, XP_PER_ACTION * 0.3);
    }
    const speed = skillSpeed(levelFromXp(agent.skills.get(agent.state.job as Job) ?? 0));
    agent.nextGatherGameTime = now + GATHER_CADENCE_SECONDS / speed;
  }

  /** Pêche : si un poisson est à portée, on le capture (mono-coup, hp=1). */
  private advanceFish(agent: Agent, now: number): void {
    if (now < agent.nextGatherGameTime) return;
    const fish = findNearestFish(this.wildlife, agent.state.pos);
    if (!fish) return;
    if (distance(agent.state.pos, fish.pos) > FISH_RANGE) return;
    fish.hp -= 1;
    if (fish.hp <= 0) {
      add(agent.inventory, 'poisson', 1);
      agent.memory.add(this.clock.tick, "J'ai pêché un poisson", 2);
      this.gainSkillXp(agent, agent.state.job as Job, XP_PER_ACTION);
      const idx = this.wildlife.indexOf(fish);
      if (idx >= 0) this.wildlife.splice(idx, 1);
    }
    const speed = skillSpeed(levelFromXp(agent.skills.get(agent.state.job as Job) ?? 0));
    agent.nextGatherGameTime = now + GATHER_CADENCE_SECONDS / speed;
  }

  /** Cible de déplacement selon l'activité : poste de craft, chantier, marché ou gisement. */
  private resolveTarget(agent: Agent, activity: string, fallback: Vec2): Vec2 {
    if (activity === 'crafting') return this.planTarget(agent) ?? fallback;
    if (activity === 'working') return this.workTarget(agent) ?? fallback;
    if (activity === 'trading') return this.world.findBuilding('marche', agent.state.pos)?.door ?? fallback;
    if (activity === 'washing') {
      const well = this.world.findBuilding('puits', agent.state.pos);
      return well?.door ?? this.world.findWaterEdge(agent.state.pos) ?? fallback;
    }
    if (activity === 'hunting') {
      const prey = findNearestPrey(this.wildlife, agent.state.pos);
      if (prey) return this.world.nearestWalkable(Math.round(prey.pos.x), Math.round(prey.pos.y));
      // Pas de proie repérée : on rabat sur la forêt la plus proche (zone de battue).
      return this.world.findTile(agent.state.pos, 'forest') ?? fallback;
    }
    if (activity === 'fishing') {
      const fish = findNearestFish(this.wildlife, agent.state.pos);
      if (fish) {
        const spot = fishingSpot(this.world, fish);
        if (spot) return spot;
      }
      return this.world.findWaterEdge(agent.state.pos) ?? fallback;
    }
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
    return b ? b.door : null;
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
      // Saisons / météo : on ne sème pas en hiver (rien ne pousse) ni en canicule.
      const canSow = this.clock.season !== 'hiver' && this.weather.kind !== 'canicule';
      if (canSow && has('graine') >= 1) {
        const empty = this.world.findOwnedFarm(pos, 'farm', id);
        if (empty) return empty;
      }
      // Étendre son exploitation : labourer une nouvelle parcelle proche du domicile.
      if (canSow && this.world.countFarms(id) < MAX_FARMS_PER_AGENT) {
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
      } else if (
        tile === 'farm' &&
        this.world.farmOwnerAt(x, y) === id &&
        count(agent.inventory, 'graine') >= 1 &&
        this.clock.season !== 'hiver' &&
        this.weather.kind !== 'canicule'
      ) {
        if (this.world.plant(x, y, now)) {
          take(agent.inventory, 'graine', 1);
          agent.memory.add(this.clock.tick, "J'ai semé un champ", 2);
          acted = true;
        }
      } else if (
        profile.farms &&
        (tile === 'grass' || tile === 'dirt') &&
        this.world.countFarms(id) < MAX_FARMS_PER_AGENT &&
        this.clock.season !== 'hiver'
      ) {
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
      // Compétences : XP gagnée + cadence accélérée par le niveau (Phase 14).
      this.gainSkillXp(agent, agent.state.job as Job, XP_PER_ACTION);
      const speed = skillSpeed(levelFromXp(agent.skills.get(agent.state.job as Job) ?? 0));
      agent.nextGatherGameTime += GATHER_CADENCE_SECONDS / speed;
    }
  }

  /** Ajoute de la XP à un métier ; bonus si un mentor du même métier travaille à côté. */
  private gainSkillXp(agent: Agent, job: Job, base: number): void {
    if (!job) return;
    let xp = base;
    // Bonus mentor : un adulte expérimenté du même métier travaille à proximité.
    for (const other of this.agents) {
      if (other === agent) continue;
      if (other.state.job !== job) continue;
      if (other.state.activity !== 'working' && other.state.activity !== 'crafting') continue;
      if ((other.skills.get(job) ?? 0) <= (agent.skills.get(job) ?? 0)) continue;
      if (distance(other.state.pos, agent.state.pos) > APPRENTICE_PROXIMITY_TILES) continue;
      xp += APPRENTICE_XP_BONUS;
      break;
    }
    agent.skills.set(job, (agent.skills.get(job) ?? 0) + xp);
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
    const anchor = this.pickBuildSite(agent, intent.buildKind);
    // Cherche un emplacement où tout le footprint du bâtiment final tient ; faute de quoi annule.
    const site = this.findFreeFootprint(intent.buildKind, anchor);
    if (!site) return null;
    if (!pay(agent.inventory, b.inputs)) return null;
    // Le chantier réserve d'emblée tout le footprint du bâtiment final (porte comprise)
    // pour qu'aucun autre agent ne vienne se poser dessus pendant la construction.
    const chantier = this.world.addBuilding('chantier', site, agent.state.id, intent.buildKind);
    return { type: 'build', kind: intent.buildKind, site, buildingId: chantier.id, progress: 0 };
  }

  /** Avance le plan courant (fabrication ou construction) dans le temps de jeu. */
  private advancePlan(agent: Agent, dt: number): void {
    if (!agent.plan) agent.plan = this.materializePlan(agent);
    const plan = agent.plan;
    if (!plan) return;
    if (!this.atPlanStation(agent, plan)) return; // pas encore au bon endroit

    // Compétences : le craft/la construction avancent plus vite si l'agent maîtrise son métier.
    const skillLvl = levelFromXp(agent.skills.get(agent.state.job as Job) ?? 0);
    plan.progress += dt * skillSpeed(skillLvl);
    if (plan.type === 'craft') {
      const r = RECIPE_BY_ID[plan.recipeId]!;
      if (plan.progress < r.durationSeconds) return;
      add(agent.inventory, r.output.kind, r.output.qty);
      agent.memory.add(this.clock.tick, `J'ai fabriqué : ${r.output.kind}`, 3);
      this.gainSkillXp(agent, agent.state.job as Job, XP_PER_ACTION);
      agent.plan = null;
    } else {
      const b = BUILD_BY_KIND[plan.kind]!;
      if (plan.progress < b.durationSeconds) return;
      this.world.finishBuilding(plan.buildingId, plan.kind);
      agent.houses++;
      agent.state.houses = agent.houses;
      agent.memory.add(this.clock.tick, `J'ai construit : ${plan.kind}`, 8);
      // Construction = gros gain d'XP (vise plusieurs niveaux pour un grand chantier).
      this.gainSkillXp(agent, agent.state.job as Job, XP_PER_ACTION * 3);
      agent.plan = null;
    }
  }

  /** L'agent est-il au bon poste / sur le chantier pour avancer son plan ? */
  private atPlanStation(agent: Agent, plan: ActivePlan): boolean {
    const pos = agent.state.pos;
    if (plan.type === 'build') return distance(pos, plan.site) < 1.6;
    const station = RECIPE_BY_ID[plan.recipeId]?.station ?? null;
    if (!station) return true; // craftable n'importe où
    if (station === 'atelier') return distance(pos, agent.workplace) < 1.6;
    const b = this.world.findBuilding(station, pos);
    return b != null && distance(pos, b.door) < 1.6;
  }

  /** Ancre de construction (point de référence). Le four/atelier/entrepôt se regroupent
   *  autour du marché si le village en partage un, sinon autour du centre du village ;
   *  la maison reste près du domicile ; le puits se rapproche de l'eau. La recherche
   *  d'un footprint libre est faite ensuite par `findFreeFootprint`. */
  private pickBuildSite(agent: Agent, kind: string): Vec2 {
    if (kind === 'puits') {
      return this.world.findWaterEdge(agent.state.pos) ?? agent.village;
    }
    if (kind === 'four' || kind === 'atelier' || kind === 'entrepot') {
      const marche = this.world.findBuilding('marche', agent.village);
      return marche ? marche.door : agent.village;
    }
    return agent.home;
  }

  /** Échange au marché : vend les surplus, achète de quoi manger si la faim presse.
   *  À haute vitesse, on enchaîne les rounds de troc tant que la cadence le permet. */
  private tryTrade(agent: Agent, now: number): void {
    if (now < agent.nextGatherGameTime) return;
    const marche = this.world.findBuilding('marche', agent.state.pos);
    if (!marche || distance(agent.state.pos, marche.door) > 1.6) return;

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

  /** Relations sociales avancées (Phase 13).
   *  - Jalousie : si le/la conjoint(e) a une affinité notablement plus forte avec
   *    quelqu'un d'autre, l'agent perd de l'affinité envers lui/elle (et gagne de la
   *    colère via les émotions).
   *  - Rupture : sous `BREAKUP_AFFINITY`, le couple se brise (souvenir fort + dialogue). */
  private stepRelations(dt: number): void {
    if (dt <= 0) return;
    const now = this.clock.gameTime;
    for (const a of this.agents) {
      if (!a.state.partnerId) continue;
      const partner = this.agents.find((p) => p.state.id === a.state.partnerId);
      if (!partner) continue;
      const relToPartner = a.relationships.get(partner.state.id) ?? 0;

      // Cherche le rival potentiel : un autre agent envers qui le partenaire a une
      // affinité bien supérieure à celle pour `a`.
      let bestGap = 0;
      let rival: Agent | null = null;
      for (const [otherId, rel] of partner.relationships) {
        if (otherId === a.state.id) continue;
        const gap = rel - relToPartner;
        if (gap > bestGap) {
          bestGap = gap;
          rival = this.agents.find((x) => x.state.id === otherId) ?? null;
        }
      }
      if (rival && bestGap > JEALOUSY_GAP) {
        const loss = JEALOUSY_DECAY_PER_SEC * (bestGap - JEALOUSY_GAP) * dt;
        a.relationships.set(partner.state.id, Math.max(-100, relToPartner - loss));
        bumpEmotion(a.emotions, a.personality, 'colere', 0.0005 * dt * (bestGap - JEALOUSY_GAP));
      }

      // Rupture si l'affinité passe sous le seuil.
      if (relToPartner <= BREAKUP_AFFINITY) {
        this.breakup(a, partner, now);
      }
    }
  }

  /** Rompt un couple : remet `partnerId` à 0 des deux côtés, choc d'affinité,
   *  mémoire & dialogue. Marque les deux d'une grosse impulsion de tristesse/colère. */
  private breakup(a: Agent, b: Agent, now: number): void {
    a.state.partnerId = 0;
    b.state.partnerId = 0;
    const ra = (a.relationships.get(b.state.id) ?? 0) - BREAKUP_AFFINITY_SHOCK;
    const rb = (b.relationships.get(a.state.id) ?? 0) - BREAKUP_AFFINITY_SHOCK;
    a.relationships.set(b.state.id, Math.max(-100, ra));
    b.relationships.set(a.state.id, Math.max(-100, rb));
    a.memory.add(now, `Je me suis séparé(e) de ${b.state.name}`, 9);
    b.memory.add(now, `Je me suis séparé(e) de ${a.state.name}`, 9);
    bumpEmotion(a.emotions, a.personality, 'tristesse', 40);
    bumpEmotion(b.emotions, b.personality, 'tristesse', 40);
    bumpEmotion(a.emotions, a.personality, 'colere', 25);
    bumpEmotion(b.emotions, b.personality, 'colere', 25);
    this.dialogueQueue.push({
      speakerId: a.state.id,
      listenerId: b.state.id,
      text: `${b.state.name}, c'est fini entre nous.`,
      voiceProfile: a.state.voiceProfile,
    });
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
      // Apprentissage : l'ado accumule de l'XP dans le métier d'un adulte au travail
      // qu'il observe à proximité. Le métier dominant deviendra le sien à la majorité.
      if (isTeen(age)) this.observeMentor(a, dt);
      // Passage à l'âge adulte : métier hérité du mentorat si possible, sinon par défaut.
      if (a.state.lifeStage === 'enfant' && stage !== 'enfant') {
        a.state.job = a.learnedJob ?? assignJob(a.aspirations, a.personality);
        a.state.voiceProfile = this.voiceFor(a.state.gender, false);
      }
      a.state.lifeStage = stage;
      // Aîné : énergie plafonnée (la fatigue arrive plus vite après 65 ans).
      if (stage === 'aine' && a.state.needs.energy > ELDER_ENERGY_CAP) {
        a.state.needs.energy = ELDER_ENERGY_CAP;
      }

      // La santé est avancée par sous-étape dans `tick` (granularité fine) ; ici on
      // ne fait que constater la mort par santé nulle.
      if (a.health <= HEALTH_DEATH_THRESHOLD) {
        dead.push(a.state.id);
        continue;
      }

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
      village: mother.village,
      target: null,
      path: null,
      pathIdx: 0,
      currentTask: null,
      // Nouveau-né : pas de stagger, il pourra agir dès le prochain tick.
      firstDecisionAt: now,
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
      mentorId: null,
      learnedJob: null,
      apprenticeXp: new Map(),
      health: HEALTH_MAX,
      illness: null,
      emotions: makeEmotions(),
      stress: 0,
      skills: new Map(),
    };
    this.agents.push(agent);
    mother.memory.add(now, `Naissance de ${name}`, 9);
    father.memory.add(now, `Naissance de ${name}`, 9);
    // Naissance → grande joie partagée chez les parents.
    bumpEmotion(mother.emotions, mother.personality, 'joie', 50);
    bumpEmotion(father.emotions, father.personality, 'joie', 50);
    this.dialogueQueue.push({
      speakerId: mother.state.id,
      listenerId: 0,
      text: `Nous avons un enfant : ${name} !`,
      voiceProfile: mother.state.voiceProfile,
    });
  }

  /** Retire des agents morts : libère les conjoints, transmet les biens (héritage),
   *  et inscrit un « souvenir partagé » de forte importance chez les villageois proches. */
  private removeAgents(ids: number[]): void {
    const now = this.clock.gameTime;
    for (const id of ids) {
      const idx = this.agents.findIndex((a) => a.state.id === id);
      if (idx < 0) continue;
      const a = this.agents[idx]!;
      if (a.state.partnerId) {
        const p = this.agents.find((x) => x.state.id === a.state.partnerId);
        if (p) p.state.partnerId = 0;
      }
      // Sépulture : tout villageois proche garde un souvenir marquant (importance 9).
      // Parents/conjoint/enfants obtiennent un souvenir maximal (10).
      const kin = new Set<number>([a.state.partnerId, ...(a.parents ?? [])].filter((x) => x > 0));
      for (const x of this.agents) {
        if (x.state.id === id || ids.includes(x.state.id)) continue;
        if (x.parents?.includes(id)) kin.add(x.state.id);
        const close = distance(x.state.pos, a.state.pos) <= FUNERAL_MEMORY_RADIUS;
        if (close || kin.has(x.state.id)) {
          const intensity = kin.has(x.state.id) ? 10 : 9;
          x.memory.add(now, `${a.state.name} est mort(e) à ${a.state.ageYears} ans`, intensity);
          // Deuil : tristesse + peur (impulsion massive si proche, modérée sinon).
          bumpEmotion(x.emotions, x.personality, 'tristesse', kin.has(x.state.id) ? 80 : 35);
          bumpEmotion(x.emotions, x.personality, 'peur', kin.has(x.state.id) ? 30 : 12);
        }
      }
      if (kin.size > 0) {
        // Une annonce funéraire (dialogue collectif visible côté joueur).
        const speaker = this.agents.find((x) => kin.has(x.state.id));
        if (speaker) {
          this.dialogueQueue.push({
            speakerId: speaker.state.id,
            listenerId: 0,
            text: `Nous avons perdu ${a.state.name}. Repose en paix.`,
            voiceProfile: speaker.state.voiceProfile,
          });
        }
      }
      // Héritage : un enfant vivant récupère les biens, sinon ils deviennent publics.
      const heir = this.agents.find((x) => x.parents?.includes(id) && !ids.includes(x.state.id));
      this.world.reassignOwner(id, heir ? heir.state.id : 0);
      this.agents.splice(idx, 1);
    }
  }

  /** Avance la santé de tous les agents d'une sous-étape (granularité fine). */
  private stepHealthAll(dt: number): void {
    if (dt <= 0) return;
    for (const a of this.agents) this.stepHealth(a, dt);
  }

  /** Décroissance d'humeurs + impulsions liées au contexte courant (Phase 12).
   *  Une fois par sous-étape : besoins critiques → peur/tristesse/colère, maladie en
   *  cours → tristesse/peur, stress monte sous la faim chronique et le manque d'énergie. */
  private stepEmotionsAll(dt: number): void {
    if (dt <= 0) return;
    for (const a of this.agents) {
      decayEmotions(a.emotions, a.personality, dt);
      const n = a.state.needs;
      // Faim aiguë : irritation + tristesse persistantes.
      if (n.hunger < 25) {
        bumpEmotion(a.emotions, a.personality, 'colere', 0.001 * dt);
        bumpEmotion(a.emotions, a.personality, 'tristesse', 0.0008 * dt);
        a.stress = Math.min(100, a.stress + 0.0006 * dt);
      }
      // Épuisement : peur diffuse, stress monte.
      if (n.energy < 20) {
        bumpEmotion(a.emotions, a.personality, 'peur', 0.0006 * dt);
        a.stress = Math.min(100, a.stress + 0.0005 * dt);
      }
      // Maladie : tristesse + peur (intensité modulée par la fragilité).
      if (a.illness) {
        bumpEmotion(a.emotions, a.personality, 'tristesse', 0.0007 * dt);
        bumpEmotion(a.emotions, a.personality, 'peur', 0.0005 * dt);
      }
      // Repli vers le calme quand tout va bien.
      if (n.hunger > 70 && n.energy > 60 && !a.illness) {
        a.stress = Math.max(0, a.stress - 0.0003 * dt);
      }
    }
  }

  /** Santé (Phase 10) : effet hygiène, progression de la maladie, contagion, guérison.
   *  Joue dans `stepLife` une fois par tick réel — `dt` = temps de jeu de ce tick.
   *  À très haute vitesse (dt couvrant plusieurs jours), les probabilités utilisent
   *  l'exponentielle (1 - e^{-rate·dt}) pour saturer à 1, et les dégâts d'une maladie
   *  sont bornés par le temps réellement « actif » dans la fenêtre — sinon un seul tick
   *  rapide pourrait tuer en une fois. */
  private stepHealth(a: Agent, dt: number): void {
    if (a.health <= HEALTH_DEATH_THRESHOLD) return; // déjà mort, ni récupération ni guérison
    const fragile = a.state.lifeStage === 'enfant' || a.state.lifeStage === 'aine' ? FRAGILE_FACTOR : 1;
    const now = this.clock.gameTime;

    // 1) Effet de l'hygiène basse (dégradation lente, indépendante de la maladie).
    if (a.state.needs.hygiene < HYGIENE_HEALTH_THRESHOLD) {
      a.health -= HEALTH_DECAY_FROM_HYGIENE_PER_SEC * dt * fragile;
    }

    // 2) Maladie en cours : incubation → contagion, dégâts (bornés), fin de maladie.
    if (a.illness) {
      const elapsedStart = Math.max(0, now - dt - a.illness.sinceGameTime);
      const elapsedEnd = now - a.illness.sinceGameTime;
      if (!a.illness.contagious && elapsedEnd >= ILLNESS_INCUBATION_SECONDS) {
        a.illness.contagious = true;
        a.memory.add(now, `Je me sens malade (${a.illness.kind})`, 5);
      }
      // Dégâts : uniquement sur la portion de dt comprise dans la durée de la maladie.
      if (elapsedStart < a.illness.durationSeconds) {
        const activeDt = Math.min(dt, a.illness.durationSeconds - elapsedStart);
        a.health -= ILLNESS_DAMAGE_PER_SEC * activeDt * fragile;
      }
      if (elapsedEnd >= a.illness.durationSeconds && a.state.needs.energy > 40 && a.state.needs.hunger > 40) {
        a.memory.add(now, `Je suis guéri(e) de ${a.illness.kind}`, 4);
        a.illness = null;
        a.health = Math.min(HEALTH_MAX, a.health + 10);
      } else if (a.illness.contagious) {
        this.spreadIllness(a, dt);
      }
    } else {
      // 3) Apparition spontanée (probabilité bornée par exp pour les longs dt).
      const hygieneFactor = a.state.needs.hygiene < HYGIENE_HEALTH_THRESHOLD ? 2 : 1;
      const rate = (ILLNESS_ONSET_PER_YEAR * hygieneFactor * fragile) / YEAR_SECONDS;
      const prob = 1 - Math.exp(-rate * dt);
      if (this.rng.chance(prob)) {
        a.illness = {
          kind: this.rng.pick(['rhume', 'fièvre', 'maux d\'estomac']),
          sinceGameTime: now,
          durationSeconds: ILLNESS_DURATION_SECONDS * (0.7 + this.rng.next() * 0.6),
          contagious: false,
        };
      }
    }

    // 4) Récupération naturelle si pas malade et hygiène correcte.
    if (!a.illness && a.state.needs.hygiene >= HYGIENE_HEALTH_THRESHOLD && a.health < HEALTH_MAX) {
      a.health = Math.min(HEALTH_MAX, a.health + HEALTH_RECOVERY_PER_SEC * dt);
    }
  }

  /** Contagion : chaque agent sain à portée a une probabilité d'être infecté. */
  private spreadIllness(source: Agent, dt: number): void {
    if (!source.illness) return;
    const p = 1 - Math.exp(-CONTAGION_RATE_PER_SEC * dt);
    for (const other of this.agents) {
      if (other === source || other.illness) continue;
      if (distance(other.state.pos, source.state.pos) > CONTAGION_RADIUS) continue;
      if (this.rng.chance(p)) {
        other.illness = {
          kind: source.illness.kind,
          sinceGameTime: this.clock.gameTime,
          durationSeconds: ILLNESS_DURATION_SECONDS * (0.7 + this.rng.next() * 0.6),
          contagious: false,
        };
      }
    }
  }

  /** Apprentissage : si un adulte travaille à proximité d'un ado, l'ado gagne du temps
   *  d'observation dans le métier de l'adulte. Le métier le plus observé devient le
   *  sien au passage à la majorité (cf. `stepLife`). */
  private observeMentor(teen: Agent, dt: number): void {
    let bestMentor: Agent | null = null;
    let bestDist = APPRENTICE_PROXIMITY_TILES + 0.001;
    for (const adult of this.agents) {
      if (adult === teen) continue;
      if (adult.state.lifeStage !== 'adulte' && adult.state.lifeStage !== 'aine') continue;
      if (adult.state.activity !== 'working' && adult.state.activity !== 'crafting') continue;
      if (!adult.state.job) continue;
      const d = distance(teen.state.pos, adult.state.pos);
      if (d < bestDist) {
        bestDist = d;
        bestMentor = adult;
      }
    }
    if (!bestMentor) return;
    const job = bestMentor.state.job as Job;
    const xp = (teen.apprenticeXp.get(job) ?? 0) + dt;
    teen.apprenticeXp.set(job, xp);
    teen.mentorId = bestMentor.state.id;
    // Élit le métier dominant à chaque tick (peu coûteux, peu de métiers).
    let topJob: Job = job;
    let topXp = xp;
    for (const [k, v] of teen.apprenticeXp) {
      if (v > topXp) {
        topXp = v;
        topJob = k;
      }
    }
    teen.learnedJob = topJob;
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
      season: this.clock.season,
      weather: { ...this.weather },
      agents: this.agents.map((a) => ({
        ...a.state,
        pos: { x: a.state.pos.x, y: a.state.pos.y },
        needs: { ...a.state.needs },
        inventory: inventoryToStacks(a.inventory),
        houses: a.houses,
        phase: currentPhaseLabel(a.currentTask),
      })),
      items: this.world.items.map((i) => ({ ...i })),
      buildings: this.world.buildings.map((b) => ({ ...b })),
      animals: this.wildlife.map<AnimalSnapshot>((a) => ({
        id: a.id,
        kind: a.kind,
        pos: { x: a.pos.x, y: a.pos.y },
        hp: a.hp,
      })),
      chunk: withChunk
        ? { width: this.world.width, height: this.world.height, tiles: [...this.world.tiles] }
        : undefined,
    };
  }

  spawnPoint(): Vec2 {
    return { x: this.world.width / 2, y: this.world.height / 2 };
  }
}
