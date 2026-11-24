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
  _setTickFailureForTests,
  createWorld,
  getSimulationStatus,
  getWorld,
  listCharacters,
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
  _setTickFailureForTests(null);
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

/** Fabrique un monde avec un personnage aux valeurs connues, prêt à simuler. */
async function createSimWorld(seed = 42) {
  const world = await createWorld({ name: 'Phase3B', generationMode: 'random', characterCount: 1, seed });
  const characters = (await listCharacters(world.id)).characters;
  expect(characters).toHaveLength(1);
  await startSimulation(world.id, 1);
  return { world, character: characters[0] };
}

describe('Tick Phase 3B — intégration SQLite', () => {
  it('un tick fait évoluer besoins et émotions et avance l’horloge d’exactement un', async () => {
    const { world, character } = await createSimWorld();
    const before = await getSimulationStatus(world.id);
    await stepSimulation(world.id);
    const after = await getSimulationStatus(world.id);
    expect(after.clock?.tick).toBe((before.clock?.tick ?? 0) + 1);

    const updated = (await listCharacters(world.id)).characters[0];
    expect(updated.currentState.needs.hunger).toBeLessThan(character.currentState.needs.hunger);
    expect(updated.currentState.needs.thirst).toBeLessThan(character.currentState.needs.thirst);
    expect(updated.initialState.needs).toEqual(character.initialState.needs);
    // Au moins une émotion évolue.
    expect(updated.currentState.emotions).not.toEqual(character.currentState.emotions);
  });

  it('applique exactement un tick avec step en pause, puis conserve le PRNG', async () => {
    const { world } = await createSimWorld();
    const clock = (await getSimulationStatus(world.id)).clock!;
    await pauseSimulation(world.id);
    await stepSimulation(world.id);
    const after = (await getSimulationStatus(world.id)).clock!;
    expect(after.tick).toBe(clock.tick + 1);
    expect(after.status).toBe('paused');
    expect((await getSimulationStatus(world.id)).worldStatus).toBe('simulation_paused');
    expect(after.rngState).toBe(clock.rngState); // Phase 3B : aucune consommation
    expect(after.lastProcessedOrder).toBe(0);
    await resumeSimulation(world.id);
    expect((await getSimulationStatus(world.id)).worldStatus).toBe('simulation_running');
  });

  it('une erreur pendant le tick provoque un rollback complet (personnages + horloge)', async () => {
    const { world, character } = await createSimWorld();
    const before = (await getSimulationStatus(world.id)).clock!;
    _setTickFailureForTests(() => { throw new Error('panne injectée'); });
    await expect(stepSimulation(world.id)).rejects.toThrow('panne injectée');
    _setTickFailureForTests(null);

    const after = (await getSimulationStatus(world.id)).clock!;
    expect(after.tick).toBe(before.tick);
    expect(after.rngState).toBe(before.rngState);
    const unchanged = (await listCharacters(world.id)).characters[0];
    expect(unchanged.currentState.needs).toEqual(character.currentState.needs);
    expect(unchanged.currentState.emotions).toEqual(character.currentState.emotions);
  });

  it('les états et l’horloge restent cohérents après fermeture et réouverture', async () => {
    const { world } = await createSimWorld();
    await stepSimulation(world.id);
    await stepSimulation(world.id);
    const beforeClock = (await getSimulationStatus(world.id)).clock!;
    const beforeChars = (await listCharacters(world.id)).characters;

    await _resetWorldStoreForTests(); // ferme la base, sans effacer les fichiers
    const afterClock = (await getSimulationStatus(world.id)).clock!;
    const afterChars = (await listCharacters(world.id)).characters;
    expect(afterClock.tick).toBe(beforeClock.tick);
    expect(afterClock.rngState).toBe(beforeClock.rngState);
    expect(afterChars.map((c) => c.currentState)).toEqual(beforeChars.map((c) => c.currentState));
  });

  it('la récupération au redémarrage met en pause les horloges running', async () => {
    const { world } = await createSimWorld();
    await stepSimulation(world.id);
    await recoverSimulationClocksAfterRestart();
    const status = await getSimulationStatus(world.id);
    expect(status.worldStatus).toBe('simulation_paused');
    expect(status.clock?.status).toBe('paused');
  });

  it('plusieurs ticks consécutifs restent déterministes et bornés', async () => {
    const { world } = await createSimWorld(7);
    for (let i = 0; i < 24; i++) await stepSimulation(world.id);
    const clock = (await getSimulationStatus(world.id)).clock!;
    expect(clock.tick).toBe(24);
    const character = (await listCharacters(world.id)).characters[0];
    for (const value of Object.values(character.currentState.needs)) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(100);
    }
    for (const value of Object.values(character.currentState.emotions)) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(100);
    }
  });
});