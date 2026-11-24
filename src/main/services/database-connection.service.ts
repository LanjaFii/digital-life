/**
 * Connexion et cycle de vie de la base sql.js (Phase 3D-B).
 *
 * Extrait de `world-store.service.ts` sans changement de comportement métier.
 * Ajoute la restauration mémoire exacte depuis un snapshot `db.export()` et la
 * persistance atomique vérifiée. Aucun CRUD n'est défini ici.
 */

import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { app } from 'electron';
import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js';
import { ensureSchema } from './database-schema.service';
import {
  atomicPersist,
  cleanupStalePersistenceTemp,
} from './persistence.service';
import { getWasmPath } from './resource.service';

let sqlPromise: Promise<SqlJsStatic> | null = null;
let sqlStatic: SqlJsStatic | null = null;
let dbPromise: Promise<Database> | null = null;
let currentDb: Database | null = null;
/** Dernier état écrit sur disque, conservé pour éviter une relecture par mutation. */
let lastPersistedBuffer: Uint8Array | null = null;

export function getDataDir(): string {
  const base = app.isPackaged ? app.getPath('userData') : app.getAppPath();
  const dir = join(base, 'data', 'saves');
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function getDbPath(): string {
  return join(getDataDir(), 'worlds.sqlite');
}

export async function getSql(): Promise<SqlJsStatic> {
  if (!sqlPromise) {
    sqlPromise = initSqlJs({
      locateFile: () => getWasmPath(),
      useOldExtensionFunctions: false,
    }).then((SQL) => {
      sqlStatic = SQL;
      return SQL;
    });
  }
  return sqlPromise;
}

export async function getDb(): Promise<Database> {
  if (!dbPromise) {
    // Un temporaire résiduel n'est jamais importé : il est nettoyé avant toute ouverture.
    cleanupStalePersistenceTemp(getDbPath());
    dbPromise = (async () => {
      const SQL = await getSql();
      const dbPath = getDbPath();
      const db = existsSync(dbPath)
        ? new SQL.Database(new Uint8Array(readFileSync(dbPath)))
        : new SQL.Database();
      currentDb = db;
      try {
        ensureSchema(db);
        const initial = db.export();
        atomicPersist(dbPath, initial);
        lastPersistedBuffer = initial;
        return db;
      } catch (error) {
        try { db.close(); } catch { /* ignore */ }
        currentDb = null;
        throw error;
      }
    })().catch((cause) => {
      // Évite de conserver une promesse rejetée : la prochaine ouverture réessaiera.
      dbPromise = null;
      sqlPromise = null;
      sqlStatic = null;
      currentDb = null;
      lastPersistedBuffer = null;
      throw cause;
    });
  }
  return dbPromise;
}

/**
 * Snapshot indépendant de l'état mémoire, avant toute mutation. sql.js `export()`
 * alloue déjà un `Uint8Array` distinct de la mémoire WASM : aucun second copiage
 * n'est nécessaire.
 */
export function snapshotDatabase(db: Database): Uint8Array {
  return db.export();
}

/**
 * Snapshot du dernier état validé, lu depuis le fichier cible.
 *
 * Le verrou global garantit que mémoire et disque sont synchronisés au début de
 * toute mutation : cette lecture remplace un second `db.export()` coûteux tout
 * en fournissant un snapshot restaurable octet pour octet.
 */
export function snapshotDatabaseFromDisk(): Uint8Array {
  if (lastPersistedBuffer) return lastPersistedBuffer;
  return new Uint8Array(readFileSync(getDbPath()));
}

/**
 * Remplace l'instance sql.js courante par une base reconstruite depuis `buffer`.
 * Le `PRAGMA foreign_keys` est rejoué ; le schéma est déjà contenu dans le
 * snapshot (aucune migration n'est rejouée, ce qui garantit l'égalité octet pour
 * octet avec l'état antérieur).
 */
export function restoreDatabaseFromBuffer(buffer: Uint8Array): void {
  if (!sqlStatic) throw new Error('Restauration impossible : sql.js non initialisé.');
  const previous = currentDb;
  const restored = new sqlStatic.Database(new Uint8Array(buffer));
  restored.run('PRAGMA foreign_keys = ON;');
  currentDb = restored;
  dbPromise = Promise.resolve(restored);
  lastPersistedBuffer = buffer;
  if (previous && previous !== restored) {
    try { previous.close(); } catch { /* ignore */ }
  }
}

/**
 * Persiste l'état courant. Si l'écriture échoue avant le `rename`, l'état mémoire
 * est restauré exactement depuis `before` et l'erreur d'origine est relancée.
 */
export async function persistSnapshotOrRestore(db: Database, before: Uint8Array): Promise<void> {
  try {
    const after = db.export();
    atomicPersist(getDbPath(), after);
    lastPersistedBuffer = after;
  } catch (error) {
    restoreDatabaseFromBuffer(before);
    throw error;
  }
}

/**
 * Exécute une transaction courte, puis persiste de manière atomique. Le
 * `ROLLBACK` couvre les erreurs SQL ; la restauration mémoire couvre les erreurs
 * survenues après `COMMIT` (export ou écriture fichier).
 */
export async function runDbTransaction<T>(
  db: Database,
  before: Uint8Array,
  fn: () => T,
): Promise<T> {
  db.run('BEGIN TRANSACTION;');
  let result: T;
  try {
    result = fn();
    db.run('COMMIT;');
  } catch (error) {
    try {
      db.run('ROLLBACK;');
    } catch {
      restoreDatabaseFromBuffer(before);
    }
    throw error;
  }
  await persistSnapshotOrRestore(db, before);
  return result;
}

/** Test/utilitaire : ferme la base et réinitialise les singletons. */
export async function closeDatabaseForTests(): Promise<void> {
  if (dbPromise) {
    const db = await dbPromise.catch(() => null);
    try { db?.close(); } catch { /* ignore */ }
  }
  dbPromise = null;
  sqlPromise = null;
  sqlStatic = null;
  currentDb = null;
  lastPersistedBuffer = null;
}
