import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EMOTION_KEYS, NEED_KEYS, TRAIT_KEYS, type CharacterDraft } from '../src/shared/character';

const tmp = mkdtempSync(join(tmpdir(), 'dl-deletion-'));

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

import {
  _resetWorldStoreForTests,
  _setWorldStatusForTests,
  createCharacterInWorld,
  createTemplate,
  createWorld,
  deleteCharacterInstance,
  getTemplate,
  getWorld,
  instantiateTemplate,
  listCharacters,
  listTemplates,
} from '../src/main/services/world-store.service';

function clearDb() {
  rmSync(join(tmp, 'data', 'saves', 'worlds.sqlite'), { force: true });
}

function makeDraft(overrides: Partial<CharacterDraft> = {}): CharacterDraft {
  return {
    firstName: 'Alice',
    lastName: 'Martin',
    age: 30,
    gender: 'female',
    biography: 'Une acrobate du quotidien.',
    traits: Object.fromEntries(TRAIT_KEYS.map((k) => [k, 50])) as unknown as CharacterDraft['traits'],
    emotions: Object.fromEntries(EMOTION_KEYS.map((k) => [k, 50])) as unknown as CharacterDraft['emotions'],
    needs: Object.fromEntries(NEED_KEYS.map((k) => [k, 80])) as unknown as CharacterDraft['needs'],
    goals: [
      { id: 'gp', label: 'Trouver sa place', kind: 'primary' },
      { id: 'gs1', label: 'Se faire des amis', kind: 'secondary' },
      { id: 'gs2', label: 'Explorer la ville', kind: 'secondary' },
    ],
    ...overrides,
  };
}

beforeEach(async () => {
  await _resetWorldStoreForTests();
  clearDb();
});

afterEach(async () => {
  await _resetWorldStoreForTests();
  clearDb();
});

afterAll(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe('Suppression d’une instance de personnage (service)', () => {
  it('1. supprime une instance valide', async () => {
    const world = await createWorld({ name: 'A', generationMode: 'empty' });
    const { character } = await createCharacterInWorld({ worldId: world.id, ...makeDraft() });
    expect(await deleteCharacterInstance(character.id, world.id)).toEqual({ deleted: true });
    expect((await listCharacters(world.id)).characters).toHaveLength(0);
  });

  it('2. refuse une suppression dans un monde vide ou sans correspondance', async () => {
    const empty = await createWorld({ name: 'Vide', generationMode: 'empty' });
    await expect(deleteCharacterInstance('introuvable', empty.id)).rejects.toThrow(/introuvable/i);
    const other = await createWorld({ name: 'Peuplé', generationMode: 'empty' });
    await createCharacterInWorld({ worldId: other.id, ...makeDraft() });
    await expect(deleteCharacterInstance('introuvable', other.id)).rejects.toThrow(/introuvable/i);
    expect((await listCharacters(other.id)).characters).toHaveLength(1);
  });

  it('3. refuse un identifiant de personnage inexistant', async () => {
    const world = await createWorld({ name: 'A', generationMode: 'empty' });
    await expect(deleteCharacterInstance('00000000-0000-0000-0000-000000000000', world.id)).rejects.toThrow(/introuvable/i);
  });

  it('4. refuse une instance appartenant à un autre monde', async () => {
    const a = await createWorld({ name: 'A', generationMode: 'empty' });
    const b = await createWorld({ name: 'B', generationMode: 'empty' });
    const { character } = await createCharacterInWorld({ worldId: a.id, ...makeDraft() });
    await expect(deleteCharacterInstance(character.id, b.id)).rejects.toThrow(/introuvable/i);
    expect((await listCharacters(a.id)).characters.map((c) => c.id)).toEqual([character.id]);
    expect((await listCharacters(b.id)).characters).toHaveLength(0);
    expect((await getWorld(a.id)).characterCount).toBe(1);
    expect((await getWorld(b.id)).characterCount).toBe(0);
  });

  it('5. refuse la suppression quand le monde n’est pas en préparation', async () => {
    const world = await createWorld({ name: 'Lancé', generationMode: 'empty' });
    const { character } = await createCharacterInWorld({ worldId: world.id, ...makeDraft() });
    await _setWorldStatusForTests(world.id, 'simulation_started');
    await expect(deleteCharacterInstance(character.id, world.id)).rejects.toThrow(/verrouillés/i);
    expect((await listCharacters(world.id)).characters).toHaveLength(1);
    expect((await getWorld(world.id)).characterCount).toBe(1);
  });

  it('6. conserve le modèle original de la bibliothèque', async () => {
    const world = await createWorld({ name: 'A', generationMode: 'empty' });
    const { character, template } = await createCharacterInWorld({ worldId: world.id, ...makeDraft(), saveAsTemplate: true });
    expect(template).toBeDefined();
    await deleteCharacterInstance(character.id, world.id);
    expect(await getTemplate(template!.id)).toEqual(template);
    expect((await listTemplates()).templates).toHaveLength(1);
  });

  it('7. conserve les instances du même modèle dans les autres mondes', async () => {
    const template = await createTemplate(makeDraft());
    const a = await createWorld({ name: 'A', generationMode: 'empty' });
    const b = await createWorld({ name: 'B', generationMode: 'empty' });
    const c = await createWorld({ name: 'C', generationMode: 'empty' });
    const ia = await instantiateTemplate({ templateId: template.id, worldId: a.id });
    const ib = await instantiateTemplate({ templateId: template.id, worldId: b.id });
    const ic = await instantiateTemplate({ templateId: template.id, worldId: c.id });
    expect(new Set([ia.id, ib.id, ic.id]).size).toBe(3);

    await deleteCharacterInstance(ia.id, a.id);

    expect((await listCharacters(a.id)).characters).toHaveLength(0);
    expect((await listCharacters(b.id)).characters).toEqual([ib]);
    expect((await listCharacters(c.id)).characters).toEqual([ic]);
    expect(await getTemplate(template.id)).toEqual(template);
  });

  it('8. met à jour le compteur du monde', async () => {
    const world = await createWorld({ name: 'A', generationMode: 'empty' });
    const first = await createCharacterInWorld({ worldId: world.id, ...makeDraft() });
    const second = await createCharacterInWorld({ worldId: world.id, ...makeDraft({ firstName: 'Bob' }) });
    expect((await getWorld(world.id)).characterCount).toBe(2);

    await deleteCharacterInstance(first.character.id, world.id);
    expect((await getWorld(world.id)).characterCount).toBe(1);
    expect((await listCharacters(world.id)).characters.map((c) => c.id)).toEqual([second.character.id]);

    await deleteCharacterInstance(second.character.id, world.id);
    expect((await getWorld(world.id)).characterCount).toBe(0);
  });

  it('9. persiste la suppression après redémarrage', async () => {
    const world = await createWorld({ name: 'A', generationMode: 'empty' });
    const removed = await createCharacterInWorld({ worldId: world.id, ...makeDraft({ firstName: 'À supprimer' }) });
    const kept = await createCharacterInWorld({ worldId: world.id, ...makeDraft({ firstName: 'À garder' }) });
    await deleteCharacterInstance(removed.character.id, world.id);

    await _resetWorldStoreForTests();

    const after = await listCharacters(world.id);
    expect(after.characters).toHaveLength(1);
    expect(after.characters[0].id).toBe(kept.character.id);
    expect((await getWorld(world.id)).characterCount).toBe(1);
  });

  it('10. valide les identifiants du personnage et du monde', async () => {
    const world = await createWorld({ name: 'A', generationMode: 'empty' });
    const { character } = await createCharacterInWorld({ worldId: world.id, ...makeDraft() });
    const bad = ['', '   ', 42, null, undefined] as unknown as string[];
    for (const id of bad) {
      await expect(deleteCharacterInstance(id, world.id)).rejects.toThrow(/personnage invalide/i);
      await expect(deleteCharacterInstance(character.id, id)).rejects.toThrow(/monde invalide/i);
    }
    expect((await listCharacters(world.id)).characters).toHaveLength(1);
  });

  it('11. refuse un monde inexistant', async () => {
    await expect(deleteCharacterInstance('un-personnage', 'monde-inexistant')).rejects.toThrow(/monde introuvable/i);
  });

  it('12. ne modifie aucun autre personnage du monde', async () => {
    const world = await createWorld({ name: 'A', generationMode: 'empty' });
    const alice = await createCharacterInWorld({ worldId: world.id, ...makeDraft({ firstName: 'Alice' }) });
    const bob = await createCharacterInWorld({ worldId: world.id, ...makeDraft({ firstName: 'Bob' }) });
    const cleo = await createCharacterInWorld({ worldId: world.id, ...makeDraft({ firstName: 'Cléo' }) });
    await deleteCharacterInstance(bob.character.id, world.id);
    const after = (await listCharacters(world.id)).characters;
    expect(after).toHaveLength(2);
    expect(after.find((c) => c.id === alice.character.id)).toEqual(alice.character);
    expect(after.find((c) => c.id === cleo.character.id)).toEqual(cleo.character);
  });

  it('13. supprime aussi une instance sans modèle d’origine', async () => {
    const world = await createWorld({ name: 'A', generationMode: 'empty' });
    const { character } = await createCharacterInWorld({ worldId: world.id, ...makeDraft() });
    expect(character.templateId).toBeNull();
    expect(await deleteCharacterInstance(character.id, world.id)).toEqual({ deleted: true });
    expect((await listTemplates()).templates).toHaveLength(0);
  });
});
