import { ipcMain } from 'electron';
import { randomInt } from 'node:crypto';
import { IPC_CHANNELS } from '../../shared/ipc';
import { generateDraftState } from '../services/character-generator.service';
import { withAllWorldLocks, withWorldMutationLock } from '../services/simulation-manager.service';
import type { CreateCharacterInWorldInput, CreateTemplateInput, InstantiateTemplateInput, UpdateCharacterInstanceInput, UpdateTemplateInput } from '../../shared/character';
import {
  createCharacterInWorld,
  createTemplate,
  deleteCharacterInstance,
  deleteTemplate,
  getTemplate,
  instantiateTemplate,
  listTemplates,
  updateCharacterInstance,
  updateTemplate,
} from '../services/world-store.service';

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Entrée invalide.');
  return value as Record<string, unknown>;
}

/** Extrait et valide l'identifiant de monde avant la prise du verrou. */
function targetWorldId(input: unknown): string {
  const worldId = asObject(input).worldId;
  if (typeof worldId !== 'string' || !worldId.trim()) throw new Error('Identifiant de monde invalide.');
  return worldId.trim();
}

export function registerCharacterIpc(): void {
  ipcMain.handle(IPC_CHANNELS.CHARACTER_CREATE, (_event, input: unknown) => {
    const worldId = targetWorldId(input);
    return withWorldMutationLock(worldId, () =>
      createCharacterInWorld(asObject(input) as unknown as CreateCharacterInWorldInput));
  });

  ipcMain.handle(IPC_CHANNELS.CHARACTER_UPDATE, (_event, id: unknown, worldId: unknown, input: unknown) => {
    if (typeof id !== 'string' || !id.trim()) throw new Error('Identifiant de personnage invalide.');
    if (typeof worldId !== 'string' || !worldId.trim()) throw new Error('Identifiant de monde invalide.');
    const obj = asObject(input) as unknown as UpdateCharacterInstanceInput;
    return withWorldMutationLock(worldId.trim(), () => updateCharacterInstance({ ...obj, id, worldId }));
  });

  ipcMain.handle(IPC_CHANNELS.CHARACTER_DELETE, (_event, id: unknown, worldId: unknown) => {
    if (typeof id !== 'string' || !id.trim()) throw new Error('Identifiant de personnage invalide.');
    if (typeof worldId !== 'string' || !worldId.trim()) throw new Error('Identifiant de monde invalide.');
    return withWorldMutationLock(worldId.trim(), () => deleteCharacterInstance(id, worldId));
  });

  ipcMain.handle(IPC_CHANNELS.CHARACTER_RANDOM_DRAFT, () => generateDraftState(randomInt(0, 2_147_483_647)));

  ipcMain.handle(IPC_CHANNELS.TEMPLATE_LIST, () => listTemplates());

  ipcMain.handle(IPC_CHANNELS.TEMPLATE_GET, (_event, id: unknown) => {
    if (typeof id !== 'string' || !id.trim()) throw new Error('Identifiant de modèle invalide.');
    return getTemplate(id);
  });

  ipcMain.handle(IPC_CHANNELS.TEMPLATE_CREATE, (_event, input: unknown) =>
    createTemplate(asObject(input) as unknown as CreateTemplateInput));

  ipcMain.handle(IPC_CHANNELS.TEMPLATE_UPDATE, (_event, input: unknown) =>
    updateTemplate(asObject(input) as unknown as UpdateTemplateInput));

  ipcMain.handle(IPC_CHANNELS.TEMPLATE_DELETE, (_event, id: unknown) => {
    if (typeof id !== 'string' || !id.trim()) throw new Error('Identifiant de modèle invalide.');
    // La suppression détache les instances de tous les mondes : verrous monde triés.
    return withAllWorldLocks(() => deleteTemplate(id));
  });

  ipcMain.handle(IPC_CHANNELS.TEMPLATE_INSTANTIATE, (_event, input: unknown) => {
    const worldId = targetWorldId(input);
    return withWorldMutationLock(worldId, () =>
      instantiateTemplate(asObject(input) as unknown as InstantiateTemplateInput));
  });
}
