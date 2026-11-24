import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import initSqlJs from 'sql.js';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_CHARACTER_ACTION_RUNTIME_JSON } from '../src/shared/action';
import { type CharacterDraft, EMOTION_KEYS, NEED_KEYS, TRAIT_KEYS } from '../src/shared/character';
import {
  _countDecisionRecordsForTests,
  _getDecisionRecordForTests,
  _getDecisionRecordRowsForTests,
  _insertDecisionRecordForTests,
  _listDecisionRecordsForTests,
  _resetWorldStoreForTests,
  _setTickFailureForTests,
  createCharacterInWorld,
  createWorld,
  deleteCharacterInstance,
  deleteWorld,
  getSimulationStatus,
  listCharacters,
  listWorlds,
  startSimulation,
  stepSimulation,
} from '../src/main/services/world-store.service';
import { makeDecisionPayload } from './decision-record-fixtures';
import { BASE_EMOTIONS, BASE_NEEDS, BASE_TRAITS, makeSnapshot } from './simulation-rules-fixtures';

const tmp = mkdtempSync(join(tmpdir(), 'dl-decision-history-'));

vi.mock('electron', () => ({
  app: { isPackaged: false, getAppPath: () => tmp, getPath: () => tmp },
  BrowserWindow: { getAllWindows: () => [] },
}));

vi.mock('../src/main/services/resource.service', () => ({
  getWasmPath: () => join(process.cwd(), 'resources', 'sqlite', 'sql-wasm.wasm'),
}));

function dbPath(): string {
  return join(tmp, 'data', 'saves', 'worlds.sqlite');
}

function clearDb(): void {
  rmSync(dbPath(), { force: true });
}

function makeDraft(index: number): CharacterDraft {
  return {
    firstName: `Personne${index}`,
    lastName: `Monde${index}`,
    age: 30,
    gender: 'female',
    biography: 'Profil de mesure.',
    traits: { ...BASE_TRAITS },
    emotions: { ...BASE_EMOTIONS },
    needs: { ...BASE_NEEDS },
    goals: [
      { id: 'gp', label: 'Trouver sa place', kind: 'primary' },
      { id: 'gs1', label: 'Se faire des amis', kind: 'secondary' },
      { id: 'gs2', label: 'Explorer le monde', kind: 'secondary' },
    ],
  };
}

beforeEach(async () => {
  _setTickFailureForTests(null);
  clearDb();
  await _resetWorldStoreForTests();
});

afterAll(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe('historique des décisions — SQLite (3D-A)', () => {
  it('écrit une décision par personnage et par tick dans la transaction du tick', async () => {
    const world = await createWorld({ name: 'Historique', generationMode: 'random', characterCount: 2, seed: 42 });
    await startSimulation(world.id, 1);
    await stepSimulation(world.id);
    await stepSimulation(world.id);

    expect(await _countDecisionRecordsForTests(world.id)).toBe(4);
    const records = await _listDecisionRecordsForTests({ worldId: world.id, limit: 500 });
    expect(records).toHaveLength(4);
    expect(new Set(records.map((record) => record.id)).size).toBe(4);
    expect(records.map((record) => record.explanation.tick).sort()).toEqual([1, 1, 2, 2]);
    for (const record of records) {
      expect(record.id).toBe(`${world.id}:${record.explanation.tick}:${record.explanation.characterId}`);
      expect(record.newAction).toEqual({
        actionId: record.explanation.selectedActionId,
        rule: record.explanation.selectionRule,
      });
      expect(await _getDecisionRecordForTests(record.id)).toEqual(record);
    }
  });

  it('rejette les doublons de personnage et de tick', async () => {
    const world = await createWorld({ name: 'Doublon', generationMode: 'empty' });
    const payload = makeDecisionPayload({
      worldId: world.id,
      characters: [makeSnapshot({ characterId: 'char-a' })],
    });
    await _insertDecisionRecordForTests(payload, '2026-11-24T12:00:00.000Z');
    await expect(_insertDecisionRecordForTests(payload, '2026-11-24T12:00:00.000Z')).rejects.toThrow();
    expect(await _countDecisionRecordsForTests(world.id)).toBe(1);
  });

  it('annule entièrement les enregistrements lors d’un rollback du tick', async () => {
    const world = await createWorld({ name: 'Rollback', generationMode: 'random', characterCount: 2, seed: 7 });
    await startSimulation(world.id, 1);
    _setTickFailureForTests(() => { throw new Error('panne injectée après historique'); });
    await expect(stepSimulation(world.id)).rejects.toThrow(/panne injectée/);
    _setTickFailureForTests(null);

    expect(await _countDecisionRecordsForTests(world.id)).toBe(0);
    expect((await getSimulationStatus(world.id)).clock?.tick).toBe(0);
    await stepSimulation(world.id);
    expect(await _countDecisionRecordsForTests(world.id)).toBe(2);
  });

  it('conserve les enregistrements après fermeture et réouverture de la base', async () => {
    const world = await createWorld({ name: 'Réouverture', generationMode: 'random', characterCount: 1, seed: 11 });
    await startSimulation(world.id, 1);
    await stepSimulation(world.id);
    const before = await _listDecisionRecordsForTests({ worldId: world.id, limit: 500 });

    await _resetWorldStoreForTests();
    const after = await _listDecisionRecordsForTests({ worldId: world.id, limit: 500 });
    expect(after).toEqual(before);
  });

  it('conserve l’historique après suppression d’une instance', async () => {
    const world = await createWorld({ name: 'Instance', generationMode: 'empty' });
    const created = await createCharacterInWorld({ ...makeDraft(1), worldId: world.id });
    await _insertDecisionRecordForTests(makeDecisionPayload({
      worldId: world.id,
      characters: [makeSnapshot({ characterId: created.character.id })],
      characterNameByCharacterId: { [created.character.id]: 'Personne1 Monde1' },
    }), '2026-11-24T12:00:00.000Z');

    expect(await deleteCharacterInstance(created.character.id, world.id)).toEqual({ deleted: true });
    const records = await _listDecisionRecordsForTests({ worldId: world.id, limit: 500 });
    expect(records).toHaveLength(1);
    expect(records[0].explanation.characterId).toBe(created.character.id);
    expect(records[0].characterName).toBe('Personne1 Monde1');
  });

  it('supprime l’historique en cascade avec le monde', async () => {
    const world = await createWorld({ name: 'Cascade', generationMode: 'empty' });
    await _insertDecisionRecordForTests(makeDecisionPayload({ worldId: world.id }), '2026-11-24T12:00:00.000Z');
    expect(await _countDecisionRecordsForTests(world.id)).toBe(1);
    expect(await deleteWorld(world.id)).toEqual({ deleted: true });
    expect(await _countDecisionRecordsForTests(world.id)).toBe(0);
  });

  it('migre une ancienne sauvegarde sans table d’historique', async () => {
    mkdirSync(join(tmp, 'data', 'saves'), { recursive: true });
    const SQL = await initSqlJs({
      locateFile: () => join(process.cwd(), 'resources', 'sqlite', 'sql-wasm.wasm'),
      useOldExtensionFunctions: false,
    });
    const legacy = new SQL.Database();
    legacy.run(`
      CREATE TABLE worlds (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, seed INTEGER NOT NULL,
        character_count INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE TABLE characters (
        id TEXT PRIMARY KEY, world_id TEXT NOT NULL, first_name TEXT NOT NULL, last_name TEXT NOT NULL,
        age INTEGER NOT NULL, gender TEXT NOT NULL, biography TEXT NOT NULL,
        traits_json TEXT NOT NULL, emotions_json TEXT NOT NULL, needs_json TEXT NOT NULL,
        goals_json TEXT NOT NULL, created_at TEXT NOT NULL
      );
      CREATE TABLE simulation_clock (
        world_id TEXT PRIMARY KEY, tick INTEGER NOT NULL DEFAULT 0, day INTEGER NOT NULL DEFAULT 1,
        hour INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'paused', speed INTEGER NOT NULL DEFAULT 1,
        rng_state INTEGER NOT NULL, last_processed_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
    `);
    const now = '2026-01-01T00:00:00.000Z';
    legacy.run(
      'INSERT INTO worlds (id, name, seed, character_count, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      ['legacy-world', 'Legacy', 42, 1, now, now],
    );
    legacy.run(`
      INSERT INTO characters (
        id, world_id, first_name, last_name, age, gender, biography,
        traits_json, emotions_json, needs_json, goals_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      'legacy-char', 'legacy-world', 'Ada', 'Lovelace', 30, 'female', 'Legacy',
      JSON.stringify(BASE_TRAITS), JSON.stringify(BASE_EMOTIONS), JSON.stringify(BASE_NEEDS), '[]', now,
    ]);
    legacy.run(`
      INSERT INTO simulation_clock (
        world_id, tick, day, hour, status, speed, rng_state, last_processed_order, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, ['legacy-world', 0, 1, 0, 'paused', 1, 1234, 0, now, now]);
    writeFileSync(dbPath(), Buffer.from(legacy.export()));
    legacy.close();

    const worlds = await listWorlds();
    expect(worlds.worlds.map((world) => world.id)).toContain('legacy-world');
    expect(await _countDecisionRecordsForTests('legacy-world')).toBe(0);
    expect(DEFAULT_CHARACTER_ACTION_RUNTIME_JSON).toContain('"version":1');

    // Vérification directe du schéma migré dans le fichier SQLite persisté.
    const migrated = new SQL.Database(new Uint8Array(readFileSync(dbPath())));
    try {
      const version = migrated.exec("SELECT version FROM schema_migrations WHERE version = '3D-1'");
      expect(version[0]?.values).toEqual([['3D-1']]);
      const columns = migrated.exec('PRAGMA table_info(decision_records)')[0]?.values ?? [];
      const names = columns.map((column) => String(column[1]));
      for (const required of [
        'id', 'world_id', 'character_id', 'tick', 'record_version', 'engine_version',
        'payload_blob', 'payload_sha256', 'uncompressed_bytes', 'created_at',
      ]) {
        expect(names).toContain(required);
      }
      const indexes = migrated.exec('PRAGMA index_list(decision_records)')[0]?.values ?? [];
      const indexNames = indexes.map((index) => String(index[1]));
      expect(indexNames).toContain('idx_decision_records_world_tick');
      expect(indexNames).toContain('idx_decision_records_character_tick');
    } finally {
      migrated.close();
    }
  });

  it('mesure la taille réelle des enregistrements pour 10, 50 et 100 personnages', async () => {
    const metrics: string[] = [];
    for (const count of [10, 50, 100]) {
      const world = await createWorld({ name: `Mesure ${count}`, generationMode: 'random', characterCount: Math.min(count, 50), seed: 1000 + count });
      let current = (await listCharacters(world.id)).characters.length;
      let draftIndex = current;
      while (current < count) {
        await createCharacterInWorld({ ...makeDraft(draftIndex), worldId: world.id });
        draftIndex += 1;
        current += 1;
      }
      await startSimulation(world.id, 1);
      await stepSimulation(world.id);
      const rows = await _getDecisionRecordRowsForTests(world.id);
      expect(rows).toHaveLength(count);
      const blobs = rows.map((row) => row.payload_blob.length);
      const raw = rows.map((row) => row.uncompressed_bytes);
      const sum = blobs.reduce((total, value) => total + value, 0);
      metrics.push(JSON.stringify({
        characters: count,
        records: rows.length,
        compressedBytesTotal: sum,
        compressedBytesAverage: +(sum / rows.length).toFixed(1),
        compressedBytesMin: Math.min(...blobs),
        compressedBytesMax: Math.max(...blobs),
        uncompressedBytesAverage: +(raw.reduce((a, b) => a + b, 0) / raw.length).toFixed(1),
      }));
      for (const row of rows) {
        expect(row.payload_blob.length).toBeLessThanOrEqual(16_384);
        expect(row.uncompressed_bytes).toBeLessThanOrEqual(65_536);
      }
    }
    // Mesures conservées comme référence de croissance (aucun fichier généré).
    for (const metric of metrics) console.log(`[3D-A taille] ${metric}`);
  }, 120_000);
});

describe('non-régression du calcul Phase 3C', () => {
  it('garde decisions et decisionRecords indexés et cohérents', async () => {
    const { computeCharacterTick } = await import('../src/main/services/character-tick.service');
    const { DEFAULT_SIMULATION_PARAMETERS } = await import('../src/main/services/simulation-parameters.service');
    const snapshots = [makeSnapshot({ characterId: 'b' }), makeSnapshot({ characterId: 'a' })];
    const result = computeCharacterTick({
      worldId: 'coherence', tick: 1, day: 1, hour: 1, seed: 42, rngState: 0x12345678,
      characters: snapshots, params: DEFAULT_SIMULATION_PARAMETERS,
    });
    expect(result.characterStates.map((state) => state.characterId)).toEqual(['a', 'b']);
    expect(result.decisionRecords).toHaveLength(result.decisions.length);
    for (let index = 0; index < result.decisions.length; index += 1) {
      expect(result.decisionRecords[index].explanation).toBe(result.decisions[index]);
      expect(result.decisionRecords[index].explanation.characterId).toBe(result.characterStates[index].characterId);
      expect(result.decisionRecords[index].stateAfter.needs).toEqual(result.characterStates[index].needs);
      expect(result.decisionRecords[index].stateAfter.runtime).toEqual(result.actionRuntimeStates[index].runtime);
    }
    expect(NEED_KEYS).toHaveLength(8);
    expect(EMOTION_KEYS).toHaveLength(10);
    expect(TRAIT_KEYS).toHaveLength(21);
  });
});
