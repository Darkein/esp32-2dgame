// Marché du village : économie monétaire simple à prix dynamiques. Les IA y vendent
// leurs surplus contre des pièces et achètent ce qui leur manque. Le marché tient un
// stock physique : on ne peut acheter que ce qui a été vendu (économie circulaire).
import { BASE_PRICE } from './catalog';
import { add, count, take, type Inventory } from './crafting';

const PRICE_MIN = 0.4; // plancher (× prix de base)
const PRICE_MAX = 2.5; // plafond (× prix de base)

export class Market {
  /** Marchandises disponibles à l'achat (déposées par les vendeurs). */
  readonly stock: Inventory = new Map();
  /** Prix courant par bien (varie avec l'offre/la demande). */
  readonly prices = new Map<string, number>();

  constructor() {
    for (const [k, v] of Object.entries(BASE_PRICE)) this.prices.set(k, v);
  }

  tradable(kind: string): boolean {
    return this.prices.has(kind);
  }

  /** Prix unitaire courant d'un bien (0 si non échangeable). */
  price(kind: string): number {
    return this.prices.get(kind) ?? 0;
  }

  private clampPrice(kind: string, p: number): number {
    const base = BASE_PRICE[kind] ?? p;
    return Math.max(base * PRICE_MIN, Math.min(base * PRICE_MAX, p));
  }

  /** Vend `qty` unités depuis `inv`. Renvoie les pièces gagnées (offre ↑ ⇒ prix ↓). */
  sell(inv: Inventory, kind: string, qty: number): number {
    if (!this.tradable(kind)) return 0;
    const n = Math.min(qty, count(inv, kind));
    if (n <= 0) return 0;
    const unit = Math.max(1, Math.floor(this.price(kind)));
    take(inv, kind, n);
    add(this.stock, kind, n);
    this.prices.set(kind, this.clampPrice(kind, this.price(kind) * (1 - 0.03 * n)));
    return unit * n;
  }

  /** Achète jusqu'à `qty` unités dans la limite du `budget`. Renvoie le coût payé. */
  buy(inv: Inventory, kind: string, qty: number, budget: number): number {
    if (!this.tradable(kind)) return 0;
    const unit = Math.max(1, Math.ceil(this.price(kind)));
    const affordable = Math.floor(budget / unit);
    const n = Math.min(qty, count(this.stock, kind), affordable);
    if (n <= 0) return 0;
    take(this.stock, kind, n);
    add(inv, kind, n);
    this.prices.set(kind, this.clampPrice(kind, this.price(kind) * (1 + 0.04 * n)));
    return unit * n;
  }
}
