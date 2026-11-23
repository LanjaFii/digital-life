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

import { _resetWorldStoreForTests, createWorld, deleteWorld, getWorld, listCharacters, listWorlds } from '../src/main/services/world-store.service';

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

  it('charge un monde existant avec ses métadonnées', async () => {
    const created = await createWorld({ name: 'Monde Reprise', seed: 777, characterCount: 3, generationMode: 'random' });
    const loaded = await getWorld(created.id);
    expect(loaded.id).toBe(created.id);
    expect(loaded.name).toBe('Monde Reprise');
    expect(loaded.seed).toBe(777);
    expect(loaded.generationMode).toBe('random');
    expect(loaded.characterCount).toBe(3);
    expect(loaded.lastOpenedAt).toBeTruthy();
  });

  it('renvoie une erreur pour un monde inexistant', async () => {
    await expect(getWorld('missing-world')).rejects.toThrow(/introuvable/i);
  });

  it('ne mélange pas les personnages entre deux mondes', async () => {
    const a = await createWorld({ name: 'A', seed: 1, generationMode: 'random', characterCount: 2 });
    const b = await createWorld({ name: 'B', seed: 2, generationMode: 'random', characterCount: 3 });
    const charsA = await listCharacters(a.id);
    const charsB = await listCharacters(b.id);
    expect(charsA.characters.every((c) => c.worldId === a.id)).toBe(true);
    expect(charsB.characters.every((c) => c.worldId === b.id)).toBe(true);
    const idsA = new Set(charsA.characters.map((c) => c.id));
    expect(charsB.characters.some((c) => idsA.has(c.id))).toBe(false);
  });

  it('persiste monde et personnages après redémarrage', async () => {
    const created = await createWorld({ name: 'Persist', seed: 99, generationMode: 'random', characterCount: 2 });
    const beforeChars = await listCharacters(created.id);
    await _resetWorldStoreForTests();
    const loaded = await getWorld(created.id);
    const afterChars = await listCharacters(created.id);
    expect(loaded.name).toBe('Persist');
    expect(afterChars.characters).toHaveLength(2);
    expect(afterChars.characters).toEqual(beforeChars.characters);
  });
});

// Nettoyage global du répertoire temporaire
afterAll(() => {
  rmSync(tmp, { recursive: true, force: true });
});