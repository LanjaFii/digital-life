/**
 * Évaluation deterministe des actions candidates (Phase 3C).
 *
 * Service pur : aucune exécution d'action, aucun PRNG, aucun effet de bord.
 * Toutes les valeurs lues (besoins/émotions projetés, personnalité, heure)
 * proviennent du même tick ; aucun candidat ne modifie un autre candidat.
 */
import type { CharacterEmotions, CharacterNeeds, EmotionKey, NeedKey } from '../../shared/character';
import type { GoalSelectionResult, ScoreComponents, ScoredCandidate } from '../../shared/decision';
import type {
  ActionCandidate,
  ActionId,
  CharacterActionRuntime,
} from '../../shared/action';
import type { AutonomousDecisionSnapshot, DecisionParameters } from '../../shared/simulation-rules';
import { getActionDefinition } from './action-registry.service';
import { EMOTION_DIRECTION } from './goal-selection.service';
import { clamp, quantize, traitMultiplier } from './personality-influence.service';

export interface ActionScoringInput {
  snapshot: AutonomousDecisionSnapshot;
  candidates: readonly ActionCandidate[];
  goals: GoalSelectionResult;
  projectedNeeds: Readonly<CharacterNeeds>;
  projectedEmotions: Readonly<CharacterEmotions>;
  params: DecisionParameters;
}

function emptyComponents(): ScoreComponents {
  return { need: 0, emotion: 0, trait: 0, circadian: 0, cost: 0, repetition: 0, duration: 0 };
}

function normalizeScore(score: number): number {
  return score === 0 ? 0 : score;
}

/** Score borné [-5, 5] et quantifié ; `idle` vaut exactement 0. */
export function scoreActionCandidates(input: ActionScoringInput): ScoredCandidate[] {
  const { params, snapshot } = input;
  if (!Number.isInteger(params.decisionScorePrecision)
    || params.decisionScorePrecision < 0
    || params.decisionScorePrecision > 6) {
    throw new Error('Précision de score de décision invalide.');
  }
  const runtime: CharacterActionRuntime = snapshot.actionRuntime;
  const isNight = snapshot.hour >= 22 || snapshot.hour < 7;

  return input.candidates.map((candidate) => {
    if (!candidate.feasible) {
      return {
        actionId: candidate.actionId,
        feasible: false,
        score: 0,
        components: emptyComponents(),
        rejections: candidate.rejections.map((r) => ({ ...r })),
      };
    }

    const definition = getActionDefinition(candidate.actionId);
    const components = emptyComponents();
    const timingFactor = definition.effectTiming === 'per_tick' ? definition.durationTicks : 1;

    for (const key of Object.keys(definition.satisfies) as NeedKey[]) {
      const nominal = definition.satisfies[key];
      if (nominal === undefined || nominal === 0) continue;
      const urgency = input.goals.needUrgencies[key];
      const margin = 100 - input.projectedNeeds[key];
      const effectiveGain = Math.min(nominal * timingFactor, margin);
      if (effectiveGain <= 0) continue;
      components.need += (effectiveGain / 100) * urgency;
    }

    for (const key of Object.keys(definition.costs) as NeedKey[]) {
      const nominal = definition.costs[key];
      if (nominal === undefined || nominal === 0) continue;
      const urgency = input.goals.needUrgencies[key];
      components.cost += (Math.abs(nominal) / 100) * urgency;
    }

    for (const key of Object.keys(definition.emotionalEffects) as EmotionKey[]) {
      const nominal = definition.emotionalEffects[key];
      if (nominal === undefined || nominal === 0) continue;
      const urgency = input.goals.emotionUrgencies[key];
      const alignment = EMOTION_DIRECTION[key] === 'decrease' ? -1 : 1;
      components.emotion += alignment * (nominal / 100) * urgency;
    }

    components.trait = params.traitWeight * (traitMultiplier(snapshot.traits, definition.traitAffinity) - 1);
    if (candidate.actionId === 'sleep' && isNight) components.circadian = params.circadianWeight;

    if (candidate.actionId !== 'idle') {
      const occurrences = runtime.recentActionIds.filter((id: ActionId) => id === candidate.actionId).length;
      const repetition = Math.min(1, occurrences / Math.max(1, params.actionHistorySize));
      components.repetition = params.repetitionWeight * repetition;
    }
    components.duration = params.durationWeight
      * (definition.durationTicks - 1)
      / Math.max(1, params.maxActionDurationTicks);

    const raw = params.needWeight * components.need
      + params.emotionWeight * components.emotion
      + components.trait
      + components.circadian
      - params.costWeight * components.cost
      - components.repetition
      - components.duration;
    const score = normalizeScore(quantize(clamp(raw, -5, 5), params.decisionScorePrecision));
    return {
      actionId: candidate.actionId,
      feasible: true,
      score,
      components,
      rejections: [],
    };
  });
}
