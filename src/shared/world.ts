/**
 * Types partagés pour les mondes/sauvegardes (Phase 1).
 * Aucun code Node ici.
 */

export type WorldGenerationMode = 'empty' | 'random';
export type WorldStatus = 'preparation' | 'simulation_started';

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