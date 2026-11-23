import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { app } from 'electron';
import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js';
import { randomUUID, randomInt } from 'node:crypto';
import type { Character, CharacterListResult } from '../../shared/character';
import type { CreateWorldInput, WorldListResult, WorldSummary } from '../../shared/world';
import { generateCharactersForWorld } from './character-generator.service';
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
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_opened_at TEXT
    );
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS characters (
      id TEXT PRIMARY KEY,
      world_id TEXT NOT NULL,
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
      FOREIGN KEY (world_id) REFERENCES worlds(id) ON DELETE CASCADE
    );
  `);
  db.run(`CREATE INDEX IF NOT EXISTS idx_characters_world_id ON characters(world_id);`);

  // Migration légère pour les bases Phase 1 existantes sans generation_mode.
  const worldColumns = db.exec("PRAGMA table_info(worlds)");
  const worldNames = new Set((worldColumns[0]?.values ?? []).map((row) => String(row[1])));
  if (!worldNames.has('generation_mode')) {
    db.run("ALTER TABLE worlds ADD COLUMN generation_mode TEXT NOT NULL DEFAULT 'empty'");
  }
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
    })();
  }
  return dbPromise;
}

function rowToWorld(row: Record<string, unknown>): WorldSummary {
  const mode = row.generation_mode === 'random' ? 'random' : 'empty';
  return {
    id: String(row.id),
    name: String(row.name),
    seed: Number(row.seed),
    characterCount: Number(row.character_count),
    generationMode: mode,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    lastOpenedAt: row.last_opened_at == null ? null : String(row.last_opened_at),
  };
}

function rowToCharacter(row: Record<string, unknown>): Character {
  return {
    id: String(row.id),
    worldId: String(row.world_id),
    firstName: String(row.first_name),
    lastName: String(row.last_name),
    age: Number(row.age),
    gender: String(row.gender) as Character['gender'],
    biography: String(row.biography),
    traits: JSON.parse(String(row.traits_json)) as Character['traits'],
    emotions: JSON.parse(String(row.emotions_json)) as Character['emotions'],
    needs: JSON.parse(String(row.needs_json)) as Character['needs'],
    goals: JSON.parse(String(row.goals_json)) as Character['goals'],
    createdAt: String(row.created_at),
  };
}

function insertCharacters(db: Database, characters: Character[]): void {
  const stmt = db.prepare(`
    INSERT INTO characters (
      id, world_id, first_name, last_name, age, gender, biography,
      traits_json, emotions_json, needs_json, goals_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const c of characters) {
    stmt.run([
      c.id,
      c.worldId,
      c.firstName,
      c.lastName,
      c.age,
      c.gender,
      c.biography,
      JSON.stringify(c.traits),
      JSON.stringify(c.emotions),
      JSON.stringify(c.needs),
      JSON.stringify(c.goals),
      c.createdAt,
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
    INSERT INTO worlds (id, name, seed, character_count, generation_mode, created_at, updated_at, last_opened_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run([
    world.id,
    world.name,
    world.seed,
    world.characterCount,
    world.generationMode,
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

export async function listCharacters(worldId: string): Promise<CharacterListResult> {
  if (!worldId || typeof worldId !== 'string') throw new Error('Identifiant de monde invalide.');
  const db = await getDb();
  const stmt = db.prepare('SELECT * FROM characters WHERE world_id = ? ORDER BY last_name ASC, first_name ASC');
  stmt.bind([worldId]);
  const characters: Character[] = [];
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

/** Test/utilitaire : réinitialise le singleton (ferme la DB en mémoire). */
export async function _resetWorldStoreForTests(): Promise<void> {
  if (dbPromise) {
    const db = await dbPromise.catch(() => null);
    db?.close();
  }
  dbPromise = null;
  sqlPromise = null;
}