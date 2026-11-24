/**
 * Golden Hash 3D-A : le calcul Phase 3C doit rester byte-identique après
 * l'ajout de l'historique. Les hashes ci-dessous ont été mesurés sur le code
 * Phase 3C livré, avant toute modification de 3D-A.
 */
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { computeCharacterTick } from '../src/main/services/character-tick.service';
import { validateDecisionRecordPayload } from '../src/main/services/decision-record.service';
import { DEFAULT_SIMULATION_PARAMETERS } from '../src/main/services/simulation-parameters.service';
import type { CharacterActionRuntime } from '../src/shared/action';
import type { CharacterEmotions, CharacterNeeds } from '../src/shared/character';
import type { CharacterTickInput, CharacterTickSnapshot } from '../src/shared/simulation-rules';
import { makeSnapshot, PROFILES } from './simulation-rules-fixtures';

/** Même canonicaliseur que celui utilisé pour la mesure de référence. */
function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`).join(',')}}`;
}

function scenarioHash(profile: string, count: number, ticks: number): string {
  let snapshots: CharacterTickSnapshot[] = Array.from({ length: count }, (_, index) => makeSnapshot({
    characterId: `c-${String(index).padStart(3, '0')}`,
    traits: { ...PROFILES[profile] },
  }));
  let rngState = 0x12345678;
  const runtimes = new Map<string, CharacterActionRuntime>();
  let last = computeCharacterTick({
    worldId: 'golden', tick: 0, day: 1, hour: 0, seed: 0xc0ffee, rngState,
    characters: snapshots, params: DEFAULT_SIMULATION_PARAMETERS,
  });
  for (let tick = 1; tick <= ticks; tick += 1) {
    const input: CharacterTickInput = {
      worldId: 'golden', tick, day: Math.floor(tick / 24) + 1, hour: tick % 24,
      seed: 0xc0ffee, rngState, characters: snapshots, params: DEFAULT_SIMULATION_PARAMETERS,
      actionRuntimeByCharacter: Object.fromEntries(runtimes),
    };
    last = computeCharacterTick(input);
    // Chaque enregistrement généré sur une longue simulation doit satisfaire
    // la validation stricte utilisée à l'écriture et à la lecture.
    for (const record of last.decisionRecords) validateDecisionRecordPayload(record);
    rngState = last.rngState;
    snapshots = last.characterStates.map((state, index) => ({
      ...snapshots[index],
      needs: state.needs as CharacterNeeds,
      emotions: state.emotions as CharacterEmotions,
    }));
    for (const runtime of last.actionRuntimeStates) runtimes.set(runtime.characterId, runtime.runtime);
  }
  const core = {
    worldId: last.worldId, tick: last.tick, rngState: last.rngState,
    characterStates: last.characterStates, deltas: last.deltas, decisions: last.decisions,
    actionDeltas: last.actionDeltas, actionRuntimeStates: last.actionRuntimeStates, warnings: last.warnings,
  };
  return createHash('sha256').update(canonical(core), 'utf8').digest('hex');
}

const EXPECTED: Record<string, string> = {
  'optimiste résilient|1|720': 'd04aaa45719768fa4733c0450a8ba96e901583ef5bd26bfe8edc0dc18ad9ed30',
  'anxieux peu résilient|1|720': 'c6541d8f1ad6f0b433c5f14d3273f7c1c84ac85cda76ee4ef57b9fe5910f185e',
  'discipliné|1|720': '53834d31f386bc0165ae36827ccd8765005740efffaac47161f3b38ef1df3e61',
  'impulsif|1|720': '3542ef14c9774496f84a1628068c5c12461387d6326499fa2822ecd9711789a2',
  'très sociable|1|720': '734559d1e390800f2f43883dcfec9903c767b4f0d4782589e76a2173677a5695',
  'indépendant|1|720': 'be9cd0d0691492ea50d11c001573d940c7f4ad3abfc8447a7ad751ff071a31dc',
  'optimiste résilient|2|24': 'b0202dcfb5758907a963cb42299a521cfeeb897f68cc42b5e386f8b9a9e3937f',
  'optimiste résilient|2|72': 'e93a820e62e971f6c66c8358cd72147dbaf84fc932ef22db19dba3da48453507',
  'optimiste résilient|2|168': '808d75c16f702a48fe0b0247eab6870f065f5f68a56b89c29ab3404bc0f26187',
  'optimiste résilient|2|720': 'a0a958962524d2ab91dce109a1a412dc2f35dda5ce7eee85b06ae02b5308aa78',
  'optimiste résilient|10|24': 'ca075a830addfdd97eace6bd5186df3c4c0fbd4d96af04eb5bc52b995b270dc5',
  'optimiste résilient|10|72': 'aeaefbbcafeff965712effd61ee03a111bc96e7cd5d8f1d28e46fa486fc106e2',
  'optimiste résilient|10|168': '6e408ec5f27e290538f60d05383f48fd3a394fcf088501ac8f9c83300b4862ab',
  'optimiste résilient|10|720': 'c52c72c5ff8328f8fc8d76e48f1c2113a90e013507cc89ef0ac266f0de1453ec',
  'optimiste résilient|50|24': '6947e666f23150e531fcce534a890290227f568c6dda19eb7c39bee8e555356a',
  'optimiste résilient|50|72': '63a708e045acc3b871455ba30fce681db9893ac441042ff4346fabad93924130',
  'optimiste résilient|50|168': '4a6deb41813daba76d009f67b19980cd23efba0853696df44ea47292f5981ff8',
  'optimiste résilient|50|720': 'b308e915b48d4cf331ea58bf6d407edadb07727843cf60e22cdb2e89777566b4',
};

describe('Golden Hash — non-régression Phase 3C après 3D-A', () => {
  for (const [key, expected] of Object.entries(EXPECTED)) {
    const [profile, count, ticks] = key.split('|');
    it(`${profile} — ${count} personnage(s), ${ticks} ticks`, () => {
      expect(scenarioHash(profile, Number(count), Number(ticks))).toBe(expected);
    }, 120_000);
  }
});
