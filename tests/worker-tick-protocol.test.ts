/** Validateurs stricts du protocole de calcul du tick (Phase 3D-C1). */
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { computeCharacterTick } from '../src/main/services/character-tick.service';
import { ACTION_REGISTRY_VERSION } from '../src/shared/action';
import { canonicalizeGoldenTickResult } from '../src/shared/canonicalization';
import { DECISION_ENGINE_VERSION } from '../src/shared/decision';
import type { SimulationParametersV1 } from '../src/shared/simulation-rules';
import {
  createComputeTickError,
  validateComputeTickRequest,
  validateComputeTickResponse,
  validateComputeWorkerReady,
  WorkerProtocolError,
  type ComputeTickResultResponse,
} from '../src/shared/worker-protocol';
import { makeComputeTickInput, makeComputeTickRequest } from './worker-tick-fixtures';

function expectProtocolError(code: 'invalid_input' | 'unsupported_version', run: () => unknown): WorkerProtocolError {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(WorkerProtocolError);
    const failure = error as WorkerProtocolError;
    expect(failure.code).toBe(code);
    return failure;
  }
  throw new Error('Le validateur aurait dû lever une erreur de protocole.');
}

describe('protocole compute-tick : requêtes', () => {
  it('accepte une requête complète et correctement versionnée', () => {
    const request = makeComputeTickRequest();
    expect(validateComputeTickRequest(structuredClone(request))).toEqual(request);
  });

  it('rejette une version de protocole incompatible en conservant requestId', () => {
    const request = { ...makeComputeTickRequest(), protocolVersion: 2 };
    const failure = expectProtocolError('unsupported_version', () => validateComputeTickRequest(request));
    expect(failure.requestId).toBe('compute-1');
    expect(failure.worldId).toBe('worker-world');
  });

  it('rejette un type inattendu, un champ manquant et un champ inconnu', () => {
    const wrongType = { ...makeComputeTickRequest(), type: 'tick' };
    expectProtocolError('invalid_input', () => validateComputeTickRequest(wrongType));

    const incomplete = makeComputeTickRequest() as unknown as Record<string, unknown>;
    delete (incomplete.input as Record<string, unknown>).hour;
    expectProtocolError('invalid_input', () => validateComputeTickRequest(incomplete));

    const unknown = makeComputeTickRequest();
    (unknown.input.params as unknown as Record<string, unknown>).inconnu = 1;
    expectProtocolError('invalid_input', () => validateComputeTickRequest(unknown));
  });

  it('rejette les valeurs invalides et non finies', () => {
    for (const hour of [24, -1, 1.5, Number.NaN]) {
      expectProtocolError('invalid_input', () => validateComputeTickRequest(makeComputeTickRequest('compute-1', { hour })));
    }
    expectProtocolError('invalid_input', () => validateComputeTickRequest(makeComputeTickRequest('compute-1', {
      rngState: -1,
    })));
    expectProtocolError('unsupported_version', () => validateComputeTickRequest(makeComputeTickRequest('compute-1', {
      params: { ...makeComputeTickInput().params, version: 2 } as unknown as SimulationParametersV1,
    })));
  });
});

describe('protocole compute-tick : réponses', () => {
  function validResponse(): ComputeTickResultResponse {
    const input = makeComputeTickInput();
    const result = computeCharacterTick(input);
    return {
      type: 'compute-tick:result',
      protocolVersion: 1,
      requestId: 'compute-1',
      worldId: input.worldId,
      tick: input.tick,
      result,
      checksum: createHash('sha256').update(canonicalizeGoldenTickResult(result), 'utf8').digest('hex'),
      versions: {
        engineVersion: DECISION_ENGINE_VERSION,
        registryVersion: ACTION_REGISTRY_VERSION,
        parametersVersion: input.params.version,
      },
    };
  }

  it('accepte une réponse complète', () => {
    expect(() => validateComputeTickResponse(validResponse())).not.toThrow();
  });

  it('rejette un checksum altéré, des versions incompatibles et une enveloppe incohérente', () => {
    const badChecksum = validResponse();
    badChecksum.checksum = 'z'.repeat(64);
    expectProtocolError('invalid_input', () => validateComputeTickResponse(badChecksum));

    const badVersions = validResponse();
    badVersions.versions = { ...badVersions.versions, registryVersion: 2 };
    expectProtocolError('unsupported_version', () => validateComputeTickResponse(badVersions));

    const mismatch = validResponse();
    mismatch.tick += 1;
    expectProtocolError('invalid_input', () => validateComputeTickResponse(mismatch));

    const withoutRecords = validResponse() as unknown as Record<string, unknown>;
    delete (withoutRecords.result as Record<string, unknown>).decisionRecords;
    expectProtocolError('invalid_input', () => validateComputeTickResponse(withoutRecords));
  });

  it('accepte les erreurs corrélées et non corrélées, puis rejette un code inconnu', () => {
    expect(() => validateComputeTickResponse(createComputeTickError({
      requestId: 'compute-1', worldId: 'worker-world', code: 'compute_error', message: 'panne',
    }))).not.toThrow();
    expect(() => validateComputeTickResponse(createComputeTickError({
      code: 'invalid_input', message: 'requête illisible',
    }))).not.toThrow();

    const unknown = { ...createComputeTickError({ requestId: 'compute-1', code: 'compute_error', message: 'x' }), code: 'autre' };
    expectProtocolError('invalid_input', () => validateComputeTickResponse(unknown));
  });
});

describe('signal ready', () => {
  it('accepte uniquement { type: ready, protocolVersion: 1 }', () => {
    const ready = { type: 'ready', protocolVersion: 1 };
    expect(validateComputeWorkerReady(ready)).toEqual(ready);
    expectProtocolError('unsupported_version', () => validateComputeWorkerReady({ ...ready, protocolVersion: 2 }));
    expectProtocolError('invalid_input', () => validateComputeWorkerReady({ ...ready, requestId: 'compute-1' }));
  });
});
