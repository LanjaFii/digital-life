import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS, type DigitalLifeApi } from '../shared/ipc';

/**
 * Unique surface exposée au renderer. `contextIsolation` et `sandbox` sont actifs :
 * le renderer ne peut ni exiger Node, ni accéder à ipcRenderer directement.
 */
const api: DigitalLifeApi = {
  getAppInfo: () => ipcRenderer.invoke(IPC_CHANNELS.GET_APP_INFO),
  getDiagnostic: () => ipcRenderer.invoke(IPC_CHANNELS.GET_DIAGNOSTIC),
  listWorlds: () => ipcRenderer.invoke(IPC_CHANNELS.WORLD_LIST),
  createWorld: (input) => ipcRenderer.invoke(IPC_CHANNELS.WORLD_CREATE, input),
  deleteWorld: (id) => ipcRenderer.invoke(IPC_CHANNELS.WORLD_DELETE, id),
  getWorld: (id) => ipcRenderer.invoke(IPC_CHANNELS.WORLD_GET, id),
  listCharacters: (worldId) => ipcRenderer.invoke(IPC_CHANNELS.CHARACTER_LIST, worldId),
};

contextBridge.exposeInMainWorld('digitalLife', api);
