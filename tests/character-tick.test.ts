import { describe, expect, it } from 'vitest';
import { computeCharacterTick, orderSnapshots } from '../src/main/services/character-tick.service';
import { DEFAULT_SIMULATION_PARAMETERS } from '../src/main/services/simulation-parameters.service';
import type { CharacterTickInput } from '../src/shared/simulation-rules';
import { makeSnapshot } from './simulation-rules-fixtures';

function input(characters: ReturnType<typeof makeSnapshot>[], overrides: Partial<CharacterTickInput> = {}): CharacterTickInput {
  return {
    worldId: 'world-1',
    tick: 1,
    day: 1,
    hour: 1,
    seed: 1234,
    rngState: 0xdeadbeef,
    characters,
    params: DEFAULT_SIMULATION_PARAMETERS,
    ...overrides,
  };
}

describe('orchestration du tick personnage (Phase 3B)', () => {
  it('trie les personnages par identifiant de façon stable', () => {
    const ordered = orderSnapshots([
      makeSnapshot({ characterId: 'c' }),
      makeSnapshot({ characterId: 'a' }),
      makeSnapshot({ characterId: 'b' }),
    ]);
    expect(ordered.map((s) => s.characterId)).toEqual(['a', 'b', 'c']);
  });

  it('l’ordre d’entrée des personnages ne change pas le résultat', () => {
    const a = makeSnapshot({ characterId: 'a', traits: { discipline: 100 } });
    const b = makeSnapshot({ characterId: 'b', traits: { impulsivity: 100 } });
    const forward = computeCharacterTick(input([a, b]));
    const reverse = computeCharacterTick(input([b, a]));
    expect(forward).toEqual(reverse);
  });

  it('conserve strictement le PRNG et n’expose aucun effet SQLite', () => {
    const result = computeCharacterTick(input([makeSnapshot()]));
    expect(result.rngState).toBe(0xdeadbeef);
    expect(result.worldId).toBe('world-1');
    expect(result.tick).toBe(1);
  });

  it('applique l’arrondi aux centièmes et bornage final', () => {
    const result = computeCharacterTick(input([makeSnapshot()]));
    const state = result.characterStates[0];
    for (const value of [...Object.values(state.needs), ...Object.values(state.emotions)]) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(100);
      expect(Math.abs(value * 100 - Math.round(value * 100))).toBeLessThan(1e-6);
    }
  });

  it('les deltas reflètent exactement les valeurs finales', () => {
    const result = computeCharacterTick(input([makeSnapshot()]));
    const state = result.characterStates[0];
    for (const d of result.deltas) {
      const after = d.field.startsWith('needs.')
        ? state.needs[d.field.slice(6) as keyof typeof state.needs]
        : state.emotions[d.field.slice(9) as keyof typeof state.emotions];
      expect(d.after).toBe(after);
      expect(d.delta).toBeCloseTo(after - d.before, 6);
    }
  });

  it('est reproductible sur un même état', () => {
    const state = makeSnapshot();
    expect(computeCharacterTick(input([state]))).toEqual(computeCharacterTick(input([state])));
  });
});
