/**
 * Orchestration pure d'un tick personnage (Phase 3B + décisions Phase 3C).
 *
 * Ce service ne touche ni SQLite, ni Electron, ni le réseau. Il trie les
 * personnages par identifiant, calcule chaque personnage depuis un snapshot
 * immuable, applique une décision autonome sur les valeurs projetées, agrège
 * les artefacts d'audit, puis finalise les valeurs avec un seul arrondi.
 *
 * Les règles d'échec sont évaluées une seule fois, par le moteur de décision,
 * sur les valeurs de début de tick ; l'exécution ne les réévalue pas.
 */
import {
  createDefaultActionRuntime,
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
  type DecisionExplanation,
  type GoalSelectionResult,
  type DecisionRecordPayloadV1,
  type ScoredCandidate,
} from '../../shared/decision';
import type {
  AutonomousDecisionSnapshot,
  CharacterTickInput,
  CharacterTickResult,
  CharacterTickSnapshot,
  DecisionParameters,
  TickDelta,
  TickDeltaCause,
} from '../../shared/simulation-rules';
import { assertActionExecutable, executeActionEffects } from './action-execution.service';
import { buildActionCandidates } from './action-candidacy.service';
import { ACTION_REGISTRY, getActionDefinition } from './action-registry.service';
import {
  clearActiveActionRuntime,
  continueActionRuntime,
  parseActionRuntime,
  startActionRuntime,
} from './action-runtime.service';
import { scoreActionCandidates } from './action-scoring.service';
import { collectRuleIds } from '../../shared/canonicalization';
import { decideAction } from './decision-engine.service';
import { selectImmediateGoals } from './goal-selection.service';
import { finalizeValue } from './personality-influence.service';
import { projectEmotions } from './emotion-evolution.service';
import { projectNeeds } from './needs-evolution.service';
import { SeededRng } from './prng';

/** Tri stable et indépendant de la locale des identifiants. */
export function orderSnapshots(
  characters: readonly CharacterTickSnapshot[],
): CharacterTickSnapshot[] {
  return [...characters].sort((a, b) => {
    const left = a.characterId < b.characterId ? -1 : a.characterId > b.characterId ? 1 : 0;
    return left;
  });
}

function resolveDecisionParams(input: CharacterTickInput): DecisionParameters {
  return { ...input.params.decision, ...(input.decisionParams ?? {}) };
}

/** Deltas passifs par besoin, calculés avant tout effet d'action. */
function passiveDeltas(deltas: readonly TickDelta[]): Record<NeedKey, number> {
  const result = {} as Record<NeedKey, number>;
  for (const key of NEED_KEYS) {
    result[key] = deltas.find((d) => d.field === `needs.${key}`)?.delta ?? 0;
  }
  return result;
}

/**
 * Ajoute les causes d'effets d'action aux deltas passifs. `finalizeCharacter`
 * n'utilise que les causes pour construire un `TickDelta` déjà quantifié.
 */
function withActionCauses(
  rawDeltas: readonly TickDelta[],
  effects: readonly ActionEffectDelta[],
  projectedNeeds: Readonly<CharacterNeeds>,
  projectedEmotions: Readonly<CharacterEmotions>,
): TickDelta[] {
  const merged = rawDeltas.map((delta) => ({ ...delta, causes: [...delta.causes] }));
  const positions = new Map(merged.map((delta, index) => [delta.field, index] as const));

  for (const effect of effects) {
    const cause: TickDeltaCause = {
      kind: 'action_effect',
      source: effect.ruleId,
      contribution: effect.applied,
      note: `nominal ${effect.expected}`,
    };
    const position = positions.get(effect.field);
    if (position !== undefined) {
      merged[position].causes.push(cause);
      continue;
    }
    const isNeed = effect.field.startsWith('needs.');
    const key = effect.field.slice(isNeed ? 6 : 9);
    const before = isNeed
      ? projectedNeeds[key as NeedKey]
      : projectedEmotions[key as EmotionKey];
    merged.push({
      entityId: effect.characterId,
      field: effect.field,
      before,
      after: before + effect.applied,
      delta: effect.applied,
      causes: [cause],
      ruleId: effect.ruleId,
    });
    positions.set(effect.field, merged.length - 1);
  }
  return merged;
}

/**
 * Applique arrondi déterministe et bornage final à toutes les valeurs.
 * Quand l'exécution d'action a déjà quantifié les valeurs, l'arrondi est
 * explicitement évité pour respecter l'unique quantification du tick.
 */
function finalizeCharacter(
  snapshot: CharacterTickSnapshot,
  needs: Readonly<CharacterNeeds>,
  emotions: Readonly<CharacterEmotions>,
  rawDeltas: readonly TickDelta[],
  input: CharacterTickInput,
  valuesAlreadyFinalized: boolean,
): CharacterTickResult['characterStates'][number] & { deltas: TickDelta[]; warnings: string[] } {
  const needsFinal = {} as CharacterNeeds;
  const emotionsFinal = {} as CharacterEmotions;
  const deltas: TickDelta[] = [];
  const warnings: string[] = [];

  for (const key of NEED_KEYS) {
    const before = snapshot.needs[key];
    const after = valuesAlreadyFinalized ? needs[key] : finalizeValue(needs[key], input.params);
    needsFinal[key] = after;
    if (after !== before) {
      const raw = rawDeltas.find((d) => d.field === `needs.${key}`);
      deltas.push({
        entityId: snapshot.characterId,
        field: `needs.${key}`,
        before,
        after,
        delta: after - before,
        causes: raw?.causes ?? [{ kind: 'rounding', source: 'rule.finalize', contribution: after - before }],
        ruleId: `needs.${key}.evolution`,
      });
    }
  }

  for (const key of EMOTION_KEYS) {
    const before = snapshot.emotions[key];
    const after = valuesAlreadyFinalized ? emotions[key] : finalizeValue(emotions[key], input.params);
    emotionsFinal[key] = after;
    if (after !== before) {
      const raw = rawDeltas.find((d) => d.field === `emotions.${key}`);
      deltas.push({
        entityId: snapshot.characterId,
        field: `emotions.${key}`,
        before,
        after,
        delta: after - before,
        causes: raw?.causes ?? [{ kind: 'rounding', source: 'rule.finalize', contribution: after - before }],
        ruleId: `emotions.${key}.evolution`,
      });
    }
  }

  if (needsFinal.safety === 0) warnings.push(`${snapshot.characterId}: safety à 0`);
  if (needsFinal.health === 0) warnings.push(`${snapshot.characterId}: health à 0`);

  return { characterId: snapshot.characterId, needs: needsFinal, emotions: emotionsFinal, deltas, warnings };
}

interface DecisionOutcome {
  runtime: CharacterActionRuntime;
  effects: ActionEffectDelta[];
  needs: Readonly<CharacterNeeds>;
  emotions: Readonly<CharacterEmotions>;
  finalized: boolean;
}

/**
 * Applique la décision au runtime et aux valeurs projetées. Les effets sont
 * calculés depuis les valeurs projetées, jamais depuis un état déjà modifié
 * par un autre personnage du même tick.
 */
function applyDecision(
  input: CharacterTickInput,
  snapshot: AutonomousDecisionSnapshot,
  decision: DecisionExplanation,
  projectedNeeds: CharacterNeeds,
  projectedEmotions: CharacterEmotions,
): DecisionOutcome {
  const runtimeBefore = snapshot.actionRuntime;
  const activeBefore = runtimeBefore.active;
  const definition = getActionDefinition(decision.selectedActionId);
  assertActionExecutable(definition);

  const execute = (): DecisionOutcome => {
    const result = executeActionEffects({
      characterId: snapshot.characterId,
      tick: input.tick,
      definition,
      projectedNeeds,
      projectedEmotions,
      traits: snapshot.traits,
      params: input.params,
      // La règle d'échec a déjà été évaluée par le moteur de décision.
      active: null,
      selectionRule: decision.selectionRule,
    });
    if (result.failure) {
      throw new Error(`Échec d'action non décidé par le moteur : ${result.failure.ruleId}.`);
    }
    return {
      runtime: runtimeBefore,
      effects: result.deltas,
      needs: result.needs,
      emotions: result.emotions,
      finalized: true,
    };
  };

  if (activeBefore && decision.selectionRule === 'action_failed') {
    return {
      runtime: clearActiveActionRuntime(
        runtimeBefore, input.tick, activeBefore.actionId, 'action_failed', decision.reason,
      ),
      effects: [],
      needs: projectedNeeds,
      emotions: projectedEmotions,
      finalized: false,
    };
  }

  let outcome: DecisionOutcome;
  if (activeBefore && decision.selectionRule === 'interruption') {
    outcome = execute();
    outcome.runtime = clearActiveActionRuntime(
      outcome.runtime, input.tick, activeBefore.actionId, 'interruption', decision.reason,
    );
  } else if (activeBefore && decision.selectionRule === 'continue_active') {
    outcome = execute();
    outcome.runtime = continueActionRuntime(runtimeBefore, input.tick, definition.cooldownTicks);
    return outcome;
  } else {
    outcome = execute();
  }

  outcome.runtime = startActionRuntime(
    outcome.runtime,
    decision.selectedActionId,
    input.tick,
    definition.durationTicks,
    definition.cooldownTicks,
    resolveDecisionParams(input).actionHistorySize,
    decision.selectionRule,
    decision.reason,
  );
  return outcome;
}

/**
 * Score associé à la décision finale. Les interruptions sont évaluées depuis
 * `interruptionScored` ; poursuite et échec ne réévaluent aucun candidat et
 * portent explicitement `0`.
 */
function resolveSelectedScore(
  decision: DecisionExplanation,
  scored: readonly ScoredCandidate[],
  interruptionScored: readonly ScoredCandidate[],
): number {
  if (decision.selectionRule === 'continue_active' || decision.selectionRule === 'action_failed') return 0;
  const pool = decision.selectionRule === 'interruption' ? interruptionScored : scored;
  const candidate = pool.find((item) => item.actionId === decision.selectedActionId);
  if (!candidate) throw new Error(`Score du candidat retenu introuvable pour ${decision.selectedActionId}.`);
  return candidate.score;
}

function resolvePreviousAction(runtime: CharacterActionRuntime): DecisionRecordPayloadV1['previousAction'] {
  const active = runtime.active;
  const last = runtime.lastDecision;
  if (active) {
    return {
      actionId: active.actionId,
      rule: last?.tick === active.startedTick && last.actionId === active.actionId ? last.rule : null,
      tick: active.startedTick,
      active: true,
    };
  }
  return {
    actionId: last?.actionId ?? null,
    rule: last?.rule ?? null,
    tick: last?.tick ?? null,
    active: false,
  };
}

/** Extrait les avertissements d'un personnage du tableau global préfixé. */
function characterWarnings(warnings: readonly string[], characterId: string): string[] {
  const prefix = `${characterId}:`;
  return warnings.filter((warning) => warning.startsWith(prefix));
}

interface BuildRecordInput {
  snapshot: CharacterTickSnapshot;
  decision: DecisionExplanation;
  scored: readonly ScoredCandidate[];
  interruptionScored: readonly ScoredCandidate[];
  runtimeBefore: CharacterActionRuntime;
  runtimeAfter: CharacterActionRuntime;
  goals: GoalSelectionResult;
  paramsVersion: number;
  passiveDeltas: readonly TickDelta[];
  actionDeltas: readonly ActionEffectDelta[];
  appliedDeltas: readonly TickDelta[];
  warnings: readonly string[];
  finalized: { needs: CharacterNeeds; emotions: CharacterEmotions };
  characterName: string;
}

function buildDecisionRecordPayload(input: BuildRecordInput): DecisionRecordPayloadV1 {
  const { decision, snapshot } = input;
  const passiveDeltas = input.passiveDeltas.map((delta) => ({ ...delta, causes: delta.causes.map((cause) => ({ ...cause })) }));
  const actionDeltas = input.actionDeltas.map((delta) => ({ ...delta }));
  const appliedDeltas = input.appliedDeltas.map((delta) => ({ ...delta, causes: delta.causes.map((cause) => ({ ...cause })) }));
  return {
    id: `${decision.worldId}:${decision.tick}:${decision.characterId}`,
    recordVersion: 1,
    engineVersion: DECISION_ENGINE_VERSION,
    registryVersion: ACTION_REGISTRY.version,
    parametersVersion: input.paramsVersion,
    ruleIds: collectRuleIds({
      explanation: decision,
      passiveDeltas,
      actionDeltas,
      appliedDeltas,
    }),
    explanation: decision,
    score: resolveSelectedScore(decision, input.scored, input.interruptionScored),
    needUrgencies: { ...input.goals.needUrgencies },
    emotionUrgencies: { ...input.goals.emotionUrgencies },
    previousAction: resolvePreviousAction(input.runtimeBefore),
    newAction: { actionId: decision.selectedActionId, rule: decision.selectionRule },
    characterName: input.characterName,
    stateBefore: {
      needs: { ...snapshot.needs },
      emotions: { ...snapshot.emotions },
      runtime: input.runtimeBefore,
    },
    stateAfter: {
      needs: { ...input.finalized.needs },
      emotions: { ...input.finalized.emotions },
      runtime: input.runtimeAfter,
    },
    passiveDeltas,
    actionDeltas,
    appliedDeltas,
    warnings: characterWarnings(input.warnings, snapshot.characterId),
  };
}

/** Calcule le tick complet de tous les personnages. Résultat purement mémoire. */
export function computeCharacterTick(input: CharacterTickInput): CharacterTickResult {
  const ordered = orderSnapshots(input.characters);
  const decisionParams = resolveDecisionParams(input);
  // Un seul PRNG par tick, séquencé dans l'ordre trié des identifiants.
  const rng = new SeededRng(0);
  rng.setState(input.rngState);

  const characterStates: CharacterTickResult['characterStates'] = [];
  const deltas: TickDelta[] = [];
  const warnings: string[] = [];
  const decisions: DecisionExplanation[] = [];
  const decisionRecords: DecisionRecordPayloadV1[] = [];
  const actionDeltas: ActionEffectDelta[] = [];
  const actionRuntimeStates: CharacterTickResult['actionRuntimeStates'] = [];

  for (const snapshot of ordered) {
    const projectedNeeds = projectNeeds(snapshot, input.params);
    const projectedEmotions = projectEmotions(snapshot, projectedNeeds.needs, input.params);
    const needDeltas = passiveDeltas(projectedNeeds.deltas);
    const runtime = parseActionRuntime(
      input.actionRuntimeByCharacter?.[snapshot.characterId] ?? createDefaultActionRuntime(),
    );
    const decisionSnapshot: AutonomousDecisionSnapshot = {
      ...snapshot,
      hour: input.hour,
      actionRuntime: runtime,
      passiveNeedDeltas: needDeltas,
      otherCharacterExists: ordered.length > 1,
    };

    const goals = selectImmediateGoals({
      characterId: snapshot.characterId,
      tick: input.tick,
      hour: input.hour,
      projectedNeeds: projectedNeeds.needs,
      needDeltas,
      emotions: snapshot.emotions,
      goals: snapshot.goals,
      params: input.params,
      decisionParams,
    });
    const scoringContext = {
      goals,
      projectedNeeds: projectedNeeds.needs,
      projectedEmotions: projectedEmotions.emotions,
      params: decisionParams,
    };
    const scored = scoreActionCandidates({
      snapshot: decisionSnapshot,
      candidates: buildActionCandidates(decisionSnapshot, input.tick),
      ...scoringContext,
    });
    // Second jeu utilisé uniquement pour la quatrième condition d'interruption.
    const releasedSnapshot: AutonomousDecisionSnapshot = {
      ...decisionSnapshot,
      actionRuntime: { ...runtime, active: null },
    };
    const interruptionScored = scoreActionCandidates({
      snapshot: releasedSnapshot,
      candidates: buildActionCandidates(releasedSnapshot, input.tick),
      ...scoringContext,
    });

    const decision = decideAction({
      snapshot: decisionSnapshot,
      worldId: input.worldId,
      tick: input.tick,
      day: input.day,
      hour: input.hour,
      scored,
      interruptionScored,
      goals,
      params: decisionParams,
      rng,
    });
    if (decision.rngState !== rng.getState()) {
      throw new Error('État PRNG incohérent entre le moteur de décision et l’orchestrateur.');
    }

    const outcome = applyDecision(
      input, decisionSnapshot, decision.explanation,
      projectedNeeds.needs as CharacterNeeds,
      projectedEmotions.emotions as CharacterEmotions,
    );
    const rawDeltas = withActionCauses(
      [...projectedNeeds.deltas, ...projectedEmotions.deltas],
      outcome.effects,
      projectedNeeds.needs as CharacterNeeds,
      projectedEmotions.emotions as CharacterEmotions,
    );
    const finalized = finalizeCharacter(
      snapshot,
      outcome.needs,
      outcome.emotions,
      rawDeltas,
      input,
      outcome.finalized,
    );

    characterStates.push({ characterId: finalized.characterId, needs: finalized.needs, emotions: finalized.emotions });
    deltas.push(...finalized.deltas);
    warnings.push(...finalized.warnings);
    decisions.push(decision.explanation);
    decisionRecords.push(buildDecisionRecordPayload({
      snapshot,
      decision: decision.explanation,
      scored,
      interruptionScored,
      runtimeBefore: runtime,
      runtimeAfter: outcome.runtime,
      goals,
      paramsVersion: input.params.version,
      finalized,
      passiveDeltas: [...projectedNeeds.deltas, ...projectedEmotions.deltas],
      actionDeltas: outcome.effects,
      appliedDeltas: finalized.deltas,
      warnings: finalized.warnings,
      characterName: input.characterNameByCharacterId?.[snapshot.characterId] ?? snapshot.characterId,
    }));
    actionDeltas.push(...outcome.effects);
    actionRuntimeStates.push({ characterId: snapshot.characterId, runtime: outcome.runtime });
  }

  return {
    worldId: input.worldId,
    tick: input.tick,
    rngState: rng.getState(),
    characterStates,
    deltas,
    decisions,
    decisionRecords,
    actionDeltas,
    actionRuntimeStates,
    warnings,
  };
}
