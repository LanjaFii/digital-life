/**
 * Simulations longues Phase 3B/3C (profils documentés + critères d'échec).
 * Exécutées sur les services purs : aucun SQLite/Electron impliqué.
 *
 * Depuis la Phase 3C, un tick transporte son `rngState` et son runtime
 * d'action d'un tick à l'autre : les tests rejouent donc une vraie simulation
 * continuation, pas 3000 ticks indépendants.
 */
import { describe, expect, it } from 'vitest';
import { EMOTION_KEYS, NEED_KEYS, type CharacterEmotions, type CharacterNeeds } from '../src/shared/character';
import type { CharacterActionRuntime } from '../src/shared/action';
import { computeCharacterTick } from '../src/main/services/character-tick.service';
import { DEFAULT_SIMULATION_PARAMETERS } from '../src/main/services/simulation-parameters.service';
import type { CharacterTickInput, CharacterTickSnapshot } from '../src/shared/simulation-rules';
import { BASE_EMOTIONS, BASE_NEEDS, BASE_TRAITS, makeSnapshot, PROFILES } from './simulation-rules-fixtures';

const params = DEFAULT_SIMULATION_PARAMETERS;

interface Series {
  needs: Record<string, number[]>;
  emotions: Record<string, number[]>;
  actions: string[];
  rules: string[];
}

function runTicks(snapshot: CharacterTickSnapshot, count: number): Series {
  const series: Series = {
    needs: Object.fromEntries(NEED_KEYS.map((k) => [k, []])),
    emotions: Object.fromEntries(EMOTION_KEYS.map((k) => [k, []])),
    actions: [],
    rules: [],
  };
  let current = snapshot;
  let rngState = 0x12345678;
  let runtime: CharacterActionRuntime | undefined;
  for (let tick = 1; tick <= count; tick++) {
    const input: CharacterTickInput = {
      worldId: 'long', tick, day: Math.floor(tick / 24) + 1, hour: tick % 24,
      seed: 42, rngState, characters: [current], params,
      actionRuntimeByCharacter: runtime
        ? { [current.characterId]: runtime }
        : undefined,
    };
    const result = computeCharacterTick(input);
    const state = result.characterStates[0];
    for (const k of NEED_KEYS) series.needs[k].push(state.needs[k]);
    for (const k of EMOTION_KEYS) series.emotions[k].push(state.emotions[k]);
    series.actions.push(result.decisions[0].selectedActionId);
    series.rules.push(result.decisions[0].selectionRule);
    current = { ...current, needs: state.needs as CharacterNeeds, emotions: state.emotions as CharacterEmotions };
    rngState = result.rngState;
    runtime = result.actionRuntimeStates[0].runtime;
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

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/**
 * Une action doit rester au plus 6 fois sur 10 décisions hors déficit (doc §15.2).
 * Les ticks de continuation d'une action longue ne sont pas de nouvelles
 * décisions : ils sont exclus du comptage, sinon un `sleep` de 8 ticks serait
 * à tort qualifié de boucle. `idle` est également exclu : c'est le repli quand
 * aucune action n'a de score positif, pas une boucle d'action.
 */
function assertNoActionLoop(series: Series, label: string) {
  const decisions = series.actions.filter(
    (id, index) => series.rules[index] !== 'continue_active' && id !== 'idle',
  );
  for (let start = 0; start + 10 <= decisions.length; start += 10) {
    const window = decisions.slice(start, start + 10);
    const counts = window.reduce<Record<string, number>>((acc, id) => {
      acc[id] = (acc[id] ?? 0) + 1;
      return acc;
    }, {});
    for (const [id, occurrences] of Object.entries(counts)) {
      expect(occurrences, `${label} : boucle sur ${id}`).toBeLessThanOrEqual(6);
    }
  }
}

describe('simulations longues (horizons documentés)', () => {
  for (const horizon of [24, 72, 168, 720]) {
    it(`${horizon} ticks : bornes, determinisme, pas d'explosion`, () => {
      const snapshot = makeSnapshot();
      const a = runTicks(snapshot, horizon);
      const b = runTicks(snapshot, horizon);
      assertNumericHealth(a, `${horizon} ticks`);
      expect(a, `rejeu ${horizon} ticks`).toEqual(b);
      assertNoActionLoop(a, `${horizon} ticks`);
    });
  }

  it('plusieurs milliers de ticks (3000) restent stables', () => {
    const series = runTicks(makeSnapshot(), 3000);
    assertNumericHealth(series, '3000 ticks');
    assertNoActionLoop(series, '3000 ticks');
    // Les actions de subsistance maintiennent la faim et la soif hautes :
    // contrairement à la Phase 3B, `hunger` ne s'effondre plus à 0.
    expect(series.needs.hunger.at(-1)).toBeGreaterThan(50);
    expect(series.needs.thirst.at(-1)).toBeGreaterThan(50);
    expect(series.emotions.happiness.at(-1)).toBeLessThan(40);
  }, 20000);

  it('pas de saturation permanente sans cause active (besoins maintenus hauts)', () => {
    // Scénario stable : on réinitialise les besoins à 100 à chaque tick, comme
    // le ferait une future action de satisfaction. Aucune cause négative.
    let snapshot = makeSnapshot();
    const tail: number[] = [];
    for (let tick = 1; tick <= 200; tick++) {
      const result = computeCharacterTick({
        worldId: 'stable', tick, day: Math.floor(tick / 24) + 1, hour: tick % 24,
        seed: 42, rngState: tick, characters: [snapshot], params,
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
      // Le bonheur oscille désormais avec les cycles homeostatiques des actions
      // (manger/boire/dormir) : seuil Phase 3B < 20 réservé aux émotions sans
      // effet d'action. Borne retenue : < 60 inversions / 200 ticks, sans
      // oscillation violente (> 40 points entre deux ticks).
      const limit = key === 'happiness' ? 60 : 20;
      expect(flips, `oscillation artificielle sur ${key}`).toBeLessThan(limit);
      if (key === 'happiness') {
        for (let i = 1; i < tail.length; i++) {
          expect(Math.abs(tail[i] - tail[i - 1]), 'oscillation violente de happiness').toBeLessThanOrEqual(40);
        }
      }
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
    const hunger: Record<string, number> = {};
    const socialization: Record<string, number> = {};
    for (const profile of Object.keys(PROFILES) as Array<keyof typeof PROFILES>) {
      const snapshot = makeSnapshot({
        characterId: profile,
        traits: { ...BASE_TRAITS, ...PROFILES[profile] },
        needs: { ...BASE_NEEDS, hunger: 80 },
      });
      const series = runTicks(snapshot, 60);
      assertNumericHealth(series, profile);
      // Moyenne plutôt que valeur finale : les actions de subsistance ramènent
      // la faim à 100 en fin de fenêtre et masqueraient la pente liée aux traits.
      hunger[profile] = average(series.needs.hunger);
      socialization[profile] = average(series.needs.socialization);
    }
    expect(hunger['impulsif']).toBeLessThan(hunger['discipliné']);
    // Un seul personnage : `seek_company` est infaisable. Le profil indépendant
    // choisit activement `be_alone`, ce qui fait davantage chuter sa socialisation.
    expect(socialization['indépendant']).toBeLessThan(socialization['très sociable']);
  });
});
