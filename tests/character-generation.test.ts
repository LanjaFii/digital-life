import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const tmp = mkdtempSync(join(tmpdir(), 'dl-chars-'));

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getAppPath: () => tmp,
    getPath: () => tmp,
  },
}));

vi.mock('../src/main/services/resource.service', () => ({
  getWasmPath: () => join(process.cwd(), 'resources', 'sqlite', 'sql-wasm.wasm'),
}));

import { generateCharactersForWorld } from '../src/main/services/character-generator.service';
import { _resetWorldStoreForTests, createWorld, listCharacters } from '../src/main/services/world-store.service';

function clearDb() {
  rmSync(join(tmp, 'data', 'saves', 'worlds.sqlite'), { force: true });
}

function expectInRange(value: number, min: number, max: number) {
  expect(value).toBeGreaterThanOrEqual(min);
  expect(value).toBeLessThanOrEqual(max);
  expect(Number.isInteger(value)).toBe(true);
}

describe('Génération de personnages (Phase 1)', () => {
  beforeEach(async () => {
    await _resetWorldStoreForTests();
    clearDb();
  });

  afterEach(async () => {
    await _resetWorldStoreForTests();
    clearDb();
  });

  it('génère les mêmes personnages avec la même seed et les mêmes paramètres', () => {
    const a = generateCharactersForWorld('world-a', 12345, 4, '2026-01-01T00:00:00.000Z');
    const b = generateCharactersForWorld('world-a', 12345, 4, '2026-01-01T00:00:00.000Z');
    expect(a).toEqual(b);
  });

  it('génère des personnages différents avec des seeds différentes', () => {
    const a = generateCharactersForWorld('world-a', 12345, 4, '2026-01-01T00:00:00.000Z');
    const b = generateCharactersForWorld('world-a', 54321, 4, '2026-01-01T00:00:00.000Z');
    expect(a).not.toEqual(b);
    expect(a[0].firstName !== b[0].firstName || a[0].lastName !== b[0].lastName || a[0].biography !== b[0].biography).toBe(true);
  });

  it('génère le nombre exact de personnages demandé', () => {
    const chars = generateCharactersForWorld('world-a', 999, 7, '2026-01-01T00:00:00.000Z');
    expect(chars).toHaveLength(7);
  });

  it('crée un monde vide sans personnage', async () => {
    const world = await createWorld({ name: 'Vide', generationMode: 'empty', seed: 1 });
    const { characters } = await listCharacters(world.id);
    expect(world.characterCount).toBe(0);
    expect(characters).toHaveLength(0);
  });

  it('persiste les personnages en SQLite et les recharge après redémarrage', async () => {
    const world = await createWorld({ name: 'Persisté', generationMode: 'random', seed: 42, characterCount: 3 });
    const before = await listCharacters(world.id);
    expect(before.characters).toHaveLength(3);

    // Simule un redémarrage : réinitialise le singleton sans supprimer le fichier SQLite.
    await _resetWorldStoreForTests();
    const after = await listCharacters(world.id);
    expect(after.characters).toHaveLength(3);
    expect(after.characters).toEqual(before.characters);
  });

  it('isole les personnages entre deux mondes', async () => {
    const w1 = await createWorld({ name: 'Monde 1', generationMode: 'random', seed: 100, characterCount: 2 });
    const w2 = await createWorld({ name: 'Monde 2', generationMode: 'random', seed: 200, characterCount: 3 });
    const c1 = await listCharacters(w1.id);
    const c2 = await listCharacters(w2.id);
    expect(c1.characters).toHaveLength(2);
    expect(c2.characters).toHaveLength(3);
    expect(c1.characters.every((c) => c.worldId === w1.id)).toBe(true);
    expect(c2.characters.every((c) => c.worldId === w2.id)).toBe(true);
    const ids1 = new Set(c1.characters.map((c) => c.id));
    expect(c2.characters.some((c) => ids1.has(c.id))).toBe(false);
  });

  it('ne crée pas de doublons et reste stable au rechargement', async () => {
    const world = await createWorld({ name: 'NoDup', generationMode: 'random', seed: 77, characterCount: 5 });
    const first = await listCharacters(world.id);
    const second = await listCharacters(world.id);
    expect(second.characters).toEqual(first.characters);
    const ids = first.characters.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('génère des personnages avec champs complets et valeurs plausibles', async () => {
    const world = await createWorld({ name: 'Complet', generationMode: 'random', seed: 1234, characterCount: 4 });
    const { characters } = await listCharacters(world.id);
    expect(characters).toHaveLength(4);
    for (const c of characters) {
      expect(c.id).toBeTruthy();
      expect(c.worldId).toBe(world.id);
      expect(c.firstName.length).toBeGreaterThan(0);
      expect(c.lastName.length).toBeGreaterThan(0);
      expectInRange(c.age, 18, 65);
      expect(['female', 'male', 'nonbinary']).toContain(c.gender);
      expect(c.biography.length).toBeGreaterThan(10);

      for (const value of Object.values(c.currentState.traits)) expectInRange(value, 0, 100);
      for (const value of Object.values(c.currentState.emotions)) expectInRange(value, 0, 100);
      for (const value of Object.values(c.currentState.needs)) expectInRange(value, 0, 100);

      expect(c.currentState.goals.length).toBeGreaterThanOrEqual(1);
      expect(c.currentState.goals.some((g) => g.kind === 'primary')).toBe(true);
      for (const g of c.currentState.goals) {
        expect(g.id).toBeTruthy();
        expect(g.label.length).toBeGreaterThan(0);
      }
    }
  });
});

afterAll(() => {
  rmSync(tmp, { recursive: true, force: true });
});
