import { BrowserWindow } from 'electron';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { Worker } from 'node:worker_threads';
import {
  isSimulationSpeed,
  normalizeWorldSimulationStatus,
  type SimulationSpeed,
  type SimulationStatusView,
} from '../../shared/simulation';
import {
  deleteWorld,
  getSimulationStatus,
  pauseSimulation,
  resumeSimulation,
  setSimulationSpeed,
  startSimulation,
  stepSimulation,
  stopSimulation,
} from './world-store.service';

type WorkerOutMessage =
  | { type: 'tick'; worldId: string }
  | { type: 'error'; worldId?: string; message: string }
  | { type: 'ready' };

type WorkerInMessage =
  | { type: 'configure'; worldId: string; speed: SimulationSpeed; running: boolean }
  | { type: 'setSpeed'; worldId: string; speed: SimulationSpeed }
  | { type: 'start'; worldId: string }
  | { type: 'pause'; worldId: string }
  | { type: 'stop'; worldId: string }
  | { type: 'step'; worldId: string }
  | { type: 'shutdown' };

let worker: Worker | null = null;
let workerReadyPromise: Promise<void> | null = null;
let resolveWorkerReady: (() => void) | null = null;
const worldLocks = new Map<string, Promise<void>>();
const activeTickWorlds = new Set<string>();
/** Mondes supprimés : aucun tick tardif ne doit plus s'appliquer après suppression. */
const deletedWorldIds = new Set<string>();
const WORLD_LOCK_TIMEOUT_MS = 30_000;

export class WorldLockTimeoutError extends Error {
  constructor(worldId: string) {
    super(`Timeout après ${WORLD_LOCK_TIMEOUT_MS} ms sur le verrou du monde ${worldId}.`);
    this.name = 'WorldLockTimeoutError';
  }
}

function logSimulationError(context: string, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[DIGITAL LIFE][simulation] ${context}: ${message}`);
}

function workerScriptPath(): string {
  const fromDist = join(process.cwd(), 'dist', 'main', 'simulation', 'simulation.worker.js');
  if (existsSync(fromDist)) return fromDist;
  const fromDir = join(__dirname, '..', 'simulation', 'simulation.worker.js');
  if (existsSync(fromDir)) return fromDir;
  return fromDist;
}

function postToWorker(message: WorkerInMessage): void {
  if (!worker) throw new Error('Worker de simulation indisponible.');
  worker.postMessage(message);
}

async function ensureWorker(): Promise<void> {
  if (worker) {
    await workerReadyPromise;
    return;
  }
  worker = new Worker(workerScriptPath());
  workerReadyPromise = new Promise<void>((resolve) => {
    resolveWorkerReady = resolve;
  });
  worker.on('message', (message: WorkerOutMessage) => {
    if (message.type === 'ready') {
      resolveWorkerReady?.();
      resolveWorkerReady = null;
      return;
    }
    if (message.type === 'error') {
      logSimulationError(`worker${message.worldId ? `:${message.worldId}` : ''}`, message.message);
      return;
    }
    if (message.type === 'tick') {
      void handleTick(message.worldId);
    }
  });
  worker.on('error', (error) => logSimulationError('worker-crash', error));
  worker.on('exit', (code) => {
    if (code !== 0) logSimulationError('worker-exit', `code ${code}`);
    worker = null;
    workerReadyPromise = null;
    resolveWorkerReady = null;
  });
  await workerReadyPromise;
}

async function withWorldLock<T>(worldId: string, fn: () => Promise<T>): Promise<T> {
  const previous = worldLocks.get(worldId) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  // La map doit stocker exactement la promesse comparée dans le `finally` :
  // l'ancien code comparait `current` à `previous.then(() => current)`.
  const chained = previous.then(() => current, () => current);
  worldLocks.set(worldId, chained);

  let timer: NodeJS.Timeout | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new WorldLockTimeoutError(worldId)), WORLD_LOCK_TIMEOUT_MS);
  });

  try {
    await Promise.race([previous.then(() => undefined, () => undefined), timeout]);
    return await fn();
  } finally {
    if (timer) clearTimeout(timer);
    release();
    if (worldLocks.get(worldId) === chained) worldLocks.delete(worldId);
  }
}

function broadcastStatus(status: SimulationStatusView): void {
  try {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send('simulation:status-changed', status);
    }
  } catch {
    // Hors Electron (tests unitaires) : pas de broadcast.
  }
}

async function syncWorkerForStatus(status: SimulationStatusView): Promise<void> {
  await ensureWorker();
  const clock = status.clock;
  if (!clock) {
    postToWorker({ type: 'stop', worldId: status.worldId });
    return;
  }
  const running = normalizeWorldSimulationStatus(status.worldStatus) === 'simulation_running' && clock.status === 'running';
  postToWorker({ type: 'configure', worldId: status.worldId, speed: clock.speed, running });
}

async function handleTick(worldId: string): Promise<void> {
  if (activeTickWorlds.has(worldId) || deletedWorldIds.has(worldId)) return; // anti double-tick
  activeTickWorlds.add(worldId);
  try {
    // Le verrou du monde couvre le tick ET la synchronisation du worker : une
    // suppression ne peut pas s'intercaler entre le COMMIT et le broadcast.
    await withWorldLock(worldId, async () => {
      if (deletedWorldIds.has(worldId)) return;
      const current = await getSimulationStatus(worldId);
      if (!current.clock) return;
      if (normalizeWorldSimulationStatus(current.worldStatus) !== 'simulation_running' || current.clock.status !== 'running') {
        return;
      }
      const next = await stepSimulation(worldId);
      if (deletedWorldIds.has(worldId)) return;
      await syncWorkerForStatus(next);
      broadcastStatus(next);
    });
  } catch (error) {
    logSimulationError(`tick:${worldId}`, error);
    try {
      if (deletedWorldIds.has(worldId)) return;
      await withWorldLock(worldId, async () => {
        const status = await getSimulationStatus(worldId);
        await syncWorkerForStatus(status);
        broadcastStatus(status);
      });
    } catch {
      // Ignore secondary failure.
    }
  } finally {
    activeTickWorlds.delete(worldId);
  }
}

async function withWorldCommandLock(
  worldId: string,
  fn: () => Promise<SimulationStatusView>,
): Promise<SimulationStatusView> {
  return withWorldLock(worldId, async () => {
    if (deletedWorldIds.has(worldId)) throw new Error('Monde supprimé.');
    const status = await fn();
    // La synchronisation reste sous le verrou du monde : aucune suppression ne
    // peut s'intercaler entre la mutation SQLite et la notification de l'UI.
    await syncWorkerForStatus(status);
    broadcastStatus(status);
    return status;
  });
}

export async function simulationGetStatus(worldId: string): Promise<SimulationStatusView> {
  const status = await getSimulationStatus(worldId);
  // Ne démarre pas le worker juste pour une lecture, sauf si simulation déjà active.
  if (status.isActive) await syncWorkerForStatus(status);
  return status;
}

export async function simulationStart(worldId: string, speed?: unknown): Promise<SimulationStatusView> {
  const safeSpeed: SimulationSpeed = isSimulationSpeed(speed) ? speed : 1;
  return withWorldCommandLock(worldId, () => startSimulation(worldId, safeSpeed));
}

export async function simulationPause(worldId: string): Promise<SimulationStatusView> {
  return withWorldCommandLock(worldId, () => pauseSimulation(worldId));
}

export async function simulationResume(worldId: string): Promise<SimulationStatusView> {
  return withWorldCommandLock(worldId, () => resumeSimulation(worldId));
}

export async function simulationStep(worldId: string): Promise<SimulationStatusView> {
  return withWorldCommandLock(worldId, () => stepSimulation(worldId));
}

export async function simulationSetSpeed(worldId: string, speed: unknown): Promise<SimulationStatusView> {
  return withWorldCommandLock(worldId, () => setSimulationSpeed(worldId, speed));
}

export async function simulationStop(worldId: string): Promise<SimulationStatusView> {
  return withWorldCommandLock(worldId, () => stopSimulation(worldId));
}

/**
 * Suppression orchestrée d'un monde. L'ordre des verrous est strict :
 * verrou du monde (attend la fin du tick en cours) puis verrou global SQLite
 * pris par `deleteWorld`. Aucun tick tardif ne peut réécrire le monde supprimé.
 */
export async function simulationDeleteWorld(worldId: string): Promise<{ deleted: boolean }> {
  return withWorldLock(worldId, async () => {
    // Tombeau permanent : les messages de tick déjà en file sont ignorés.
    deletedWorldIds.add(worldId);
    if (worker) {
      try { postToWorker({ type: 'stop', worldId }); } catch { /* ignore */ }
    }
    activeTickWorlds.delete(worldId);
    const result = await deleteWorld(worldId);
    activeTickWorlds.delete(worldId);
    return result;
  });
}

export async function shutdownSimulationManager(): Promise<void> {
  if (worker) {
    try { postToWorker({ type: 'shutdown' }); } catch { /* ignore */ }
    await worker.terminate().catch(() => undefined);
  }
  worker = null;
  workerReadyPromise = null;
  resolveWorkerReady = null;
  activeTickWorlds.clear();
  worldLocks.clear();
}

/** Test uniquement : réinitialise l'état module-level du manager. */
export async function _resetSimulationManagerForTests(): Promise<void> {
  await shutdownSimulationManager();
  deletedWorldIds.clear();
}
