/**
 * Persistance atomique du fichier SQLite (Phase 3D-B).
 *
 * Protocole : fichier temporaire sur le même système de fichiers, vérification
 * octet par octet via SHA-256, `rename` atomique, puis fsync du répertoire quand
 * le runtime le permet. Aucun repli silencieux par copie partielle n'est prévu.
 */

import { createHash } from 'node:crypto';
import {
  closeSync,
  existsSync,
  fsyncSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
  writeSync,
} from 'node:fs';
import { dirname } from 'node:path';

export type PersistenceFailureStage =
  | 'beforeWrite'
  | 'beforeFsync'
  | 'beforeVerify'
  | 'beforeRename'
  | 'afterRename';

export interface PersistenceFailureContext {
  targetPath: string;
  tempPath: string;
  buffer: Uint8Array;
}

export type PersistenceFailureHook = (
  stage: PersistenceFailureStage,
  context: PersistenceFailureContext,
) => void;

let failureHookForTests: PersistenceFailureHook | null = null;

/** Test uniquement : injecte une panne à une étape précise de l'écriture. */
export function _setPersistenceFailureForTests(hook: PersistenceFailureHook | null): void {
  failureHookForTests = hook;
}

export function getPersistenceTempPath(dbPath: string): string {
  return `${dbPath}.tmp`;
}

/** Nettoie un temporaire résiduel d'un arrêt précédent. Jamais le fichier cible. */
export function cleanupStalePersistenceTemp(dbPath: string): void {
  const tempPath = getPersistenceTempPath(dbPath);
  if (!existsSync(tempPath)) return;
  try {
    if (statSync(tempPath).isDirectory()) {
      throw new Error('Le fichier temporaire de persistance est un répertoire.');
    }
    rmSync(tempPath, { force: true });
  } catch (error) {
    throw new Error(
      `Impossible de nettoyer le temporaire de persistance ${tempPath} : ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

export interface AtomicPersistResult {
  committed: boolean;
  targetPath: string;
  /** Erreur de durabilité non fatale après un `rename` déjà réussi. */
  directoryFsyncError?: string;
}

/** Options d'injection technique, utilisées uniquement par les tests. */
export interface AtomicPersistOptions {
  fsync?: (fd: number) => void;
  directoryFsync?: (fd: number) => void;
  platform?: NodeJS.Platform;
}

/** Vue `Buffer` sans copie d'un `Uint8Array` déjà alloué par sql.js. */
function asBuffer(data: Uint8Array): Buffer {
  return Buffer.isBuffer(data)
    ? data
    : Buffer.from(data.buffer, data.byteOffset, data.byteLength);
}

function sha256(data: Uint8Array): string {
  return createHash('sha256').update(asBuffer(data)).digest('hex');
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Écrit `buffer` dans `dbPath` de manière atomique.
 *
 * Une erreur avant `rename` est levée et laisse le fichier cible intact. Après
 * `rename`, la base disque est considérée comme validée : une erreur de fsync du
 * répertoire est journalisée et retournée dans `directoryFsyncError`, jamais
 * transformée en restauration mémoire (qui créerait une divergence inverse).
 */
export function atomicPersist(
  dbPath: string,
  buffer: Uint8Array,
  options: AtomicPersistOptions = {},
): AtomicPersistResult {
  const tempPath = getPersistenceTempPath(dbPath);
  const context: PersistenceFailureContext = { targetPath: dbPath, tempPath, buffer };
  const expectedHash = sha256(buffer);
  const fileFsync = options.fsync ?? fsyncSync;
  const directoryFsync = options.directoryFsync ?? fsyncSync;
  const platform = options.platform ?? process.platform;

  if (existsSync(dbPath) && statSync(dbPath).isDirectory()) {
    throw new Error(`Le chemin de base ${dbPath} est un répertoire.`);
  }
  cleanupStalePersistenceTemp(dbPath);

  let fd: number | null = null;
  try {
    failureHookForTests?.('beforeWrite', context);
    fd = openSync(tempPath, 'wx', 0o600);
    const bytes = asBuffer(buffer);
    let written = 0;
    while (written < bytes.length) {
      written += writeSync(fd, bytes, written, bytes.length - written);
    }
    closeSync(fd);
    fd = null;

    failureHookForTests?.('beforeFsync', context);
    fd = openSync(tempPath, 'r+');
    fileFsync(fd);
    closeSync(fd);
    fd = null;

    failureHookForTests?.('beforeVerify', context);
    const verified = readFileSync(tempPath);
    if (verified.length !== bytes.length || sha256(verified) !== expectedHash) {
      throw new Error('Vérification SHA-256 du fichier temporaire échouée.');
    }

    failureHookForTests?.('beforeRename', context);
    renameSync(tempPath, dbPath);

    let directoryFsyncError: string | undefined;
    try {
      failureHookForTests?.('afterRename', context);
    } catch (error) {
      directoryFsyncError = `Hook post-renommage : ${describe(error)}`;
      console.error(`[DIGITAL LIFE][persistence] ${directoryFsyncError}`);
    }

    if (platform !== 'win32') {
      let dirFd: number | null = null;
      try {
        dirFd = openSync(dirname(dbPath), 'r');
        directoryFsync(dirFd);
        closeSync(dirFd);
        dirFd = null;
      } catch (error) {
        const message = `fsync du répertoire indisponible : ${describe(error)}`;
        console.error(`[DIGITAL LIFE][persistence] ${message}`);
        directoryFsyncError = directoryFsyncError ? `${directoryFsyncError}; ${message}` : message;
      } finally {
        if (dirFd !== null) {
          try { closeSync(dirFd); } catch { /* ignore */ }
        }
      }
    }

    return {
      committed: true,
      targetPath: dbPath,
      ...(directoryFsyncError ? { directoryFsyncError } : {}),
    };
  } catch (error) {
    if (fd !== null) {
      try { closeSync(fd); } catch { /* ignore */ }
    }
    try { rmSync(tempPath, { force: true }); } catch { /* ignore */ }
    throw error;
  }
}
