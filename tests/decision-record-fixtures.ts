/** Fabrique de charges utiles d'historique pour les tests 3D-A. */
import { computeCharacterTick } from '../src/main/services/character-tick.service';
import { DEFAULT_SIMULATION_PARAMETERS } from '../src/main/services/simulation-parameters.service';
import type { DecisionRecordPayloadV1 } from '../src/shared/decision';
import type { CharacterTickInput } from '../src/shared/simulation-rules';
import { makeSnapshot } from './simulation-rules-fixtures';

export function makeDecisionPayload(
  overrides: Partial<CharacterTickInput> = {},
): DecisionRecordPayloadV1 {
  const input: CharacterTickInput = {
    worldId: 'world-a',
    tick: 1,
    day: 1,
    hour: 1,
    seed: 1234,
    rngState: 0xdeadbeef,
    characters: [makeSnapshot({ characterId: 'char-a' })],
    params: DEFAULT_SIMULATION_PARAMETERS,
    characterNameByCharacterId: { 'char-a': 'Ada Lovelace' },
    ...overrides,
  };
  const record = computeCharacterTick(input).decisionRecords[0];
  if (!record) throw new Error('Aucune charge utile de décision produite.');
  return record;
}
