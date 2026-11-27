import type {
  CharacterInstance,
  CharacterListResult,
  CharacterTemplate,
  CharacterTemplateListResult,
  CreateCharacterInWorldInput,
  CreateTemplateInput,
  InstantiateTemplateInput,
  RandomCharacterDraft,
  UpdateCharacterInstanceInput,
  UpdateTemplateInput,
} from './character';
import type { CreateWorldInput, WorldListResult, WorldSummary } from './world';
import type { SimulationSpeed, SimulationStatusView } from './simulation';
import type { DecisionRecordV1 } from './decision';
import type { DecisionHistoryQuery, DecisionSummaryView } from './decision-view';

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
  WORLD_GET: 'world:get',
  CHARACTER_LIST: 'character:list',
  CHARACTER_CREATE: 'character:create',
  CHARACTER_UPDATE: 'character:update',
  CHARACTER_DELETE: 'character:delete',
  CHARACTER_RANDOM_DRAFT: 'character:random-draft',
  TEMPLATE_LIST: 'template:list',
  TEMPLATE_GET: 'template:get',
  TEMPLATE_CREATE: 'template:create',
  TEMPLATE_UPDATE: 'template:update',
  TEMPLATE_DELETE: 'template:delete',
  TEMPLATE_INSTANTIATE: 'template:instantiate',
  SIMULATION_STATUS: 'simulation:status',
  SIMULATION_START: 'simulation:start',
  SIMULATION_PAUSE: 'simulation:pause',
  SIMULATION_RESUME: 'simulation:resume',
  SIMULATION_STEP: 'simulation:step',
  SIMULATION_SPEED: 'simulation:speed',
  SIMULATION_STOP: 'simulation:stop',
  SIMULATION_STATUS_CHANGED: 'simulation:status-changed',
  DECISION_HISTORY: 'decision:history',
  DECISION_RECORD: 'decision:record',
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
  getWorld(id: string): Promise<WorldSummary>;
  listCharacters(worldId: string): Promise<CharacterListResult>;
  createCharacter(input: CreateCharacterInWorldInput): Promise<{ character: CharacterInstance; template?: CharacterTemplate }>;
  updateCharacter(id: string, worldId: string, input: UpdateCharacterInstanceInput): Promise<CharacterInstance>;
  deleteCharacter(id: string, worldId: string): Promise<{ deleted: boolean }>;
  generateRandomDraft(): Promise<RandomCharacterDraft>;
  listTemplates(): Promise<CharacterTemplateListResult>;
  getTemplate(id: string): Promise<CharacterTemplate>;
  createTemplate(input: CreateTemplateInput): Promise<CharacterTemplate>;
  updateTemplate(input: UpdateTemplateInput): Promise<CharacterTemplate>;
  deleteTemplate(id: string): Promise<{ deleted: boolean }>;
  instantiateTemplate(input: InstantiateTemplateInput): Promise<CharacterInstance>;
  simulationGetStatus(worldId: string): Promise<SimulationStatusView>;
  simulationStart(worldId: string, speed?: SimulationSpeed): Promise<SimulationStatusView>;
  simulationPause(worldId: string): Promise<SimulationStatusView>;
  simulationResume(worldId: string): Promise<SimulationStatusView>;
  simulationStep(worldId: string): Promise<SimulationStatusView>;
  simulationSetSpeed(worldId: string, speed: SimulationSpeed): Promise<SimulationStatusView>;
  simulationStop(worldId: string): Promise<SimulationStatusView>;
  /** Lectures seules de l'historique : aucun canal n'autorise de mutation. */
  getDecisionHistory(query: DecisionHistoryQuery): Promise<DecisionSummaryView[]>;
  getDecisionRecord(worldId: string, id: string): Promise<DecisionRecordV1>;
  onSimulationStatusChanged(callback: (status: SimulationStatusView) => void): () => void;
}
