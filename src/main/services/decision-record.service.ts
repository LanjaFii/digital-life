/**
 * Contrôle d'intégrité, sérialisation et validation stricte des décisions (3D-A).
 *
 * Service Node-only : il utilise `node:crypto` et `node:zlib`, mais jamais
 * SQLite ni Electron. Le calcul du tick produit une charge utile déterministe ;
 * ce module ajoute les métadonnées d'intégrité et fournit les fonctions de
 * vérification utilisées à l'écriture comme à la lecture.
 */
import { createHash } from 'node:crypto';
import { deflateSync, inflateSync } from 'node:zlib';
import {
  ACTION_IDS,
  DECISION_RULES,
  type ActionEffectDelta,
  type CharacterActionRuntime,
} from '../../shared/action';
import {
  EMOTION_KEYS,
  NEED_KEYS,
  type CharacterEmotions,
  type CharacterNeeds,
  type EmotionKey,
  type NeedKey,
} from '../../shared/character';
import {
  DECISION_ENGINE_VERSION,
  DECISION_RECORD_VERSION,
  type DecisionExplanation,
  type DecisionRecordPayloadV1,
  type DecisionRecordV1,
} from '../../shared/decision';
import type { TickDelta, TickDeltaCauseKind } from '../../shared/simulation-rules';
import { ACTION_REGISTRY } from './action-registry.service';
import { DEFAULT_SIMULATION_PARAMETERS } from './simulation-parameters.service';

/** Limites de corruption : indépendantes des paramètres configurables. */
export const DECISION_PAYLOAD_MAX_BYTES = 65_536;
export const DECISION_BLOB_MAX_BYTES = 16_384;

const MAX_MOTIVATIONS = 19;
const MAX_IMMEDIATE_GOALS = 3;
const MAX_CANDIDATES = ACTION_IDS.length;
const MAX_RECENT_ACTIONS = 64;
const MAX_DELTAS = 128;
const MAX_WARNINGS = 64;

const ACTION_SET = new Set<string>(ACTION_IDS);
const RULE_SET = new Set<string>(DECISION_RULES);
const NEED_SET = new Set<string>(NEED_KEYS);
const EMOTION_SET = new Set<string>(EMOTION_KEYS);
const CAUSE_KINDS = new Set<string>([
  'base_decay', 'need_deficit', 'comfort', 'emotion_pressure', 'emotion_target',
  'trait_modifier', 'baseline_recovery', 'action_effect', 'clamp', 'rounding',
]);

const PAYLOAD_KEYS = [
  'id', 'recordVersion', 'engineVersion', 'registryVersion', 'parametersVersion', 'ruleIds',
  'explanation', 'score', 'needUrgencies', 'emotionUrgencies', 'previousAction', 'newAction',
  'characterName', 'stateBefore', 'stateAfter', 'passiveDeltas', 'actionDeltas',
  'appliedDeltas', 'warnings',
] as const;

const RECORD_KEYS = [...PAYLOAD_KEYS, 'payloadSha256', 'uncompressedBytes', 'createdAt'] as const;

const EXPLANATION_KEYS = [
  'worldId', 'characterId', 'tick', 'day', 'hour', 'ruleId', 'motivations',
  'immediateGoals', 'candidateScores', 'selectedActionId', 'selectionRule', 'reason',
  'rejected', 'expectedEffects', 'rngStateBefore', 'rngStateAfter', 'rngDraws',
] as const;

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

/** JSON canonique : clés triées récursivement, nombres finis obligatoires. */
export function canonicalize(value: unknown): string {
  if (value === undefined) throw new Error('Valeur undefined interdite dans un enregistrement de décision.');
  if (value === null) return 'null';
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Nombre non fini interdit dans un enregistrement de décision.');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([key, child]) => `${JSON.stringify(key)}:${canonicalize(child)}`).join(',')}}`;
  }
  throw new Error('Type non sérialisable dans un enregistrement de décision.');
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertExactKeys(value: unknown, label: string, keys: readonly string[]): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${label} invalide : objet attendu.`);
  const expected = new Set(keys);
  for (const key of Object.keys(value)) {
    if (!expected.has(key)) throw new Error(`${label} invalide : clé inconnue ${key}.`);
  }
  for (const key of expected) {
    if (!(key in value)) throw new Error(`${label} invalide : clé manquante ${key}.`);
  }
  return value;
}

function assertAllowedKeys(value: unknown, label: string, keys: readonly string[]): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${label} invalide : objet attendu.`);
  const allowed = new Set(keys);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new Error(`${label} invalide : clé inconnue ${key}.`);
  }
  return value;
}

function requireString(value: unknown, label: string, allowEmpty = true): string {
  if (typeof value !== 'string' || (!allowEmpty && value.length === 0)) {
    throw new Error(`${label} invalide : chaîne attendue.`);
  }
  return value;
}

function requireFinite(value: unknown, label: string, min?: number, max?: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${label} invalide : nombre fini attendu.`);
  if (min !== undefined && value < min) throw new Error(`${label} hors bornes basses.`);
  if (max !== undefined && value > max) throw new Error(`${label} hors bornes hautes.`);
  return value;
}

function requireInteger(value: unknown, label: string, min: number, max = Number.MAX_SAFE_INTEGER): number {
  const number = requireFinite(value, label, min, max);
  if (!Number.isInteger(number)) throw new Error(`${label} invalide : entier attendu.`);
  return number;
}

function requireUint32(value: unknown, label: string): number {
  return requireInteger(value, label, 0, 0xffffffff);
}

function requireBoolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`${label} invalide : booléen attendu.`);
  return value;
}

function requireArray(value: unknown, label: string, max: number): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label} invalide : tableau attendu.`);
  if (value.length > max) throw new Error(`${label} invalide : trop d'éléments.`);
  return value;
}

function requireActionId(value: unknown, label: string): string {
  const actionId = requireString(value, label, false);
  if (!ACTION_SET.has(actionId)) throw new Error(`${label} invalide : action inconnue.`);
  return actionId;
}

function requireRule(value: unknown, label: string): string {
  const rule = requireString(value, label, false);
  if (!RULE_SET.has(rule)) throw new Error(`${label} invalide : règle inconnue.`);
  return rule;
}

function validateNumberMap(
  value: unknown,
  label: string,
  keys: readonly string[],
  min: number,
  max: number,
  allowPartial: boolean,
): Record<string, number> {
  const record = allowPartial ? assertAllowedKeys(value, label, keys) : assertExactKeys(value, label, keys);
  for (const key of Object.keys(record)) {
    if (!keys.includes(key)) throw new Error(`${label} invalide : clé inconnue ${key}.`);
    requireFinite(record[key], `${label}.${key}`, min, max);
  }
  if (!allowPartial) {
    for (const key of keys) requireFinite(record[key], `${label}.${key}`, min, max);
  }
  return record as Record<string, number>;
}

function validateExplanation(value: unknown): DecisionExplanation {
  const e = assertExactKeys(value, 'explanation', EXPLANATION_KEYS);
  requireString(e.worldId, 'explanation.worldId', false);
  requireString(e.characterId, 'explanation.characterId', false);
  requireInteger(e.tick, 'explanation.tick', 0);
  requireInteger(e.day, 'explanation.day', 1);
  requireInteger(e.hour, 'explanation.hour', 0, 23);
  if (e.ruleId !== 'decision.v1') throw new Error('explanation.ruleId invalide.');

  for (const [index, raw] of requireArray(e.motivations, 'explanation.motivations', MAX_MOTIVATIONS).entries()) {
    const motivation = assertExactKeys(raw, `motivations[${index}]`, [
      'id', 'source', 'refKey', 'targetKey', 'urgency', 'direction', 'reason',
    ]);
    requireString(motivation.id, `motivations[${index}].id`, false);
    if (!['need', 'emotion', 'circadian'].includes(requireString(motivation.source, 'motivation.source'))) {
      throw new Error('motivation.source invalide.');
    }
    const refKey = requireString(motivation.refKey, 'motivation.refKey', false);
    if (!NEED_SET.has(refKey) && !EMOTION_SET.has(refKey) && refKey !== 'night') {
      throw new Error('motivation.refKey invalide.');
    }
    const target = requireString(motivation.targetKey, 'motivation.targetKey', false);
    if (!NEED_SET.has(target) && !EMOTION_SET.has(target)) throw new Error('motivation.targetKey invalide.');
    requireFinite(motivation.urgency, 'motivation.urgency', 0, 1);
    if (!['increase', 'decrease'].includes(requireString(motivation.direction, 'motivation.direction'))) {
      throw new Error('motivation.direction invalide.');
    }
    requireString(motivation.reason, 'motivation.reason');
  }

  for (const [index, raw] of requireArray(e.immediateGoals, 'explanation.immediateGoals', MAX_IMMEDIATE_GOALS).entries()) {
    const goal = assertExactKeys(raw, `immediateGoals[${index}]`, [
      'id', 'label', 'rank', 'urgency', 'motivations', 'ruleId',
    ]);
    requireString(goal.id, 'immediateGoal.id', false);
    requireString(goal.label, 'immediateGoal.label');
    requireInteger(goal.rank, 'immediateGoal.rank', 1);
    requireFinite(goal.urgency, 'immediateGoal.urgency', 0, 1);
    requireArray(goal.motivations, 'immediateGoal.motivations', MAX_MOTIVATIONS);
    if (goal.ruleId !== 'goal.immediate.v1') throw new Error('immediateGoal.ruleId invalide.');
  }

  for (const [index, raw] of requireArray(e.candidateScores, 'explanation.candidateScores', MAX_CANDIDATES).entries()) {
    const candidate = assertExactKeys(raw, `candidateScores[${index}]`, [
      'actionId', 'feasible', 'score', 'components', 'rejections',
    ]);
    requireActionId(candidate.actionId, 'candidate.actionId');
    requireBoolean(candidate.feasible, 'candidate.feasible');
    requireFinite(candidate.score, 'candidate.score', -5, 5);
    assertExactKeys(candidate.components, 'candidate.components', [
      'need', 'emotion', 'trait', 'circadian', 'cost', 'repetition', 'duration',
    ]);
    for (const value of Object.values(candidate.components as Record<string, unknown>)) {
      requireFinite(value, 'candidate.component');
    }
    for (const rejection of requireArray(candidate.rejections, 'candidate.rejections', MAX_CANDIDATES)) {
      const item = assertExactKeys(rejection, 'candidate.rejection', ['precondition', 'reason']);
      requireString(item.precondition, 'rejection.precondition');
      requireString(item.reason, 'rejection.reason');
    }
  }

  for (const [index, raw] of requireArray(e.rejected, 'explanation.rejected', MAX_CANDIDATES).entries()) {
    const rejected = assertExactKeys(raw, `rejected[${index}]`, ['actionId', 'reasons']);
    requireActionId(rejected.actionId, 'rejected.actionId');
    for (const reason of requireArray(rejected.reasons, 'rejected.reasons', MAX_CANDIDATES)) {
      requireString(reason, 'rejected.reason');
    }
  }

  const effects = assertExactKeys(e.expectedEffects, 'explanation.expectedEffects', ['needs', 'emotions']);
  validateNumberMap(effects.needs, 'expectedEffects.needs', NEED_KEYS, -100, 100, true);
  validateNumberMap(effects.emotions, 'expectedEffects.emotions', EMOTION_KEYS, -100, 100, true);

  requireActionId(e.selectedActionId, 'explanation.selectedActionId');
  requireRule(e.selectionRule, 'explanation.selectionRule');
  requireString(e.reason, 'explanation.reason');
  requireUint32(e.rngStateBefore, 'explanation.rngStateBefore');
  requireUint32(e.rngStateAfter, 'explanation.rngStateAfter');
  const draws = requireInteger(e.rngDraws, 'explanation.rngDraws', 0, 1);
  if (draws !== 0 && draws !== 1) throw new Error('explanation.rngDraws invalide.');

  return e as unknown as DecisionExplanation;
}

function validateRuntime(value: unknown, label: string): CharacterActionRuntime {
  const runtime = assertExactKeys(value, label, [
    'version', 'active', 'recentActionIds', 'cooldowns', 'lastDecision', 'interruptedCount',
  ]);
  if (runtime.version !== 1) throw new Error(`${label} : version inconnue.`);
  requireInteger(runtime.interruptedCount, `${label}.interruptedCount`, 0);
  if (runtime.active !== null) {
    const active = assertExactKeys(runtime.active, `${label}.active`, [
      'actionId', 'startedTick', 'endsAtTick', 'lastAppliedTick', 'interruptedCount',
    ]);
    requireActionId(active.actionId, 'active.actionId');
    const started = requireInteger(active.startedTick, 'active.startedTick', 0);
    requireInteger(active.endsAtTick, 'active.endsAtTick', started);
    requireInteger(active.lastAppliedTick, 'active.lastAppliedTick', 0);
    requireInteger(active.interruptedCount, 'active.interruptedCount', 0);
  }
  for (const actionId of requireArray(runtime.recentActionIds, 'runtime.recentActionIds', MAX_RECENT_ACTIONS)) {
    requireActionId(actionId, 'recentActionId');
  }
  const cooldowns = assertAllowedKeys(runtime.cooldowns, 'runtime.cooldowns', ACTION_IDS);
  for (const [actionId, tick] of Object.entries(cooldowns)) requireInteger(tick, `cooldown.${actionId}`, 0);
  if (runtime.lastDecision !== null) {
    const last = assertExactKeys(runtime.lastDecision, 'runtime.lastDecision', ['tick', 'actionId', 'rule', 'reason']);
    requireInteger(last.tick, 'lastDecision.tick', 0);
    requireActionId(last.actionId, 'lastDecision.actionId');
    requireRule(last.rule, 'lastDecision.rule');
    requireString(last.reason, 'lastDecision.reason');
  }
  return runtime as unknown as CharacterActionRuntime;
}

function validateState(value: unknown, label: string): {
  needs: CharacterNeeds;
  emotions: CharacterEmotions;
  runtime: CharacterActionRuntime;
} {
  const state = assertExactKeys(value, label, ['needs', 'emotions', 'runtime']);
  const needs = validateNumberMap(state.needs, `${label}.needs`, NEED_KEYS, 0, 100, false) as unknown as CharacterNeeds;
  const emotions = validateNumberMap(state.emotions, `${label}.emotions`, EMOTION_KEYS, 0, 100, false) as unknown as CharacterEmotions;
  const runtime = validateRuntime(state.runtime, `${label}.runtime`);
  return { needs, emotions, runtime };
}

function validateDelta(value: unknown, label: string): TickDelta {
  const delta = assertExactKeys(value, label, ['entityId', 'field', 'before', 'after', 'delta', 'causes', 'ruleId']);
  requireString(delta.entityId, `${label}.entityId`, false);
  const field = requireString(delta.field, `${label}.field`, false);
  const separator = field.indexOf('.');
  if (separator < 0) throw new Error(`${label}.field invalide.`);
  const domain = field.slice(0, separator);
  const key = field.slice(separator + 1);
  if (domain === 'needs' && !NEED_SET.has(key)) throw new Error(`${label}.field invalide.`);
  if (domain === 'emotions' && !EMOTION_SET.has(key)) throw new Error(`${label}.field invalide.`);
  if (domain !== 'needs' && domain !== 'emotions') throw new Error(`${label}.field invalide.`);
  requireFinite(delta.before, `${label}.before`, 0, 100);
  requireFinite(delta.after, `${label}.after`, 0, 100);
  requireFinite(delta.delta, `${label}.delta`, -100, 100);
  requireString(delta.ruleId, `${label}.ruleId`, false);
  for (const [index, rawCause] of requireArray(delta.causes, `${label}.causes`, 64).entries()) {
    const cause = assertAllowedKeys(rawCause, `${label}.causes[${index}]`, ['kind', 'source', 'weight', 'contribution', 'note']);
    if (!CAUSE_KINDS.has(requireString(cause.kind, 'cause.kind', false) as TickDeltaCauseKind)) {
      throw new Error('cause.kind invalide.');
    }
    requireString(cause.source, 'cause.source');
    if (cause.weight !== undefined) requireFinite(cause.weight, 'cause.weight', -100, 100);
    if (cause.contribution !== undefined) requireFinite(cause.contribution, 'cause.contribution', -100, 100);
    if (cause.note !== undefined) requireString(cause.note, 'cause.note');
  }
  return delta as unknown as TickDelta;
}

function validateActionDelta(value: unknown, label: string): ActionEffectDelta {
  const delta = assertExactKeys(value, label, [
    'characterId', 'actionId', 'tick', 'field', 'expected', 'applied', 'ruleId',
  ]);
  requireString(delta.characterId, `${label}.characterId`, false);
  requireActionId(delta.actionId, `${label}.actionId`);
  requireInteger(delta.tick, `${label}.tick`, 0);
  requireString(delta.field, `${label}.field`, false);
  requireFinite(delta.expected, `${label}.expected`, -100, 100);
  requireFinite(delta.applied, `${label}.applied`, -100, 100);
  requireString(delta.ruleId, `${label}.ruleId`, false);
  return delta as unknown as ActionEffectDelta;
}

export function validateDecisionRecordPayload(value: unknown): DecisionRecordPayloadV1 {
  const payload = assertExactKeys(value, 'DecisionRecordPayloadV1', PAYLOAD_KEYS);
  const explanation = validateExplanation(payload.explanation);
  const id = requireString(payload.id, 'id', false);
  if (id !== `${explanation.worldId}:${explanation.tick}:${explanation.characterId}`) {
    throw new Error('Identifiant d’enregistrement incohérent.');
  }
  if (payload.recordVersion !== DECISION_RECORD_VERSION) throw new Error('Version d’enregistrement inconnue.');
  if (payload.engineVersion !== DECISION_ENGINE_VERSION) throw new Error('Version de moteur inconnue.');
  if (payload.registryVersion !== ACTION_REGISTRY.version) throw new Error('Version de registre inconnue.');
  if (payload.parametersVersion !== DEFAULT_SIMULATION_PARAMETERS.version) {
    throw new Error('Version de paramètres inconnue.');
  }

  const ruleIds = requireArray(payload.ruleIds, 'ruleIds', 64);
  for (const ruleId of ruleIds) requireString(ruleId, 'ruleId', false);
  const sorted = [...ruleIds].sort();
  if (canonicalize(ruleIds) !== canonicalize(sorted) || new Set(ruleIds).size !== ruleIds.length) {
    throw new Error('ruleIds doit être trié et unique.');
  }

  const score = requireFinite(payload.score, 'score', -5, 5);
  if ((explanation.selectionRule === 'continue_active' || explanation.selectionRule === 'action_failed') && score !== 0) {
    throw new Error('Aucun score ne doit être calculé pour une action poursuivie ou échouée.');
  }

  validateNumberMap(payload.needUrgencies, 'needUrgencies', NEED_KEYS, 0, 1, false);
  validateNumberMap(payload.emotionUrgencies, 'emotionUrgencies', EMOTION_KEYS, 0, 1, false);

  const previous = assertExactKeys(payload.previousAction, 'previousAction', ['actionId', 'rule', 'tick', 'active']);
  if (previous.actionId !== null) requireActionId(previous.actionId, 'previousAction.actionId');
  if (previous.rule !== null) requireRule(previous.rule, 'previousAction.rule');
  if (previous.tick !== null) requireInteger(previous.tick, 'previousAction.tick', 0);
  requireBoolean(previous.active, 'previousAction.active');
  const next = assertExactKeys(payload.newAction, 'newAction', ['actionId', 'rule']);
  requireActionId(next.actionId, 'newAction.actionId');
  requireRule(next.rule, 'newAction.rule');
  if (next.actionId !== explanation.selectedActionId || next.rule !== explanation.selectionRule) {
    throw new Error('newAction incohérent avec l’explication.');
  }

  requireString(payload.characterName, 'characterName', false);
  validateState(payload.stateBefore, 'stateBefore');
  validateState(payload.stateAfter, 'stateAfter');
  for (const raw of requireArray(payload.passiveDeltas, 'passiveDeltas', MAX_DELTAS)) validateDelta(raw, 'passiveDelta');
  for (const raw of requireArray(payload.actionDeltas, 'actionDeltas', MAX_DELTAS)) validateActionDelta(raw, 'actionDelta');
  for (const raw of requireArray(payload.appliedDeltas, 'appliedDeltas', MAX_DELTAS)) validateDelta(raw, 'appliedDelta');
  for (const warning of requireArray(payload.warnings, 'warnings', MAX_WARNINGS)) requireString(warning, 'warning');

  return payload as unknown as DecisionRecordPayloadV1;
}

export function validateDecisionRecord(value: unknown): DecisionRecordV1 {
  const record = assertExactKeys(value, 'DecisionRecordV1', RECORD_KEYS);
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
  const raw = inflateSync(Buffer.from(row.payload_blob));
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

/** Ordonne et déduplique les identifiants de règles d'un enregistrement. */
export function collectRuleIds(parts: {
  explanation: DecisionExplanation;
  passiveDeltas: readonly TickDelta[];
  actionDeltas: readonly ActionEffectDelta[];
  appliedDeltas: readonly TickDelta[];
}): string[] {
  const ids = new Set<string>([parts.explanation.ruleId]);
  for (const goal of parts.explanation.immediateGoals) ids.add(goal.ruleId);
  for (const delta of parts.passiveDeltas) ids.add(delta.ruleId);
  for (const delta of parts.actionDeltas) ids.add(delta.ruleId);
  for (const delta of parts.appliedDeltas) ids.add(delta.ruleId);
  return [...ids].sort();
}
