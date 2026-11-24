import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipc';
import { isSimulationSpeed } from '../../shared/simulation';
import {
  simulationGetStatus,
  simulationPause,
  simulationResume,
  simulationSetSpeed,
  simulationStart,
  simulationStep,
  simulationStop,
} from '../services/simulation-manager.service';

function asWorldId(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error('Identifiant de monde invalide.');
  return value.trim();
}

export function registerSimulationIpc(): void {
  ipcMain.handle(IPC_CHANNELS.SIMULATION_STATUS, (_event, worldId: unknown) =>
    simulationGetStatus(asWorldId(worldId)));
  ipcMain.handle(IPC_CHANNELS.SIMULATION_START, (_event, worldId: unknown, speed: unknown) =>
    simulationStart(asWorldId(worldId), isSimulationSpeed(speed) ? speed : undefined));
  ipcMain.handle(IPC_CHANNELS.SIMULATION_PAUSE, (_event, worldId: unknown) =>
    simulationPause(asWorldId(worldId)));
  ipcMain.handle(IPC_CHANNELS.SIMULATION_RESUME, (_event, worldId: unknown) =>
    simulationResume(asWorldId(worldId)));
  ipcMain.handle(IPC_CHANNELS.SIMULATION_STEP, (_event, worldId: unknown) =>
    simulationStep(asWorldId(worldId)));
  ipcMain.handle(IPC_CHANNELS.SIMULATION_SPEED, (_event, worldId: unknown, speed: unknown) => {
    if (!isSimulationSpeed(speed)) throw new Error('Vitesse de simulation invalide.');
    return simulationSetSpeed(asWorldId(worldId), speed);
  });
  ipcMain.handle(IPC_CHANNELS.SIMULATION_STOP, (_event, worldId: unknown) =>
    simulationStop(asWorldId(worldId)));
}