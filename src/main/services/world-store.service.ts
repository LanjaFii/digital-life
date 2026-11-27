import type { Database } from 'sql.js';
import { randomUUID, randomInt } from 'node:crypto';
import type {
  CharacterDraft,
  CharacterInstance,
  CharacterListResult,
  CharacterTemplate,
  CharacterTemplateListResult,
  CreateCharacterInWorldInput,
  CreateTemplateInput,
  InstantiateTemplateInput,
  UpdateCharacterInstanceInput,
  UpdateTemplateInput,
} from '../../shared/character';
import type { CreateWorldInput, WorldListResult, WorldSummary } from '../../shared/world';
import {
  SIMULATION_MS_PER_TICK_AT_1X,
  SIMULATION_SPEEDS,
  SIMULATION_TICKS_PER_DAY,
  isSimulationSpeed,
  normalizeWorldSimulationStatus,
  type SimulationClock,
  type SimulationRuntimeStatus,
  type SimulationSpeed,
  type SimulationStatusView,
} from '../../shared/simulation';
import {
  DEFAULT_CHARACTER_ACTION_RUNTIME_JSON,
  type CharacterActionRuntime,
} from '../../shared/action';
import type { DecisionRecordPayloadV1, DecisionRecordV1 } from '../../shared/decision';
import type {
  CharacterTickInput,
  CharacterTickResult,
  CharacterTickSnapshot,
} from '../../shared/simulation-rules';
import { computeCharacterTick } from './character-tick.service';
import {
  countDecisionRecords,
  ensureDecisionHistorySchema,
  getDecisionRecord,
  getDecisionRecordRows,
  insertDecisionRecords,
  listDecisionRecords,
  type DecisionHistoryReadQuery,
} from './decision-history.store';
import { finalizeDecisionRecord } from './decision-record.service';
import { generateCharactersForWorld } from './character-generator.service';
import { validateCharacterDraft } from './character-validation.service';
import { parseActionRuntime } from './action-runtime.service';
import { DEFAULT_SIMULATION_PARAMETERS } from './simulation-parameters.service';
import {
  assertDecisionRecordsMatchTick,
  buildNextClock,
  buildTickStates,
  setWorldStatus,
  upsertClock,
  writeTickCharacterStates,
  writeTickDecisionHistory,
} from './tick-writer.service';
import { withDbWrite } from './db-write-lock.service';
import {
  closeDatabaseForTests,
  getDb,
  persistSnapshotOrRestore,
  runDbTransaction,
  snapshotDatabase,
  snapshotDatabaseFromDisk,
} from './database-connection.service';
import {
  _setPersistenceFailureForTests as setPersistenceFailureHook,
  type PersistenceFailureHook,
} from './persistence.service';

/**
 * Hook de test : injecte une erreur après l'écriture des personnages mais avant
 * l'écriture de l'horloge, afin de vérifier le rollback atomique du tick.
 * Jamais utilisé en production (aucun appel hors tests).
 */
let tickFailureForTests: (() => void) | null = null;

/**
 * État attendu du tick calculé hors du main. Le verrou du monde garantit qu'aucune
 * écriture ciblant ce monde ne peut survenir entre la préparation et la validation.
 */
export interface TickExpectation {
  worldId: string;
  /** Tick calculé (horloge lue + 1). */
  tick: number;
  day: number;
  hour: number;
  /** uint32 lu avant le calcul, comparé à l'horloge relue avant toute écriture. */
  rngState: number;
}

function rowToWorld(row: Record<string, unknown>): WorldSummary {
  const mode = row.generation_mode === 'random' ? 'random' : 'empty';
  const status = normalizeWorldSimulationStatus(row.status);
  return {
    id: String(row.id),
    name: String(row.name),
    seed: Number(row.seed),
    characterCount: Number(row.character_count),
    generationMode: mode,
    status,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    lastOpenedAt: row.last_opened_at == null ? null : String(row.last_opened_at),
  };
}

function rowToCharacter(row: Record<string, unknown>): CharacterInstance {
  const traits = JSON.parse(String(row.current_traits_json ?? row.traits_json)) as CharacterInstance['currentState']['traits'];
  const emotions = JSON.parse(String(row.current_emotions_json ?? row.emotions_json)) as CharacterInstance['currentState']['emotions'];
  const needs = JSON.parse(String(row.current_needs_json ?? row.needs_json)) as CharacterInstance['currentState']['needs'];
  const goals = JSON.parse(String(row.current_goals_json ?? row.goals_json)) as CharacterInstance['currentState']['goals'];
  const initialTraits = JSON.parse(String(row.initial_traits_json ?? row.traits_json)) as CharacterInstance['initialState']['traits'];
  const initialEmotions = JSON.parse(String(row.initial_emotions_json ?? row.emotions_json)) as CharacterInstance['initialState']['emotions'];
  const initialNeeds = JSON.parse(String(row.initial_needs_json ?? row.needs_json)) as CharacterInstance['initialState']['needs'];
  const initialGoals = JSON.parse(String(row.initial_goals_json ?? row.goals_json)) as CharacterInstance['initialState']['goals'];
  return {
    id: String(row.id),
    worldId: String(row.world_id),
    templateId: row.template_id == null ? null : String(row.template_id),
    firstName: String(row.first_name),
    lastName: String(row.last_name),
    age: Number(row.age),
    gender: String(row.gender) as CharacterInstance['gender'],
    biography: String(row.biography),
    initialState: { traits: initialTraits, emotions: initialEmotions, needs: initialNeeds, goals: initialGoals },
    currentState: { traits, emotions, needs, goals },
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at ?? row.created_at),
  };
}

function insertCharacters(db: Database, characters: CharacterInstance[]): void {
  const stmt = db.prepare(`
    INSERT INTO characters (
      id, world_id, template_id, first_name, last_name, age, gender, biography,
      traits_json, emotions_json, needs_json, goals_json,
      initial_traits_json, initial_emotions_json, initial_needs_json, initial_goals_json,
      current_traits_json, current_emotions_json, current_needs_json, current_goals_json,
      current_action_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const c of characters) {
    stmt.run([
      c.id,
      c.worldId,
      c.templateId ?? null,
      c.firstName,
      c.lastName,
      c.age,
      c.gender,
      c.biography,
      JSON.stringify(c.currentState.traits),
      JSON.stringify(c.currentState.emotions),
      JSON.stringify(c.currentState.needs),
      JSON.stringify(c.currentState.goals),
      JSON.stringify(c.initialState.traits),
      JSON.stringify(c.initialState.emotions),
      JSON.stringify(c.initialState.needs),
      JSON.stringify(c.initialState.goals),
      JSON.stringify(c.currentState.traits),
      JSON.stringify(c.currentState.emotions),
      JSON.stringify(c.currentState.needs),
      JSON.stringify(c.currentState.goals),
      DEFAULT_CHARACTER_ACTION_RUNTIME_JSON,
      c.createdAt,
      c.updatedAt,
    ]);
  }
  stmt.free();
}

export async function listWorlds(): Promise<WorldListResult> {
  const db = await getDb();
  const stmt = db.prepare('SELECT * FROM worlds ORDER BY updated_at DESC, created_at DESC');
  const worlds: WorldSummary[] = [];
  while (stmt.step()) {
    worlds.push(rowToWorld(stmt.getAsObject()));
  }
  stmt.free();
  return { worlds };
}

export async function createWorld(input: CreateWorldInput): Promise<WorldSummary> {
  return withDbWrite(async () => {
    const name = input.name?.trim();
    if (!name) throw new Error('Le nom du monde est obligatoire.');
    if (name.length > 80) throw new Error('Le nom du monde est trop long (80 caractères max).');

    const generationMode = input.generationMode === 'random' ? 'random' : 'empty';
    const rawCount = Number.isFinite(input.characterCount) ? Math.floor(input.characterCount!) : 0;
    const characterCount = generationMode === 'random' ? Math.min(50, Math.max(1, rawCount || 5)) : 0;
    const seed = Number.isFinite(input.seed) ? Math.floor(input.seed!) : randomInt(0, 2_147_483_647);
    const now = new Date().toISOString();
    const world: WorldSummary = {
      id: randomUUID(),
      name,
      seed,
      characterCount,
      generationMode,
      status: 'preparation',
      createdAt: now,
      updatedAt: now,
      lastOpenedAt: null,
    };
    const characters =
      generationMode === 'random' ? generateCharactersForWorld(world.id, world.seed, world.characterCount, now) : [];

    const db = await getDb();
    const before = snapshotDatabaseFromDisk();
    // Défensif : éviter doublons si un appel inattendu cible un monde déjà peuplé.
    const existing = db.prepare('SELECT COUNT(*) AS count FROM characters WHERE world_id = ?');
    existing.bind([world.id]);
    const hasExisting = existing.step() && Number(existing.getAsObject().count) > 0;
    existing.free();
    if (hasExisting) {
      throw new Error('Des personnages existent déjà pour ce monde.');
    }

    const stmt = db.prepare(`
      INSERT INTO worlds (id, name, seed, character_count, generation_mode, status, created_at, updated_at, last_opened_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run([
      world.id,
      world.name,
      world.seed,
      world.characterCount,
      world.generationMode,
      world.status,
      world.createdAt,
      world.updatedAt,
      world.lastOpenedAt,
    ]);
    stmt.free();
    if (characters.length > 0) {
      insertCharacters(db, characters);
    }
    await persistSnapshotOrRestore(db, before);
    return world;
  });
}

export async function getWorld(id: string): Promise<WorldSummary> {
  return withDbWrite(async () => {
    if (!id || typeof id !== 'string') throw new Error('Identifiant de monde invalide.');
    const db = await getDb();
    const before = snapshotDatabaseFromDisk();
    const stmt = db.prepare('SELECT * FROM worlds WHERE id = ?');
    stmt.bind([id]);
    const row = stmt.step() ? stmt.getAsObject() : null;
    stmt.free();
    if (!row) throw new Error('Monde introuvable.');

    const now = new Date().toISOString();
    const update = db.prepare('UPDATE worlds SET last_opened_at = ?, updated_at = ? WHERE id = ?');
    update.run([now, now, id]);
    update.free();
    await persistSnapshotOrRestore(db, before);

    return { ...rowToWorld(row), lastOpenedAt: now, updatedAt: now };
  });
}

export async function listCharacters(worldId: string): Promise<CharacterListResult> {
  if (!worldId || typeof worldId !== 'string') throw new Error('Identifiant de monde invalide.');
  const db = await getDb();
  const stmt = db.prepare('SELECT * FROM characters WHERE world_id = ? ORDER BY last_name ASC, first_name ASC');
  stmt.bind([worldId]);
  const characters: CharacterInstance[] = [];
  while (stmt.step()) {
    characters.push(rowToCharacter(stmt.getAsObject()));
  }
  stmt.free();
  return { characters };
}

export async function deleteWorld(id: string): Promise<{ deleted: boolean }> {
  return withDbWrite(async () => {
    if (!id || typeof id !== 'string') throw new Error('Identifiant de monde invalide.');
    const db = await getDb();
    const before = snapshotDatabaseFromDisk();
    const delChars = db.prepare('DELETE FROM characters WHERE world_id = ?');
    delChars.run([id]);
    delChars.free();
    const stmt = db.prepare('DELETE FROM worlds WHERE id = ?');
    stmt.run([id]);
    stmt.free();
    const changes = db.getRowsModified();
    if (changes > 0) await persistSnapshotOrRestore(db, before);
    return { deleted: changes > 0 };
  });
}

function rowToTemplate(row: Record<string, unknown>): CharacterTemplate {
  return {
    id: String(row.id),
    firstName: String(row.first_name),
    lastName: String(row.last_name),
    age: Number(row.age),
    gender: String(row.gender) as CharacterTemplate['gender'],
    biography: String(row.biography),
    traits: JSON.parse(String(row.traits_json)) as CharacterTemplate['traits'],
    emotions: JSON.parse(String(row.emotions_json)) as CharacterTemplate['emotions'],
    needs: JSON.parse(String(row.needs_json)) as CharacterTemplate['needs'],
    goals: JSON.parse(String(row.goals_json)) as CharacterTemplate['goals'],
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function getWorldRow(db: Database, id: string): Record<string, unknown> | null {
  const stmt = db.prepare('SELECT * FROM worlds WHERE id = ?');
  stmt.bind([id]);
  const row = stmt.step() ? stmt.getAsObject() : null;
  stmt.free();
  return row;
}

export function isWorldPreparationStatus(status: unknown): boolean {
  return normalizeWorldSimulationStatus(status) === 'preparation';
}

function assertWorldPreparation(db: Database, worldId: string): void {
  const row = getWorldRow(db, worldId);
  if (!row) throw new Error('Monde introuvable.');
  if (!isWorldPreparationStatus(row.status)) {
    throw new Error('Les paramètres initiaux sont verrouillés après le démarrage de la simulation.');
  }
}

function syncWorldCharacterCount(db: Database, worldId: string): void {
  const countStmt = db.prepare('SELECT COUNT(*) AS count FROM characters WHERE world_id = ?');
  countStmt.bind([worldId]);
  const count = countStmt.step() ? Number(countStmt.getAsObject().count) : 0;
  countStmt.free();
  const now = new Date().toISOString();
  const upd = db.prepare('UPDATE worlds SET character_count = ?, updated_at = ? WHERE id = ?');
  upd.run([count, now, worldId]);
  upd.free();
}

function buildInstanceFromDraft(
  draft: CharacterDraft,
  worldId: string,
  templateId: string | null,
  now: string,
): CharacterInstance {
  const initialState = {
    traits: { ...draft.traits },
    emotions: { ...draft.emotions },
    needs: { ...draft.needs },
    goals: draft.goals.map((g) => ({ ...g })),
  };
  const currentState = {
    traits: { ...draft.traits },
    emotions: { ...draft.emotions },
    needs: { ...draft.needs },
    goals: draft.goals.map((g) => ({ ...g })),
  };
  return {
    id: randomUUID(),
    worldId,
    templateId,
    firstName: draft.firstName,
    lastName: draft.lastName,
    age: draft.age,
    gender: draft.gender,
    biography: draft.biography,
    initialState,
    currentState,
    createdAt: now,
    updatedAt: now,
  };
}

export async function listTemplates(): Promise<CharacterTemplateListResult> {
  const db = await getDb();
  const stmt = db.prepare('SELECT * FROM character_templates ORDER BY updated_at DESC, created_at DESC');
  const templates: CharacterTemplate[] = [];
  while (stmt.step()) templates.push(rowToTemplate(stmt.getAsObject()));
  stmt.free();
  return { templates };
}

export async function getTemplate(id: string): Promise<CharacterTemplate> {
  if (!id || typeof id !== 'string') throw new Error('Identifiant de modèle invalide.');
  const db = await getDb();
  const stmt = db.prepare('SELECT * FROM character_templates WHERE id = ?');
  stmt.bind([id]);
  const row = stmt.step() ? stmt.getAsObject() : null;
  stmt.free();
  if (!row) throw new Error('Modèle introuvable.');
  return rowToTemplate(row);
}

export async function createTemplate(input: CreateTemplateInput): Promise<CharacterTemplate> {
  return withDbWrite(async () => {
    const draft = validateCharacterDraft(input);
    const now = new Date().toISOString();
    const template: CharacterTemplate = { id: randomUUID(), ...draft, createdAt: now, updatedAt: now };
    const db = await getDb();
    const before = snapshotDatabaseFromDisk();
    const stmt = db.prepare(`
      INSERT INTO character_templates (
        id, first_name, last_name, age, gender, biography,
        traits_json, emotions_json, needs_json, goals_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run([
      template.id, template.firstName, template.lastName, template.age, template.gender, template.biography,
      JSON.stringify(template.traits), JSON.stringify(template.emotions), JSON.stringify(template.needs), JSON.stringify(template.goals),
      template.createdAt, template.updatedAt,
    ]);
    stmt.free();
    await persistSnapshotOrRestore(db, before);
    return template;
  });
}

export async function updateTemplate(input: UpdateTemplateInput): Promise<CharacterTemplate> {
  return withDbWrite(async () => {
    if (!input || typeof input !== 'object' || typeof (input as UpdateTemplateInput).id !== 'string') {
      throw new Error('Identifiant de modèle invalide.');
    }
    const id = (input as UpdateTemplateInput).id.trim();
    if (!id) throw new Error('Identifiant de modèle invalide.');
    const draft = validateCharacterDraft(input);
    const db = await getDb();
    const before = snapshotDatabaseFromDisk();
    const existing = db.prepare('SELECT * FROM character_templates WHERE id = ?');
    existing.bind([id]);
    const row = existing.step() ? existing.getAsObject() : null;
    existing.free();
    if (!row) throw new Error('Modèle introuvable.');
    const createdAt = String(row.created_at);
    const now = new Date().toISOString();
    const stmt = db.prepare(`
      UPDATE character_templates
      SET first_name=?, last_name=?, age=?, gender=?, biography=?,
          traits_json=?, emotions_json=?, needs_json=?, goals_json=?, updated_at=?
      WHERE id = ?
    `);
    stmt.run([
      draft.firstName, draft.lastName, draft.age, draft.gender, draft.biography,
      JSON.stringify(draft.traits), JSON.stringify(draft.emotions), JSON.stringify(draft.needs), JSON.stringify(draft.goals),
      now, id,
    ]);
    stmt.free();
    await persistSnapshotOrRestore(db, before);
    return { id, ...draft, createdAt, updatedAt: now };
  });
}

export async function deleteTemplate(id: string): Promise<{ deleted: boolean }> {
  return withDbWrite(async () => {
    if (!id || typeof id !== 'string' || !id.trim()) throw new Error('Identifiant de modèle invalide.');
    const db = await getDb();
    const before = snapshotDatabaseFromDisk();
    const clearRef = db.prepare('UPDATE characters SET template_id = NULL WHERE template_id = ?');
    clearRef.run([id]);
    clearRef.free();
    const stmt = db.prepare('DELETE FROM character_templates WHERE id = ?');
    stmt.run([id]);
    stmt.free();
    const changes = db.getRowsModified();
    if (changes > 0) await persistSnapshotOrRestore(db, before);
    return { deleted: changes > 0 };
  });
}

export async function createCharacterInWorld(input: CreateCharacterInWorldInput): Promise<{ character: CharacterInstance; template?: CharacterTemplate }> {
  return withDbWrite(async () => {
    if (!input || typeof input !== 'object') throw new Error('Entrée invalide.');
    const worldId = typeof input.worldId === 'string' ? input.worldId.trim() : '';
    if (!worldId) throw new Error('Identifiant de monde invalide.');
    const draft = validateCharacterDraft(input);
    const saveAsTemplate = input.saveAsTemplate === true;
    const db = await getDb();
    const before = snapshotDatabaseFromDisk();
    assertWorldPreparation(db, worldId);

    const now = new Date().toISOString();
    let template: CharacterTemplate | undefined;
    let templateId: string | null = null;
    if (saveAsTemplate) {
      template = { id: randomUUID(), ...draft, createdAt: now, updatedAt: now };
      templateId = template.id;
      const tStmt = db.prepare(`
        INSERT INTO character_templates (
          id, first_name, last_name, age, gender, biography,
          traits_json, emotions_json, needs_json, goals_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      tStmt.run([
        template.id, template.firstName, template.lastName, template.age, template.gender, template.biography,
        JSON.stringify(template.traits), JSON.stringify(template.emotions), JSON.stringify(template.needs), JSON.stringify(template.goals),
        template.createdAt, template.updatedAt,
      ]);
      tStmt.free();
    }

    const character = buildInstanceFromDraft(draft, worldId, templateId, now);
    insertCharacters(db, [character]);
    syncWorldCharacterCount(db, worldId);
    await persistSnapshotOrRestore(db, before);
    return template ? { character, template } : { character };
  });
}

export async function instantiateTemplate(input: InstantiateTemplateInput): Promise<CharacterInstance> {
  return withDbWrite(async () => {
    if (!input || typeof input !== 'object') throw new Error('Entrée invalide.');
    const templateId = typeof input.templateId === 'string' ? input.templateId.trim() : '';
    const worldId = typeof input.worldId === 'string' ? input.worldId.trim() : '';
    if (!templateId) throw new Error('Identifiant de modèle invalide.');
    if (!worldId) throw new Error('Identifiant de monde invalide.');
    const db = await getDb();
    const before = snapshotDatabaseFromDisk();
    assertWorldPreparation(db, worldId);

    const tStmt = db.prepare('SELECT * FROM character_templates WHERE id = ?');
    tStmt.bind([templateId]);
    const row = tStmt.step() ? tStmt.getAsObject() : null;
    tStmt.free();
    if (!row) throw new Error('Modèle introuvable.');
    const template = rowToTemplate(row);

    const now = new Date().toISOString();
    const draft: CharacterDraft = {
      firstName: template.firstName,
      lastName: template.lastName,
      age: template.age,
      gender: template.gender,
      biography: template.biography,
      traits: { ...template.traits },
      emotions: { ...template.emotions },
      needs: { ...template.needs },
      goals: template.goals.map((g) => ({ ...g, id: randomUUID() })),
    };
    const character = buildInstanceFromDraft(draft, worldId, template.id, now);
    insertCharacters(db, [character]);
    syncWorldCharacterCount(db, worldId);
    await persistSnapshotOrRestore(db, before);
    return character;
  });
}

export async function updateCharacterInstance(input: UpdateCharacterInstanceInput): Promise<CharacterInstance> {
  return withDbWrite(async () => {
    if (!input || typeof input !== 'object') throw new Error('Entrée invalide.');
    const id = typeof input.id === 'string' ? input.id.trim() : '';
    const worldId = typeof input.worldId === 'string' ? input.worldId.trim() : '';
    if (!id) throw new Error('Identifiant de personnage invalide.');
    if (!worldId) throw new Error('Identifiant de monde invalide.');
    const draft = validateCharacterDraft(input);
    const db = await getDb();
    const before = snapshotDatabaseFromDisk();
    assertWorldPreparation(db, worldId);

    const existingStmt = db.prepare('SELECT * FROM characters WHERE id = ? AND world_id = ?');
    existingStmt.bind([id, worldId]);
    const row = existingStmt.step() ? existingStmt.getAsObject() : null;
    existingStmt.free();
    if (!row) throw new Error('Personnage introuvable.');

    const now = new Date().toISOString();
    const createdAt = String(row.created_at);
    const templateId = row.template_id == null ? null : String(row.template_id);
    const initialTraitsJson = JSON.stringify(draft.traits);
    const initialEmotionsJson = JSON.stringify(draft.emotions);
    const initialNeedsJson = JSON.stringify(draft.needs);
    const initialGoalsJson = JSON.stringify(draft.goals);
    const currentTraitsJson = initialTraitsJson;
    const currentEmotionsJson = initialEmotionsJson;
    const currentNeedsJson = initialNeedsJson;
    const currentGoalsJson = initialGoalsJson;

    const stmt = db.prepare(`
      UPDATE characters
      SET first_name=?, last_name=?, age=?, gender=?, biography=?,
          traits_json=?, emotions_json=?, needs_json=?, goals_json=?,
          initial_traits_json=?, initial_emotions_json=?, initial_needs_json=?, initial_goals_json=?,
          current_traits_json=?, current_emotions_json=?, current_needs_json=?, current_goals_json=?,
          updated_at=?
      WHERE id = ? AND world_id = ?
    `);
    stmt.run([
      draft.firstName, draft.lastName, draft.age, draft.gender, draft.biography,
      currentTraitsJson, currentEmotionsJson, currentNeedsJson, currentGoalsJson,
      initialTraitsJson, initialEmotionsJson, initialNeedsJson, initialGoalsJson,
      currentTraitsJson, currentEmotionsJson, currentNeedsJson, currentGoalsJson,
      now, id, worldId,
    ]);
    stmt.free();
    await persistSnapshotOrRestore(db, before);

    return {
      id,
      worldId,
      templateId,
      firstName: draft.firstName,
      lastName: draft.lastName,
      age: draft.age,
      gender: draft.gender,
      biography: draft.biography,
      initialState: { traits: { ...draft.traits }, emotions: { ...draft.emotions }, needs: { ...draft.needs }, goals: draft.goals.map((g) => ({ ...g })) },
      currentState: { traits: { ...draft.traits }, emotions: { ...draft.emotions }, needs: { ...draft.needs }, goals: draft.goals.map((g) => ({ ...g })) },
      createdAt,
      updatedAt: now,
    };
  });
}

/**
 * Supprime une seule instance de personnage, exclusivement dans le monde demandé.
 * Valide les identifiants, l'existence du monde, son statut de préparation et
 * l'appartenance réelle du personnage au monde. Le modèle d'origine n'est jamais touché.
 */
export async function deleteCharacterInstance(id: string, worldId: string): Promise<{ deleted: boolean }> {
  return withDbWrite(async () => {
    const characterId = typeof id === 'string' ? id.trim() : '';
    const targetWorldId = typeof worldId === 'string' ? worldId.trim() : '';
    if (!characterId) throw new Error('Identifiant de personnage invalide.');
    if (!targetWorldId) throw new Error('Identifiant de monde invalide.');

    const db = await getDb();
    const before = snapshotDatabaseFromDisk();
    assertWorldPreparation(db, targetWorldId);

    // Vérification d'appartenance avant suppression : un id valide d'un autre monde
    // ne doit jamais permettre de supprimer quoi que ce soit.
    const existing = db.prepare('SELECT id FROM characters WHERE id = ? AND world_id = ?');
    existing.bind([characterId, targetWorldId]);
    const found = existing.step();
    existing.free();
    if (!found) throw new Error('Personnage introuvable dans ce monde.');

    const del = db.prepare('DELETE FROM characters WHERE id = ? AND world_id = ?');
    del.run([characterId, targetWorldId]);
    del.free();
    syncWorldCharacterCount(db, targetWorldId);
    await persistSnapshotOrRestore(db, before);
    return { deleted: true };
  });
}

/** Test/utilitaire : réinitialise le singleton (ferme la DB en mémoire). */
export async function _resetWorldStoreForTests(): Promise<void> {
  tickFailureForTests = null;
  setPersistenceFailureHook(null);
  await closeDatabaseForTests();
}

/** Test : lit les colonnes JSON brutes d'un personnage (audit Phase 3C). */
export async function _getCharacterJsonColumnsForTests(
  worldId: string,
  characterId: string,
): Promise<{ currentActionJson: string | null; currentGoalsJson: string | null }> {
  const db = await getDb();
  const stmt = db.prepare(
    'SELECT current_action_json, current_goals_json FROM characters WHERE id = ? AND world_id = ?',
  );
  stmt.bind([characterId, assertValidWorldId(worldId)]);
  if (!stmt.step()) {
    stmt.free();
    throw new Error('Personnage introuvable dans ce monde.');
  }
  const row = stmt.getAsObject();
  stmt.free();
  return {
    currentActionJson: row.current_action_json === null ? null : String(row.current_action_json),
    currentGoalsJson: row.current_goals_json === null ? null : String(row.current_goals_json),
  };
}

/** Test : injecte un runtime corrompu pour vérifier le rollback complet. */
export async function _setCharacterActionJsonForTests(
  worldId: string,
  characterId: string,
  value: string,
): Promise<void> {
  await withDbWrite(async () => {
      const db = await getDb();
      const before = snapshotDatabaseFromDisk();
      const stmt = db.prepare('UPDATE characters SET current_action_json = ? WHERE id = ? AND world_id = ?');
      stmt.run([value, characterId, assertValidWorldId(worldId)]);
      stmt.free();
      await persistSnapshotOrRestore(db, before);
  });
}

function assertValidWorldId(worldId: string): string {
  const id = typeof worldId === 'string' ? worldId.trim() : '';
  if (!id) throw new Error('Identifiant de monde invalide.');
  return id;
}

function normalizeSpeed(speed: unknown): SimulationSpeed {
  if (!isSimulationSpeed(speed)) throw new Error('Vitesse de simulation invalide.');
  return speed;
}

function clockRowToClock(row: Record<string, unknown>): SimulationClock {
  const tick = Number(row.tick);
  const day = Number(row.day);
  const hour = Number(row.hour);
  const speed = Number(row.speed);
  const rngState = Number(row.rng_state);
  const lastProcessedOrder = Number(row.last_processed_order);
  const statusRaw = String(row.status);
  const status: SimulationRuntimeStatus =
    statusRaw === 'running' ? 'running' : statusRaw === 'stopped' ? 'stopped' : 'paused';
  if (
    !Number.isInteger(tick) || tick < 0 ||
    !Number.isInteger(day) || day < 1 ||
    !Number.isInteger(hour) || hour < 0 || hour > 23 ||
    !isSimulationSpeed(speed) ||
    !Number.isInteger(rngState) || rngState < 0 || rngState > 0xffffffff ||
    !Number.isInteger(lastProcessedOrder) || lastProcessedOrder < 0
  ) {
    throw new Error('Horloge de simulation invalide en base.');
  }
  return {
    worldId: String(row.world_id),
    tick,
    day,
    hour,
    status,
    speed,
    rngState: rngState >>> 0,
    lastProcessedOrder,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function getSimulationClockRow(db: Database, worldId: string): Record<string, unknown> | null {
  const stmt = db.prepare('SELECT * FROM simulation_clock WHERE world_id = ?');
  stmt.bind([worldId]);
  const row = stmt.step() ? stmt.getAsObject() : null;
  stmt.free();
  return row;
}

export async function getSimulationClock(worldId: string): Promise<SimulationClock | null> {
  const id = assertValidWorldId(worldId);
  const db = await getDb();
  const row = getSimulationClockRow(db, id);
  return row ? clockRowToClock(row) : null;
}

function getWorldOrThrow(db: Database, worldId: string): WorldSummary {
  const row = getWorldRow(db, worldId);
  if (!row) throw new Error('Monde introuvable.');
  return rowToWorld(row);
}

function deriveDayHour(tick: number): { day: number; hour: number } {
  return {
    day: Math.floor(tick / SIMULATION_TICKS_PER_DAY) + 1,
    hour: tick % SIMULATION_TICKS_PER_DAY,
  };
}

function simulationSeed(worldSeed: number): number {
  // Sépare le flux de simulation du flux de génération (même seed monde, domaines différents).
  return (Math.trunc(worldSeed) ^ 0x85ebca6b) >>> 0;
}

export async function recoverSimulationClocksAfterRestart(): Promise<void> {
  await withDbWrite(async () => {
      const db = await getDb();
      const now = new Date().toISOString();
      const stmt = db.prepare(`SELECT world_id, status, speed, rng_state, tick, day, hour, last_processed_order, created_at, updated_at
        FROM simulation_clock WHERE status = 'running'`);
      const toPause: string[] = [];
      while (stmt.step()) toPause.push(String(stmt.getAsObject().world_id));
      stmt.free();
      if (toPause.length === 0) return;
      const before = snapshotDatabaseFromDisk();
      await runDbTransaction(db, before, () => {
        for (const worldId of toPause) {
          const row = getSimulationClockRow(db, worldId);
          if (!row) continue;
          const prev = clockRowToClock(row);
          upsertClock(db, { ...prev, status: 'paused', updatedAt: now });
          setWorldStatus(db, worldId, 'simulation_paused', now);
        }
      });
  });
}

export async function getSimulationStatus(worldId: string): Promise<SimulationStatusView> {
  const id = assertValidWorldId(worldId);
  const db = await getDb();
  const world = getWorldOrThrow(db, id);
  const clockRow = getSimulationClockRow(db, id);
  const clock = clockRow ? clockRowToClock(clockRow) : null;
  return {
    worldId: id,
    worldStatus: world.status,
    clock,
    isActive: normalizeWorldSimulationStatus(world.status) === 'simulation_running' && clock?.status === 'running',
  };
}

export async function startSimulation(worldId: string, speed: unknown = 1): Promise<SimulationStatusView> {
  return withDbWrite(async () => {
      const id = assertValidWorldId(worldId);
      const normalizedSpeed = normalizeSpeed(speed);
      const db = await getDb();
      const world = getWorldOrThrow(db, id);
      const status = normalizeWorldSimulationStatus(world.status);
      if (status === 'simulation_running') throw new Error('La simulation est déjà démarrée.');
      if (world.characterCount <= 0) throw new Error('Impossible de démarrer une simulation sans personnage.');
      if (status === 'simulation_stopped') {
        throw new Error('Un monde arrêté ne peut pas être redémarré implicitement ; créez une nouvelle sauvegarde ou une reprise explicite documentée.');
      }

      const existing = getSimulationClockRow(db, id);
      const now = new Date().toISOString();
      const before = snapshotDatabaseFromDisk();
      await runDbTransaction(db, before, () => {
        let clock: SimulationClock;
        if (!existing) {
          if (status !== 'preparation') throw new Error('État de monde incohérent : horloge absente.');
          const rngState = simulationSeed(world.seed);
          clock = {
            worldId: id,
            tick: 0,
            day: 1,
            hour: 0,
            status: 'running',
            speed: normalizedSpeed,
            rngState,
            lastProcessedOrder: 0,
            createdAt: now,
            updatedAt: now,
          };
        } else {
          const prev = clockRowToClock(existing);
          if (status !== 'simulation_paused') throw new Error('Transition de démarrage invalide pour ce monde.');
          clock = { ...prev, status: 'running', speed: normalizedSpeed, updatedAt: now };
        }
        upsertClock(db, clock);
        setWorldStatus(db, id, 'simulation_running', now);
      });
      return getSimulationStatus(id);
  });
}

export async function pauseSimulation(worldId: string): Promise<SimulationStatusView> {
  return withDbWrite(async () => {
      const id = assertValidWorldId(worldId);
      const db = await getDb();
      const world = getWorldOrThrow(db, id);
      const status = normalizeWorldSimulationStatus(world.status);
      const clockRow = getSimulationClockRow(db, id);
      if (status !== 'simulation_running' || !clockRow) {
        throw new Error('Seule une simulation en cours peut être mise en pause.');
      }
      const prev = clockRowToClock(clockRow);
      const now = new Date().toISOString();
      const before = snapshotDatabaseFromDisk();
      await runDbTransaction(db, before, () => {
        upsertClock(db, { ...prev, status: 'paused', updatedAt: now });
        setWorldStatus(db, id, 'simulation_paused', now);
      });
      return getSimulationStatus(id);
  });
}

export async function resumeSimulation(worldId: string): Promise<SimulationStatusView> {
  return withDbWrite(async () => {
      const id = assertValidWorldId(worldId);
      const db = await getDb();
      const world = getWorldOrThrow(db, id);
      const status = normalizeWorldSimulationStatus(world.status);
      const clockRow = getSimulationClockRow(db, id);
      if (status !== 'simulation_paused' || !clockRow) {
        throw new Error('Seule une simulation en pause peut être reprise.');
      }
      const prev = clockRowToClock(clockRow);
      const now = new Date().toISOString();
      const before = snapshotDatabaseFromDisk();
      await runDbTransaction(db, before, () => {
        upsertClock(db, { ...prev, status: 'running', updatedAt: now });
        setWorldStatus(db, id, 'simulation_running', now);
      });
      return getSimulationStatus(id);
  });
}

export async function stopSimulation(worldId: string): Promise<SimulationStatusView> {
  return withDbWrite(async () => {
      const id = assertValidWorldId(worldId);
      const db = await getDb();
      const world = getWorldOrThrow(db, id);
      const status = normalizeWorldSimulationStatus(world.status);
      const clockRow = getSimulationClockRow(db, id);
      if (!clockRow || (status !== 'simulation_running' && status !== 'simulation_paused')) {
        throw new Error('Seule une simulation démarrée peut être arrêtée.');
      }
      const prev = clockRowToClock(clockRow);
      const now = new Date().toISOString();
      const before = snapshotDatabaseFromDisk();
      await runDbTransaction(db, before, () => {
        upsertClock(db, { ...prev, status: 'stopped', updatedAt: now });
        setWorldStatus(db, id, 'simulation_stopped', now);
      });
      return getSimulationStatus(id);
  });
}

export async function setSimulationSpeed(worldId: string, speed: unknown): Promise<SimulationStatusView> {
  return withDbWrite(async () => {
      const id = assertValidWorldId(worldId);
      const normalizedSpeed = normalizeSpeed(speed);
      const db = await getDb();
      getWorldOrThrow(db, id);
      const clockRow = getSimulationClockRow(db, id);
      if (!clockRow) throw new Error('Aucune horloge de simulation pour ce monde.');
      const prev = clockRowToClock(clockRow);
      const now = new Date().toISOString();
      const before = snapshotDatabaseFromDisk();
      await runDbTransaction(db, before, () => {
        upsertClock(db, { ...prev, speed: normalizedSpeed, updatedAt: now });
      });
      return getSimulationStatus(id);
  });
}

/**
 * Charge les personnages et leur runtime d'action dans la transaction courante.
 * Un runtime corrompu lève ici une erreur technique : le tick est rollbacké.
 */
function loadTickSnapshots(
  db: Database,
  worldId: string,
): {
  snapshots: CharacterTickSnapshot[];
  actionRuntimeByCharacter: Record<string, CharacterActionRuntime>;
  characterNameByCharacterId: Record<string, string>;
} {
  const stmt = db.prepare('SELECT * FROM characters WHERE world_id = ? ORDER BY id ASC');
  stmt.bind([worldId]);
  const snapshots: CharacterTickSnapshot[] = [];
  const actionRuntimeByCharacter: Record<string, CharacterActionRuntime> = {};
  const characterNameByCharacterId: Record<string, string> = {};
  while (stmt.step()) {
    const row = stmt.getAsObject();
    const character = rowToCharacter(row);
    actionRuntimeByCharacter[character.id] = parseActionRuntime(row.current_action_json);
    characterNameByCharacterId[character.id] = `${character.firstName} ${character.lastName}`;
    snapshots.push({
      characterId: character.id,
      traits: character.currentState.traits,
      needs: character.currentState.needs,
      emotions: character.currentState.emotions,
      goals: character.currentState.goals,
    });
  }
  stmt.free();
  return { snapshots, actionRuntimeByCharacter, characterNameByCharacterId };
}

/**
 * Écrit un résultat déjà calculé dans la transaction courante. Toutes les
 * validations de cohérence sont effectuées avant la première écriture SQL.
 * Partagé par le chemin direct de référence et par le chemin worker.
 */
function writeCalculatedTick(
  db: Database,
  worldId: string,
  prev: SimulationClock,
  result: CharacterTickResult,
  expected: TickExpectation,
): void {
  const states = buildTickStates(result);
  assertDecisionRecordsMatchTick(result.decisionRecords, states);
  for (const decision of result.decisions) {
    if (decision.worldId !== expected.worldId || decision.tick !== expected.tick ||
        decision.day !== expected.day || decision.hour !== expected.hour) {
      throw new Error('Explication de décision incohérente avec le tick attendu.');
    }
  }

  const now = new Date().toISOString();
  writeTickCharacterStates(db, states, now);
  const inserted = writeTickDecisionHistory(db, result.decisionRecords, now);
  if (inserted !== states.length) {
    throw new Error('Écriture incomplète de l’historique des décisions.');
  }
  if (tickFailureForTests) tickFailureForTests();

  upsertClock(db, buildNextClock(prev, expected.tick, expected.day, expected.hour, result.rngState, now));
  setWorldStatus(db, worldId, prev.status === 'running' ? 'simulation_running' : 'simulation_paused', now);
}

/**
 * Applique exactement un tick : évolution passive, décisions autonomes, effets
 * d'action, runtime et avance de l'horloge dans une seule transaction SQLite et
 * une seule persistance atomique. Chemin de référence Phase 3C, conservé pour
 * les tests de parité : la production utilise désormais le worker via
 * `prepareTickInput()` / `commitTickResult()`.
 */
export async function stepSimulation(worldId: string): Promise<SimulationStatusView> {
  return withDbWrite(async () => {
      const id = assertValidWorldId(worldId);
      const db = await getDb();
      // Validations d'entrée avant ouverture de la transaction (aucune mutation).
      const world = getWorldOrThrow(db, id);
      const status = normalizeWorldSimulationStatus(world.status);
      const preflightClock = getSimulationClockRow(db, id);
      if (!preflightClock || (status !== 'simulation_running' && status !== 'simulation_paused')) {
        throw new Error('La simulation doit être démarrée pour exécuter un tick.');
      }

      // Snapshot avant mutation : restauration mémoire exacte si le disque échoue.
      const before = snapshotDatabaseFromDisk();

      // Protocole : BEGIN avant tout chargement cohérent de l'état du tick.
      await runDbTransaction(db, before, () => {
        const clockRow = getSimulationClockRow(db, id);
        if (!clockRow) throw new Error('Horloge de simulation introuvable pendant le tick.');
        const prev = clockRowToClock(clockRow);
        const { snapshots, actionRuntimeByCharacter, characterNameByCharacterId } = loadTickSnapshots(db, id);
        const nextTick = prev.tick + 1;
        const { day, hour } = deriveDayHour(nextTick);
        const expected: TickExpectation = {
          worldId: id,
          tick: nextTick,
          day,
          hour,
          rngState: prev.rngState >>> 0,
        };

        // Calcul purement mémoire : aucun état n'est modifié avant cette étape.
        const result = computeCharacterTick({
          worldId: id,
          tick: nextTick,
          day,
          hour,
          seed: simulationSeed(world.seed),
          rngState: prev.rngState,
          characters: snapshots,
          params: DEFAULT_SIMULATION_PARAMETERS,
          actionRuntimeByCharacter,
          characterNameByCharacterId,
        });

        writeCalculatedTick(db, id, prev, result, expected);
      });
      return getSimulationStatus(id);
  });
}

/**
 * Prépare une entrée de tick immuable sous le verrou global court. Aucune
 * transaction n'est ouverte et aucune donnée n'est modifiée : le verrou global
 * est relâché dès le retour, avant l'attente du worker de calcul.
 */
export async function prepareTickInput(worldId: string): Promise<{
  expected: TickExpectation;
  input: CharacterTickInput;
}> {
  return withDbWrite(async () => {
    const id = assertValidWorldId(worldId);
    const db = await getDb();
    const world = getWorldOrThrow(db, id);
    const status = normalizeWorldSimulationStatus(world.status);
    const preflightClock = getSimulationClockRow(db, id);
    if (!preflightClock || (status !== 'simulation_running' && status !== 'simulation_paused')) {
      throw new Error('La simulation doit être démarrée pour exécuter un tick.');
    }

    const prev = clockRowToClock(preflightClock);
    const { snapshots, actionRuntimeByCharacter, characterNameByCharacterId } = loadTickSnapshots(db, id);
    const nextTick = prev.tick + 1;
    const { day, hour } = deriveDayHour(nextTick);
    const expected: TickExpectation = {
      worldId: id,
      tick: nextTick,
      day,
      hour,
      rngState: prev.rngState >>> 0,
    };
    const input: CharacterTickInput = {
      worldId: id,
      tick: nextTick,
      day,
      hour,
      seed: simulationSeed(world.seed),
      rngState: prev.rngState >>> 0,
      characters: snapshots,
      params: DEFAULT_SIMULATION_PARAMETERS,
      actionRuntimeByCharacter,
      characterNameByCharacterId,
    };
    return { expected, input };
  });
}

/**
 * Reprend le verrou global, valide que l'horloge n'a pas changé pendant le
 * calcul, puis écrit le résultat dans une transaction courte et une persistance
 * atomique. `before` est exporté ici, après la reprise du verrou : un export
 * pris avant l'attente écraserait les écritures concurrentes des autres mondes.
 */
export async function commitTickResult(
  worldId: string,
  expected: TickExpectation,
  result: CharacterTickResult,
): Promise<SimulationStatusView> {
  return withDbWrite(async () => {
    const id = assertValidWorldId(worldId);
    const db = await getDb();
    const world = getWorldOrThrow(db, id);
    const status = normalizeWorldSimulationStatus(world.status);
    const clockRow = getSimulationClockRow(db, id);
    if (!clockRow || (status !== 'simulation_running' && status !== 'simulation_paused')) {
      throw new Error('La simulation doit être démarrée pour valider un tick.');
    }
    const prev = clockRowToClock(clockRow);
    if (prev.worldId !== expected.worldId || prev.tick + 1 !== expected.tick ||
        (prev.rngState >>> 0) !== (expected.rngState >>> 0)) {
      throw new Error('L’horloge a changé pendant le calcul du tick.');
    }
    if (result.worldId !== expected.worldId || result.tick !== expected.tick) {
      throw new Error('Résultat de tick incohérent avec la requête.');
    }

    const before = snapshotDatabaseFromDisk();
    await runDbTransaction(db, before, () => {
      const currentRow = getSimulationClockRow(db, id);
      if (!currentRow) throw new Error('Horloge de simulation introuvable pendant le tick.');
      const current = clockRowToClock(currentRow);
      if (current.tick + 1 !== expected.tick || (current.rngState >>> 0) !== (expected.rngState >>> 0)) {
        throw new Error('L’horloge a changé pendant la transaction du tick.');
      }
      writeCalculatedTick(db, id, current, result, expected);
    });
    return getSimulationStatus(id);
  });
}

/** Test uniquement : injecte une panne avant l'écriture de l'horloge. */
export function _setTickFailureForTests(hook: (() => void) | null): void {
  tickFailureForTests = hook;
}

/** Test/utilitaire : force l'horloge pour des scénarios déterministes. */
export async function _setSimulationClockForTests(worldId: string, clock: Partial<SimulationClock>): Promise<void> {
  await withDbWrite(async () => {
      const id = assertValidWorldId(worldId);
      const db = await getDb();
      const existing = getSimulationClockRow(db, id);
      if (!existing) throw new Error('Horloge de simulation introuvable.');
      const prev = clockRowToClock(existing);
      const next: SimulationClock = { ...prev, ...clock, worldId: id, updatedAt: new Date().toISOString() };
      const { day, hour } = deriveDayHour(next.tick);
      next.day = day;
      next.hour = hour;
      const before = snapshotDatabaseFromDisk();
      await runDbTransaction(db, before, () => {
        upsertClock(db, next);
      });
  });
}

/** Test : force le statut d'un monde pour vérifier le verrouillage futur. */
export async function _setWorldStatusForTests(
  worldId: string,
  status: 'preparation' | 'simulation_running' | 'simulation_paused' | 'simulation_stopped' | 'simulation_started',
): Promise<void> {
  await withDbWrite(async () => {
      const db = await getDb();
      const before = snapshotDatabaseFromDisk();
      const stmt = db.prepare('UPDATE worlds SET status = ? WHERE id = ?');
      stmt.run([normalizeWorldSimulationStatus(status), worldId]);
      stmt.free();
      await persistSnapshotOrRestore(db, before);
  });
}

/** Test : insère directement une charge utile d'historique. */
export async function _insertDecisionRecordForTests(
  payload: DecisionRecordPayloadV1,
  createdAt = new Date().toISOString(),
): Promise<DecisionRecordV1> {
  return withDbWrite(async () => {
      const db = await getDb();
      const record = finalizeDecisionRecord(payload, createdAt);
      const before = snapshotDatabaseFromDisk();
      await runDbTransaction(db, before, () => {
        insertDecisionRecords(db, [payload], createdAt);
      });
      return record;
  });
}

/** Test : lit les enregistrements décodés et validés. */
export async function _listDecisionRecordsForTests(
  query: DecisionHistoryReadQuery,
): Promise<DecisionRecordV1[]> {
  const db = await getDb();
  return listDecisionRecords(db, query);
}

/** Test : lit un enregistrement par identifiant. */
export async function _getDecisionRecordForTests(id: string): Promise<DecisionRecordV1> {
  const db = await getDb();
  return getDecisionRecord(db, id);
}

/** Test : compte les enregistrements d'un monde, avec filtre optionnel. */
export async function _countDecisionRecordsForTests(worldId: string, characterId?: string): Promise<number> {
  const db = await getDb();
  return countDecisionRecords(db, worldId, characterId);
}

/** Test : lit les colonnes brutes, notamment le BLOB compressé. */
export async function _getDecisionRecordRowsForTests(
  worldId: string,
): Promise<ReturnType<typeof getDecisionRecordRows>> {
  const db = await getDb();
  return getDecisionRecordRows(db, worldId);
}

/** Test uniquement : injecte une panne à une étape de l'écriture atomique. */
export function _setPersistenceFailureForTests(hook: PersistenceFailureHook | null): void {
  setPersistenceFailureHook(hook);
}

/** Test uniquement : exporte l'état mémoire pour comparaison octet pour octet. */
export async function _exportDatabaseForTests(): Promise<Uint8Array> {
  return snapshotDatabase(await getDb());
}
