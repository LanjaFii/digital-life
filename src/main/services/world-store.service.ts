import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { app } from 'electron';
import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js';
import { randomUUID } from 'node:crypto';
import type { CreateWorldInput, WorldListResult, WorldSummary } from '../../shared/world';
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
  // Migration légère pour les bases Phase 1 existantes sans generation_mode.
  const columns = db.exec("PRAGMA table_info(worlds)");
  const names = new Set((columns[0]?.values ?? []).map((row) => String(row[1])));
  if (!names.has('generation_mode')) {
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
  const seed = Number.isFinite(input.seed) ? Math.floor(input.seed!) : Math.floor(Math.random() * 2_147_483_647);
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
  const db = await getDb();
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
  persist(db);
  return world;
}

export async function deleteWorld(id: string): Promise<{ deleted: boolean }> {
  if (!id || typeof id !== 'string') throw new Error('Identifiant de monde invalide.');
  const db = await getDb();
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