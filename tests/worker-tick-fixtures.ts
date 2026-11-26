/** Filières partagées pour les tests du protocole et du worker de calcul. */
import { createHash } from 'node:crypto';
import { computeCharacterTick } from '../src/main/services/character-tick.service';
import { validateDecisionRecordPayload } from '../src/main/services/decision-record.service';
import { DEFAULT_SIMULATION_PARAMETERS } from '../src/main/services/simulation-parameters.service';
import type { CharacterActionRuntime } from '../src/shared/action';
import type { CharacterEmotions, CharacterNeeds } from '../src/shared/character';
import { canonicalizeGoldenTickResult } from '../src/shared/canonicalization';
import type { CharacterTickInput, CharacterTickSnapshot } from '../src/shared/simulation-rules';
import type { ComputeTickRequest } from '../src/shared/worker-protocol';
import { makeSnapshot, PROFILES } from './simulation-rules-fixtures';

export function makeComputeTickInput(overrides: Partial<CharacterTickInput> = {}): CharacterTickInput {
  return {
    worldId: 'worker-world',
    tick: 1,
    day: 1,
    hour: 1,
    seed: 0xc0ffee,
    rngState: 0x12345678,
    characters: [makeSnapshot({ characterId: 'c-000' })],
    params: structuredClone(DEFAULT_SIMULATION_PARAMETERS),
    ...overrides,
  };
}

export function makeComputeTickRequest(
  requestId = 'compute-1',
  overrides: Partial<CharacterTickInput> = {},
): ComputeTickRequest {
  return {
    type: 'compute-tick',
    protocolVersion: 1,
    requestId,
    input: makeComputeTickInput(overrides),
  };
}

/**
 * Hash du noyau Golden Hash pour un scénario documenté. Source unique utilisée
 * par les 18 références historiques et par la matrice complète isolée.
 */
export function computeGoldenScenarioHash(profile: string, count: number, ticks: number): string {
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
  return createHash('sha256').update(canonicalizeGoldenTickResult(last), 'utf8').digest('hex');
}
