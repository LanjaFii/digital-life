/**
 * Protocole versionné du worker de calcul du tick (Phase 3D-C1).
 *
 * Module strictement partagé et sans dépendance Node : il définit l'enveloppe,
 * ses validateurs et les réponses d'erreur. Il ne calcule aucun checksum (le
 * hachage SHA-256 est calculé dans le main et dans le worker, puis comparé).
 * Aucun champ du protocole ne modifie `CharacterTickInput`/`CharacterTickResult`.
 */
import { ACTION_REGISTRY_VERSION, type ActionEffectDelta } from './action';
import {
  EMOTION_KEYS,
  NEED_KEYS,
  TRAIT_KEYS,
  type CharacterEmotions,
  type CharacterNeeds,
  type CharacterTraits,
} from './character';
import { DECISION_ENGINE_VERSION } from './decision';
import {
  assertAllowedKeys,
  assertExactKeys,
  requireArray,
  requireFinite,
  requireInteger,
  requireString,
  validateActionDelta,
  validateDecisionExplanation,
  validateDecisionRecordPayload,
  validateRuntime,
  validateTickDelta,
} from './decision-validation';
import {
  DECISION_PARAMETER_KEYS,
  SIMULATION_PARAMETERS_VERSION,
  type CharacterTickInput,
  type CharacterTickResult,
  type SimulationParametersV1,
} from './simulation-rules';

/** Seule version acceptée ; toute autre valeur est rejetée sans interprétation tolérante. */
export const WORKER_PROTOCOL_VERSION = 1 as const;

export const COMPUTE_TICK_REQUEST_TYPE = 'compute-tick' as const;
export const COMPUTE_TICK_RESULT_TYPE = 'compute-tick:result' as const;
export const COMPUTE_TICK_ERROR_TYPE = 'compute-tick:error' as const;
export const COMPUTE_WORKER_READY_TYPE = 'ready' as const;

export const COMPUTE_ERROR_CODES = ['invalid_input', 'compute_error', 'unsupported_version'] as const;
export type ComputeErrorCode = (typeof COMPUTE_ERROR_CODES)[number];

export interface ComputeTickRequest {
  type: typeof COMPUTE_TICK_REQUEST_TYPE;
  protocolVersion: typeof WORKER_PROTOCOL_VERSION;
  requestId: string;
  input: CharacterTickInput;
}

export interface ComputeTickVersions {
  engineVersion: string;
  registryVersion: number;
  parametersVersion: number;
}

export interface ComputeTickResultResponse {
  type: typeof COMPUTE_TICK_RESULT_TYPE;
  protocolVersion: typeof WORKER_PROTOCOL_VERSION;
  requestId: string;
  worldId: string;
  tick: number;
  result: CharacterTickResult;
  /** SHA-256 hexadécimal du noyau Golden Hash, sans `decisionRecords`. */
  checksum: string;
  versions: ComputeTickVersions;
}

/**
 * `requestId` peut être vide pour une erreur non corrélable (message illisible).
 * Le main journalise alors l'erreur sans tenter de résoudre une requête.
 */
export interface ComputeTickErrorResponse {
  type: typeof COMPUTE_TICK_ERROR_TYPE;
  protocolVersion: typeof WORKER_PROTOCOL_VERSION;
  requestId: string;
  worldId?: string;
  code: ComputeErrorCode;
  message: string;
}

export interface ComputeWorkerReadyMessage {
  type: typeof COMPUTE_WORKER_READY_TYPE;
  protocolVersion: typeof WORKER_PROTOCOL_VERSION;
}

export type ComputeTickResponse = ComputeTickResultResponse | ComputeTickErrorResponse;
export type ComputeWorkerMessage = ComputeWorkerReadyMessage | ComputeTickResponse;

/** Erreur de protocole : le code permet au worker de répondre sans ambiguïté. */
export class WorkerProtocolError extends Error {
  readonly code: ComputeErrorCode;
  readonly requestId: string;
  readonly worldId?: string;
  readonly receivedVersion?: unknown;

  constructor(options: {
    code: ComputeErrorCode;
    message: string;
    requestId?: string;
    worldId?: string;
    receivedVersion?: unknown;
  }) {
    super(options.message);
    this.name = 'WorkerProtocolError';
    this.code = options.code;
    this.requestId = options.requestId ?? '';
    this.worldId = options.worldId;
    this.receivedVersion = options.receivedVersion;
  }
}

function invalid(message: string, requestId = '', worldId?: string): WorkerProtocolError {
  return new WorkerProtocolError({ code: 'invalid_input', message, requestId, worldId });
}

/** Uniformise les erreurs des validateurs génériques en erreurs de protocole. */
function protocolFailure(error: unknown, requestId: string, worldId?: string): WorkerProtocolError {
  if (error instanceof WorkerProtocolError) return error;
  return invalid(
    error instanceof Error ? error.message : String(error),
    requestId,
    worldId,
  );
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function readWorldIdFromInput(value: unknown): string | undefined {
  if (!isObject(value)) return undefined;
  return readString(value.worldId);
}

function assertVersion(value: unknown, requestId: string, worldId?: string): void {
  if (value === WORKER_PROTOCOL_VERSION) return;
  throw new WorkerProtocolError({
    code: 'unsupported_version',
    message: `Version de protocole incompatible : ${String(value)}.`,
    requestId,
    worldId,
    receivedVersion: value,
  });
}

function assertUint32(value: unknown, label: string): number {
  return requireInteger(value, label, 0, 0xffffffff);
}

const NEED_KEY_SET = new Set<string>(NEED_KEYS);
const EMOTION_KEY_SET = new Set<string>(EMOTION_KEYS);

function validateNumberMap(
  value: unknown,
  label: string,
  keys: readonly string[],
  min: number,
  max: number,
  allowPartial: boolean,
  required = !allowPartial,
): void {
  const record = allowPartial ? assertAllowedKeys(value, label, keys) : assertExactKeys(value, label, keys);
  for (const [key, child] of Object.entries(record)) {
    if (!keys.includes(key)) throw invalid(`${label} invalide : clé inconnue ${key}.`);
    requireFinite(child, `${label}.${key}`, min, max);
  }
  if (required) for (const key of keys) requireFinite(record[key], `${label}.${key}`, min, max);
}

function validateShape(
  value: unknown,
  label: string,
  required: readonly string[],
  optional: readonly string[] = [],
): Record<string, unknown> {
  if (!isObject(value)) throw invalid(`${label} invalide : objet attendu.`);
  const allowed = new Set([...required, ...optional]);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw invalid(`${label} invalide : clé inconnue ${key}.`);
  }
  for (const key of required) {
    if (!(key in value)) throw invalid(`${label} invalide : clé manquante ${key}.`);
  }
  return value;
}

function validateSimulationParameters(value: unknown, requestId: string): SimulationParametersV1 {
  const p = validateShape(value, 'params', [
    'version', 'precision', 'deficitThreshold', 'comfortThreshold', 'emotionThreshold',
    'emotionDeadZone', 'comfortSpan', 'emotionTargetSpan', 'caps', 'decision', 'needs', 'emotions',
  ]);
  if (p.version !== SIMULATION_PARAMETERS_VERSION) {
    throw new WorkerProtocolError({
      code: 'unsupported_version',
      message: 'Version des paramètres de simulation incompatible.',
      requestId,
      receivedVersion: p.version,
    });
  }
  requireInteger(p.precision, 'params.precision', 0, 6);
  for (const key of ['deficitThreshold', 'comfortThreshold', 'emotionThreshold'] as const) {
    requireFinite(p[key], `params.${key}`, 0, 100);
  }
  requireFinite(p.emotionDeadZone, 'params.emotionDeadZone', 0, 10);
  requireFinite(p.comfortSpan, 'params.comfortSpan', -100, 100);
  requireFinite(p.emotionTargetSpan, 'params.emotionTargetSpan', -100, 100);

  validateShape(p.caps, 'params.caps', ['emotionPressure', 'emotionDelta', 'healthLoss']);
  for (const cap of Object.values(p.caps as Record<string, unknown>)) requireFinite(cap, 'params.caps', 0, 100);

  const decision = assertExactKeys(p.decision, 'params.decision', DECISION_PARAMETER_KEYS);
  if (decision.tieBreak !== 'id' && decision.tieBreak !== 'rng') throw invalid('params.decision.tieBreak invalide.');
  requireInteger(decision.decisionScorePrecision, 'decisionScorePrecision', 1, 6);
  if (decision.maxRngDrawsPerCharacterTick !== 1) throw invalid('maxRngDrawsPerCharacterTick invalide.');
  for (const key of [
    'needWeight', 'emotionWeight', 'traitWeight', 'circadianWeight', 'costWeight',
    'repetitionWeight', 'durationWeight', 'trendWeight',
  ] as const) requireFinite(decision[key], `decision.${key}`, -100, 100);
  for (const key of ['minimumMotivationUrgency', 'criticalUrgency', 'referenceDecayFloor'] as const) {
    requireFinite(decision[key], `decision.${key}`, 0, 1);
  }
  requireInteger(decision.immediateGoalLimit, 'immediateGoalLimit', 1, 3);
  requireInteger(decision.maxActionDurationTicks, 'maxActionDurationTicks', 1, 24);
  requireInteger(decision.actionHistorySize, 'actionHistorySize', 1, 64);
  requireInteger(decision.minTicksBeforeInterrupt, 'minTicksBeforeInterrupt', 0, 64);

  const needs = assertExactKeys(p.needs, 'params.needs', NEED_KEYS);
  for (const [needKey, raw] of Object.entries(needs)) {
    const rule = validateShape(raw, `params.needs.${needKey}`, ['decay', 'traitModifiers', 'accelerators'], ['recovery', 'lossCap']);
    requireFinite(rule.decay, `needs.${needKey}.decay`, -100, 100);
    validateNumberMap(rule.traitModifiers, `needs.${needKey}.traitModifiers`, TRAIT_KEYS, -100, 100, true, false);
    for (const [index, rawAccelerator] of requireArray(rule.accelerators, 'accelerators', 32).entries()) {
      const accelerator = validateShape(rawAccelerator, `accelerators[${index}]`, ['source', 'kind', 'threshold', 'amount']);
      if (!NEED_KEY_SET.has(String(accelerator.source)) && !EMOTION_KEY_SET.has(String(accelerator.source))) {
        throw invalid('accelerator.source invalide.');
      }
      if (!['need_below', 'need_above', 'emotion_above'].includes(String(accelerator.kind))) {
        throw invalid('accelerator.kind invalide.');
      }
      requireFinite(accelerator.threshold, 'accelerator.threshold', 0, 100);
      requireFinite(accelerator.amount, 'accelerator.amount', -100, 100);
    }
    if (rule.recovery !== undefined) {
      const recovery = validateShape(rule.recovery, 'recovery', ['kind', 'rate'], ['baseline', 'requires', 'threshold', 'max', 'recoveryTraits']);
      if (!['below_baseline', 'requires_comfort'].includes(String(recovery.kind))) throw invalid('recovery.kind invalide.');
      requireFinite(recovery.rate, 'recovery.rate', -100, 100);
      if (recovery.baseline !== undefined) requireFinite(recovery.baseline, 'recovery.baseline', 0, 100);
      if (recovery.threshold !== undefined) requireFinite(recovery.threshold, 'recovery.threshold', 0, 100);
      if (recovery.max !== undefined) requireFinite(recovery.max, 'recovery.max', 0, 100);
      if (recovery.requires !== undefined) {
        for (const key of requireArray(recovery.requires, 'recovery.requires', NEED_KEYS.length)) {
          if (!NEED_KEY_SET.has(String(key))) throw invalid('recovery.requires invalide.');
        }
      }
      if (recovery.recoveryTraits !== undefined) {
        validateNumberMap(recovery.recoveryTraits, 'recovery.recoveryTraits', TRAIT_KEYS, -100, 100, true, false);
      }
    }
    if (rule.lossCap !== undefined) requireFinite(rule.lossCap, 'lossCap', 0, 100);
  }

  const emotions = assertExactKeys(p.emotions, 'params.emotions', EMOTION_KEYS);
  for (const [emotionKey, raw] of Object.entries(emotions)) {
    const rule = assertExactKeys(raw, `params.emotions.${emotionKey}`, [
      'baseline', 'min', 'max', 'recoveryRate', 'needWeights', 'comfortWeights',
      'emotionWeights', 'emotionTargetWeights', 'baselineTraits', 'pressureTraits', 'recoveryTraits',
    ]);
    requireFinite(rule.baseline, 'emotion.baseline', 0, 100);
    requireFinite(rule.min, 'emotion.min', 0, 100);
    requireFinite(rule.max, 'emotion.max', 0, 100);
    if (Number(rule.min) > Number(rule.max)) throw invalid('emotion.min/max incohérents.');
    requireFinite(rule.recoveryRate, 'emotion.recoveryRate', -100, 100);
    validateNumberMap(rule.needWeights, 'emotion.needWeights', NEED_KEYS, -100, 100, true, false);
    validateNumberMap(rule.comfortWeights, 'emotion.comfortWeights', NEED_KEYS, -100, 100, true, false);
    validateNumberMap(rule.emotionWeights, 'emotion.emotionWeights', EMOTION_KEYS, -100, 100, true, false);
    validateNumberMap(rule.emotionTargetWeights, 'emotion.emotionTargetWeights', EMOTION_KEYS, -100, 100, true, false);
    validateNumberMap(rule.baselineTraits, 'emotion.baselineTraits', TRAIT_KEYS, -100, 100, true, false);
    validateNumberMap(rule.pressureTraits, 'emotion.pressureTraits', TRAIT_KEYS, -100, 100, true, false);
    validateNumberMap(rule.recoveryTraits, 'emotion.recoveryTraits', TRAIT_KEYS, -100, 100, true, false);
  }
  return p as unknown as SimulationParametersV1;
}

/** Valide strictement une entrée de tick : aucun champ inconnu ni valeur non finie. */
export function validateCharacterTickInput(value: unknown, requestId = ''): CharacterTickInput {
  try {
    const input = validateShape(value, 'CharacterTickInput', [
      'worldId', 'tick', 'day', 'hour', 'seed', 'rngState', 'characters', 'params',
    ], ['decisionParams', 'actionRuntimeByCharacter', 'characterNameByCharacterId']);
    requireString(input.worldId, 'input.worldId', false);
    requireInteger(input.tick, 'input.tick', 0);
    requireInteger(input.day, 'input.day', 1);
    requireInteger(input.hour, 'input.hour', 0, 23);
    assertUint32(input.seed, 'input.seed');
    assertUint32(input.rngState, 'input.rngState');

    const characters = requireArray(input.characters, 'input.characters', 1000);
    const characterIds = new Set<string>();
    for (const [index, raw] of characters.entries()) {
      const character = validateShape(raw, `characters[${index}]`, ['characterId', 'traits', 'needs', 'emotions', 'goals']);
      const characterId = requireString(character.characterId, 'character.characterId', false);
      if (characterIds.has(characterId)) throw invalid('Identifiant de personnage dupliqué.');
      characterIds.add(characterId);
      validateNumberMap(character.traits, 'character.traits', TRAIT_KEYS, 0, 100, false) as unknown as CharacterTraits;
      validateNumberMap(character.needs, 'character.needs', NEED_KEYS, 0, 100, false) as unknown as CharacterNeeds;
      validateNumberMap(character.emotions, 'character.emotions', EMOTION_KEYS, 0, 100, false) as unknown as CharacterEmotions;
      for (const rawGoal of requireArray(character.goals, 'character.goals', 16)) {
        const goal = validateShape(rawGoal, 'character.goal', ['id', 'label', 'kind']);
        requireString(goal.id, 'goal.id', false);
        requireString(goal.label, 'goal.label');
        if (goal.kind !== 'primary' && goal.kind !== 'secondary') throw invalid('goal.kind invalide.');
      }
    }

    validateSimulationParameters(input.params, requestId);

    if (input.decisionParams !== undefined) {
      const decisionParams = assertAllowedKeys(input.decisionParams, 'input.decisionParams', DECISION_PARAMETER_KEYS);
      for (const [key, value] of Object.entries(decisionParams)) {
        if (key === 'tieBreak') {
          if (value !== 'id' && value !== 'rng') throw invalid('decisionParams.tieBreak invalide.');
        } else if (key === 'maxRngDrawsPerCharacterTick') {
          if (value !== 1) throw invalid('decisionParams.maxRngDrawsPerCharacterTick invalide.');
        } else if (key === 'immediateGoalLimit') {
          requireInteger(value, `decisionParams.${key}`, 1, 3);
        } else if (
          key === 'decisionScorePrecision' || key === 'maxActionDurationTicks' ||
          key === 'actionHistorySize' || key === 'minTicksBeforeInterrupt'
        ) {
          requireInteger(value, `decisionParams.${key}`, 0, 64);
        } else {
          requireFinite(value, `decisionParams.${key}`, -100, 100);
        }
      }
    }

    if (input.actionRuntimeByCharacter !== undefined) {
      for (const [characterId, rawRuntime] of Object.entries(assertAllowedKeys(
        input.actionRuntimeByCharacter, 'input.actionRuntimeByCharacter', [...characterIds],
      ))) validateRuntime(rawRuntime, `actionRuntimeByCharacter.${characterId}`);
    }

    if (input.characterNameByCharacterId !== undefined) {
      for (const [characterId, name] of Object.entries(assertAllowedKeys(
        input.characterNameByCharacterId, 'input.characterNameByCharacterId', [...characterIds],
      ))) requireString(name, `characterNameByCharacterId.${characterId}`, false);
    }

    return input as unknown as CharacterTickInput;
  } catch (error) {
    throw protocolFailure(error, requestId, readWorldIdFromInput(value));
  }
}

/** Valide une requête ; toute divergence lève `WorkerProtocolError`. */
export function validateComputeTickRequest(value: unknown): ComputeTickRequest {
  let requestId = '';
  let worldId: string | undefined;
  try {
    if (!isObject(value)) throw invalid('Message invalide : objet attendu.');
    requestId = readString(value.requestId) ?? '';
    worldId = readWorldIdFromInput(value.input);
    assertVersion(value.protocolVersion, requestId, worldId);
    const request = assertExactKeys(value, 'ComputeTickRequest', ['type', 'protocolVersion', 'requestId', 'input']);
    if (request.type !== COMPUTE_TICK_REQUEST_TYPE) throw invalid('Type de message inattendu.', requestId, worldId);
    if (requestId.length === 0) throw invalid('requestId invalide.', requestId, worldId);
    validateCharacterTickInput(request.input, requestId);
    return value as unknown as ComputeTickRequest;
  } catch (error) {
    throw protocolFailure(error, requestId, worldId);
  }
}

function validateResult(value: unknown, requestId: string): void {
  const result = assertExactKeys(value, 'CharacterTickResult', [
    'worldId', 'tick', 'rngState', 'characterStates', 'deltas', 'decisions',
    'decisionRecords', 'actionDeltas', 'actionRuntimeStates', 'warnings',
  ]);
  requireString(result.worldId, 'result.worldId', false);
  requireInteger(result.tick, 'result.tick', 0);
  assertUint32(result.rngState, 'result.rngState');

  const states = requireArray(result.characterStates, 'result.characterStates', 1000);
  const stateIds = new Set<string>();
  for (const [index, rawState] of states.entries()) {
    const state = assertExactKeys(rawState, `characterStates[${index}]`, ['characterId', 'needs', 'emotions']);
    const characterId = requireString(state.characterId, 'characterStates.characterId', false);
    if (stateIds.has(characterId)) throw invalid('État de personnage dupliqué.', requestId);
    stateIds.add(characterId);
    validateNumberMap(state.needs, 'characterStates.needs', NEED_KEYS, 0, 100, false);
    validateNumberMap(state.emotions, 'characterStates.emotions', EMOTION_KEYS, 0, 100, false);
  }

  for (const rawDelta of requireArray(result.deltas, 'result.deltas', 4096)) validateTickDelta(rawDelta, 'result.delta');
  const decisions = requireArray(result.decisions, 'result.decisions', 1000);
  if (decisions.length !== states.length) throw invalid('Nombre de décisions incohérent.', requestId);
  for (const [index, rawDecision] of decisions.entries()) {
    validateDecisionExplanation(rawDecision);
    const decision = rawDecision as { characterId?: unknown };
    if (!stateIds.has(String(decision.characterId))) throw invalid(`décision[${index}] inconnue.`, requestId);
  }

  const records = requireArray(result.decisionRecords, 'result.decisionRecords', 1000);
  if (records.length !== states.length) throw invalid('Nombre d’enregistrements incohérent.', requestId);
  for (const rawRecord of records) validateDecisionRecordPayload(rawRecord);

  const actionDeltas = requireArray(result.actionDeltas, 'result.actionDeltas', 4096);
  for (const delta of actionDeltas) validateActionDelta(delta, 'result.actionDelta') as ActionEffectDelta;

  const runtimes = requireArray(result.actionRuntimeStates, 'result.actionRuntimeStates', 1000);
  if (runtimes.length !== states.length) throw invalid('Nombre de runtimes incohérent.', requestId);
  const runtimeIds = new Set<string>();
  for (const rawRuntime of runtimes) {
    const entry = assertExactKeys(rawRuntime, 'actionRuntimeStates', ['characterId', 'runtime']);
    const characterId = requireString(entry.characterId, 'actionRuntimeStates.characterId', false);
    if (runtimeIds.has(characterId) || !stateIds.has(characterId)) {
      throw invalid('Runtime de personnage dupliqué ou inconnu.', requestId);
    }
    runtimeIds.add(characterId);
    validateRuntime(entry.runtime, 'actionRuntimeStates.runtime');
  }

  for (const warning of requireArray(result.warnings, 'result.warnings', 256)) {
    requireString(warning, 'result.warning');
  }
}

/** Valide une réponse ; toute divergence lève `WorkerProtocolError`. */
export function validateComputeTickResponse(value: unknown): ComputeTickResponse {
  let requestId = '';
  let worldId: string | undefined;
  try {
    if (!isObject(value)) throw invalid('Réponse invalide : objet attendu.');
    requestId = readString(value.requestId) ?? '';
    worldId = readString(value.worldId);
    assertVersion(value.protocolVersion, requestId, worldId);
    const type = readString(value.type) ?? '';

    if (type === COMPUTE_TICK_RESULT_TYPE) {
      assertExactKeys(value, 'ComputeTickResultResponse', [
        'type', 'protocolVersion', 'requestId', 'worldId', 'tick', 'result', 'checksum', 'versions',
      ]);
      requireString(requestId, 'requestId', false);
      const envelopeWorldId = requireString(value.worldId, 'worldId', false);
      worldId = envelopeWorldId;
      const tick = requireInteger(value.tick, 'tick', 0);
      validateResult(value.result, requestId);
      const result = value.result as CharacterTickResult;
      if (result.worldId !== envelopeWorldId || result.tick !== tick) {
        throw invalid('Enveloppe incohérente avec le résultat.', requestId, envelopeWorldId);
      }
      if (!/^[a-f0-9]{64}$/.test(requireString(value.checksum, 'checksum'))) {
        throw invalid('checksum invalide.', requestId, envelopeWorldId);
      }
      const versions = assertExactKeys(value.versions, 'versions', ['engineVersion', 'registryVersion', 'parametersVersion']);
      if (versions.engineVersion !== DECISION_ENGINE_VERSION ||
          versions.registryVersion !== ACTION_REGISTRY_VERSION ||
          versions.parametersVersion !== SIMULATION_PARAMETERS_VERSION) {
        throw new WorkerProtocolError({
          code: 'unsupported_version',
          message: 'Versions annoncées incompatibles avec le main.',
          requestId,
          worldId: envelopeWorldId,
        });
      }
      return value as unknown as ComputeTickResultResponse;
    }

    if (type === COMPUTE_TICK_ERROR_TYPE) {
      assertAllowedKeys(value, 'ComputeTickErrorResponse', [
        'type', 'protocolVersion', 'requestId', 'worldId', 'code', 'message',
      ]);
      for (const key of ['type', 'protocolVersion', 'requestId', 'code', 'message'] as const) {
        if (!(key in value)) throw invalid(`ComputeTickErrorResponse invalide : clé manquante ${key}.`, requestId);
      }
      requireString(requestId, 'requestId');
      if (value.worldId !== undefined) {
        worldId = requireString(value.worldId, 'worldId', false);
      }
      if (!COMPUTE_ERROR_CODES.includes(String(value.code) as ComputeErrorCode)) {
        throw invalid('Code d’erreur inconnu.', requestId);
      }
      requireString(value.message, 'message');
      return value as unknown as ComputeTickErrorResponse;
    }

    throw invalid('Type de réponse inattendu.', requestId);
  } catch (error) {
    throw protocolFailure(error, requestId, worldId);
  }
}

/** Valide le signal `ready` émis une seule fois au démarrage du worker. */
export function validateComputeWorkerReady(value: unknown): ComputeWorkerReadyMessage {
  try {
    if (!isObject(value)) throw invalid('Message ready invalide : objet attendu.');
    assertVersion(value.protocolVersion, '');
    assertExactKeys(value, 'ComputeWorkerReadyMessage', ['type', 'protocolVersion']);
    if (value.type !== COMPUTE_WORKER_READY_TYPE) throw invalid('Type de message ready inattendu.');
    return value as unknown as ComputeWorkerReadyMessage;
  } catch (error) {
    throw protocolFailure(error, '');
  }
}

/** Construit une réponse d'erreur corrélée ou non corrélée. */
export function createComputeTickError(options: {
  requestId?: string;
  worldId?: string;
  code: ComputeErrorCode;
  message: string;
}): ComputeTickErrorResponse {
  const response: ComputeTickErrorResponse = {
    type: COMPUTE_TICK_ERROR_TYPE,
    protocolVersion: WORKER_PROTOCOL_VERSION,
    requestId: options.requestId ?? '',
    code: options.code,
    message: options.message,
  };
  if (options.worldId !== undefined) response.worldId = options.worldId;
  return response;
}

/** Convertit une erreur de validation en réponse protocolaire. */
export function errorResponseFrom(error: unknown): ComputeTickErrorResponse {
  if (error instanceof WorkerProtocolError) {
    return createComputeTickError({
      requestId: error.requestId,
      worldId: error.worldId,
      code: error.code,
      message: error.message,
    });
  }
  return createComputeTickError({
    code: 'compute_error',
    message: error instanceof Error ? error.message : String(error),
  });
}
