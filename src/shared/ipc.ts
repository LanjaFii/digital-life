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
  CHARACTER_RANDOM_DRAFT: 'character:random-draft',
  TEMPLATE_LIST: 'template:list',
  TEMPLATE_GET: 'template:get',
  TEMPLATE_CREATE: 'template:create',
  TEMPLATE_UPDATE: 'template:update',
  TEMPLATE_DELETE: 'template:delete',
  TEMPLATE_INSTANTIATE: 'template:instantiate',
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
  generateRandomDraft(): Promise<RandomCharacterDraft>;
  listTemplates(): Promise<CharacterTemplateListResult>;
  getTemplate(id: string): Promise<CharacterTemplate>;
  createTemplate(input: CreateTemplateInput): Promise<CharacterTemplate>;
  updateTemplate(input: UpdateTemplateInput): Promise<CharacterTemplate>;
  deleteTemplate(id: string): Promise<{ deleted: boolean }>;
  instantiateTemplate(input: InstantiateTemplateInput): Promise<CharacterInstance>;
}
