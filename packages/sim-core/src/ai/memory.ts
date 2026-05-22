/** Souvenir individuel du flux de mémoire (cf. Generative Agents). */
export interface Memory {
  tick: number;
  text: string;
  /** Importance 1..10 (estimée à la création). */
  importance: number;
}

/**
 * Flux de mémoire d'un agent : stocke des souvenirs et en récupère les plus
 * pertinents par score récence + importance (la pertinence sémantique viendra
 * avec les embeddings en phase ultérieure).
 */
export class MemoryStream {
  private memories: Memory[] = [];
  private readonly cap: number;

  constructor(cap = 200) {
    this.cap = cap;
  }

  add(tick: number, text: string, importance = 3): void {
    this.memories.push({ tick, text, importance });
    if (this.memories.length > this.cap) this.memories.shift();
  }

  /** Récupère les `k` souvenirs au meilleur score (récence pondérée + importance). */
  retrieve(currentTick: number, k = 5): Memory[] {
    const decay = 0.995;
    return [...this.memories]
      .map((m) => ({
        m,
        score: m.importance / 10 + Math.pow(decay, Math.max(0, currentTick - m.tick)),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, k)
      .map((x) => x.m);
  }

  recentText(currentTick: number, k = 5): string {
    return this.retrieve(currentTick, k)
      .map((m) => `- ${m.text}`)
      .join('\n');
  }
}
