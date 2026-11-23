import type { CharacterListResult } from './character';
import type { CreateWorldInput, WorldListResult, WorldSummary } from './world';

/**
 * Contrat IPC strict entre le renderer et le processus principal.
 * Ce fichier est partagé (main, preload, renderer) : aucune API Node n'est exposée.
 */
export const IPC_CHANNELS = {
  GET_APP_INFO: 'app:get-info',
  GET_DIAGNOSTIC: 'app:diagnostic',
  WORLD_LIST: 'world:list',
  WORLD_CREATE: 'world:create',
  WORLD_DELETE: 'world:delete',
  CHARACTER_LIST: 'character:list',
} as const;

export interface AppInfo {
  name: string;
  version: string;
  platform: NodeJS.Platform;
  arch: string;
  nodeVersion: string;
  electronVersion: string;
}

export interface DiagnosticCheck {
  name: string;
  ok: boolean;
  detail?: string;
}

export interface DiagnosticResult {
  ok: boolean;
  checks: DiagnosticCheck[];
}

export interface DigitalLifeApi {
  getAppInfo(): Promise<AppInfo>;
  getDiagnostic(): Promise<DiagnosticResult>;
  listWorlds(): Promise<WorldListResult>;
  createWorld(input: CreateWorldInput): Promise<WorldSummary>;
  deleteWorld(id: string): Promise<{ deleted: boolean }>;
  listCharacters(worldId: string): Promise<CharacterListResult>;
}
