import { parentPort } from 'node:worker_threads';
import {
  SIMULATION_MS_PER_TICK_AT_1X,
  SIMULATION_TICKS_PER_DAY,
  isSimulationSpeed,
  type SimulationSpeed,
} from '../../shared/simulation';

type WorkerCommand =
  | { type: 'configure'; worldId: string; speed: SimulationSpeed; running: boolean }
  | { type: 'setSpeed'; worldId: string; speed: SimulationSpeed }
  | { type: 'start'; worldId: string }
  | { type: 'pause'; worldId: string }
  | { type: 'stop'; worldId: string }
  | { type: 'step'; worldId: string }
  | { type: 'shutdown' };

type WorkerEvent =
  | { type: 'tick'; worldId: string }
  | { type: 'error'; worldId?: string; message: string }
  | { type: 'ready' };

interface WorkerWorldState {
  worldId: string;
  speed: SimulationSpeed;
  running: boolean;
  timer: NodeJS.Timeout | null;
}

const worlds = new Map<string, WorkerWorldState>();

function post(event: WorkerEvent): void {
  parentPort?.postMessage(event);
}

function intervalMs(speed: SimulationSpeed): number {
  return Math.max(1, Math.floor(SIMULATION_MS_PER_TICK_AT_1X / speed));
}

function clearTimer(state: WorkerWorldState): void {
  if (state.timer) {
    clearInterval(state.timer);
    state.timer = null;
  }
}

function schedule(state: WorkerWorldState): void {
  clearTimer(state);
  if (!state.running) return;
  state.timer = setInterval(() => {
    post({ type: 'tick', worldId: state.worldId });
  }, intervalMs(state.speed));
  // Évite de bloquer la terminaison du processus si seul le worker reste actif.
  state.timer.unref?.();
}

function getOrCreate(worldId: string): WorkerWorldState {
  let state = worlds.get(worldId);
  if (!state) {
    state = { worldId, speed: 1, running: false, timer: null };
    worlds.set(worldId, state);
  }
  return state;
}

function validateWorldId(worldId: unknown): string {
  if (typeof worldId !== 'string' || !worldId.trim()) throw new Error('worldId invalide.');
  return worldId;
}

function handleCommand(command: WorkerCommand): void {
  switch (command.type) {
    case 'configure': {
      const worldId = validateWorldId(command.worldId);
      if (!isSimulationSpeed(command.speed)) throw new Error('Vitesse invalide.');
      const state = getOrCreate(worldId);
      state.speed = command.speed;
      state.running = command.running === true;
      schedule(state);
      return;
    }
    case 'start': {
      const state = getOrCreate(validateWorldId(command.worldId));
      state.running = true;
      schedule(state);
      return;
    }
    case 'pause':
    case 'stop': {
      const state = getOrCreate(validateWorldId(command.worldId));
      state.running = false;
      clearTimer(state);
      return;
    }
    case 'setSpeed': {
      const state = getOrCreate(validateWorldId(command.worldId));
      if (!isSimulationSpeed(command.speed)) throw new Error('Vitesse invalide.');
      state.speed = command.speed;
      schedule(state);
      return;
    }
    case 'step': {
      const worldId = validateWorldId(command.worldId);
      // Step = exactement un tick, indépendant du timer.
      post({ type: 'tick', worldId });
      return;
    }
    case 'shutdown': {
      for (const state of worlds.values()) clearTimer(state);
      worlds.clear();
      process.exit(0);
    }
  }
}

parentPort?.on('message', (command: WorkerCommand) => {
  try {
    handleCommand(command);
  } catch (error) {
    post({
      type: 'error',
      worldId: typeof (command as { worldId?: unknown }).worldId === 'string' ? (command as { worldId: string }).worldId : undefined,
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

post({ type: 'ready' });

// Export inutile au runtime, mais garde le fichier comme module TS.
export const SIMULATION_TICKS_PER_DAY_VALUE = SIMULATION_TICKS_PER_DAY;