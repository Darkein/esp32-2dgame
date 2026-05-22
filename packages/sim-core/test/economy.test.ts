import { describe, it, expect } from 'vitest';
import { Market } from '../src/market';
import { Simulation } from '../src/sim';
import { JOBS } from '../src/catalog';

describe('marché (monnaie + offre/demande)', () => {
  it('vendre dépose au stock et rapporte des pièces ; acheter puise au stock', () => {
    const m = new Market();
    const inv = new Map<string, number>([['bois', 10]]);
    const earned = m.sell(inv, 'bois', 6);
    expect(earned).toBeGreaterThan(0);
    expect(inv.get('bois')).toBe(4);
    expect(m.stock.get('bois')).toBe(6);

    const before = inv.get('bois')!;
    const spent = m.buy(inv, 'bois', 3, earned);
    expect(spent).toBeGreaterThan(0);
    expect(inv.get('bois')).toBe(before + 3);
  });

  it('la vente fait baisser le prix, l\'achat le fait monter', () => {
    const m = new Market();
    const p0 = m.price('pierre');
    m.sell(new Map([['pierre', 20]]), 'pierre', 20);
    expect(m.price('pierre')).toBeLessThan(p0);
    const p1 = m.price('pierre');
    m.buy(new Map(), 'pierre', 10, 1000);
    expect(m.price('pierre')).toBeGreaterThan(p1);
  });

  it('on ne peut pas acheter un bien absent du stock', () => {
    const m = new Market();
    expect(m.buy(new Map(), 'meuble', 1, 1000)).toBe(0);
  });
});

describe('métiers + économie en jeu', () => {
  it('chaque IA reçoit un métier connu', () => {
    const sim = new Simulation({ seed: 7, agentCount: 10 });
    for (const a of sim.agents) expect(JOBS).toContain(a.state.job as never);
  });

  it('seuls les fermiers créent et possèdent des champs (usage exclusif)', () => {
    const sim = new Simulation({ seed: 7, agentCount: 10 });
    const farmTiles = () =>
      sim.world.tiles.filter((t) => t === 'farm' || t.startsWith('champ_')).length;
    expect(farmTiles()).toBe(0); // aucun champ au départ
    for (let i = 0; i < 12000; i++) sim.tick();
    expect(farmTiles()).toBeGreaterThan(0); // des champs ont été cultivés
    for (const a of sim.agents) {
      if (sim.world.countFarms(a.state.id) > 0) expect(a.state.job).toBe('fermier');
    }
  });

  it('le commerce génère des pièces et alimente le marché', () => {
    const sim = new Simulation({ seed: 7, agentCount: 10 });
    const initialCoins = sim.agents.reduce((s, a) => s + a.state.coins, 0);
    for (let i = 0; i < 16000; i++) sim.tick();
    const finalCoins = sim.snapshot().agents.reduce((s, a) => s + a.coins, 0);
    expect(finalCoins).toBeGreaterThan(initialCoins); // des ventes ont eu lieu
    const stockTotal = [...sim.market.stock.values()].reduce((s, v) => s + v, 0);
    expect(stockTotal).toBeGreaterThan(0); // des biens ont été déposés au marché
  });
});
