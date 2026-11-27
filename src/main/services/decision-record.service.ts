/**
 * Contrôle d'intégrité, sérialisation et validation stricte des décisions (3D-A).
 *
 * Service Node-only : il utilise `node:crypto` et `node:zlib`, mais jamais
 * SQLite ni Electron. Le calcul du tick produit une charge utile déterministe ;
 * ce module ajoute les métadonnées d'intégrité et fournit les fonctions de
 * vérification utilisées à l'écriture comme à la lecture.
 *
 * Les définitions pures (canonicalisation, collecte des règles, validation des
 * charges utiles) vivent désormais dans `src/shared/` et sont réexportées ici
 * pour préserver les contrats existants.
 */
import { createHash } from 'node:crypto';
import { deflateSync, inflateSync } from 'node:zlib';
import { canonicalize, collectRuleIds } from '../../shared/canonicalization';
import type { DecisionRecordPayloadV1, DecisionRecordV1 } from '../../shared/decision';
import {
  assertExactKeys,
  DECISION_BLOB_MAX_BYTES,
  DECISION_PAYLOAD_MAX_BYTES,
  DECISION_RECORD_KEYS,
  requireInteger,
  requireString,
  validateDecisionRecordPayload,
} from '../../shared/decision-validation';

export { canonicalize, collectRuleIds } from '../../shared/canonicalization';
export {
  DECISION_BLOB_MAX_BYTES,
  DECISION_PAYLOAD_MAX_BYTES,
  validateDecisionRecordPayload,
} from '../../shared/decision-validation';

export interface DecisionRecordRow {
  id: string;
  world_id: string;
  character_id: string;
  tick: number;
  day: number;
  hour: number;
  record_version: number;
  engine_version: string;
  registry_version: number;
  parameters_version: number;
  character_name: string;
  previous_action_id: string | null;
  selected_action_id: string;
  selection_rule: string;
  score: number;
  reason: string;
  rng_state_before: number;
  rng_state_after: number;
  rng_draws: number;
  warnings_json: string;
  state_before_json: string;
  state_after_json: string;
  deltas_json: string;
  payload_blob: Uint8Array;
  payload_sha256: string;
  uncompressed_bytes: number;
  created_at: string;
}

export function canonicalDecisionPayload(payload: DecisionRecordPayloadV1): string {
  return canonicalize(payload);
}

export function canonicalDecisionRecord(record: DecisionRecordV1): string {
  return canonicalize(record);
}

function payloadFromRecord(record: DecisionRecordV1): DecisionRecordPayloadV1 {
  const { payloadSha256: _hash, uncompressedBytes: _bytes, createdAt: _createdAt, ...payload } = record;
  return payload as DecisionRecordPayloadV1;
}

function integrityFor(payload: DecisionRecordPayloadV1): { payloadSha256: string; uncompressedBytes: number } {
  const canonical = canonicalDecisionPayload(payload);
  return {
    payloadSha256: createHash('sha256').update(canonical, 'utf8').digest('hex'),
    uncompressedBytes: Buffer.byteLength(canonical, 'utf8'),
  };
}

function parseIsoDate(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
    throw new Error(`${label} invalide : horodatage ISO attendu.`);
  }
  if (Number.isNaN(Date.parse(value))) throw new Error(`${label} invalide : date non valide.`);
  return value;
}

export function validateDecisionRecord(value: unknown): DecisionRecordV1 {
  const record = assertExactKeys(value, 'DecisionRecordV1', DECISION_RECORD_KEYS);
  const payload = validateDecisionRecordPayload(payloadFromRecord(value as DecisionRecordV1));
  if (!/^[a-f0-9]{64}$/.test(requireString(record.payloadSha256, 'payloadSha256'))) {
    throw new Error('payloadSha256 invalide.');
  }
  requireInteger(record.uncompressedBytes, 'uncompressedBytes', 0, DECISION_PAYLOAD_MAX_BYTES);
  parseIsoDate(record.createdAt, 'createdAt');

  const integrity = integrityFor(payload);
  if (record.payloadSha256 !== integrity.payloadSha256) throw new Error('Hash de charge utile invalide.');
  if (record.uncompressedBytes !== integrity.uncompressedBytes) throw new Error('Taille de charge utile invalide.');
  return value as DecisionRecordV1;
}

/** Ajoute les métadonnées d'intégrité déterministes et l'horodatage du store. */
export function finalizeDecisionRecord(
  payload: DecisionRecordPayloadV1,
  createdAt: string,
): DecisionRecordV1 {
  const validPayload = validateDecisionRecordPayload(payload);
  const timestamp = parseIsoDate(createdAt, 'createdAt');
  const record: DecisionRecordV1 = {
    ...validPayload,
    ...integrityFor(validPayload),
    createdAt: timestamp,
  };
  return validateDecisionRecord(record);
}

/** Prépare une ligne SQLite ; le BLOB est la représentation compressée du complet. */
export function serializeDecisionRecord(record: DecisionRecordV1): DecisionRecordRow {
  const valid = validateDecisionRecord(record);
  const explanation = valid.explanation;
  const raw = Buffer.from(canonicalDecisionRecord(valid), 'utf8');
  if (raw.length > DECISION_PAYLOAD_MAX_BYTES) throw new Error('JSON d’enregistrement trop volumineux.');
  const blob = deflateSync(raw);
  if (blob.length > DECISION_BLOB_MAX_BYTES) throw new Error('BLOB d’enregistrement trop volumineux.');
  return {
    id: valid.id,
    world_id: explanation.worldId,
    character_id: explanation.characterId,
    tick: explanation.tick,
    day: explanation.day,
    hour: explanation.hour,
    record_version: valid.recordVersion,
    engine_version: valid.engineVersion,
    registry_version: valid.registryVersion,
    parameters_version: valid.parametersVersion,
    character_name: valid.characterName,
    previous_action_id: valid.previousAction.actionId,
    selected_action_id: explanation.selectedActionId,
    selection_rule: explanation.selectionRule,
    score: valid.score,
    reason: explanation.reason,
    rng_state_before: explanation.rngStateBefore,
    rng_state_after: explanation.rngStateAfter,
    rng_draws: explanation.rngDraws,
    warnings_json: canonicalize(valid.warnings),
    state_before_json: canonicalize(valid.stateBefore),
    state_after_json: canonicalize(valid.stateAfter),
    deltas_json: canonicalize({
      passiveDeltas: valid.passiveDeltas,
      actionDeltas: valid.actionDeltas,
      appliedDeltas: valid.appliedDeltas,
    }),
    payload_blob: new Uint8Array(blob),
    payload_sha256: valid.payloadSha256,
    uncompressed_bytes: valid.uncompressedBytes,
    created_at: valid.createdAt,
  };
}

/** Relit un BLOB SQLite avec toutes les vérifications d'intégrité. */
export function deserializeDecisionRecord(row: DecisionRecordRow): DecisionRecordV1 {
  if (!(row.payload_blob instanceof Uint8Array)) throw new Error('BLOB d’enregistrement invalide.');
  if (row.payload_blob.length > DECISION_BLOB_MAX_BYTES) throw new Error('BLOB d’enregistrement trop volumineux.');
  let raw: Buffer;
  try {
    raw = inflateSync(Buffer.from(row.payload_blob));
  } catch {
    // D6 : une corruption deflate reste une erreur technique métier homogène.
    throw new Error('BLOB d’enregistrement corrompu.');
  }
  if (raw.length > DECISION_PAYLOAD_MAX_BYTES) throw new Error('JSON d’enregistrement trop volumineux.');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.toString('utf8')) as unknown;
  } catch {
    throw new Error('JSON d’enregistrement corrompu.');
  }
  const record = validateDecisionRecord(parsed);
  const explanation = record.explanation;

  const checks: Array<[unknown, unknown, string]> = [
    [row.id, record.id, 'id'],
    [row.world_id, explanation.worldId, 'world_id'],
    [row.character_id, explanation.characterId, 'character_id'],
    [row.tick, explanation.tick, 'tick'],
    [row.day, explanation.day, 'day'],
    [row.hour, explanation.hour, 'hour'],
    [row.record_version, record.recordVersion, 'record_version'],
    [row.engine_version, record.engineVersion, 'engine_version'],
    [row.registry_version, record.registryVersion, 'registry_version'],
    [row.parameters_version, record.parametersVersion, 'parameters_version'],
    [row.character_name, record.characterName, 'character_name'],
    [row.previous_action_id, record.previousAction.actionId, 'previous_action_id'],
    [row.selected_action_id, explanation.selectedActionId, 'selected_action_id'],
    [row.selection_rule, explanation.selectionRule, 'selection_rule'],
    [row.score, record.score, 'score'],
    [row.reason, explanation.reason, 'reason'],
    [row.rng_state_before, explanation.rngStateBefore, 'rng_state_before'],
    [row.rng_state_after, explanation.rngStateAfter, 'rng_state_after'],
    [row.rng_draws, explanation.rngDraws, 'rng_draws'],
    [row.payload_sha256, record.payloadSha256, 'payload_sha256'],
    [row.uncompressed_bytes, record.uncompressedBytes, 'uncompressed_bytes'],
    [row.created_at, record.createdAt, 'created_at'],
    [row.warnings_json, canonicalize(record.warnings), 'warnings_json'],
    [row.state_before_json, canonicalize(record.stateBefore), 'state_before_json'],
    [row.state_after_json, canonicalize(record.stateAfter), 'state_after_json'],
    [row.deltas_json, canonicalize({
      passiveDeltas: record.passiveDeltas,
      actionDeltas: record.actionDeltas,
      appliedDeltas: record.appliedDeltas,
    }), 'deltas_json'],
  ];
  for (const [actual, expected, label] of checks) {
    if (actual !== expected) throw new Error(`Colonne ${label} incohérente avec le BLOB.`);
  }
  return record;
}
