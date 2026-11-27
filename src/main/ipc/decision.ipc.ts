import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipc';
import {
  validateDecisionHistoryQuery,
  validateDecisionRecordId,
  validateDecisionWorldId,
} from '../../shared/decision-view';
import { readDecisionHistory, readDecisionRecord } from '../services/decision-read.service';

/**
 * Canaux de consultation de l'historique : lecture seule, validation stricte
 * des paramètres dans le main, aucune écriture ni commande de simulation.
 */
export function registerDecisionIpc(): void {
  ipcMain.handle(IPC_CHANNELS.DECISION_HISTORY, (_event, query: unknown) =>
    readDecisionHistory(validateDecisionHistoryQuery(query)));
  ipcMain.handle(IPC_CHANNELS.DECISION_RECORD, (_event, worldId: unknown, id: unknown) =>
    readDecisionRecord(validateDecisionWorldId(worldId), validateDecisionRecordId(id)));
}
