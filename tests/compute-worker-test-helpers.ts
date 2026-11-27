/** Harnais de test du client de calcul : worker factice et réponses protocolaires. */
import { createHash } from 'node:crypto';
import { ACTION_REGISTRY_VERSION } from '../src/shared/action';
import { DECISION_ENGINE_VERSION } from '../src/shared/decision';
import { canonicalizeGoldenTickResult } from '../src/shared/canonicalization';
import {
  SIMULATION_PARAMETERS_VERSION,
  type CharacterTickResult,
} from '../src/shared/simulation-rules';
import {
  COMPUTE_TICK_RESULT_TYPE,
  WORKER_PROTOCOL_VERSION,
  type ComputeTickRequest,
  type ComputeTickResultResponse,
} from '../src/shared/worker-protocol';
import type { ComputeWorkerLike } from '../src/main/simulation/tick-compute-client.service';
import { computeCharacterTick } from '../src/main/services/character-tick.service';

export interface FakeComputeWorker extends ComputeWorkerLike {
  posted: ComputeTickRequest[];
  emitMessage(value: unknown): void;
  emitError(error: Error): void;
  emitExit(code: number): void;
}

/** Worker factice : `ready` immédiat puis chaque requête transmise au gestionnaire. */
export function createFakeComputeWorker(
  onRequest: (request: ComputeTickRequest, worker: FakeComputeWorker) => void,
): FakeComputeWorker {
  const handlers: Record<string, Array<(...args: never[]) => void>> = {};
  const posted: ComputeTickRequest[] = [];
  const worker: FakeComputeWorker = {
    posted,
    postMessage(value: unknown): void {
      const request = value as ComputeTickRequest;
      posted.push(request);
      onRequest(request, worker);
    },
    on(event: string, handler: (...args: never[]) => void): void {
      (handlers[event] ??= []).push(handler);
    },
    terminate(): Promise<number> {
      return Promise.resolve(0);
    },
    emitMessage(value: unknown): void {
      for (const handler of handlers.message ?? []) (handler as (v: unknown) => void)(value);
    },
    emitError(error: Error): void {
      for (const handler of handlers.error ?? []) (handler as (e: Error) => void)(error);
    },
    emitExit(code: number): void {
      for (const handler of handlers.exit ?? []) (handler as (c: number) => void)(code);
    },
  };
  queueMicrotask(() => worker.emitMessage({ type: 'ready', protocolVersion: WORKER_PROTOCOL_VERSION }));
  return worker;
}

/** Réponse `compute-tick:result` valide, calculée par la référence directe. */
export function makeResultResponse(
  request: ComputeTickRequest,
  result: CharacterTickResult = computeCharacterTick(request.input),
): ComputeTickResultResponse {
  return {
    type: COMPUTE_TICK_RESULT_TYPE,
    protocolVersion: WORKER_PROTOCOL_VERSION,
    requestId: request.requestId,
    worldId: result.worldId,
    tick: result.tick,
    result,
    checksum: createHash('sha256').update(canonicalizeGoldenTickResult(result), 'utf8').digest('hex'),
    versions: {
      engineVersion: DECISION_ENGINE_VERSION,
      registryVersion: ACTION_REGISTRY_VERSION,
      parametersVersion: SIMULATION_PARAMETERS_VERSION,
    },
  };
}

/** Réponse immédiate par défaut, utilisée par les tests d'orchestration. */
export function respondImmediately(request: ComputeTickRequest, worker: FakeComputeWorker): void {
  queueMicrotask(() => worker.emitMessage(makeResultResponse(request)));
}
