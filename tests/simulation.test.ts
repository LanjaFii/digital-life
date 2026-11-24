import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmp = mkdtempSync(join(tmpdir(), 'dl-sim-'));

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getAppPath: () => tmp,
    getPath: () => tmp,
  },
  BrowserWindow: {
    getAllWindows: () => [],
  },
}));

vi.mock('../src/main/services/resource.service', () => ({
  getWasmPath: () => join(process.cwd(), 'resources', 'sqlite', 'sql-wasm.wasm'),
}));

import {
  _resetWorldStoreForTests,
  createWorld,
  getSimulationStatus,
  getWorld,
  pauseSimulation,
  recoverSimulationClocksAfterRestart,
  resumeSimulation,
  setSimulationSpeed,
  startSimulation,
  stepSimulation,
  stopSimulation,
} from '../src/main/services/world-store.service';
import { createCharacterInWorld } from '../src/main/services/world-store.service';

function clearDb() {
  rmSync(tmp, { recursive: true, force: true });
  mkdtempSync(tmp);
}

beforeEach(async () => {
  clearDb();
  await _resetWorldStoreForTests();
});

describe('Simulation clock (store)', () => {
  it('crée une horloge au démarrage à tick 0', async () => {
    const world = await createWorld({ name: 'Sim', generationMode: 'random', characterCount: 2, seed: 42 });
    const status = await startSimulation(world.id, 1);
    expect(status.worldStatus).toBe('simulation_running');
    expect(status.clock?.tick).toBe(0);
    expect(status.clock?.day).toBe(1);
    expect(status.clock?.hour).toBe(0);
    expect(status.clock?.status).toBe('running');
    expect(status.clock?.speed).toBe(1);
    expect(status.clock?.rngState).toBeTypeOf('number');
  });

  it('refuse de démarrer un monde sans personnage', async () => {
    const world = await createWorld({ name: 'Vide', generationMode: 'empty' });
    await expect(startSimulation(world.id, 1)).rejects.toThrow(/sans personnage/);
  });

  it('step incrémente exactement un tick et met à jour jour/heure', async () => {
    const world = await createWorld({ name: 'Step', generationMode: 'random', characterCount: 1, seed: 1 });
    await startSimulation(world.id, 1);
    const s1 = await stepSimulation(world.id);
    expect(s1.clock?.tick).toBe(1);
    expect(s1.clock?.hour).toBe(1);
    expect(s1.clock?.day).toBe(1);
  });

  it('passe au jour 2 après 24 ticks', async () => {
    const world = await createWorld({ name: 'Jour', generationMode: 'random', characterCount: 1, seed: 1 });
    await startSimulation(world.id, 1);
    for (let i = 0; i < 24; i++) await stepSimulation(world.id);
    const status = await getSimulationStatus(world.id);
    expect(status.clock?.tick).toBe(24);
    expect(status.clock?.day).toBe(2);
    expect(status.clock?.hour).toBe(0);
  });

  it('pause puis reprise préservent l’état du PRNG/horloge', async () => {
    const world = await createWorld({ name: 'Pause', generationMode: 'random', characterCount: 1, seed: 7 });
    await startSimulation(world.id, 1);
    await stepSimulation(world.id);
    const paused = await pauseSimulation(world.id);
    expect(paused.clock?.status).toBe('paused');
    expect(paused.worldStatus).toBe('simulation_paused');
    const resumed = await resumeSimulation(world.id);
    expect(resumed.clock?.status).toBe('running');
    expect(resumed.clock?.tick).toBe(paused.clock?.tick);
    expect(resumed.clock?.rngState).toBe(paused.clock?.rngState);
  });

  it('change la vitesse sans modifier le tick', async () => {
    const world = await createWorld({ name: 'Speed', generationMode: 'random', characterCount: 1, seed: 2 });
    await startSimulation(world.id, 1);
    await stepSimulation(world.id);
    const before = await getSimulationStatus(world.id);
    const after = await setSimulationSpeed(world.id, 10);
    expect(after.clock?.speed).toBe(10);
    expect(after.clock?.tick).toBe(before.clock?.tick);
  });

  it('arrête la simulation sans supprimer les données', async () => {
    const world = await createWorld({ name: 'Stop', generationMode: 'random', characterCount: 1, seed: 3 });
    await startSimulation(world.id, 1);
    const stopped = await stopSimulation(world.id);
    expect(stopped.worldStatus).toBe('simulation_stopped');
    expect(stopped.clock?.status).toBe('stopped');
    const loaded = await getWorld(world.id);
    expect(loaded.id).toBe(world.id);
  });

  it('restaure l’horloge après reset et recovery met en pause les running', async () => {
    const world = await createWorld({ name: 'Restore', generationMode: 'random', characterCount: 1, seed: 9 });
    await startSimulation(world.id, 2);
    await stepSimulation(world.id);
    await stepSimulation(world.id);
    const before = await getSimulationStatus(world.id);

    await _resetWorldStoreForTests();
    await recoverSimulationClocksAfterRestart();
    const after = await getSimulationStatus(world.id);
    expect(after.clock?.tick).toBe(before.clock?.tick);
    expect(after.clock?.rngState).toBe(before.clock?.rngState);
    expect(after.clock?.status).toBe('paused');
    expect(after.worldStatus).toBe('simulation_paused');
  });

  it('refuse les commandes invalides', async () => {
    const world = await createWorld({ name: 'Bad', generationMode: 'random', characterCount: 1, seed: 5 });
    await expect(pauseSimulation(world.id)).rejects.toThrow();
    await startSimulation(world.id, 1);
    await expect(startSimulation(world.id, 1)).rejects.toThrow(/déjà/);
    await expect(setSimulationSpeed(world.id, 3)).rejects.toThrow(/Vitesse/);
  });

  it('interdit modification de personnage après démarrage', async () => {
    const world = await createWorld({ name: 'Lock', generationMode: 'empty' });
    const { character } = await createCharacterInWorld({
      worldId: world.id,
      firstName: 'A',
      lastName: 'B',
      age: 20,
      gender: 'female',
      biography: 'bio',
      traits: { sociability:50, empathy:50, aggression:50, patience:50, impulsivity:50, curiosity:50, intelligence:50, creativity:50, honesty:50, altruism:50, ambition:50, courage:50, timidity:50, distrust:50, optimism:50, humor:50, jealousy:50, discipline:50, independence:50, loyalty:50, resilience:50 },
      emotions: { happiness:50, sadness:50, stress:50, anxiety:50, anger:50, fear:50, confidence:50, loneliness:50, motivation:50, satisfaction:50 },
      needs: { hunger:50, thirst:50, energy:50, sleep:50, health:50, hygiene:50, socialization:50, safety:50 },
      goals: [{ id: 'p', label: 'P', kind: 'primary' }, { id: 's1', label: 'S1', kind: 'secondary' }, { id: 's2', label: 'S2', kind: 'secondary' }],
    });
    await startSimulation(world.id, 1);
    await expect(createCharacterInWorld({
      worldId: world.id, firstName:'X', lastName:'Y', age:20, gender:'male', biography:'b',
      traits: character.initialState.traits, emotions: character.initialState.emotions, needs: character.initialState.needs, goals: character.initialState.goals,
    })).rejects.toThrow(/verrouillés/);
  });
});