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
  createCharacter: (input) => ipcRenderer.invoke(IPC_CHANNELS.CHARACTER_CREATE, input),
  updateCharacter: (id, worldId, input) => ipcRenderer.invoke(IPC_CHANNELS.CHARACTER_UPDATE, id, worldId, input),
  deleteCharacter: (id, worldId) => ipcRenderer.invoke(IPC_CHANNELS.CHARACTER_DELETE, id, worldId),
  generateRandomDraft: () => ipcRenderer.invoke(IPC_CHANNELS.CHARACTER_RANDOM_DRAFT),
  listTemplates: () => ipcRenderer.invoke(IPC_CHANNELS.TEMPLATE_LIST),
  getTemplate: (id) => ipcRenderer.invoke(IPC_CHANNELS.TEMPLATE_GET, id),
  createTemplate: (input) => ipcRenderer.invoke(IPC_CHANNELS.TEMPLATE_CREATE, input),
  updateTemplate: (input) => ipcRenderer.invoke(IPC_CHANNELS.TEMPLATE_UPDATE, input),
  deleteTemplate: (id) => ipcRenderer.invoke(IPC_CHANNELS.TEMPLATE_DELETE, id),
  instantiateTemplate: (input) => ipcRenderer.invoke(IPC_CHANNELS.TEMPLATE_INSTANTIATE, input),
  simulationGetStatus: (worldId) => ipcRenderer.invoke(IPC_CHANNELS.SIMULATION_STATUS, worldId),
  simulationStart: (worldId, speed) => ipcRenderer.invoke(IPC_CHANNELS.SIMULATION_START, worldId, speed),
  simulationPause: (worldId) => ipcRenderer.invoke(IPC_CHANNELS.SIMULATION_PAUSE, worldId),
  simulationResume: (worldId) => ipcRenderer.invoke(IPC_CHANNELS.SIMULATION_RESUME, worldId),
  simulationStep: (worldId) => ipcRenderer.invoke(IPC_CHANNELS.SIMULATION_STEP, worldId),
  simulationSetSpeed: (worldId, speed) => ipcRenderer.invoke(IPC_CHANNELS.SIMULATION_SPEED, worldId, speed),
  simulationStop: (worldId) => ipcRenderer.invoke(IPC_CHANNELS.SIMULATION_STOP, worldId),
  onSimulationStatusChanged: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, status: unknown) => {
      callback(status as never);
    };
    ipcRenderer.on(IPC_CHANNELS.SIMULATION_STATUS_CHANGED, listener);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.SIMULATION_STATUS_CHANGED, listener);
  },
};

contextBridge.exposeInMainWorld('digitalLife', api);
