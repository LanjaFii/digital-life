import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipc';
import { getAppInfo, getDiagnostic } from '../services/app-info.service';

/** Enregistre uniquement les handlers IPC autorisés. */
export function registerAppIpc(): void {
  ipcMain.handle(IPC_CHANNELS.GET_APP_INFO, () => getAppInfo());
  ipcMain.handle(IPC_CHANNELS.GET_DIAGNOSTIC, () => getDiagnostic());
}
