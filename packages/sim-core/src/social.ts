import type { Agent } from './entities';

/** Familles dérivées du champ `parents` (Phase 13). */
export interface Family {
  parents: Agent[];
  children: Agent[];
  siblings: Agent[];
}

/** Calcule la famille immédiate d'un agent à partir de tous les agents vivants. */
export function familyOf(self: Agent, agents: Agent[]): Family {
  const parentIds = new Set(self.parents ?? []);
  const parents = agents.filter((a) => parentIds.has(a.state.id));
  const children = agents.filter((a) => a.parents?.includes(self.state.id));
  const siblings = agents.filter(
    (a) =>
      a !== self &&
      a.parents &&
      a.parents.some((id) => parentIds.has(id)),
  );
  return { parents, children, siblings };
}

/** Réputation publique d'un agent : moyenne des affinités que les autres ont envers lui.
 *  Renvoie 0 quand personne n'a d'opinion. Bornée -100..100. */
export function reputation(target: Agent, agents: Agent[]): number {
  let sum = 0;
  let n = 0;
  for (const a of agents) {
    if (a === target) continue;
    const v = a.relationships.get(target.state.id);
    if (v == null) continue;
    sum += v;
    n++;
  }
  return n === 0 ? 0 : sum / n;
}
