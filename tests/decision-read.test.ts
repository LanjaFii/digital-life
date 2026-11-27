import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CharacterTickInput } from '../src/shared/simulation-rules';
import { readDecisionHistory, readDecisionRecord } from '../src/main/services/decision-read.service';
import { getDb } from '../src/main/services/database-connection.service';
import {
  _insertDecisionRecordForTests,
  _resetWorldStoreForTests,
  createCharacterInWorld,
  createWorld,
  deleteCharacterInstance,
  deleteWorld,
} from '../src/main/services/world-store.service';
import { makeDecisionPayload } from './decision-record-fixtures';
import { BASE_EMOTIONS, BASE_NEEDS, BASE_TRAITS, makeSnapshot } from './simulation-rules-fixtures';

const tmp = mkdtempSync(join(tmpdir(), 'dl-decision-read-'));

vi.mock('electron', () => ({
  app: { isPackaged: false, getAppPath: () => tmp, getPath: () => tmp },
  BrowserWindow: { getAllWindows: () => [] },
}));

vi.mock('../src/main/services/resource.service', () => ({
  getWasmPath: () => join(process.cwd(), 'resources', 'sqlite', 'sql-wasm.wasm'),
}));

beforeEach(async () => {
  rmSync(join(tmp, 'data', 'saves', 'worlds.sqlite'), { force: true });
  await _resetWorldStoreForTests();
});

afterAll(() => {
  rmSync(tmp, { recursive: true, force: true });
});

async function newWorld(name: string): Promise<string> {
  const world = await createWorld({ name, generationMode: 'empty' });
  return world.id;
}

async function insert(
  worldId: string,
  characterId: string,
  tick: number,
  overrides: Partial<CharacterTickInput> = {},
): Promise<string> {
  const payload = makeDecisionPayload({
    worldId,
    tick,
    day: 1 + Math.floor((tick - 1) / 24),
    hour: (tick - 1) % 24,
    characters: [makeSnapshot({ characterId })],
    characterNameByCharacterId: { [characterId]: `Nom ${characterId}` },
    ...overrides,
  });
  const record = await _insertDecisionRecordForTests(payload);
  return record.id;
}

async function updateRow(id: string, column: string, value: string | number | Uint8Array | null): Promise<void> {
  const db = await getDb();
  db.run(`UPDATE decision_records SET ${column} = ? WHERE id = ?`, [value, id]);
}

describe('consultation de l’historique des décisions (3D-D)', () => {
  it('isole strictement les mondes et les personnages', async () => {
    const worldA = await newWorld('Monde A');
    const worldB = await newWorld('Monde B');
    const idA = await insert(worldA, 'char-a', 1);
    const idB = await insert(worldB, 'char-b', 1);
    await insert(worldA, 'char-c', 1);

    const allA = await readDecisionHistory({ worldId: worldA });
    expect(allA.map((item) => item.id).sort()).toEqual([idA, `${worldA}:1:char-c`]);
    expect(allA.every((item) => item.characterName.startsWith('Nom '))).toBe(true);
    expect(await readDecisionHistory({ worldId: worldB })).toHaveLength(1);
    expect((await readDecisionHistory({ worldId: worldB }))[0].id).toBe(idB);
    expect(await readDecisionHistory({ worldId: worldA, characterId: 'char-a' })).toHaveLength(1);

    expect((await readDecisionRecord(worldA, idA)).id).toBe(idA);
    await expect(readDecisionRecord(worldB, idA)).rejects.toThrow(/introuvable/);
  });

  it('applique une pagination par offset avec un tri stable', async () => {
    const world = await newWorld('Pagination');
    const expected: string[] = [];
    for (const tick of [2, 1]) {
      for (const characterId of ['char-b', 'char-a', 'char-c']) {
        expected.push(await insert(world, characterId, tick));
      }
    }
    expected.sort((a, b) => {
      const parse = (id: string) => id.split(':');
      const [pa, pb] = [parse(a), parse(b)];
      return Number(pb[1]) - Number(pa[1]) || pa[2].localeCompare(pb[2]) || a.localeCompare(b);
    });

    const first = await readDecisionHistory({ worldId: world, limit: 2, offset: 0 });
    const second = await readDecisionHistory({ worldId: world, limit: 2, offset: 2 });
    const third = await readDecisionHistory({ worldId: world, limit: 2, offset: 4 });
    expect([...first, ...second, ...third].map((item) => item.id)).toEqual(expected);
    expect(await readDecisionHistory({ worldId: world, offset: 6 })).toEqual([]);
  });

  it('ne projette que des résumés légers et bornés', async () => {
    const world = await newWorld('Projection');
    const id = await insert(world, 'char-a', 1);
    const [summary] = await readDecisionHistory({ worldId: world });
    expect(Object.keys(summary).sort()).toEqual([
      'characterId', 'characterName', 'day', 'hour', 'id', 'previousActionId',
      'reason', 'score', 'selectionRule', 'selectedActionId', 'tick', 'warningCount',
    ].sort());
    expect(summary.id).toBe(id);
    const record = await readDecisionRecord(world, id);
    expect(record.payloadSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(record.uncompressedBytes).toBeGreaterThan(0);
  });

  it('conserve l’historique après suppression du personnage', async () => {
    const world = await newWorld('Suppression personnage');
    const { character } = await createCharacterInWorld({
      worldId: world,
      firstName: 'Ada', lastName: 'Lovelace', age: 30, gender: 'female', biography: 'Test',
      traits: { ...BASE_TRAITS }, emotions: { ...BASE_EMOTIONS }, needs: { ...BASE_NEEDS },
      goals: [
        { id: 'gp', label: 'Objectif principal', kind: 'primary' },
        { id: 'gs1', label: 'Objectif secondaire 1', kind: 'secondary' },
        { id: 'gs2', label: 'Objectif secondaire 2', kind: 'secondary' },
      ],
    });
    const id = await insert(world, character.id, 1);
    await deleteCharacterInstance(character.id, world);
    expect((await readDecisionHistory({ worldId: world })).map((item) => item.id)).toEqual([id]);
    expect((await readDecisionRecord(world, id)).explanation.characterId).toBe(character.id);
  });

  it('supprime l’historique avec le monde', async () => {
    const world = await newWorld('Suppression monde');
    const id = await insert(world, 'char-a', 1);
    await deleteWorld(world);
    expect(await readDecisionHistory({ worldId: world })).toEqual([]);
    await expect(readDecisionRecord(world, id)).rejects.toThrow(/introuvable/);
  });

  it('rejette toute la page si le checksum est altéré', async () => {
    const world = await newWorld('Checksum');
    const id = await insert(world, 'char-a', 1);
    await updateRow(id, 'payload_sha256', '0'.repeat(64));
    await expect(readDecisionHistory({ worldId: world })).rejects.toThrow(/Hash de charge utile|payload_sha256/);
    await expect(readDecisionRecord(world, id)).rejects.toThrow(/Hash de charge utile|payload_sha256/);
  });

  it('normalise une charge utile corrompue en erreur technique', async () => {
    const world = await newWorld('BLOB corrompu');
    const id = await insert(world, 'char-a', 1);
    await updateRow(id, 'payload_blob', new Uint8Array([0x42, 0x30, 0x52, 0x21]));
    await expect(readDecisionHistory({ worldId: world })).rejects.toThrow(/corrompu/);
  });

  it('refuse une version d’enregistrement inconnue', async () => {
    const world = await newWorld('Version inconnue');
    const id = await insert(world, 'char-a', 1);
    await updateRow(id, 'record_version', 999);
    await expect(readDecisionHistory({ worldId: world })).rejects.toThrow(/record_version/);
  });

  it('renvoie une liste vide pour un monde sans historique', async () => {
    const world = await newWorld('Historique vide');
    expect(await readDecisionHistory({ worldId: world })).toEqual([]);
  });
});
