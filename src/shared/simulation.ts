/**
 * Contrats partagés pour l'infrastructure de simulation (Phase 3A).
 * Aucun code Node ici. Le renderer ne reçoit que ces vues validées par le main.
 */

export const SIMULATION_SPEEDS = [1, 2, 5, 10] as const;
export type SimulationSpeed = (typeof SIMULATION_SPEEDS)[number];

/** Statut runtime de l'horloge. */
export type SimulationRuntimeStatus = 'running' | 'paused' | 'stopped';

/**
 * Statut du monde côté persistance/UI.
 * - preparation : monde éditable, aucune horloge démarrée.
 * - simulation_running : simulation démarrée, ticks automatiques possibles.
 * - simulation_paused : simulation démarrée mais suspendue, état conservé.
 * - simulation_stopped : simulation arrêtée volontairement ; données conservées,
 *   aucun tick automatique, reprise possible via start/resume selon politique.
 *
 * `simulation_started` est conservé en lecture pour compatibilité legacy
 * (ancienne valeur équivalente à `simulation_running`).
 */
export type WorldSimulationStatus =
  | 'preparation'
  | 'simulation_running'
  | 'simulation_paused'
  | 'simulation_stopped'
  | 'simulation_started';

export const SIMULATION_TICKS_PER_DAY = 24;
export const SIMULATION_HOURS_PER_TICK = 1;
export const SIMULATION_MS_PER_TICK_AT_1X = 60_000;

/** Horloge persistée par monde. Source de vérité = main/SQLite. */
export interface SimulationClock {
  worldId: string;
  tick: number;
  day: number;
  hour: number;
  status: SimulationRuntimeStatus;
  speed: SimulationSpeed;
  /** État exact du PRNG de simulation (uint32 mulberry32). */
  rngState: number;
  /** Dernier ordre traité dans le tick (0 tant qu'aucun traitement métier). */
  lastProcessedOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface SimulationStatusView {
  worldId: string;
  worldStatus: WorldSimulationStatus;
  clock: SimulationClock | null;
  /** true si le worker/timer actif produit des ticks pour ce monde. */
  isActive: boolean;
}

export interface SimulationStartInput {
  worldId: string;
  speed?: SimulationSpeed;
}

export interface SimulationWorldInput {
  worldId: string;
}

export interface SimulationSpeedInput {
  worldId: string;
  speed: SimulationSpeed;
}

export type SimulationCommand =
  | { kind: 'start'; worldId: string; speed?: SimulationSpeed }
  | { kind: 'pause'; worldId: string }
  | { kind: 'resume'; worldId: string }
  | { kind: 'step'; worldId: string }
  | { kind: 'setSpeed'; worldId: string; speed: SimulationSpeed }
  | { kind: 'stop'; worldId: string }
  | { kind: 'getStatus'; worldId: string };

export function isSimulationSpeed(value: unknown): value is SimulationSpeed {
  return value === 1 || value === 2 || value === 5 || value === 10;
}

export function isWorldSimulationStatus(value: unknown): value is WorldSimulationStatus {
  return (
    value === 'preparation' ||
    value === 'simulation_running' ||
    value === 'simulation_paused' ||
    value === 'simulation_stopped' ||
    value === 'simulation_started'
  );
}

export function normalizeWorldSimulationStatus(value: unknown): 'preparation' | 'simulation_running' | 'simulation_paused' | 'simulation_stopped' {
  if (value === 'simulation_started' || value === 'simulation_running') return 'simulation_running';
  if (value === 'simulation_paused') return 'simulation_paused';
  if (value === 'simulation_stopped') return 'simulation_stopped';
  return 'preparation';
}

export function canEditWorldParameters(status: WorldSimulationStatus): boolean {
  return normalizeWorldSimulationStatus(status) === 'preparation';
}