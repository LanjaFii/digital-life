/** Parité calcul synchrone / worker et déterminisme (Phase 3D-C2). */
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { Worker } from 'node:worker_threads';
import { afterEach, describe, expect, it } from 'vitest';
import { computeCharacterTick } from '../src/main/services/character-tick.service';
import { canonicalizeGoldenTickResult } from '../src/shared/canonicalization';
import type { ComputeTickResponse } from '../src/shared/worker-protocol';
import { makeComputeTickRequest } from './worker-tick-fixtures';

const WORKER_PATH = join(process.cwd(), 'dist', 'main', 'simulation', 'tick-compute.worker.js');
const workers: Worker[] = [];

async function startWorker(): Promise<Worker> {
  const worker = new Worker(WORKER_PATH);
  workers.push(worker);
  await new Promise<void>((resolve, reject) => {
    const onMessage = (value: unknown): void => {
      if (typeof value !== 'object' || value === null || (value as { type?: unknown }).type !== 'ready') return;
      cleanup();
      resolve();
    };
    const onError = (error: Error): void => {
      cleanup();
      reject(error);
    };
    const onExit = (code: number): void => {
      cleanup();
      reject(new Error(`Worker terminé avant ready (code ${code}).`));
    };
    const cleanup = (): void => {
      worker.off('message', onMessage);
      worker.off('error', onError);
      worker.off('exit', onExit);
    };
    worker.on('message', onMessage);
    worker.on('error', onError);
    worker.on('exit', onExit);
  });
  return worker;
}

async function askWorker(worker: Worker, message: unknown): Promise<ComputeTickResponse> {
  const requestId = (message as { requestId?: unknown }).requestId;
  return new Promise<ComputeTickResponse>((resolve, reject) => {
    const onMessage = (value: unknown): void => {
      if (typeof value !== 'object' || value === null) return;
      const response = value as Partial<ComputeTickResponse>;
      if (response.requestId !== requestId) return;
      cleanup();
      resolve(response as ComputeTickResponse);
    };
    const onError = (error: Error): void => {
      cleanup();
      reject(error);
    };
    const onExit = (code: number): void => {
      cleanup();
      reject(new Error(`Worker terminé pendant une requête (code ${code}).`));
    };
    const cleanup = (): void => {
      worker.off('message', onMessage);
      worker.off('error', onError);
      worker.off('exit', onExit);
    };
    worker.on('message', onMessage);
    worker.on('error', onError);
    worker.on('exit', onExit);
    worker.postMessage(message);
  });
}

afterEach(async () => {
  await Promise.all(workers.splice(0).map((worker) => worker.terminate()));
});

describe('worker de calcul : parité avec le calcul synchrone', () => {
  it('produit états, décisions, actions, deltas, PRNG et checksum identiques', async () => {
    const worker = await startWorker();
    const request = makeComputeTickRequest('compute-parity');
    const direct = computeCharacterTick(request.input);
    const response = await askWorker(worker, request);

    expect(response.type).toBe('compute-tick:result');
    if (response.type !== 'compute-tick:result') throw new Error(response.message);
    expect(response.worldId).toBe(direct.worldId);
    expect(response.tick).toBe(direct.tick);
    expect(response.result).toEqual(direct);
    expect(response.result.rngState).toBe(direct.rngState);
    expect(response.result.decisions.map((decision) => decision.rngDraws))
      .toEqual(direct.decisions.map((decision) => decision.rngDraws));
    expect(response.checksum).toBe(
      createHash('sha256').update(canonicalizeGoldenTickResult(direct), 'utf8').digest('hex'),
    );
    expect(response.versions).toEqual({
      engineVersion: 'phase3d.1',
      registryVersion: 1,
      parametersVersion: 1,
    });
    // `decisionRecords` est exclu du noyau haché mais reste transmis pour validation dans le main.
    expect(response.result.decisionRecords.length).toBe(direct.decisionRecords.length);
  });

  it('ne conserve aucun état résiduel entre deux requêtes', async () => {
    const worker = await startWorker();
    const original = makeComputeTickRequest('compute-original');
    const other = makeComputeTickRequest('compute-other', { worldId: 'autre-monde', tick: 7 });
    const repeat = makeComputeTickRequest('compute-repeat');

    const first = await askWorker(worker, original);
    await askWorker(worker, other);
    const second = await askWorker(worker, repeat);

    expect(first.type).toBe('compute-tick:result');
    expect(second.type).toBe('compute-tick:result');
    if (first.type !== 'compute-tick:result' || second.type !== 'compute-tick:result') return;
    expect({ ...second, requestId: first.requestId }).toEqual(first);
  });

  it('répond une erreur corrélée pour une version incompatible', async () => {
    const worker = await startWorker();
    const request = { ...makeComputeTickRequest('compute-version'), protocolVersion: 2 };
    const response = await askWorker(worker, request);
    expect(response.type).toBe('compute-tick:error');
    if (response.type !== 'compute-tick:error') return;
    expect(response.requestId).toBe('compute-version');
    expect(response.code).toBe('unsupported_version');
    expect(response.worldId).toBe('worker-world');
  });
});
