import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TickExpectation } from '../src/main/services/world-store.service';
import type { SimulationStatusView } from '../src/shared/simulation';
import {
  createFakeComputeWorker,
  respondImmediately,
  type FakeComputeWorker,
} from './compute-worker-test-helpers';
import { makeComputeTickInput } from './worker-tick-fixtures';

const mocks = vi.hoisted(() => ({
  commitTickResult: vi.fn(),
  deleteWorld: vi.fn(),
  getSimulationStatus: vi.fn(),
  listWorlds: vi.fn(),
  pauseSimulation: vi.fn(),
  prepareTickInput: vi.fn(),
  resumeSimulation: vi.fn(),
  setSimulationSpeed: vi.fn(),
  startSimulation: vi.fn(),
  stopSimulation: vi.fn(),
}));

vi.mock('../src/main/services/world-store.service', () => mocks);

vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: () => [] },
}));

vi.mock('node:worker_threads', () => ({
  Worker: class {
    private handlers: Record<string, Array<(...args: unknown[]) => void>> = {};

    constructor() {
      setImmediate(() => this.emit('message', { type: 'ready' }));
    }

    on(event: string, handler: (...args: unknown[]) => void): void {
      (this.handlers[event] ??= []).push(handler);
    }

    emit(event: string, ...args: unknown[]): void {
      for (const handler of this.handlers[event] ?? []) handler(...args);
    }

    postMessage(): void { /* planificateur factice */ }
    async terminate(): Promise<number> { return 0; }
  },
}));

import {
  COMPUTE_TICK_TIMEOUT_MS,
  _setComputeWorkerFactoryForTests,
} from '../src/main/simulation/tick-compute-client.service';
import {
  _managerStateForTests,
  _resetSimulationManagerForTests,
  simulationDeleteWorld,
  simulationStep,
} from '../src/main/services/simulation-manager.service';

function status(worldId: string): SimulationStatusView {
  return {
    worldId,
    worldStatus: 'simulation_running',
    clock: {
      worldId,
      tick: 0,
      day: 1,
      hour: 0,
      status: 'running',
      speed: 1,
      rngState: 0,
      lastProcessedOrder: 0,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    isActive: true,
  };
}

function preparation(worldId: string): { expected: TickExpectation; input: ReturnType<typeof makeComputeTickInput> } {
  return {
    expected: { worldId, tick: 1, day: 1, hour: 1, rngState: 0x12345678 },
    input: makeComputeTickInput({ worldId, tick: 1, day: 1, hour: 1 }),
  };
}

function deferred<T = void>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`deadlock: ${label}`)), 5_000)),
  ]);
}

async function waitFor(predicate: () => boolean, label: string): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setImmediate(resolve));
  }
  throw new Error(`condition non atteinte: ${label}`);
}

beforeEach(async () => {
  await _resetSimulationManagerForTests();
  vi.clearAllMocks();
  mocks.getSimulationStatus.mockImplementation(async (worldId: string) => status(worldId));
  mocks.prepareTickInput.mockImplementation(async (worldId: string) => preparation(worldId));
  mocks.commitTickResult.mockImplementation(async (worldId: string) => status(worldId));
  mocks.deleteWorld.mockImplementation(async () => ({ deleted: true }));
  mocks.listWorlds.mockImplementation(async () => ({ worlds: [] }));
  _setComputeWorkerFactoryForTests(() => createFakeComputeWorker(respondImmediately));
});

describe('Verrou par monde du manager avec calcul worker', () => {
  it('sérialise deux ticks du même monde', async () => {
    const gate = deferred<void>();
    const events: string[] = [];
    mocks.prepareTickInput.mockImplementationOnce(async (worldId: string) => {
      events.push('tick-1-debut');
      await gate.promise;
      events.push('tick-1-fin');
      return preparation(worldId);
    });
    mocks.prepareTickInput.mockImplementationOnce(async (worldId: string) => {
      events.push('tick-2');
      return preparation(worldId);
    });

    const first = withTimeout(simulationStep('w1'), 'tick-1');
    const second = withTimeout(simulationStep('w1'), 'tick-2');
    await new Promise((resolve) => setImmediate(resolve));
    expect(events).toEqual(['tick-1-debut']);
    gate.resolve();
    await Promise.all([first, second]);
    expect(events).toEqual(['tick-1-debut', 'tick-1-fin', 'tick-2']);
  });

  it('laisse deux mondes différents progresser en parallèle', async () => {
    const gateA = deferred<void>();
    const gateB = deferred<void>();
    const started: string[] = [];
    mocks.prepareTickInput.mockImplementationOnce(async () => {
      started.push('A');
      await gateA.promise;
      return preparation('A');
    });
    mocks.prepareTickInput.mockImplementationOnce(async () => {
      started.push('B');
      await gateB.promise;
      return preparation('B');
    });

    const a = withTimeout(simulationStep('A'), 'A');
    const b = withTimeout(simulationStep('B'), 'B');
    await new Promise((resolve) => setImmediate(resolve));
    expect(started).toEqual(['A', 'B']);
    gateA.resolve();
    gateB.resolve();
    await Promise.all([a, b]);
  });

  it('attend la fin d’un tick avant de supprimer le monde', async () => {
    const gate = deferred<void>();
    const events: string[] = [];
    mocks.prepareTickInput.mockImplementationOnce(async () => {
      events.push('tick');
      await gate.promise;
      return preparation('w1');
    });
    mocks.deleteWorld.mockImplementationOnce(async () => {
      events.push('delete');
      return { deleted: true };
    });

    const tick = simulationStep('w1');
    await waitFor(() => events.includes('tick'), 'préparation du tick');
    const del = withTimeout(simulationDeleteWorld('w1'), 'delete');
    await new Promise((resolve) => setImmediate(resolve));
    expect(events).toEqual(['tick']);
    gate.resolve();
    await expect(tick).rejects.toThrow('Monde supprimé.');
    await del;
    expect(events).toEqual(['tick', 'delete']);
  });

  it('sérialise deux suppressions concurrentes sans erreur', async () => {
    const gate = deferred<void>();
    const events: string[] = [];
    mocks.deleteWorld
      .mockImplementationOnce(async () => {
        events.push('delete-1-debut');
        await gate.promise;
        events.push('delete-1-fin');
        return { deleted: true };
      })
      .mockImplementationOnce(async () => {
        events.push('delete-2');
        return { deleted: false };
      });

    const first = withTimeout(simulationDeleteWorld('w1'), 'delete-1');
    const second = withTimeout(simulationDeleteWorld('w1'), 'delete-2');
    await new Promise((resolve) => setImmediate(resolve));
    expect(events).toEqual(['delete-1-debut']);
    gate.resolve();
    const [a, b] = await Promise.all([first, second]);
    expect(a).toEqual({ deleted: true });
    expect(b).toEqual({ deleted: false });
    expect(events).toEqual(['delete-1-debut', 'delete-1-fin', 'delete-2']);
  });

  it('libère le verrou après une erreur et ignore les commandes tardives', async () => {
    mocks.prepareTickInput.mockRejectedValueOnce(new Error('panne simulée'));
    await expect(simulationStep('w1')).rejects.toThrow('panne simulée');
    expect(_managerStateForTests().worldLocks).toEqual([]);
    await expect(withTimeout(simulationStep('w1'), 'après erreur')).resolves.toBeDefined();

    mocks.deleteWorld.mockResolvedValueOnce({ deleted: true });
    await simulationDeleteWorld('w1');
    await expect(simulationStep('w1')).rejects.toThrow('Monde supprimé.');
  });

  it('timeout du calcul : rejet manuel, aucune écriture et verrou libéré', async () => {
    vi.useFakeTimers();
    try {
      _setComputeWorkerFactoryForTests(() => createFakeComputeWorker(() => { /* jamais de réponse */ }));
      const computation = simulationStep('w1');
      const rejection = expect(computation).rejects.toThrow('Timeout');
      await vi.advanceTimersByTimeAsync(COMPUTE_TICK_TIMEOUT_MS);
      await rejection;
      expect(mocks.commitTickResult).not.toHaveBeenCalled();
      expect(_managerStateForTests().worldLocks).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('annule le calcul avant toute attente de verrou lors d’une suppression', async () => {
    let resolveWorker!: (worker: FakeComputeWorker) => void;
    const workerReady = new Promise<FakeComputeWorker>((resolve) => { resolveWorker = resolve; });
    _setComputeWorkerFactoryForTests(() => {
      const fake = createFakeComputeWorker(() => { /* réponse volontairement différée */ });
      resolveWorker(fake);
      return fake;
    });

    const computation = simulationStep('w1');
    const fake = await withTimeout(workerReady, 'worker de calcul');
    await waitFor(() => fake.posted.length === 1, 'requête postée');
    expect(_managerStateForTests().worldLocks).toEqual(['w1']);

    await simulationDeleteWorld('w1');
    await expect(computation).rejects.toThrow('annulé');
    expect(mocks.commitTickResult).not.toHaveBeenCalled();
  });
});
