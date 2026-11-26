/** Frontière d'écriture du tick : préparation et validation pures (3D-C1). */
import { describe, expect, it } from 'vitest';
import { computeCharacterTick } from '../src/main/services/character-tick.service';
import {
  assertDecisionRecordsMatchTick,
  buildNextClock,
  buildTickStates,
} from '../src/main/services/tick-writer.service';
import type { SimulationClock } from '../src/shared/simulation';
import { makeComputeTickInput } from './worker-tick-fixtures';

const clock: SimulationClock = {
  worldId: 'worker-world',
  tick: 1,
  day: 1,
  hour: 1,
  status: 'paused',
  speed: 1,
  rngState: 0x12345678,
  lastProcessedOrder: 3,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('tick-writer.service', () => {
  it('apparie les runtimes aux états calculés', () => {
    const result = computeCharacterTick(makeComputeTickInput());
    const states = buildTickStates(result);
    expect(states).toHaveLength(result.characterStates.length);
    expect(states[0].runtime).toEqual(result.actionRuntimeStates[0].runtime);
  });

  it('rejette un runtime manquant', () => {
    const result = computeCharacterTick(makeComputeTickInput());
    result.actionRuntimeStates = [];
    expect(() => buildTickStates(result)).toThrow(/runtimes/);
  });

  it('valide l’ordre et l’état final des enregistrements d’historique', () => {
    const result = computeCharacterTick(makeComputeTickInput());
    const states = buildTickStates(result);
    expect(() => assertDecisionRecordsMatchTick(result.decisionRecords, states)).not.toThrow();
    const altered = structuredClone(result.decisionRecords);
    altered[0].explanation.characterId = 'inconnu';
    expect(() => assertDecisionRecordsMatchTick(altered, states)).toThrow(/Ordre/);
  });

  it('construit une horloge suivante sans modifier le statut ni le PRNG', () => {
    const next = buildNextClock(clock, 2, 1, 2, 0xffffffff + 1, '2026-01-01T01:00:00.000Z');
    expect(next).toEqual({
      ...clock,
      tick: 2,
      hour: 2,
      rngState: 0,
      lastProcessedOrder: 0,
      updatedAt: '2026-01-01T01:00:00.000Z',
    });
  });
});
