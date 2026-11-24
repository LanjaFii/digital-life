import { describe, expect, it } from 'vitest';
import { SeededRng } from '../src/main/services/prng';

describe('SeededRng', () => {
  it('produit la même séquence pour la même seed', () => {
    const a = new SeededRng(12345);
    const b = new SeededRng(12345);
    const seqA = Array.from({ length: 10 }, () => a.next());
    const seqB = Array.from({ length: 10 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it('reprend exactement la même séquence après getState/setState', () => {
    const rng = new SeededRng(42);
    for (let i = 0; i < 5; i++) rng.next();
    const state = rng.getState();
    const expected = Array.from({ length: 8 }, () => rng.next());

    const restored = new SeededRng(999);
    restored.setState(state);
    const actual = Array.from({ length: 8 }, () => restored.next());
    expect(actual).toEqual(expected);
  });

  it('refuse un état invalide', () => {
    const rng = new SeededRng(1);
    expect(() => rng.setState(-1)).toThrow(/uint32/);
    expect(() => rng.setState(1.5)).toThrow(/uint32/);
    expect(() => rng.setState(Number.NaN)).toThrow(/uint32/);
    expect(() => rng.setState(0x1_0000_0000)).toThrow(/uint32/);
  });

  it('normalise la seed en uint32', () => {
    const a = new SeededRng(1);
    const b = new SeededRng(1 + 0x1_0000_0000);
    expect(a.getState()).toBe(b.getState());
  });
});