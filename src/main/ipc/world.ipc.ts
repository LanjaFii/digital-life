import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipc';
import type { CreateWorldInput } from '../../shared/world';
import { createWorld, deleteWorld, listCharacters, listWorlds } from '../services/world-store.service';

function asCreateInput(value: unknown): CreateWorldInput {
  if (!value || typeof value !== 'object') throw new Error('Entrée de création invalide.');
  const input = value as Record<string, unknown>;
  const mode = input.generationMode === 'random' ? 'random' : input.generationMode === 'empty' ? 'empty' : undefined;
  return {
    name: typeof input.name === 'string' ? input.name : '',
    seed: typeof input.seed === 'number' ? input.seed : undefined,
    characterCount: typeof input.characterCount === 'number' ? input.characterCount : undefined,
    generationMode: mode,
  };
}

/** Enregistre les handlers IPC monde/sauvegarde. */
export function registerWorldIpc(): void {
  ipcMain.handle(IPC_CHANNELS.WORLD_LIST, () => listWorlds());
  ipcMain.handle(IPC_CHANNELS.WORLD_CREATE, (_event, input: unknown) => createWorld(asCreateInput(input)));
  ipcMain.handle(IPC_CHANNELS.WORLD_DELETE, (_event, id: unknown) => {
    if (typeof id !== 'string') throw new Error('Identifiant de monde invalide.');
    return deleteWorld(id);
  });
  ipcMain.handle(IPC_CHANNELS.CHARACTER_LIST, (_event, worldId: unknown) => {
    if (typeof worldId !== 'string' || !worldId.trim()) throw new Error('Identifiant de monde invalide.');
    return listCharacters(worldId);
  });
}