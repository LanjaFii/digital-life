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
  _resetComputeClientForTests,
  cancelComputeForWorld,
  computeCharacterTickInWorker,
  shutdownComputeWorker,
} from '../simulation/tick-compute-client.service';
import {
  commitTickResult,
  deleteWorld,
  getSimulationStatus,
  listWorlds,
  pauseSimulation,
  prepareTickInput,
  resumeSimulation,
  setSimulationSpeed,
  startSimulation,
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

/** Marqueur interne : un tick automatique journalise ses erreurs, un step manuel les propage. */
type TickOrigin = 'auto' | 'manual';

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
      void performTick(message.worldId, 'auto');
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

interface WorldLockHandle {
  worldId: string;
  chained: Promise<void>;
  release: () => void;
  clearTimer: () => void;
}

/** Acquiert un verrou monde. L'attente est bornée ; le relâchement reste toujours possible. */
async function acquireWorldLock(worldId: string): Promise<WorldLockHandle> {
  const previous = worldLocks.get(worldId) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  // La map stocke exactement la promesse comparée lors du relâchement.
  const chained = previous.then(() => current, () => current);
  worldLocks.set(worldId, chained);

  let timer: NodeJS.Timeout | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new WorldLockTimeoutError(worldId)), WORLD_LOCK_TIMEOUT_MS);
  });

  try {
    await Promise.race([previous.then(() => undefined, () => undefined), timeout]);
  } catch (error) {
    release();
    if (worldLocks.get(worldId) === chained) worldLocks.delete(worldId);
    throw error;
  }

  return {
    worldId,
    chained,
    release,
    clearTimer: () => {
      if (timer) clearTimeout(timer);
    },
  };
}

function releaseWorldLock(handle: WorldLockHandle): void {
  handle.clearTimer();
  handle.release();
  if (worldLocks.get(handle.worldId) === handle.chained) worldLocks.delete(handle.worldId);
}

async function withWorldLock<T>(worldId: string, fn: () => Promise<T>): Promise<T> {
  const handle = await acquireWorldLock(worldId);
  try {
    return await fn();
  } finally {
    releaseWorldLock(handle);
  }
}

/** Acquiert plusieurs verrous monde dans un ordre déterministe, puis les relâche en ordre inverse. */
async function withWorldLocks<T>(worldIds: readonly string[], fn: () => Promise<T>): Promise<T> {
  const ids = [...new Set(worldIds)].sort();
  const handles: WorldLockHandle[] = [];
  try {
    for (const worldId of ids) handles.push(await acquireWorldLock(worldId));
    return await fn();
  } finally {
    for (const handle of handles.reverse()) releaseWorldLock(handle);
  }
}

/**
 * Verrou monde pour toute opération IPC modifiant un monde existant, ses
 * personnages ou ses instances. Ordre obligatoire : monde puis global.
 */
export async function withWorldMutationLock<T>(worldId: string, fn: () => Promise<T>): Promise<T> {
  return withWorldLock(worldId, async () => {
    if (deletedWorldIds.has(worldId)) throw new Error('Monde supprimé.');
    return fn();
  });
}

/** Verrou monde global pour une opération touchant des instances dans plusieurs mondes. */
export async function withAllWorldLocks<T>(fn: () => Promise<T>): Promise<T> {
  const { worlds } = await listWorlds();
  return withWorldLocks(worlds.map((world) => world.id), fn);
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

/**
 * Cycle complet d'un tick : snapshot court sous verrou global, calcul asynchrone
 * dans le worker sous verrou monde seul, puis reprise du verrou global pour
 * validation et écriture atomique. Aucun repli synchrone n'est prévu.
 */
async function performTick(worldId: string, origin: TickOrigin): Promise<SimulationStatusView | null> {
  if (origin === 'auto' && (activeTickWorlds.has(worldId) || deletedWorldIds.has(worldId))) return null;
  activeTickWorlds.add(worldId);
  try {
    return await withWorldLock(worldId, async () => {
      if (deletedWorldIds.has(worldId)) {
        if (origin === 'manual') throw new Error('Monde supprimé.');
        return null;
      }
      const current = await getSimulationStatus(worldId);
      if (origin === 'auto') {
        if (!current.clock) return null;
        if (normalizeWorldSimulationStatus(current.worldStatus) !== 'simulation_running' || current.clock.status !== 'running') {
          return null;
        }
      }

      const { expected, input } = await prepareTickInput(worldId);
      const response = await computeCharacterTickInWorker(input);
      if (deletedWorldIds.has(worldId)) {
        if (origin === 'manual') throw new Error('Monde supprimé.');
        return null;
      }
      if (response.worldId !== expected.worldId || response.tick !== expected.tick) {
        throw new Error('Réponse du worker de calcul incohérente avec le tick attendu.');
      }

      const next = await commitTickResult(worldId, expected, response.result);
      if (deletedWorldIds.has(worldId)) {
        if (origin === 'manual') throw new Error('Monde supprimé.');
        return null;
      }
      await syncWorkerForStatus(next);
      broadcastStatus(next);
      return next;
    });
  } catch (error) {
    if (origin === 'manual') throw error;
    // Erreur automatique : journalisation seule, aucun état écrit ni statut diffusé.
    logSimulationError(`tick:${worldId}`, error);
    return null;
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
  // Ne démarre pas le worker de calcul juste pour une lecture (arbitrage P7).
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
  const next = await performTick(worldId, 'manual');
  if (!next) throw new Error('Tick non appliqué.');
  return next;
}

export async function simulationSetSpeed(worldId: string, speed: unknown): Promise<SimulationStatusView> {
  return withWorldCommandLock(worldId, () => setSimulationSpeed(worldId, speed));
}

export async function simulationStop(worldId: string): Promise<SimulationStatusView> {
  return withWorldCommandLock(worldId, () => stopSimulation(worldId));
}

/**
 * Suppression orchestrée d'un monde (arbitrage P5). Le tombeau et l'annulation
 * des calculs pendants précèdent toute attente de verrou, afin qu'un timeout du
 * verrou monde ne puisse jamais laisser une écriture tardive s'appliquer.
 */
export async function simulationDeleteWorld(worldId: string): Promise<{ deleted: boolean }> {
  deletedWorldIds.add(worldId);
  cancelComputeForWorld(worldId);
  return withWorldLock(worldId, async () => {
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
  await shutdownComputeWorker();
  activeTickWorlds.clear();
  worldLocks.clear();
}

/** Test uniquement : réinitialise l'état module-level du manager. */
export async function _resetSimulationManagerForTests(): Promise<void> {
  await shutdownSimulationManager();
  await _resetComputeClientForTests();
  deletedWorldIds.clear();
}

/** Test uniquement : état observable des verrous et du tombeau. */
export function _managerStateForTests(): {
  deletedWorldIds: string[];
  activeTickWorlds: string[];
  worldLocks: string[];
} {
  return {
    deletedWorldIds: [...deletedWorldIds],
    activeTickWorlds: [...activeTickWorlds],
    worldLocks: [...worldLocks.keys()],
  };
}
