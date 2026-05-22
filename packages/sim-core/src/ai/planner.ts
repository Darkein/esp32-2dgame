// Sélection déterministe du projet de craft/construction d'un agent, pilotée par ses
// besoins et ses aspirations. Ne renvoie qu'une *intention* (réalisable maintenant) ;
// la matérialisation (paiement des matériaux, chantier) est faite par `sim.advancePlan`.
import type { Agent } from '../entities';
import type { World } from '../world';
import { BUILD_BY_KIND, RECIPE_BY_ID } from '../catalog';
import { canAfford, count } from '../crafting';

export type PlanIntent =
  | { kind: 'craft'; recipeId: string }
  | { kind: 'build'; buildKind: string };

/** Postes de craft disponibles pour l'agent (l'atelier de travail + les fours bâtis). */
function availableStations(world: World): Set<string> {
  const s = new Set<string>(['atelier']);
  if (world.hasBuilding('four')) s.add('four');
  return s;
}

export function choosePlan(agent: Agent, world: World): PlanIntent | null {
  const inv = agent.inventory;
  const has = (k: string) => count(inv, k);
  const stations = availableStations(world);

  const tryCraft = (id: string): PlanIntent | null => {
    const r = RECIPE_BY_ID[id];
    if (!r) return null;
    if (r.station && !stations.has(r.station)) return null;
    return canAfford(inv, r.inputs) ? { kind: 'craft', recipeId: id } : null;
  };
  const tryBuild = (kind: string): PlanIntent | null => {
    const b = BUILD_BY_KIND[kind];
    if (!b) return null;
    return canAfford(inv, b.inputs) ? { kind: 'build', buildKind: kind } : null;
  };
  const first = (...c: (PlanIntent | null)[]) => c.find((x) => x !== null) ?? null;

  const aspir = agent.aspirations.join(' ');
  const hungry = agent.state.needs.hunger < 55;

  // 1. Filière alimentaire si la faim monte : cuire du pain, sinon bâtir un four, sinon farine.
  if (hungry && has('pain') < 1) {
    const food = first(
      tryCraft('pain'),
      world.hasBuilding('four') ? null : tryBuild('four'),
      tryCraft('farine'),
    );
    if (food) return food;
  }

  // 2. Aspirations.
  if (aspir.includes('maison') || aspir.includes('famille')) {
    const b = tryBuild('maison');
    if (b) return b;
  }
  if (aspir.includes('crafting')) {
    const r = tryCraft('outil');
    if (r) return r;
  }
  if (aspir.includes('richesse')) {
    const r = first(tryCraft('meuble'), tryCraft('poterie'));
    if (r) return r;
  }

  // 3. Repli : valoriser les surplus puis améliorer le village.
  if (has('ble') >= 2 && has('graine') < 3) {
    const r = tryCraft('graine');
    if (r) return r;
  }
  return first(
    tryCraft('planche'),
    tryCraft('outil'),
    tryCraft('meuble'),
    tryCraft('poterie'),
    world.hasBuilding('four') ? null : tryBuild('four'),
    tryBuild('entrepot'),
  );
}
