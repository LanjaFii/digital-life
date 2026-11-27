/**
 * Façade de lecture de l'historique des décisions (Phase 3D-D).
 *
 * Node/main uniquement. Aucune écriture, aucun verrou de simulation, aucun
 * BLOB ni ligne SQLite brute ne franchit cette frontière : les enregistrements
 * sont décompressés et validés par le store, puis projetés en vues légères.
 */
import type { DecisionRecordV1 } from '../../shared/decision';
import {
  validateDecisionHistoryQuery,
  validateDecisionRecordId,
  validateDecisionSummaryView,
  validateDecisionWorldId,
  type DecisionHistoryQuery,
  type DecisionSummaryView,
} from '../../shared/decision-view';
import { getDb } from './database-connection.service';
import { getDecisionRecordForWorld, listDecisionRecords } from './decision-history.store';

/** Projecte un enregistrement validé en résumé affichable, sans charge utile. */
export function toDecisionSummary(record: DecisionRecordV1): DecisionSummaryView {
  return validateDecisionSummaryView({
    id: record.id,
    characterId: record.explanation.characterId,
    characterName: record.characterName,
    tick: record.explanation.tick,
    day: record.explanation.day,
    hour: record.explanation.hour,
    previousActionId: record.previousAction.actionId,
    selectedActionId: record.explanation.selectedActionId,
    selectionRule: record.explanation.selectionRule,
    score: record.score,
    reason: record.explanation.reason,
    warningCount: record.warnings.length,
  });
}

/** Lit une page bornée d'historique et ne renvoie que des résumés validés. */
export async function readDecisionHistory(query: DecisionHistoryQuery): Promise<DecisionSummaryView[]> {
  const valid = validateDecisionHistoryQuery(query);
  const db = await getDb();
  return listDecisionRecords(db, valid).map(toDecisionSummary);
}

/** Lit un enregistrement complet à la demande, dans un monde impérativement spécifié. */
export async function readDecisionRecord(worldId: string, id: string): Promise<DecisionRecordV1> {
  const validWorldId = validateDecisionWorldId(worldId);
  const validId = validateDecisionRecordId(id);
  const db = await getDb();
  return getDecisionRecordForWorld(db, validWorldId, validId);
}
