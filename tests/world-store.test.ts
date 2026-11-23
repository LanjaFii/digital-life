import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const tmp = mkdtempSync(join(tmpdir(), 'dl-worlds-'));

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getAppPath: () => tmp,
    getPath: () => tmp,
  },
}));

// Le service résout le WASM via resource.service ; on pointe vers le vrai fichier du projet.
vi.mock('../src/main/services/resource.service', () => ({
  getWasmPath: () => join(process.cwd(), 'resources', 'sqlite', 'sql-wasm.wasm'),
}));

import { _resetWorldStoreForTests, createWorld, deleteWorld, listWorlds } from '../src/main/services/world-store.service';

function clearDb() {
  rmSync(join(tmp, 'data', 'saves', 'worlds.sqlite'), { force: true });
}

describe('WorldStore (Phase 1 fondation)', () => {
  beforeEach(async () => {
    await _resetWorldStoreForTests();
    clearDb();
  });

  afterEach(async () => {
    await _resetWorldStoreForTests();
    clearDb();
  });

  it('crée et liste des mondes persistés', async () => {
    const created = await createWorld({ name: 'Monde Alpha', seed: 123, characterCount: 4, generationMode: 'random' });
    expect(created.name).toBe('Monde Alpha');
    expect(created.seed).toBe(123);
    expect(created.characterCount).toBe(4);
    expect(created.generationMode).toBe('random');
    expect(created.id).toBeTruthy();

    const listed = await listWorlds();
    expect(listed.worlds).toHaveLength(1);
    expect(listed.worlds[0].id).toBe(created.id);
    expect(listed.worlds[0].generationMode).toBe('random');
  });

  it('crée un monde vide avec 0 personnage', async () => {
    const created = await createWorld({ name: 'Vide', generationMode: 'empty', characterCount: 9 });
    expect(created.generationMode).toBe('empty');
    expect(created.characterCount).toBe(0);
  });

  it('supprime un monde existant', async () => {
    const created = await createWorld({ name: 'À supprimer' });
    const result = await deleteWorld(created.id);
    expect(result.deleted).toBe(true);
    const listed = await listWorlds();
    expect(listed.worlds).toHaveLength(0);
  });

  it('refuse un nom vide', async () => {
    await expect(createWorld({ name: '   ' })).rejects.toThrow(/obligatoire/i);
  });
});

// Nettoyage global du répertoire temporaire
afterAll(() => {
  rmSync(tmp, { recursive: true, force: true });
});