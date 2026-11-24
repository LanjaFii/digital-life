/**
 * Application des effets numériques d'une action (Phase 3C).
 *
 * Service pur : calcule les valeurs finales et les deltas d'audit, sans
 * Electron, SQLite, PRNG ni réseau. Les effets sont ajoutés aux valeurs
 * projetées par l'évolution passive, puis quantifiés une seule fois.
 */
import type {
  ActionDefinition,
  ActionEffectDelta,
  ActionFailureRule,
  ActionId,
  CharacterActionRuntime,
  DecisionRule,
} from '../../shared/action';
import {
  EMOTION_KEYS,
  NEED_KEYS,
  type CharacterEmotions,
  type CharacterNeeds,
  type CharacterTraits,
} from '../../shared/character';
import type { SimulationParametersV1 } from '../../shared/simulation-rules';
import { findActionFailure } from './decision-engine.service';
import { EMOTION_DIRECTION } from './goal-selection.service';
import {
  clamp,
  emotionBaseline,
  finalizeValue,
  traitMultiplier,
} from './personality-influence.service';

export interface ActionExecutionInput {
  characterId: string;
  tick: number;
  definition: ActionDefinition;
  /** Valeurs après évolution passive du tick, avant effet d'action. */
  projectedNeeds: Readonly<CharacterNeeds>;
  projectedEmotions: Readonly<CharacterEmotions>;
  traits: Readonly<CharacterTraits>;
  params: SimulationParametersV1;
  /** État actif avant décision, uniquement pour les règles d'échec. */
  active: CharacterActionRuntime['active'];
  selectionRule: DecisionRule;
}

export interface ActionFailureInfo {
  ruleId: string;
  reason: string;
  onFailure: ActionFailureRule['onFailure'];
}

export interface ActionExecutionResult {
  needs: CharacterNeeds;
  emotions: CharacterEmotions;
  deltas: ActionEffectDelta[];
  failure: ActionFailureInfo | null;
}

function resolveFailure(
  definition: ActionDefinition,
  input: ActionExecutionInput,
): ActionFailureInfo | null {
  if (!input.active) return null;
  const failure = findActionFailure(
    definition,
    { needs: input.projectedNeeds, active: input.active },
    input.tick,
  );
  if (!failure) return null;
  const rule = definition.failureRules.find((candidate) => candidate.id === failure.ruleId);
  if (!rule) throw new Error(`Règle d'échec introuvable : ${failure.ruleId}.`);
  return { ...failure, onFailure: rule.onFailure };
}

function delta(
  input: ActionExecutionInput,
  actionId: ActionId,
  field: ActionEffectDelta['field'],
  expected: number,
  applied: number,
): ActionEffectDelta {
  return {
    characterId: input.characterId,
    actionId,
    tick: input.tick,
    field,
    expected,
    applied: applied === 0 ? 0 : applied,
    ruleId: `action.${actionId}.effect`,
  };
}

/**
 * Applique une action au snapshot projeté. Retourne les valeurs finales déjà
 * quantifiées : l'orchestrateur ne doit pas les requantifier une seconde fois.
 */
export function executeActionEffects(input: ActionExecutionInput): ActionExecutionResult {
  const failure = resolveFailure(input.definition, input);
  if (failure) {
    return {
      needs: { ...input.projectedNeeds },
      emotions: { ...input.projectedEmotions },
      deltas: [],
      failure,
    };
  }

  const actionId = input.definition.id;
  const multiplier = traitMultiplier(input.traits, input.definition.traitAffinity);
  const rawNeeds: CharacterNeeds = { ...input.projectedNeeds };
  const rawEmotions: CharacterEmotions = { ...input.projectedEmotions };
  const deltas: ActionEffectDelta[] = [];

  for (const key of NEED_KEYS) {
    const gain = input.definition.satisfies[key] ?? 0;
    const cost = input.definition.costs[key] ?? 0;
    const nominal = gain + cost;
    if (nominal === 0) continue;
    const projected = input.projectedNeeds[key];
    const gross = nominal * multiplier;
    const applied = clamp(gross, -projected, 100 - projected);
    rawNeeds[key] = projected + applied;
    deltas.push(delta(input, actionId, `needs.${key}`, nominal, applied));
  }

  for (const key of EMOTION_KEYS) {
    const nominal = input.definition.emotionalEffects[key] ?? 0;
    if (nominal === 0) continue;
    const projected = input.projectedEmotions[key];
    const isNegative = EMOTION_DIRECTION[key] === 'decrease';
    // Une émotion négative ne descend pas sous sa baseline ; une émotion
    // positive ne descend pas sous 0. Aucune valeur n'est forcée vers sa cible.
    const floor = isNegative ? emotionBaseline(input.params.emotions[key], input.traits) : 0;
    const gross = nominal * multiplier;
    const applied = gross >= 0
      ? Math.min(gross, Math.max(0, 100 - projected))
      : -Math.min(-gross, Math.max(0, projected - floor));
    rawEmotions[key] = projected + applied;
    deltas.push(delta(input, actionId, `emotions.${key}`, nominal, applied));
  }

  const needs = {} as CharacterNeeds;
  for (const key of NEED_KEYS) needs[key] = finalizeValue(rawNeeds[key], input.params);
  const emotions = {} as CharacterEmotions;
  for (const key of EMOTION_KEYS) emotions[key] = finalizeValue(rawEmotions[key], input.params);

  return { needs, emotions, deltas, failure: null };
}

/** Vérifie qu'aucune action Tier B n'est appliquée, même si elle est sélectionnée. */
export function assertActionExecutable(definition: ActionDefinition): void {
  if (definition.availability !== 'available') {
    throw new Error(`Action non exécutable (environnement absent) : ${definition.id}.`);
  }
  if (definition.sideEffects.length > 0) {
    throw new Error(`Effet non numérique non implémenté : ${definition.id}.`);
  }
}
