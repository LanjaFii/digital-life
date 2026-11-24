import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import initSqlJs from 'sql.js';
import { EMOTION_KEYS, NEED_KEYS, TRAIT_KEYS, type CharacterDraft } from '../src/shared/character';

const tmp = mkdtempSync(join(tmpdir(), 'dl-library-'));

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
  deleteTemplate,
  getTemplate,
  getWorld,
  instantiateTemplate,
  listCharacters,
  listTemplates,
  listWorlds,
  updateCharacterInstance,
  updateTemplate,
} from '../src/main/services/world-store.service';

function clearDb() {
  rmSync(join(tmp, 'data', 'saves', 'worlds.sqlite'), { force: true });
}

/** Brouillon valide : 21 traits, 10 émotions, 8 besoins, 1+2 objectifs. */
function makeDraft(overrides: Partial<CharacterDraft> = {}): CharacterDraft {
  return {
    firstName: 'Alice',
    lastName: 'Martin',
    age: 30,
    gender: 'female',
    biography: 'Une acrobate du quotidien.',
    traits: Object.fromEntries(TRAIT_KEYS.map((k) => [k, k === 'sociability' ? 85 : 50])) as unknown as CharacterDraft['traits'],
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

describe('Création manuelle de personnage', () => {
  it('crée un personnage valide dans un monde vide', async () => {
    const world = await createWorld({ name: 'Vide', generationMode: 'empty' });
    const { character, template } = await createCharacterInWorld({ worldId: world.id, ...makeDraft() });
    expect(template).toBeUndefined();
    expect(character.id).toBeTruthy();
    expect(character.worldId).toBe(world.id);
    expect(character.templateId).toBeNull();
    expect(character.firstName).toBe('Alice');
    expect(character.initialState).toEqual(character.currentState);
    expect(character.currentState.traits.sociability).toBe(85);
    const listed = await listCharacters(world.id);
    expect(listed.characters).toHaveLength(1);
    expect((await getWorld(world.id)).characterCount).toBe(1);
  });

  it('ajoute un personnage dans un monde déjà peuplé sans toucher aux existants', async () => {
    const world = await createWorld({ name: 'Peuplé', seed: 42, generationMode: 'random', characterCount: 3 });
    const before = await listCharacters(world.id);
    await createCharacterInWorld({ worldId: world.id, ...makeDraft({ firstName: 'Nina' }) });
    const after = await listCharacters(world.id);
    expect(after.characters).toHaveLength(4);
    for (const old of before.characters) {
      expect(after.characters.find((c) => c.id === old.id)).toEqual(old);
    }
    expect((await getWorld(world.id)).characterCount).toBe(4);
  });

  it('crée uniquement dans la bibliothèque sans personnage de monde', async () => {
    const world = await createWorld({ name: 'Vide', generationMode: 'empty' });
    const template = await createTemplate(makeDraft());
    expect(template.id).toBeTruthy();
    expect((await listCharacters(world.id)).characters).toHaveLength(0);
    expect((await listTemplates()).templates).toHaveLength(1);
  });

  it('crée simultanément une instance et un modèle (saveAsTemplate)', async () => {
    const world = await createWorld({ name: 'Double', generationMode: 'empty' });
    const { character, template } = await createCharacterInWorld({ worldId: world.id, ...makeDraft(), saveAsTemplate: true });
    expect(template).toBeDefined();
    expect(character.templateId).toBe(template!.id);
    expect(character.id).not.toBe(template!.id);
    expect((await listTemplates()).templates).toHaveLength(1);
    expect((await listCharacters(world.id)).characters).toHaveLength(1);
  });

  it('persiste instance et modèle après redémarrage', async () => {
    const world = await createWorld({ name: 'Persist', generationMode: 'empty' });
    const { character, template } = await createCharacterInWorld({ worldId: world.id, ...makeDraft(), saveAsTemplate: true });
    await _resetWorldStoreForTests();
    const chars = await listCharacters(world.id);
    expect(chars.characters).toHaveLength(1);
    expect(chars.characters[0]).toEqual(character);
    expect(await getTemplate(template!.id)).toEqual(template);
  });

  it('rejette un monde inexistant', async () => {
    await expect(createCharacterInWorld({ worldId: 'nope', ...makeDraft() })).rejects.toThrow(/introuvable/i);
  });

  it('rejette un âge invalide', async () => {
    const world = await createWorld({ name: 'Âge', generationMode: 'empty' });
    for (const age of [17, 66, 30.5, Number.NaN]) {
      await expect(createCharacterInWorld({ worldId: world.id, ...makeDraft({ age }) })).rejects.toThrow(/âge/i);
    }
  });

  it('rejette un genre invalide', async () => {
    const world = await createWorld({ name: 'Genre', generationMode: 'empty' });
    await expect(
      createCharacterInWorld({ worldId: world.id, ...makeDraft({ gender: 'autre' as CharacterDraft['gender'] }) }),
    ).rejects.toThrow(/genre/i);
  });

  it('rejette des traits hors limites ou incomplets', async () => {
    const world = await createWorld({ name: 'Traits', generationMode: 'empty' });
    const traits = makeDraft().traits;
    await expect(
      createCharacterInWorld({ worldId: world.id, ...makeDraft({ traits: { ...traits, courage: 101 } }) }),
    ).rejects.toThrow(/entre 0 et 100/i);
    await expect(
      createCharacterInWorld({ worldId: world.id, ...makeDraft({ traits: { ...traits, empathy: -1 } }) }),
    ).rejects.toThrow(/entre 0 et 100/i);
    const incomplete = { ...traits } as Partial<CharacterDraft['traits']>;
    delete incomplete.resilience;
    await expect(
      createCharacterInWorld({ worldId: world.id, ...makeDraft({ traits: incomplete as CharacterDraft['traits'] }) }),
    ).rejects.toThrow(/resilience/i);
  });

  it('rejette des émotions et besoins invalides', async () => {
    const world = await createWorld({ name: 'Scores', generationMode: 'empty' });
    const base = makeDraft();
    await expect(
      createCharacterInWorld({ worldId: world.id, ...makeDraft({ emotions: { ...base.emotions, stress: 120 } }) }),
    ).rejects.toThrow(/entre 0 et 100/i);
    await expect(
      createCharacterInWorld({ worldId: world.id, ...makeDraft({ needs: { ...base.needs, energy: -5 } }) }),
    ).rejects.toThrow(/entre 0 et 100/i);
    await expect(
      createCharacterInWorld({ worldId: world.id, ...makeDraft({ emotions: { ...base.emotions, happiness: 50.5 } }) }),
    ).rejects.toThrow(/entier/i);
  });

  it('rejette des objectifs invalides', async () => {
    const world = await createWorld({ name: 'Buts', generationMode: 'empty' });
    const goals = makeDraft().goals;
    // Pas d'objectif principal.
    await expect(
      createCharacterInWorld({ worldId: world.id, ...makeDraft({ goals: goals.filter((g) => g.kind !== 'primary') }) }),
    ).rejects.toThrow(/principal/i);
    // Un seul secondaire.
    await expect(
      createCharacterInWorld({ worldId: world.id, ...makeDraft({ goals: goals.slice(0, 2) }) }),
    ).rejects.toThrow(/secondaires/i);
    // Libellé vide.
    await expect(
      createCharacterInWorld({
        worldId: world.id,
        ...makeDraft({ goals: goals.map((g) => (g.kind === 'primary' ? { ...g, label: '  ' } : g)) }),
      }),
    ).rejects.toThrow(/obligatoire/i);
  });

  it('rejette prénom/nom vides', async () => {
    const world = await createWorld({ name: 'Noms', generationMode: 'empty' });
    await expect(createCharacterInWorld({ worldId: world.id, ...makeDraft({ firstName: ' ' }) })).rejects.toThrow(/prénom/i);
    await expect(createCharacterInWorld({ worldId: world.id, ...makeDraft({ lastName: '' }) })).rejects.toThrow(/nom/i);
  });
});

describe('Bibliothèque de modèles', () => {
  it('crée, liste et récupère un modèle par identifiant', async () => {
    const a = await createTemplate(makeDraft());
    const b = await createTemplate(makeDraft({ firstName: 'Bob', lastName: 'Durand', gender: 'male' }));
    const listed = await listTemplates();
    expect(listed.templates).toHaveLength(2);
    expect(new Set(listed.templates.map((t) => t.id))).toEqual(new Set([a.id, b.id]));
    const fetched = await getTemplate(a.id);
    expect(fetched).toEqual(a);
    expect(fetched.createdAt).toBeTruthy();
    expect(fetched.updatedAt).toBeTruthy();
  });

  it('modifie un modèle en conservant createdAt', async () => {
    const created = await createTemplate(makeDraft());
    const updated = await updateTemplate({ id: created.id, ...makeDraft({ firstName: 'Alicia', biography: 'Nouvelle bio.' }) });
    expect(updated.id).toBe(created.id);
    expect(updated.firstName).toBe('Alicia');
    expect(updated.biography).toBe('Nouvelle bio.');
    expect(updated.createdAt).toBe(created.createdAt);
    expect((await getTemplate(created.id)).firstName).toBe('Alicia');
  });

  it('supprime un modèle', async () => {
    const created = await createTemplate(makeDraft());
    expect(await deleteTemplate(created.id)).toEqual({ deleted: true });
    expect((await listTemplates()).templates).toHaveLength(0);
    await expect(getTemplate(created.id)).rejects.toThrow(/introuvable/i);
  });

  it('persiste la bibliothèque après redémarrage', async () => {
    const created = await createTemplate(makeDraft());
    await _resetWorldStoreForTests();
    const listed = await listTemplates();
    expect(listed.templates).toHaveLength(1);
    expect(listed.templates[0]).toEqual(created);
  });

  it('gère les identifiants inexistants', async () => {
    await expect(getTemplate('missing')).rejects.toThrow(/introuvable/i);
    await expect(updateTemplate({ id: 'missing', ...makeDraft() })).rejects.toThrow(/introuvable/i);
    expect(await deleteTemplate('missing')).toEqual({ deleted: false });
    await expect(getTemplate('')).rejects.toThrow(/invalide/i);
    await expect(instantiateTemplate({ templateId: 'missing', worldId: 'x' })).rejects.toThrow();
  });
});

describe('Réutilisation et indépendance des instances', () => {
  it('instancie le même modèle dans plusieurs mondes avec des ids distincts', async () => {
    const template = await createTemplate(makeDraft());
    const a = await createWorld({ name: 'Monde A', generationMode: 'empty' });
    const b = await createWorld({ name: 'Monde B', generationMode: 'empty' });
    const c = await createWorld({ name: 'Monde C', generationMode: 'empty' });
    const ia = await instantiateTemplate({ templateId: template.id, worldId: a.id });
    const ib = await instantiateTemplate({ templateId: template.id, worldId: b.id });
    const ic = await instantiateTemplate({ templateId: template.id, worldId: c.id });
    expect(new Set([ia.id, ib.id, ic.id]).size).toBe(3);
    expect(ia.worldId).toBe(a.id);
    expect(ib.worldId).toBe(b.id);
    expect(ic.worldId).toBe(c.id);
    for (const instance of [ia, ib, ic]) {
      expect(instance.templateId).toBe(template.id);
      expect(instance.currentState.traits.sociability).toBe(85);
      expect(instance.currentState).toEqual(instance.initialState);
    }
    expect((await getWorld(a.id)).characterCount).toBe(1);
    expect((await getWorld(b.id)).characterCount).toBe(1);
  });

  it('modifie une instance sans toucher aux autres instances ni au modèle', async () => {
    const template = await createTemplate(makeDraft());
    const a = await createWorld({ name: 'A', generationMode: 'empty' });
    const b = await createWorld({ name: 'B', generationMode: 'empty' });
    const c = await createWorld({ name: 'C', generationMode: 'empty' });
    const ia = await instantiateTemplate({ templateId: template.id, worldId: a.id });
    const ib = await instantiateTemplate({ templateId: template.id, worldId: b.id });
    const ic = await instantiateTemplate({ templateId: template.id, worldId: c.id });

    const draftA = makeDraft({ traits: { ...makeDraft().traits, sociability: 45 } });
    await updateCharacterInstance({ id: ia.id, worldId: a.id, ...draftA });
    const draftB = makeDraft({ traits: { ...makeDraft().traits, sociability: 20 } });
    await updateCharacterInstance({ id: ib.id, worldId: b.id, ...draftB });

    const afterA = (await listCharacters(a.id)).characters[0];
    const afterB = (await listCharacters(b.id)).characters[0];
    const afterC = (await listCharacters(c.id)).characters[0];
    expect(afterA.currentState.traits.sociability).toBe(45);
    expect(afterB.currentState.traits.sociability).toBe(20);
    expect(afterC.currentState.traits.sociability).toBe(85);
    expect(afterC).toEqual(ic);
    expect((await getTemplate(template.id)).traits.sociability).toBe(85);
  });

  it('modifie le modèle sans modifier les instances existantes', async () => {
    const template = await createTemplate(makeDraft());
    const world = await createWorld({ name: 'A', generationMode: 'empty' });
    const instance = await instantiateTemplate({ templateId: template.id, worldId: world.id });
    await updateTemplate({ id: template.id, ...makeDraft({ traits: { ...makeDraft().traits, sociability: 95 }, firstName: 'Alice 2' }) });
    const after = (await listCharacters(world.id)).characters[0];
    expect(after.currentState.traits.sociability).toBe(85);
    expect(after.firstName).toBe('Alice');
    expect(after).toEqual(instance);
    // Seules les futures instances utilisent les nouvelles valeurs.
    const future = await instantiateTemplate({ templateId: template.id, worldId: world.id });
    expect(future.currentState.traits.sociability).toBe(95);
    expect(future.firstName).toBe('Alice 2');
  });

  it('supprime le modèle sans supprimer les instances (référence informative effacée)', async () => {
    const template = await createTemplate(makeDraft());
    const a = await createWorld({ name: 'A', generationMode: 'empty' });
    const b = await createWorld({ name: 'B', generationMode: 'empty' });
    const ia = await instantiateTemplate({ templateId: template.id, worldId: a.id });
    const ib = await instantiateTemplate({ templateId: template.id, worldId: b.id });
    expect(await deleteTemplate(template.id)).toEqual({ deleted: true });
    const afterA = (await listCharacters(a.id)).characters;
    const afterB = (await listCharacters(b.id)).characters;
    expect(afterA).toHaveLength(1);
    expect(afterB).toHaveLength(1);
    expect(afterA[0].id).toBe(ia.id);
    expect(afterB[0].id).toBe(ib.id);
    expect(afterA[0].templateId).toBeNull();
    expect(afterB[0].templateId).toBeNull();
    expect(afterA[0].currentState.traits.sociability).toBe(85);
    expect((await getWorld(a.id)).characterCount).toBe(1);
    expect((await getWorld(b.id)).characterCount).toBe(1);
  });

  it('isole les personnages entre mondes et persiste les modifications', async () => {
    const template = await createTemplate(makeDraft());
    const a = await createWorld({ name: 'A', generationMode: 'empty' });
    const b = await createWorld({ name: 'B', generationMode: 'empty' });
    const ia = await instantiateTemplate({ templateId: template.id, worldId: a.id });
    await instantiateTemplate({ templateId: template.id, worldId: b.id });
    await updateCharacterInstance({ id: ia.id, worldId: a.id, ...makeDraft({ firstName: 'Modifiée' }) });
    await _resetWorldStoreForTests();
    const afterA = await listCharacters(a.id);
    const afterB = await listCharacters(b.id);
    expect(afterA.characters.every((c) => c.worldId === a.id)).toBe(true);
    expect(afterB.characters.every((c) => c.worldId === b.id)).toBe(true);
    expect(afterA.characters[0].firstName).toBe('Modifiée');
    expect(afterB.characters[0].firstName).toBe('Alice');
  });

  it('refuse de modifier une instance avec un mauvais monde', async () => {
    const world = await createWorld({ name: 'A', generationMode: 'empty' });
    const other = await createWorld({ name: 'B', generationMode: 'empty' });
    const { character } = await createCharacterInWorld({ worldId: world.id, ...makeDraft() });
    await expect(updateCharacterInstance({ id: character.id, worldId: other.id, ...makeDraft() })).rejects.toThrow(/introuvable/i);
  });
});

describe('Verrouillage après démarrage de simulation (préparé, pas de moteur)', () => {
  it('verrouille création, instanciation et modification quand status=simulation_started', async () => {
    const world = await createWorld({ name: 'Lancé', generationMode: 'empty' });
    const { character } = await createCharacterInWorld({ worldId: world.id, ...makeDraft() });
    const template = await createTemplate(makeDraft());
    await _setWorldStatusForTests(world.id, 'simulation_started');
    expect((await getWorld(world.id)).status).toBe('simulation_running');
    await expect(createCharacterInWorld({ worldId: world.id, ...makeDraft() })).rejects.toThrow(/verrouillés/i);
    await expect(instantiateTemplate({ templateId: template.id, worldId: world.id })).rejects.toThrow(/verrouillés/i);
    await expect(updateCharacterInstance({ id: character.id, worldId: world.id, ...makeDraft() })).rejects.toThrow(/verrouillés/i);
    // La consultation reste possible.
    expect((await listCharacters(world.id)).characters).toHaveLength(1);
  });

  it('les mondes existants restent en préparation par défaut', async () => {
    const world = await createWorld({ name: 'Prep', generationMode: 'random', seed: 7, characterCount: 2 });
    expect(world.status).toBe('preparation');
    await _resetWorldStoreForTests();
    expect((await getWorld(world.id)).status).toBe('preparation');
  });
});

describe('Migration additive d’une base Phase 1 existante', () => {
  it('préserve les anciens mondes/personnages et permet les nouvelles opérations', async () => {
    // Reconstruit une base au schéma legacy (sans status, template_id, initial/current).
    const SQL = await initSqlJs({ locateFile: () => join(process.cwd(), 'resources', 'sqlite', 'sql-wasm.wasm'), useOldExtensionFunctions: false });
    const legacy = new SQL.Database();
    legacy.run(`
      CREATE TABLE worlds (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, seed INTEGER NOT NULL,
        character_count INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL, last_opened_at TEXT
      );
    `);
    legacy.run(`
      CREATE TABLE characters (
        id TEXT PRIMARY KEY, world_id TEXT NOT NULL,
        first_name TEXT NOT NULL, last_name TEXT NOT NULL, age INTEGER NOT NULL,
        gender TEXT NOT NULL, biography TEXT NOT NULL,
        traits_json TEXT NOT NULL, emotions_json TEXT NOT NULL, needs_json TEXT NOT NULL, goals_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `);
    const draft = makeDraft();
    const now = '2026-01-01T10:00:00.000Z';
    legacy.run(
      'INSERT INTO worlds (id, name, seed, character_count, created_at, updated_at, last_opened_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      ['legacy-world', 'Monde Legacy', 42, 1, now, now, null],
    );
    legacy.run(
      'INSERT INTO characters (id, world_id, first_name, last_name, age, gender, biography, traits_json, emotions_json, needs_json, goals_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      ['legacy-char', 'legacy-world', draft.firstName, draft.lastName, draft.age, draft.gender, draft.biography,
        JSON.stringify(draft.traits), JSON.stringify(draft.emotions), JSON.stringify(draft.needs), JSON.stringify(draft.goals), now],
    );
    mkdirSync(join(tmp, 'data', 'saves'), { recursive: true });
    writeFileSync(join(tmp, 'data', 'saves', 'worlds.sqlite'), Buffer.from(legacy.export()));
    legacy.close();

    // Ouverture via le store : la migration doit être additive et silencieuse.
    const worlds = await listWorlds();
    expect(worlds.worlds).toHaveLength(1);
    expect(worlds.worlds[0].name).toBe('Monde Legacy');
    expect(worlds.worlds[0].status).toBe('preparation');
    expect(worlds.worlds[0].generationMode).toBe('empty');

    const chars = await listCharacters('legacy-world');
    expect(chars.characters).toHaveLength(1);
    const migrated = chars.characters[0];
    expect(migrated.id).toBe('legacy-char');
    expect(migrated.templateId).toBeNull();
    expect(migrated.currentState.traits.sociability).toBe(85);
    expect(migrated.initialState).toEqual(migrated.currentState);
    expect(migrated.updatedAt).toBe(now);

    // Les nouvelles opérations fonctionnent sur la base migrée.
    await createCharacterInWorld({ worldId: 'legacy-world', ...makeDraft({ firstName: 'Nina' }) });
    expect((await getWorld('legacy-world')).characterCount).toBe(2);
    const template = await createTemplate(makeDraft());
    const instance = await instantiateTemplate({ templateId: template.id, worldId: 'legacy-world' });
    expect(instance.templateId).toBe(template.id);
    expect((await getWorld('legacy-world')).characterCount).toBe(3);
    // L'ancien personnage reste intact.
    const after = await listCharacters('legacy-world');
    expect(after.characters.find((c) => c.id === 'legacy-char')).toEqual(migrated);
  });
});
