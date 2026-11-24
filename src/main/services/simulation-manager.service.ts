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
  worldLocks.set(worldId, previous.then(() => current));
  await previous;
  try {
    return await fn();
  } finally {
    release();
    if (worldLocks.get(worldId) === current) worldLocks.delete(worldId);
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
  if (activeTickWorlds.has(worldId)) return; // anti double-tick
  activeTickWorlds.add(worldId);
  try {
    const status = await withWorldLock(worldId, async () => {
      const current = await getSimulationStatus(worldId);
      if (!current.clock) return current;
      if (normalizeWorldSimulationStatus(current.worldStatus) !== 'simulation_running' || current.clock.status !== 'running') {
        return current;
      }
      const next = await stepSimulation(worldId);
      return next;
    });
    await syncWorkerForStatus(status);
    broadcastStatus(status);
  } catch (error) {
    logSimulationError(`tick:${worldId}`, error);
    try {
      const status = await getSimulationStatus(worldId);
      await syncWorkerForStatus(status);
      broadcastStatus(status);
    } catch {
      // Ignore secondary failure.
    }
  } finally {
    activeTickWorlds.delete(worldId);
  }
}

export async function simulationGetStatus(worldId: string): Promise<SimulationStatusView> {
  const status = await getSimulationStatus(worldId);
  // Ne démarre pas le worker juste pour une lecture, sauf si simulation déjà active.
  if (status.isActive) await syncWorkerForStatus(status);
  return status;
}

export async function simulationStart(worldId: string, speed?: unknown): Promise<SimulationStatusView> {
  const safeSpeed: SimulationSpeed = isSimulationSpeed(speed) ? speed : 1;
  const status = await withWorldLock(worldId, () => startSimulation(worldId, safeSpeed));
  await syncWorkerForStatus(status);
  broadcastStatus(status);
  return status;
}

export async function simulationPause(worldId: string): Promise<SimulationStatusView> {
  const status = await withWorldLock(worldId, () => pauseSimulation(worldId));
  await syncWorkerForStatus(status);
  broadcastStatus(status);
  return status;
}

export async function simulationResume(worldId: string): Promise<SimulationStatusView> {
  const status = await withWorldLock(worldId, () => resumeSimulation(worldId));
  await syncWorkerForStatus(status);
  broadcastStatus(status);
  return status;
}

export async function simulationStep(worldId: string): Promise<SimulationStatusView> {
  const status = await withWorldLock(worldId, () => stepSimulation(worldId));
  await syncWorkerForStatus(status);
  broadcastStatus(status);
  return status;
}

export async function simulationSetSpeed(worldId: string, speed: unknown): Promise<SimulationStatusView> {
  const status = await withWorldLock(worldId, () => setSimulationSpeed(worldId, speed));
  await syncWorkerForStatus(status);
  broadcastStatus(status);
  return status;
}

export async function simulationStop(worldId: string): Promise<SimulationStatusView> {
  const status = await withWorldLock(worldId, () => stopSimulation(worldId));
  await syncWorkerForStatus(status);
  broadcastStatus(status);
  return status;
}

export async function simulationClearWorld(worldId: string): Promise<void> {
  if (worker) {
    try { postToWorker({ type: 'stop', worldId }); } catch { /* ignore */ }
  }
  activeTickWorlds.delete(worldId);
  worldLocks.delete(worldId);
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