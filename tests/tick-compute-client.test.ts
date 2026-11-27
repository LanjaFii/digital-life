/** Intégration du client worker : corrélation, timeout, doublons et redémarrage (3D-C3). */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  _computeClientStateForTests,
  _resetComputeClientForTests,
  _setComputeWorkerFactoryForTests,
  COMPUTE_TICK_TIMEOUT_MS,
  ComputeTimeoutError,
  ComputeWorkerFailure,
  computeCharacterTickInWorker,
} from '../src/main/simulation/tick-compute-client.service';
import { createComputeTickError, type ComputeTickRequest } from '../src/shared/worker-protocol';
import {
  createFakeComputeWorker,
  makeResultResponse,
  type FakeComputeWorker,
} from './compute-worker-test-helpers';
import { makeComputeTickInput } from './worker-tick-fixtures';

const workers: FakeComputeWorker[] = [];

function useFakeWorkers(onRequest: (request: ComputeTickRequest, worker: FakeComputeWorker) => void = () => undefined): void {
  _setComputeWorkerFactoryForTests(() => {
    const worker = createFakeComputeWorker(onRequest);
    workers.push(worker);
    return worker;
  });
}

async function flushReady(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

beforeEach(async () => {
  vi.useFakeTimers();
  workers.length = 0;
  await _resetComputeClientForTests();
  useFakeWorkers();
});

afterEach(async () => {
  await _resetComputeClientForTests();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('Client de calcul worker', () => {
  it('génère des requestId monotones et vide le registre après réponse', async () => {
    useFakeWorkers((request, worker) => {
      queueMicrotask(() => worker.emitMessage(makeResultResponse(request)));
    });
    await flushReady();

    const first = computeCharacterTickInWorker(makeComputeTickInput({ worldId: 'w1' }));
    const second = computeCharacterTickInWorker(makeComputeTickInput({ worldId: 'w2' }));
    await flushReady();
    const [a, b] = await Promise.all([first, second]);

    expect(workers[0].posted.map((request) => request.requestId)).toEqual(['compute-1', 'compute-2']);
    expect(a.requestId).toBe('compute-1');
    expect(b.requestId).toBe('compute-2');
    expect(_computeClientStateForTests().pendingIds).toEqual([]);
    expect(_computeClientStateForTests().requestSequence).toBe(2);
  });

  it('corréle plusieurs mondes même quand les réponses arrivent dans un autre ordre', async () => {
    useFakeWorkers();
    await flushReady();
    const first = computeCharacterTickInWorker(makeComputeTickInput({ worldId: 'w1', tick: 1 }));
    const second = computeCharacterTickInWorker(makeComputeTickInput({ worldId: 'w2', tick: 2 }));
    await flushReady();
    expect(workers[0].posted).toHaveLength(2);

    workers[0].emitMessage(makeResultResponse(workers[0].posted[1]));
    workers[0].emitMessage(makeResultResponse(workers[0].posted[0]));
    const [a, b] = await Promise.all([first, second]);
    expect(a.requestId).toBe('compute-1');
    expect(b.requestId).toBe('compute-2');
    expect(a.worldId).toBe('w1');
    expect(b.worldId).toBe('w2');
  });

  it('rejette après 30 s et ignore la réponse tardive', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    useFakeWorkers();
    await flushReady();
    const pending = computeCharacterTickInWorker(makeComputeTickInput());
    await flushReady();
    expect(_computeClientStateForTests().pendingIds).toEqual(['compute-1']);

    const rejection = expect(pending).rejects.toBeInstanceOf(ComputeTimeoutError);
    await vi.advanceTimersByTimeAsync(COMPUTE_TICK_TIMEOUT_MS);
    await rejection;
    expect(_computeClientStateForTests().pendingIds).toEqual([]);

    workers[0].emitMessage(makeResultResponse(workers[0].posted[0]));
    await flushReady();
    expect(errors).toHaveBeenCalledWith(expect.stringContaining('réponse tardive'));
  });

  it('n’accepte qu’une seule réponse par requestId', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    useFakeWorkers();
    await flushReady();
    const pending = computeCharacterTickInWorker(makeComputeTickInput());
    await flushReady();

    const response = makeResultResponse(workers[0].posted[0]);
    workers[0].emitMessage(response);
    workers[0].emitMessage(response);
    await expect(pending).resolves.toMatchObject({ requestId: 'compute-1' });
    await vi.advanceTimersByTimeAsync(COMPUTE_TICK_TIMEOUT_MS);
    expect(errors).toHaveBeenCalledWith(expect.stringContaining('réponse tardive'));
  });

  it('rejette une réponse d’erreur corrélée', async () => {
    useFakeWorkers();
    await flushReady();
    const pending = computeCharacterTickInWorker(makeComputeTickInput({ worldId: 'w-erreur' }));
    await flushReady();
    workers[0].emitMessage(createComputeTickError({
      requestId: 'compute-1',
      worldId: 'w-erreur',
      code: 'compute_error',
      message: 'panne de calcul',
    }));
    await expect(pending).rejects.toThrow('panne de calcul');
    expect(_computeClientStateForTests().pendingIds).toEqual([]);
  });

  it('rejette un checksum incohérent', async () => {
    useFakeWorkers();
    await flushReady();
    const pending = computeCharacterTickInWorker(makeComputeTickInput());
    await flushReady();
    workers[0].emitMessage({ ...makeResultResponse(workers[0].posted[0]), checksum: '0'.repeat(64) });
    await expect(pending).rejects.toThrow('Checksum du résultat incohérent.');
  });

  it('rejette toutes les requêtes sur error puis recrée le worker paresseusement', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    useFakeWorkers();
    await flushReady();
    const first = computeCharacterTickInWorker(makeComputeTickInput({ worldId: 'w1' }));
    const second = computeCharacterTickInWorker(makeComputeTickInput({ worldId: 'w2' }));
    await flushReady();
    workers[0].emitError(new Error('crash'));
    await expect(first).rejects.toBeInstanceOf(ComputeWorkerFailure);
    await expect(second).rejects.toBeInstanceOf(ComputeWorkerFailure);
    expect(_computeClientStateForTests().hasWorker).toBe(false);

    useFakeWorkers((request, worker) => {
      queueMicrotask(() => worker.emitMessage(makeResultResponse(request)));
    });
    const third = computeCharacterTickInWorker(makeComputeTickInput({ worldId: 'w3' }));
    await flushReady();
    await expect(third).resolves.toMatchObject({ requestId: 'compute-3' });
    expect(workers).toHaveLength(2);
  });

  it('rejette toutes les requêtes sur exit puis recrée le worker paresseusement', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    useFakeWorkers();
    await flushReady();
    const pending = computeCharacterTickInWorker(makeComputeTickInput({ worldId: 'w1' }));
    await flushReady();
    workers[0].emitExit(1);
    await expect(pending).rejects.toBeInstanceOf(ComputeWorkerFailure);
    expect(_computeClientStateForTests().hasWorker).toBe(false);

    useFakeWorkers((request, worker) => {
      queueMicrotask(() => worker.emitMessage(makeResultResponse(request)));
    });
    const next = computeCharacterTickInWorker(makeComputeTickInput({ worldId: 'w2' }));
    await flushReady();
    await expect(next).resolves.toMatchObject({ requestId: 'compute-2' });
    expect(workers).toHaveLength(2);
  });

  it('copie l’entrée avant envoi : aucune référence mutable n’est partagée', async () => {
    useFakeWorkers((request, worker) => {
      queueMicrotask(() => worker.emitMessage(makeResultResponse(request)));
    });
    await flushReady();
    const input = makeComputeTickInput({ worldId: 'immuable' });
    const pending = computeCharacterTickInWorker(input);
    await flushReady();
    await expect(pending).resolves.toBeDefined();

    expect(workers[0].posted[0].input).not.toBe(input);
    expect(workers[0].posted[0].input.characters).not.toBe(input.characters);
    expect(workers[0].posted[0].input.worldId).toBe('immuable');
  });

  it('utilise le vrai worker compilé en production, sans injection', async () => {
    vi.useRealTimers();
    await _resetComputeClientForTests();
    const response = await computeCharacterTickInWorker(makeComputeTickInput({ worldId: 'vrai-worker' }));
    expect(response.requestId).toBe('compute-1');
    expect(response.worldId).toBe('vrai-worker');
    expect(response.checksum).toMatch(/^[a-f0-9]{64}$/);
    expect(_computeClientStateForTests().pendingIds).toEqual([]);
  });
});
