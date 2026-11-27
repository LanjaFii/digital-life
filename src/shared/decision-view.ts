/**
 * Contrats de consultation de l'historique des décisions (Phase 3D-D).
 *
 * Module pur partagé entre le main et le renderer : aucune API Node, aucun
 * accès SQLite. Le main valide systématiquement toute valeur reçue du renderer
 * avant d'ouvrir une requête, puis ne renvoie que des vues typées et bornées.
 */
import {
  assertAllowedKeys,
  assertExactKeys,
  requireFinite,
  requireInteger,
  requireString,
} from './decision-validation';
import type { DecisionRule } from './action';

/** Fenêtre par défaut et plafond absolu d'une requête d'historique. */
export const DECISION_HISTORY_DEFAULT_LIMIT = 50;
export const DECISION_HISTORY_MAX_LIMIT = 500;
/** Décalage maximal : une requête reste toujours bornée, même sans total exact. */
export const DECISION_HISTORY_MAX_OFFSET = 1_000_000;

export const DECISION_HISTORY_QUERY_KEYS = [
  'worldId', 'characterId', 'fromTick', 'toTick', 'limit', 'offset',
] as const;

export const DECISION_SUMMARY_KEYS = [
  'id', 'characterId', 'characterName', 'tick', 'day', 'hour',
  'previousActionId', 'selectedActionId', 'selectionRule', 'score', 'reason',
  'warningCount',
] as const;

/** Paramètres de lecture d'une page d'historique. */
export interface DecisionHistoryQuery {
  worldId: string;
  characterId?: string;
  fromTick?: number;
  toTick?: number;
  limit?: number;
  offset?: number;
}

/** Vue légère affichée dans une liste ; jamais de BLOB ni de charge complète. */
export interface DecisionSummaryView {
  id: string;
  characterId: string;
  characterName: string;
  tick: number;
  day: number;
  hour: number;
  previousActionId: string | null;
  selectedActionId: string;
  selectionRule: DecisionRule;
  score: number;
  reason: string;
  warningCount: number;
}

/** Identifiant de monde obligatoire pour toute lecture de décision. */
export function validateDecisionWorldId(value: unknown): string {
  const worldId = requireString(value, 'worldId', false).trim();
  if (!worldId) throw new Error('Identifiant de monde invalide.');
  return worldId;
}

/** Validation stricte de l'identifiant `${worldId}:${tick}:${characterId}`. */
export function validateDecisionRecordId(value: unknown): string {
  const id = requireString(value, 'id', false).trim();
  const parts = id.split(':');
  if (parts.length !== 3) throw new Error('Identifiant de décision invalide.');
  const [worldId, tickText, characterId] = parts;
  if (!worldId || !characterId || !/^\d+$/.test(tickText)) {
    throw new Error('Identifiant de décision invalide.');
  }
  const tick = Number(tickText);
  if (!Number.isSafeInteger(tick) || tick < 0) throw new Error('Identifiant de décision invalide.');
  return id;
}

/** Valide et normalise une requête de consultation, avant tout accès SQLite. */
export function validateDecisionHistoryQuery(value: unknown): DecisionHistoryQuery {
  const input = assertAllowedKeys(value, 'DecisionHistoryQuery', DECISION_HISTORY_QUERY_KEYS);
  const query: DecisionHistoryQuery = { worldId: validateDecisionWorldId(input.worldId) };

  if (input.characterId !== undefined) {
    const characterId = requireString(input.characterId, 'characterId', false).trim();
    if (!characterId) throw new Error('Identifiant de personnage invalide.');
    query.characterId = characterId;
  }
  if (input.fromTick !== undefined) {
    query.fromTick = requireInteger(input.fromTick, 'fromTick', 0);
  }
  if (input.toTick !== undefined) {
    query.toTick = requireInteger(input.toTick, 'toTick', 0);
  }
  if (query.fromTick !== undefined && query.toTick !== undefined && query.fromTick > query.toTick) {
    throw new Error('La plage de ticks est invalide.');
  }
  query.limit = input.limit === undefined
    ? DECISION_HISTORY_DEFAULT_LIMIT
    : requireInteger(input.limit, 'limit', 1, DECISION_HISTORY_MAX_LIMIT);
  query.offset = input.offset === undefined
    ? 0
    : requireInteger(input.offset, 'offset', 0, DECISION_HISTORY_MAX_OFFSET);
  return query;
}

/** Contrôle de la vue envoyée au renderer, sans lui faire confiance. */
export function validateDecisionSummaryView(value: unknown): DecisionSummaryView {
  const view = assertExactKeys(value, 'DecisionSummaryView', DECISION_SUMMARY_KEYS);
  if (view.previousActionId !== null) requireString(view.previousActionId, 'previousActionId', false);
  return {
    id: requireString(view.id, 'id', false),
    characterId: requireString(view.characterId, 'characterId', false),
    characterName: requireString(view.characterName, 'characterName', false),
    tick: requireInteger(view.tick, 'tick', 0),
    day: requireInteger(view.day, 'day', 1),
    hour: requireInteger(view.hour, 'hour', 0, 23),
    previousActionId: view.previousActionId as string | null,
    selectedActionId: requireString(view.selectedActionId, 'selectedActionId', false),
    selectionRule: requireString(view.selectionRule, 'selectionRule', false) as DecisionRule,
    score: requireFinite(view.score, 'score', -5, 5),
    reason: requireString(view.reason, 'reason'),
    warningCount: requireInteger(view.warningCount, 'warningCount', 0),
  };
}
