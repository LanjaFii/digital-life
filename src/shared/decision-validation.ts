/**
 * Validation stricte des explications et charges utiles de décision.
 *
 * Module pur, sans Node, Electron ni SQLite. Il est partagé entre le service
 * d'intégrité Node (`decision-record.service.ts`) et les validateurs du
 * protocole worker, afin qu'une seule définition des contrats fasse foi.
 */
import {
  ACTION_IDS,
  ACTION_REGISTRY_VERSION,
  DECISION_RULES,
  type ActionEffectDelta,
  type CharacterActionRuntime,
} from './action';
import {
  EMOTION_KEYS,
  NEED_KEYS,
  type CharacterEmotions,
  type CharacterNeeds,
} from './character';
import {
  DECISION_ENGINE_VERSION,
  DECISION_RECORD_VERSION,
  type DecisionExplanation,
  type DecisionRecordPayloadV1,
} from './decision';
import {
  SIMULATION_PARAMETERS_VERSION,
  TICK_DELTA_CAUSE_KINDS,
  type TickDelta,
  type TickDeltaCauseKind,
} from './simulation-rules';
import { canonicalize } from './canonicalization';

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
const CAUSE_KINDS = new Set<string>(TICK_DELTA_CAUSE_KINDS);

export const DECISION_RECORD_PAYLOAD_KEYS = [
  'id', 'recordVersion', 'engineVersion', 'registryVersion', 'parametersVersion', 'ruleIds',
  'explanation', 'score', 'needUrgencies', 'emotionUrgencies', 'previousAction', 'newAction',
  'characterName', 'stateBefore', 'stateAfter', 'passiveDeltas', 'actionDeltas',
  'appliedDeltas', 'warnings',
] as const;

export const DECISION_RECORD_KEYS = [...DECISION_RECORD_PAYLOAD_KEYS, 'payloadSha256', 'uncompressedBytes', 'createdAt'] as const;

const EXPLANATION_KEYS = [
  'worldId', 'characterId', 'tick', 'day', 'hour', 'ruleId', 'motivations',
  'immediateGoals', 'candidateScores', 'selectedActionId', 'selectionRule', 'reason',
  'rejected', 'expectedEffects', 'rngStateBefore', 'rngStateAfter', 'rngDraws',
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function assertExactKeys(value: unknown, label: string, keys: readonly string[]): Record<string, unknown> {
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

export function assertAllowedKeys(value: unknown, label: string, keys: readonly string[]): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${label} invalide : objet attendu.`);
  const allowed = new Set(keys);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new Error(`${label} invalide : clé inconnue ${key}.`);
  }
  return value;
}

export function requireString(value: unknown, label: string, allowEmpty = true): string {
  if (typeof value !== 'string' || (!allowEmpty && value.length === 0)) {
    throw new Error(`${label} invalide : chaîne attendue.`);
  }
  return value;
}

export function requireFinite(value: unknown, label: string, min?: number, max?: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${label} invalide : nombre fini attendu.`);
  if (min !== undefined && value < min) throw new Error(`${label} hors bornes basses.`);
  if (max !== undefined && value > max) throw new Error(`${label} hors bornes hautes.`);
  return value;
}

export function requireInteger(value: unknown, label: string, min: number, max = Number.MAX_SAFE_INTEGER): number {
  const number = requireFinite(value, label, min, max);
  if (!Number.isInteger(number)) throw new Error(`${label} invalide : entier attendu.`);
  return number;
}

function requireUint32(value: unknown, label: string): number {
  return requireInteger(value, label, 0, 0xffffffff);
}

export function requireBoolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`${label} invalide : booléen attendu.`);
  return value;
}

export function requireArray(value: unknown, label: string, max: number): unknown[] {
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

export function validateDecisionExplanation(value: unknown): DecisionExplanation {
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

export function validateRuntime(value: unknown, label: string): CharacterActionRuntime {
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

export function validateState(value: unknown, label: string): {
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

export function validateTickDelta(value: unknown, label: string): TickDelta {
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

export function validateActionDelta(value: unknown, label: string): ActionEffectDelta {
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
  const payload = assertExactKeys(value, 'DecisionRecordPayloadV1', DECISION_RECORD_PAYLOAD_KEYS);
  const explanation = validateDecisionExplanation(payload.explanation);
  const id = requireString(payload.id, 'id', false);
  if (id !== `${explanation.worldId}:${explanation.tick}:${explanation.characterId}`) {
    throw new Error('Identifiant d’enregistrement incohérent.');
  }
  if (payload.recordVersion !== DECISION_RECORD_VERSION) throw new Error('Version d’enregistrement inconnue.');
  if (payload.engineVersion !== DECISION_ENGINE_VERSION) throw new Error('Version de moteur inconnue.');
  if (payload.registryVersion !== ACTION_REGISTRY_VERSION) throw new Error('Version de registre inconnue.');
  if (payload.parametersVersion !== SIMULATION_PARAMETERS_VERSION) {
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
  for (const raw of requireArray(payload.passiveDeltas, 'passiveDeltas', MAX_DELTAS)) validateTickDelta(raw, 'passiveDelta');
  for (const raw of requireArray(payload.actionDeltas, 'actionDeltas', MAX_DELTAS)) validateActionDelta(raw, 'actionDelta');
  for (const raw of requireArray(payload.appliedDeltas, 'appliedDeltas', MAX_DELTAS)) validateTickDelta(raw, 'appliedDelta');
  for (const warning of requireArray(payload.warnings, 'warnings', MAX_WARNINGS)) requireString(warning, 'warning');

  return payload as unknown as DecisionRecordPayloadV1;
}
