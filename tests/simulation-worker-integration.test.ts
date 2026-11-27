/** Intégration manager + store + worker de calcul, verrous et origine des ticks (3D-C3). */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EMOTION_KEYS, NEED_KEYS, TRAIT_KEYS } from '../src/shared/character';
import type { CharacterDraft } from '../src/shared/character';
import { IPC_CHANNELS } from '../src/shared/ipc';

const tmp = mkdtempSync(join(tmpdir(), 'dl-c3-'));

const spies = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  broadcasts: [] as unknown[],
  planners: [] as Array<{ emit(event: string, ...args: unknown[]): void }>,
}));

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getAppPath: () => tmp,
    getPath: () => tmp,
  },
  BrowserWindow: {
    getAllWindows: () => [{
      isDestroyed: () => false,
      webContents: { send: (_channel: string, value: unknown) => spies.broadcasts.push(value) },
    }],
  },
  ipcMain: {
    handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
      spies.handlers.set(channel, handler);
    },
  },
}));

vi.mock('../src/main/services/resource.service', () => ({
  getWasmPath: () => join(process.cwd(), 'resources', 'sqlite', 'sql-wasm.wasm'),
}));

vi.mock('node:worker_threads', () => ({
  Worker: class {
    private handlers: Record<string, Array<(...args: unknown[]) => void>> = {};

    constructor() {
      spies.planners.push(this as unknown as { emit(event: string, ...args: unknown[]): void });
      queueMicrotask(() => this.emit('message', { type: 'ready' }));
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

import { _setComputeWorkerFactoryForTests } from '../src/main/simulation/tick-compute-client.service';
import {
  _managerStateForTests,
  _resetSimulationManagerForTests,
  simulationDeleteWorld,
  simulationGetStatus,
  simulationStep,
  withWorldMutationLock,
} from '../src/main/services/simulation-manager.service';
import {
  _resetWorldStoreForTests,
  _setTickFailureForTests,
  createTemplate,
  createWorld,
  getSimulationStatus,
  listCharacters,
  prepareTickInput,
  startSimulation,
} from '../src/main/services/world-store.service';
import { computeCharacterTick } from '../src/main/services/character-tick.service';
import { registerWorldIpc } from '../src/main/ipc/world.ipc';
import { registerCharacterIpc } from '../src/main/ipc/character.ipc';
import {
  createFakeComputeWorker,
  respondImmediately,
  type FakeComputeWorker,
} from './compute-worker-test-helpers';

function clearDb(): void {
  rmSync(tmp, { recursive: true, force: true });
  mkdtempSync(tmp);
}

function deferred<T = void>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

async function waitFor(predicate: () => boolean, label: string): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setImmediate(resolve));
  }
  throw new Error(`condition non atteinte: ${label}`);
}

/** Brouillon valide pour les handlers de création de personnage. */
function makeDraft(): CharacterDraft {
  return {
    firstName: 'Alice',
    lastName: 'Martin',
    age: 30,
    gender: 'female',
    biography: 'Une acrobate du quotidien.',
    traits: Object.fromEntries(TRAIT_KEYS.map((key) => [key, 50])) as unknown as CharacterDraft['traits'],
    emotions: Object.fromEntries(EMOTION_KEYS.map((key) => [key, 50])) as unknown as CharacterDraft['emotions'],
    needs: Object.fromEntries(NEED_KEYS.map((key) => [key, 80])) as unknown as CharacterDraft['needs'],
    goals: [
      { id: 'gp', label: 'Trouver sa place', kind: 'primary' },
      { id: 'gs1', label: 'Se faire des amis', kind: 'secondary' },
      { id: 'gs2', label: 'Explorer la ville', kind: 'secondary' },
    ],
  };
}

async function createStartedWorld(name = 'Monde', seed = 42): Promise<string> {
  const world = await createWorld({ name, generationMode: 'random', characterCount: 2, seed });
  await startSimulation(world.id, 1);
  return world.id;
}

let computeFailureForTests: string | null = null;

beforeEach(async () => {
  clearDb();
  await _resetWorldStoreForTests();
  await _resetSimulationManagerForTests();
  _setTickFailureForTests(null);
  computeFailureForTests = null;
  spies.broadcasts.length = 0;
  spies.planners.length = 0;
  _setComputeWorkerFactoryForTests(() => createFakeComputeWorker((request, worker) => {
    queueMicrotask(() => {
      if (computeFailureForTests) {
        worker.emitMessage({
          type: 'compute-tick:error',
          protocolVersion: 1,
          requestId: request.requestId,
          worldId: request.input.worldId,
          code: 'compute_error',
          message: computeFailureForTests,
        });
        return;
      }
      respondImmediately(request, worker);
    });
  }));
});

describe('Intégration complète du tick worker', () => {
  it('applique un tick réel et reste paritaire avec le calcul direct', async () => {
    const worldId = await createStartedWorld('Worker', 1234);
    const { input } = await prepareTickInput(worldId);
    const reference = computeCharacterTick(input);

    const workerStatus = await simulationStep(worldId);

    expect(workerStatus.clock?.tick).toBe(1);
    expect(workerStatus.clock?.rngState).toBe(reference.rngState);
    expect((await listCharacters(worldId)).characters.map((c) => c.currentState))
      .toEqual(reference.characterStates.map((state) => ({
        traits: input.characters.find((c) => c.characterId === state.characterId)!.traits,
        needs: state.needs,
        emotions: state.emotions,
        goals: input.characters.find((c) => c.characterId === state.characterId)!.goals,
      })));
    expect(spies.broadcasts).toHaveLength(1);
  });

  it('rollback complet lors d’une panne d’écriture après calcul', async () => {
    const worldId = await createStartedWorld('Rollback', 7);
    const before = (await getSimulationStatus(worldId)).clock!;
    const beforeCharacters = (await listCharacters(worldId)).characters;
    _setTickFailureForTests(() => { throw new Error('panne injectée'); });

    await expect(simulationStep(worldId)).rejects.toThrow('panne injectée');
    _setTickFailureForTests(null);

    expect((await getSimulationStatus(worldId)).clock?.tick).toBe(before.tick);
    expect((await getSimulationStatus(worldId)).clock?.rngState).toBe(before.rngState);
    expect((await listCharacters(worldId)).characters.map((c) => c.currentState))
      .toEqual(beforeCharacters.map((c) => c.currentState));
    expect(spies.broadcasts).toHaveLength(0);
  });

  it('manual propage l’erreur, auto la journalise sans écrire ni diffuser', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const worldId = await createStartedWorld('Erreurs', 9);
    await simulationGetStatus(worldId); // configure le planificateur sans calculer
    const before = (await getSimulationStatus(worldId)).clock!;
    computeFailureForTests = 'panne de calcul';

    await expect(simulationStep(worldId)).rejects.toThrow('panne de calcul');
    expect((await getSimulationStatus(worldId)).clock?.tick).toBe(before.tick);

    const planner = spies.planners.at(-1);
    expect(planner).toBeDefined();
    planner!.emit('message', { type: 'tick', worldId });
    await waitFor(() => vi.mocked(console.error).mock.calls.some((call) => String(call[0]).includes('panne de calcul')), 'tick auto journalisé');
    expect((await getSimulationStatus(worldId)).clock?.tick).toBe(before.tick);
    expect(spies.broadcasts).toHaveLength(0);
    vi.restoreAllMocks();
  });

  it('suppression pendant le calcul : tombeau immédiat et aucune écriture tardive', async () => {
    const gate = deferred<void>();
    let posted = false;
    _setComputeWorkerFactoryForTests(() => createFakeComputeWorker(() => {
      posted = true;
      void gate.promise; // réponse volontairement jamais émise
    }));
    const worldId = await createStartedWorld('Suppression', 11);

    const computation = simulationStep(worldId);
    await waitFor(() => posted, 'calcul en attente');
    expect(_managerStateForTests().worldLocks).toContain(worldId);

    await simulationDeleteWorld(worldId);
    await expect(computation).rejects.toThrow('annulé');
    await expect(getSimulationStatus(worldId)).rejects.toThrow('Monde introuvable.');
    expect(spies.broadcasts).toHaveLength(0);

    gate.resolve();
    await new Promise((resolve) => setImmediate(resolve));
  });

  it('persiste le tick calculé après fermeture et réouverture de la base', async () => {
    const worldId = await createStartedWorld('Réouverture', 21);
    await simulationStep(worldId);
    const before = (await getSimulationStatus(worldId)).clock!;
    const beforeCharacters = (await listCharacters(worldId)).characters;

    await _resetWorldStoreForTests(); // ferme la base sans supprimer les fichiers
    expect((await getSimulationStatus(worldId)).clock?.tick).toBe(before.tick);
    expect((await listCharacters(worldId)).characters.map((c) => c.currentState))
      .toEqual(beforeCharacters.map((c) => c.currentState));
  });

  it('les mutations IPC d’un monde attendent la fin du tick (verrou monde avant global)', async () => {
    registerWorldIpc();
    const worldId = await createStartedWorld('Verrou IPC', 31);

    const hold = deferred<void>();
    const held = withWorldMutationLock(worldId, async () => { await hold.promise; });
    await new Promise((resolve) => setImmediate(resolve));

    const handler = spies.handlers.get(IPC_CHANNELS.WORLD_GET);
    expect(handler).toBeDefined();
    let completed = false;
    const mutation = Promise.resolve(handler!(null, worldId)).then(() => { completed = true; });
    await new Promise((resolve) => setImmediate(resolve));
    expect(completed).toBe(false);

    hold.resolve();
    await held;
    await mutation;
    expect(completed).toBe(true);

    await expect(simulationStep(worldId)).resolves.toBeDefined();
  });

  it('les mutations de personnage et de modèle attendent le verrou du monde', async () => {
    registerCharacterIpc();
    const world = await createWorld({ name: 'Préparation', generationMode: 'empty' });

    const holdCreate = deferred<void>();
    const heldCreate = withWorldMutationLock(world.id, async () => { await holdCreate.promise; });
    await new Promise((resolve) => setImmediate(resolve));
    const createHandler = spies.handlers.get(IPC_CHANNELS.CHARACTER_CREATE);
    expect(createHandler).toBeDefined();
    let characterCreated = false;
    const creating = Promise.resolve(createHandler!(null, { worldId: world.id, ...makeDraft() }))
      .then(() => { characterCreated = true; });
    await new Promise((resolve) => setImmediate(resolve));
    expect(characterCreated).toBe(false);
    holdCreate.resolve();
    await heldCreate;
    await creating;
    expect(characterCreated).toBe(true);

    const template = await createTemplate(makeDraft());
    const holdDelete = deferred<void>();
    const heldDelete = withWorldMutationLock(world.id, async () => { await holdDelete.promise; });
    await new Promise((resolve) => setImmediate(resolve));
    const deleteHandler = spies.handlers.get(IPC_CHANNELS.TEMPLATE_DELETE);
    expect(deleteHandler).toBeDefined();
    let templateDeleted = false;
    const deleting = Promise.resolve(deleteHandler!(null, template.id)).then(() => { templateDeleted = true; });
    await new Promise((resolve) => setImmediate(resolve));
    expect(templateDeleted).toBe(false);
    holdDelete.resolve();
    await heldDelete;
    await deleting;
    expect(templateDeleted).toBe(true);
  });
});
