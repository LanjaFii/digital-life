/**
 * Types partagés pour les mondes/sauvegardes (Phase 1).
 * Aucun code Node ici.
 */

export type WorldGenerationMode = 'empty' | 'random';

/**
 * Statut persistant du monde.
 * - preparation : paramètres éditables, simulation non démarrée.
 * - simulation_running : simulation démarrée et active.
 * - simulation_paused : simulation démarrée, suspendue, reprise possible.
 * - simulation_stopped : simulation arrêtée volontairement, données conservées.
 * - simulation_started : alias legacy lu comme simulation_running.
 */
export type WorldStatus =
  | 'preparation'
  | 'simulation_running'
  | 'simulation_paused'
  | 'simulation_stopped'
  | 'simulation_started';

export interface WorldSummary {
  id: string;
  name: string;
  seed: number;
  characterCount: number;
  generationMode: WorldGenerationMode;
  status: WorldStatus;
  createdAt: string;
  updatedAt: string;
  lastOpenedAt: string | null;
}

export interface CreateWorldInput {
  name: string;
  seed?: number;
  characterCount?: number;
  generationMode?: WorldGenerationMode;
}

export interface WorldListResult {
  worlds: WorldSummary[];
}