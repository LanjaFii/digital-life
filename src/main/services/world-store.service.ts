import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { app } from 'electron';
import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js';
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
import { generateCharactersForWorld } from './character-generator.service';
import { validateCharacterDraft } from './character-validation.service';
import { getWasmPath } from './resource.service';

let sqlPromise: Promise<SqlJsStatic> | null = null;
let dbPromise: Promise<Database> | null = null;

function getDataDir(): string {
  const base = app.isPackaged ? app.getPath('userData') : app.getAppPath();
  const dir = join(base, 'data', 'saves');
  mkdirSync(dir, { recursive: true });
  return dir;
}

function getDbPath(): string {
  return join(getDataDir(), 'worlds.sqlite');
}

async function getSql(): Promise<SqlJsStatic> {
  if (!sqlPromise) {
    sqlPromise = initSqlJs({
      locateFile: () => getWasmPath(),
      useOldExtensionFunctions: false,
    });
  }
  return sqlPromise;
}

function ensureSchema(db: Database): void {
  db.run('PRAGMA foreign_keys = ON;');
  db.run(`
    CREATE TABLE IF NOT EXISTS worlds (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      seed INTEGER NOT NULL,
      character_count INTEGER NOT NULL DEFAULT 0,
      generation_mode TEXT NOT NULL DEFAULT 'empty',
      status TEXT NOT NULL DEFAULT 'preparation',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_opened_at TEXT
    );
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS characters (
      id TEXT PRIMARY KEY,
      world_id TEXT NOT NULL,
      template_id TEXT,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      age INTEGER NOT NULL,
      gender TEXT NOT NULL,
      biography TEXT NOT NULL,
      traits_json TEXT NOT NULL,
      emotions_json TEXT NOT NULL,
      needs_json TEXT NOT NULL,
      goals_json TEXT NOT NULL,
      initial_traits_json TEXT,
      initial_emotions_json TEXT,
      initial_needs_json TEXT,
      initial_goals_json TEXT,
      current_traits_json TEXT,
      current_emotions_json TEXT,
      current_needs_json TEXT,
      current_goals_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (world_id) REFERENCES worlds(id) ON DELETE CASCADE
    );
  `);
  db.run(`CREATE INDEX IF NOT EXISTS idx_characters_world_id ON characters(world_id);`);

  db.run(`
    CREATE TABLE IF NOT EXISTS character_templates (
      id TEXT PRIMARY KEY,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      age INTEGER NOT NULL,
      gender TEXT NOT NULL,
      biography TEXT NOT NULL,
      traits_json TEXT NOT NULL,
      emotions_json TEXT NOT NULL,
      needs_json TEXT NOT NULL,
      goals_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  db.run(`CREATE INDEX IF NOT EXISTS idx_templates_updated_at ON character_templates(updated_at DESC);`);

  db.run(`
    CREATE TABLE IF NOT EXISTS simulation_clock (
      world_id TEXT PRIMARY KEY,
      tick INTEGER NOT NULL DEFAULT 0,
      day INTEGER NOT NULL DEFAULT 1,
      hour INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'paused',
      speed INTEGER NOT NULL DEFAULT 1,
      rng_state INTEGER NOT NULL,
      last_processed_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (world_id) REFERENCES worlds(id) ON DELETE CASCADE
    );
  `);
  db.run(`CREATE INDEX IF NOT EXISTS idx_simulation_clock_status ON simulation_clock(status);`);

  // Migrations additives (bases existantes).
  const worldColumns = db.exec("PRAGMA table_info(worlds)");
  const worldNames = new Set((worldColumns[0]?.values ?? []).map((row) => String(row[1])));
  if (!worldNames.has('generation_mode')) {
    db.run("ALTER TABLE worlds ADD COLUMN generation_mode TEXT NOT NULL DEFAULT 'empty'");
  }
  if (!worldNames.has('status')) {
    db.run("ALTER TABLE worlds ADD COLUMN status TEXT NOT NULL DEFAULT 'preparation'");
  }

  const charColumns = db.exec("PRAGMA table_info(characters)");
  const charNames = new Set((charColumns[0]?.values ?? []).map((row) => String(row[1])));
  const addCharCol = (name: string, ddl: string) => {
    if (!charNames.has(name)) db.run(`ALTER TABLE characters ADD COLUMN ${ddl}`);
  };
  addCharCol('template_id', 'template_id TEXT');
  addCharCol('updated_at', 'updated_at TEXT');
  addCharCol('initial_traits_json', 'initial_traits_json TEXT');
  addCharCol('initial_emotions_json', 'initial_emotions_json TEXT');
  addCharCol('initial_needs_json', 'initial_needs_json TEXT');
  addCharCol('initial_goals_json', 'initial_goals_json TEXT');
  addCharCol('current_traits_json', 'current_traits_json TEXT');
  addCharCol('current_emotions_json', 'current_emotions_json TEXT');
  addCharCol('current_needs_json', 'current_needs_json TEXT');
  addCharCol('current_goals_json', 'current_goals_json TEXT');

  // Backfill instances existantes : initial/current = valeurs existantes.
  db.run(`
    UPDATE characters
    SET
      updated_at = COALESCE(updated_at, created_at),
      initial_traits_json = COALESCE(initial_traits_json, traits_json),
      initial_emotions_json = COALESCE(initial_emotions_json, emotions_json),
      initial_needs_json = COALESCE(initial_needs_json, needs_json),
      initial_goals_json = COALESCE(initial_goals_json, goals_json),
      current_traits_json = COALESCE(current_traits_json, traits_json),
      current_emotions_json = COALESCE(current_emotions_json, emotions_json),
      current_needs_json = COALESCE(current_needs_json, needs_json),
      current_goals_json = COALESCE(current_goals_json, goals_json)
    WHERE
      updated_at IS NULL OR
      initial_traits_json IS NULL OR initial_emotions_json IS NULL OR initial_needs_json IS NULL OR initial_goals_json IS NULL OR
      current_traits_json IS NULL OR current_emotions_json IS NULL OR current_needs_json IS NULL OR current_goals_json IS NULL
  `);

  // Index sur template_id créé après migration additive (bases existantes sans la colonne).
  db.run(`CREATE INDEX IF NOT EXISTS idx_characters_template_id ON characters(template_id);`);
}

function persist(db: Database): void {
  const data = db.export();
  writeFileSync(getDbPath(), Buffer.from(data));
}

async function getDb(): Promise<Database> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const SQL = await getSql();
      const dbPath = getDbPath();
      const db = existsSync(dbPath)
        ? new SQL.Database(new Uint8Array(readFileSync(dbPath)))
        : new SQL.Database();
      ensureSchema(db);
      persist(db);
      return db;
    })().catch((cause) => {
      // Évite de conserver une promesse rejetée : la prochaine ouverture réessaiera.
      dbPromise = null;
      sqlPromise = null;
      throw cause;
    });
  }
  return dbPromise;
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
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
  persist(db);
  return world;
}

export async function getWorld(id: string): Promise<WorldSummary> {
  if (!id || typeof id !== 'string') throw new Error('Identifiant de monde invalide.');
  const db = await getDb();
  const stmt = db.prepare('SELECT * FROM worlds WHERE id = ?');
  stmt.bind([id]);
  const row = stmt.step() ? stmt.getAsObject() : null;
  stmt.free();
  if (!row) throw new Error('Monde introuvable.');

  const now = new Date().toISOString();
  const update = db.prepare('UPDATE worlds SET last_opened_at = ?, updated_at = ? WHERE id = ?');
  update.run([now, now, id]);
  update.free();
  persist(db);

  return { ...rowToWorld(row), lastOpenedAt: now, updatedAt: now };
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
  if (!id || typeof id !== 'string') throw new Error('Identifiant de monde invalide.');
  const db = await getDb();
  const delChars = db.prepare('DELETE FROM characters WHERE world_id = ?');
  delChars.run([id]);
  delChars.free();
  const stmt = db.prepare('DELETE FROM worlds WHERE id = ?');
  stmt.run([id]);
  stmt.free();
  const changes = db.getRowsModified();
  if (changes > 0) persist(db);
  return { deleted: changes > 0 };
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
  const draft = validateCharacterDraft(input);
  const now = new Date().toISOString();
  const template: CharacterTemplate = { id: randomUUID(), ...draft, createdAt: now, updatedAt: now };
  const db = await getDb();
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
  persist(db);
  return template;
}

export async function updateTemplate(input: UpdateTemplateInput): Promise<CharacterTemplate> {
  if (!input || typeof input !== 'object' || typeof (input as UpdateTemplateInput).id !== 'string') {
    throw new Error('Identifiant de modèle invalide.');
  }
  const id = (input as UpdateTemplateInput).id.trim();
  if (!id) throw new Error('Identifiant de modèle invalide.');
  const draft = validateCharacterDraft(input);
  const db = await getDb();
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
  persist(db);
  return { id, ...draft, createdAt, updatedAt: now };
}

export async function deleteTemplate(id: string): Promise<{ deleted: boolean }> {
  if (!id || typeof id !== 'string' || !id.trim()) throw new Error('Identifiant de modèle invalide.');
  const db = await getDb();
  const clearRef = db.prepare('UPDATE characters SET template_id = NULL WHERE template_id = ?');
  clearRef.run([id]);
  clearRef.free();
  const stmt = db.prepare('DELETE FROM character_templates WHERE id = ?');
  stmt.run([id]);
  stmt.free();
  const changes = db.getRowsModified();
  if (changes > 0) persist(db);
  return { deleted: changes > 0 };
}

export async function createCharacterInWorld(input: CreateCharacterInWorldInput): Promise<{ character: CharacterInstance; template?: CharacterTemplate }> {
  if (!input || typeof input !== 'object') throw new Error('Entrée invalide.');
  const worldId = typeof input.worldId === 'string' ? input.worldId.trim() : '';
  if (!worldId) throw new Error('Identifiant de monde invalide.');
  const draft = validateCharacterDraft(input);
  const saveAsTemplate = input.saveAsTemplate === true;
  const db = await getDb();
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
  persist(db);
  return template ? { character, template } : { character };
}

export async function instantiateTemplate(input: InstantiateTemplateInput): Promise<CharacterInstance> {
  if (!input || typeof input !== 'object') throw new Error('Entrée invalide.');
  const templateId = typeof input.templateId === 'string' ? input.templateId.trim() : '';
  const worldId = typeof input.worldId === 'string' ? input.worldId.trim() : '';
  if (!templateId) throw new Error('Identifiant de modèle invalide.');
  if (!worldId) throw new Error('Identifiant de monde invalide.');
  const db = await getDb();
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
  persist(db);
  return character;
}

export async function updateCharacterInstance(input: UpdateCharacterInstanceInput): Promise<CharacterInstance> {
  if (!input || typeof input !== 'object') throw new Error('Entrée invalide.');
  const id = typeof input.id === 'string' ? input.id.trim() : '';
  const worldId = typeof input.worldId === 'string' ? input.worldId.trim() : '';
  if (!id) throw new Error('Identifiant de personnage invalide.');
  if (!worldId) throw new Error('Identifiant de monde invalide.');
  const draft = validateCharacterDraft(input);
  const db = await getDb();
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
  persist(db);

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
}

/**
 * Supprime une seule instance de personnage, exclusivement dans le monde demandé.
 * Valide les identifiants, l'existence du monde, son statut de préparation et
 * l'appartenance réelle du personnage au monde. Le modèle d'origine n'est jamais touché.
 */
export async function deleteCharacterInstance(id: string, worldId: string): Promise<{ deleted: boolean }> {
  const characterId = typeof id === 'string' ? id.trim() : '';
  const targetWorldId = typeof worldId === 'string' ? worldId.trim() : '';
  if (!characterId) throw new Error('Identifiant de personnage invalide.');
  if (!targetWorldId) throw new Error('Identifiant de monde invalide.');

  const db = await getDb();
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
  persist(db);
  return { deleted: true };
}

/** Test/utilitaire : réinitialise le singleton (ferme la DB en mémoire). */
export async function _resetWorldStoreForTests(): Promise<void> {
  if (dbPromise) {
    const db = await dbPromise.catch(() => null);
    db?.close();
  }
  dbPromise = null;
  sqlPromise = null;
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

function upsertClock(db: Database, clock: SimulationClock): void {
  const stmt = db.prepare(`
    INSERT INTO simulation_clock (
      world_id, tick, day, hour, status, speed, rng_state, last_processed_order, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(world_id) DO UPDATE SET
      tick = excluded.tick,
      day = excluded.day,
      hour = excluded.hour,
      status = excluded.status,
      speed = excluded.speed,
      rng_state = excluded.rng_state,
      last_processed_order = excluded.last_processed_order,
      updated_at = excluded.updated_at
  `);
  stmt.run([
    clock.worldId,
    clock.tick,
    clock.day,
    clock.hour,
    clock.status,
    clock.speed,
    clock.rngState >>> 0,
    clock.lastProcessedOrder,
    clock.createdAt,
    clock.updatedAt,
  ]);
  stmt.free();
}

function setWorldStatus(db: Database, worldId: string, status: 'simulation_running' | 'simulation_paused' | 'simulation_stopped', updatedAt: string): void {
  const stmt = db.prepare('UPDATE worlds SET status = ?, updated_at = ? WHERE id = ?');
  stmt.run([status, updatedAt, worldId]);
  stmt.free();
}

export async function recoverSimulationClocksAfterRestart(): Promise<void> {
  const db = await getDb();
  const now = new Date().toISOString();
  const stmt = db.prepare(`SELECT world_id, status, speed, rng_state, tick, day, hour, last_processed_order, created_at, updated_at
    FROM simulation_clock WHERE status = 'running'`);
  const toPause: string[] = [];
  while (stmt.step()) toPause.push(String(stmt.getAsObject().world_id));
  stmt.free();
  if (toPause.length === 0) return;
  db.run('BEGIN TRANSACTION;');
  try {
    for (const worldId of toPause) {
      const row = getSimulationClockRow(db, worldId);
      if (!row) continue;
      const prev = clockRowToClock(row);
      upsertClock(db, { ...prev, status: 'paused', updatedAt: now });
      setWorldStatus(db, worldId, 'simulation_paused', now);
    }
    db.run('COMMIT;');
    persist(db);
  } catch (error) {
    try { db.run('ROLLBACK;'); } catch { /* ignore */ }
    throw error;
  }
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
  db.run('BEGIN TRANSACTION;');
  try {
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
    db.run('COMMIT;');
    persist(db);
    return getSimulationStatus(id);
  } catch (error) {
    try { db.run('ROLLBACK;'); } catch { /* ignore */ }
    throw error;
  }
}

export async function pauseSimulation(worldId: string): Promise<SimulationStatusView> {
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
  db.run('BEGIN TRANSACTION;');
  try {
    upsertClock(db, { ...prev, status: 'paused', updatedAt: now });
    setWorldStatus(db, id, 'simulation_paused', now);
    db.run('COMMIT;');
    persist(db);
    return getSimulationStatus(id);
  } catch (error) {
    try { db.run('ROLLBACK;'); } catch { /* ignore */ }
    throw error;
  }
}

export async function resumeSimulation(worldId: string): Promise<SimulationStatusView> {
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
  db.run('BEGIN TRANSACTION;');
  try {
    upsertClock(db, { ...prev, status: 'running', updatedAt: now });
    setWorldStatus(db, id, 'simulation_running', now);
    db.run('COMMIT;');
    persist(db);
    return getSimulationStatus(id);
  } catch (error) {
    try { db.run('ROLLBACK;'); } catch { /* ignore */ }
    throw error;
  }
}

export async function stopSimulation(worldId: string): Promise<SimulationStatusView> {
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
  db.run('BEGIN TRANSACTION;');
  try {
    upsertClock(db, { ...prev, status: 'stopped', updatedAt: now });
    setWorldStatus(db, id, 'simulation_stopped', now);
    db.run('COMMIT;');
    persist(db);
    return getSimulationStatus(id);
  } catch (error) {
    try { db.run('ROLLBACK;'); } catch { /* ignore */ }
    throw error;
  }
}

export async function setSimulationSpeed(worldId: string, speed: unknown): Promise<SimulationStatusView> {
  const id = assertValidWorldId(worldId);
  const normalizedSpeed = normalizeSpeed(speed);
  const db = await getDb();
  getWorldOrThrow(db, id);
  const clockRow = getSimulationClockRow(db, id);
  if (!clockRow) throw new Error('Aucune horloge de simulation pour ce monde.');
  const prev = clockRowToClock(clockRow);
  const now = new Date().toISOString();
  db.run('BEGIN TRANSACTION;');
  try {
    upsertClock(db, { ...prev, speed: normalizedSpeed, updatedAt: now });
    db.run('COMMIT;');
    persist(db);
    return getSimulationStatus(id);
  } catch (error) {
    try { db.run('ROLLBACK;'); } catch { /* ignore */ }
    throw error;
  }
}

/**
 * Applique exactement un tick. Le tick n'altère aucun personnage pour l'instant
 * (Phase 3A infrastructure) ; il avance uniquement l'horloge de façon atomique.
 */
export async function stepSimulation(worldId: string): Promise<SimulationStatusView> {
  const id = assertValidWorldId(worldId);
  const db = await getDb();
  const world = getWorldOrThrow(db, id);
  const status = normalizeWorldSimulationStatus(world.status);
  const clockRow = getSimulationClockRow(db, id);
  if (!clockRow || (status !== 'simulation_running' && status !== 'simulation_paused')) {
    throw new Error('La simulation doit être démarrée pour exécuter un tick.');
  }
  const prev = clockRowToClock(clockRow);
  const now = new Date().toISOString();
  const nextTick = prev.tick + 1;
  const { day, hour } = deriveDayHour(nextTick);
  db.run('BEGIN TRANSACTION;');
  try {
    upsertClock(db, {
      ...prev,
      tick: nextTick,
      day,
      hour,
      // step en pause conserve la pause ; step en running conserve running
      status: prev.status,
      lastProcessedOrder: 0,
      updatedAt: now,
    });
    // Le statut du monde reste cohérent avec l'horloge.
    setWorldStatus(db, id, prev.status === 'running' ? 'simulation_running' : 'simulation_paused', now);
    db.run('COMMIT;');
    persist(db);
    return getSimulationStatus(id);
  } catch (error) {
    try { db.run('ROLLBACK;'); } catch { /* ignore */ }
    throw error;
  }
}

/** Test/utilitaire : force l'horloge pour des scénarios déterministes. */
export async function _setSimulationClockForTests(worldId: string, clock: Partial<SimulationClock>): Promise<void> {
  const id = assertValidWorldId(worldId);
  const db = await getDb();
  const existing = getSimulationClockRow(db, id);
  if (!existing) throw new Error('Horloge de simulation introuvable.');
  const prev = clockRowToClock(existing);
  const next: SimulationClock = { ...prev, ...clock, worldId: id, updatedAt: new Date().toISOString() };
  const { day, hour } = deriveDayHour(next.tick);
  next.day = day;
  next.hour = hour;
  db.run('BEGIN TRANSACTION;');
  try {
    upsertClock(db, next);
    db.run('COMMIT;');
    persist(db);
  } catch (error) {
    try { db.run('ROLLBACK;'); } catch { /* ignore */ }
    throw error;
  }
}

/** Test : force le statut d'un monde pour vérifier le verrouillage futur. */
export async function _setWorldStatusForTests(
  worldId: string,
  status: 'preparation' | 'simulation_running' | 'simulation_paused' | 'simulation_stopped' | 'simulation_started',
): Promise<void> {
  const db = await getDb();
  const stmt = db.prepare('UPDATE worlds SET status = ? WHERE id = ?');
  stmt.run([normalizeWorldSimulationStatus(status), worldId]);
  stmt.free();
  persist(db);
}