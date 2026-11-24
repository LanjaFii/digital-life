/**
 * Simulations longues Phase 3B (profils documentés + critères d'échec).
 * Exécutées sur les services purs : aucun SQLite/Electron impliqué.
 */
import { describe, expect, it } from 'vitest';
import { EMOTION_KEYS, NEED_KEYS, type CharacterEmotions, type CharacterNeeds } from '../src/shared/character';
import { computeCharacterTick } from '../src/main/services/character-tick.service';
import { DEFAULT_SIMULATION_PARAMETERS } from '../src/main/services/simulation-parameters.service';
import type { CharacterTickInput, CharacterTickSnapshot } from '../src/shared/simulation-rules';
import { BASE_EMOTIONS, BASE_NEEDS, BASE_TRAITS, makeSnapshot, PROFILES } from './simulation-rules-fixtures';

const params = DEFAULT_SIMULATION_PARAMETERS;

interface Series {
  needs: Record<string, number[]>;
  emotions: Record<string, number[]>;
}

function runTicks(snapshot: CharacterTickSnapshot, count: number): Series {
  const series: Series = {
    needs: Object.fromEntries(NEED_KEYS.map((k) => [k, []])),
    emotions: Object.fromEntries(EMOTION_KEYS.map((k) => [k, []])),
  };
  let current = snapshot;
  for (let tick = 1; tick <= count; tick++) {
    const input: CharacterTickInput = {
      worldId: 'long', tick, day: Math.floor(tick / 24) + 1, hour: tick % 24,
      seed: 42, rngState: 0x12345678, characters: [current], params,
    };
    const result = computeCharacterTick(input);
    const state = result.characterStates[0];
    for (const k of NEED_KEYS) series.needs[k].push(state.needs[k]);
    for (const k of EMOTION_KEYS) series.emotions[k].push(state.emotions[k]);
    current = { ...current, needs: state.needs as CharacterNeeds, emotions: state.emotions as CharacterEmotions };
  }
  return series;
}

function assertNumericHealth(series: Series, label: string) {
  for (const [key, values] of [...Object.entries(series.needs), ...Object.entries(series.emotions)]) {
    for (const v of values) {
      expect(Number.isFinite(v), `${label} ${key} non fini`).toBe(true);
      expect(v, `${label} ${key} < 0`).toBeGreaterThanOrEqual(0);
      expect(v, `${label} ${key} > 100`).toBeLessThanOrEqual(100);
    }
  }
}

function countChanges(values: number[]): number {
  let changes = 0;
  for (let i = 1; i < values.length; i++) if (values[i] !== values[i - 1]) changes++;
  return changes;
}

describe('simulations longues (horizons documentés)', () => {
  for (const horizon of [24, 72, 168, 720]) {
    it(`${horizon} ticks : bornes, determinisme, pas d'explosion`, () => {
      const snapshot = makeSnapshot();
      const a = runTicks(snapshot, horizon);
      const b = runTicks(snapshot, horizon);
      assertNumericHealth(a, `${horizon} ticks`);
      expect(a, `rejeu ${horizon} ticks`).toEqual(b);
    });
  }

  it('plusieurs milliers de ticks (3000) restent stables', () => {
    const series = runTicks(makeSnapshot(), 3000);
    assertNumericHealth(series, '3000 ticks');
    // La saturation des émotions est ATTENDUE ici : sans actions, les besoins
    // restent à 0 pendant des milliers de ticks (cause active persistante).
    // Le critère d'échec ne s'applique qu'aux scénarios stables, testés plus bas.
    expect(series.needs.hunger.at(-1)).toBe(0);
    expect(series.emotions.happiness.at(-1)).toBeLessThan(30);
  });

  it('pas de saturation permanente sans cause active (besoins maintenus hauts)', () => {
    // Scénario stable : on réinitialise les besoins à 100 à chaque tick, comme
    // le ferait une future action de satisfaction. Aucune cause négative.
    let snapshot = makeSnapshot();
    const tail: number[] = [];
    for (let tick = 1; tick <= 200; tick++) {
      const result = computeCharacterTick({
        worldId: 'stable', tick, day: Math.floor(tick / 24) + 1, hour: tick % 24,
        seed: 42, rngState: 1, characters: [snapshot], params,
      });
      const state = result.characterStates[0];
      tail.push(state.emotions.happiness);
      // Besoins maintenus artificiellement hauts pour isoler la dynamique émotionnelle.
      snapshot = { ...snapshot, needs: { ...BASE_NEEDS }, emotions: state.emotions as CharacterEmotions };
    }
    const last = tail.slice(-50);
    expect(last.every((v) => v === 0) || last.every((v) => v === 100)).toBe(false);
  });

  it('pas d’oscillation artificielle sur un profil stable', () => {
    const series = runTicks(makeSnapshot(), 720);
    for (const [key, values] of Object.entries(series.emotions)) {
      const tail = values.slice(-200);
      let flips = 0;
      for (let i = 2; i < tail.length; i++) {
        const d1 = tail[i - 1] - tail[i - 2];
        const d2 = tail[i] - tail[i - 1];
        if (d1 * d2 < 0 && Math.abs(d1) > 0.5 && Math.abs(d2) > 0.5) flips++;
      }
      expect(flips, `oscillation artificielle sur ${key}`).toBeLessThan(20);
    }
  });

  it('pas de stagnation totale : les profils avec déficits évoluent', () => {
    for (const profile of Object.keys(PROFILES) as Array<keyof typeof PROFILES>) {
      const snapshot = makeSnapshot({
        characterId: profile,
        traits: { ...BASE_TRAITS, ...PROFILES[profile] },
        needs: { ...BASE_NEEDS, hunger: 20, sleep: 15, safety: 30 },
        emotions: { ...BASE_EMOTIONS, stress: 70 },
      });
      const series = runTicks(snapshot, 24);
      const totalChanges = Object.values(series.needs).reduce((n, v) => n + countChanges(v), 0)
        + Object.values(series.emotions).reduce((n, v) => n + countChanges(v), 0);
      expect(totalChanges, `stagnation sur ${profile}`).toBeGreaterThan(0);
    }
  });

  it('les 6 profils documentés divergent de façon cohérente sur 60 ticks', () => {
    const results: Record<string, number> = {};
    for (const profile of Object.keys(PROFILES) as Array<keyof typeof PROFILES>) {
      const snapshot = makeSnapshot({
        characterId: profile,
        traits: { ...BASE_TRAITS, ...PROFILES[profile] },
        needs: { ...BASE_NEEDS, hunger: 80 },
      });
      const series = runTicks(snapshot, 60);
      assertNumericHealth(series, profile);
      results[profile] = profile === 'très sociable' || profile === 'indépendant'
        ? series.needs.socialization[59]
        : series.needs.hunger[59];
    }
    // Horizon 60 ticks choisi pour éviter la saturation à 0 des deux profils,
    // qui masquerait la différence de pente liée aux traits.
    expect(results['impulsif']).toBeLessThan(results['discipliné']);
    // La socialisation décroît plus vite pour un profil très sociable.
    expect(results['très sociable']).toBeLessThan(results['indépendant']);
  });
});
