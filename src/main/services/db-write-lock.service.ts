/**
 * Verrou global d'écriture SQLite (Phase 3D-B).
 *
 * Une seule file de promesses module-level sérialise toutes les opérations qui
 * peuvent écrire dans la base sql.js partagée. Le verrou n'est jamais détenu
 * pendant une attente externe (worker, IPC, timer) : les appelants ne doivent
 * envelopper que la section qui touche réellement à SQLite et à `persist()`.
 *
 * L'ordre de verrou obligatoire est : verrou du monde PUIS verrou global.
 */

const DB_WRITE_LOCK_TIMEOUT_MS = 30_000;

export class DbWriteLockTimeoutError extends Error {
  constructor() {
    super(`Timeout après ${DB_WRITE_LOCK_TIMEOUT_MS} ms sur le verrou global SQLite.`);
    this.name = 'DbWriteLockTimeoutError';
  }
}

let queue: Promise<void> = Promise.resolve();

/**
 * Exécute `fn` une fois que toutes les écritures précédentes sont terminées.
 * La file est toujours relâchée, y compris en cas d'erreur ou de timeout.
 */
export async function withDbWrite<T>(fn: () => Promise<T>): Promise<T> {
  const previous = queue;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  // Une erreur précédente ne doit jamais empoisonner la file.
  queue = previous.then(() => gate, () => gate);

  let timer: NodeJS.Timeout | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new DbWriteLockTimeoutError()), DB_WRITE_LOCK_TIMEOUT_MS);
  });

  try {
    await Promise.race([previous.then(() => undefined, () => undefined), timeout]);
    return await fn();
  } finally {
    if (timer) clearTimeout(timer);
    release();
  }
}

/** Test uniquement : remet la file à zéro quand aucun appel n'est en attente. */
export function _resetDbWriteLockForTests(): void {
  queue = Promise.resolve();
}
