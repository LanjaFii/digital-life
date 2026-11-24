/**
 * Générateur pseudo-aléatoire déterministe (mulberry32).
 * Aucun appel à Math.random() : même seed => même séquence.
 *
 * L'état interne est sérialisable pour permettre une reprise exacte après
 * sauvegarde/restauration. `seed` initialise l'état ; `getState()/setState()`
 * capturent/restaurent le point exact dans la séquence.
 */
export class SeededRng {
  private state: number;

  constructor(seed: number) {
    this.state = SeededRng.normalizeSeed(seed);
  }

  /** Normalise une seed en entier non signé 32 bits. */
  static normalizeSeed(seed: number): number {
    if (!Number.isFinite(seed)) throw new Error('Seed PRNG invalide.');
    return Math.trunc(seed) >>> 0;
  }

  /** État interne exact (uint32), à persister pour reprise déterministe. */
  getState(): number {
    return this.state >>> 0;
  }

  /**
   * Restaure l'état interne exact. Refuse tout état non entier uint32 pour
   * éviter une reprise silencieusement corrompue.
   */
  setState(state: number): void {
    if (!Number.isInteger(state) || state < 0 || state > 0xffffffff) {
      throw new Error('État PRNG invalide : entier uint32 attendu.');
    }
    this.state = state >>> 0;
  }

  /** Retourne un flottant dans [0, 1). */
  next(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  int(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('Impossible de choisir dans un tableau vide.');
    return items[this.int(0, items.length - 1)];
  }

  chance(probability: number): boolean {
    return this.next() < probability;
  }
}