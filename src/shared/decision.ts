/**
 * Contrats de sélection des objectifs immédiats et des décisions (Phase 3C).
 *
 * Ces artefacts sont calculés à chaque tick et retournés pour audit. Aucun
 * objectif immédiat n'est écrit dans `current_goals_json` et aucun texte libre
 * (`CharacterGoal.label`) n'est interprété.
 */
import type { ActionEffects, ActionId, DecisionRule } from './action';
import type { EmotionKey, NeedKey } from './character';
import type { AutonomousDecisionSnapshot, DecisionParameters } from './simulation-rules';

export type MotivationSource = 'need' | 'emotion' | 'circadian';

export interface Motivation {
  /** Exemples : "need:thirst", "emotion:stress", "circadian:night". */
  id: string;
  source: MotivationSource;
  refKey: NeedKey | EmotionKey | 'night';
  /** Cible logique utilisée pour le regroupement en objectif immédiat. */
  targetKey: NeedKey | EmotionKey;
  /** 0..1, calculé depuis les valeurs projetées du tick. */
  urgency: number;
  direction: 'increase' | 'decrease';
  reason: string;
}

export interface ImmediateGoal {
  /** Exemples : "restore:thirst", "reduce:stress", "rest:night". */
  id: string;
  label: string;
  /** 1 = prioritaire. */
  rank: number;
  urgency: number;
  motivations: Motivation[];
  ruleId: 'goal.immediate.v1';
}

export interface GoalSelectionResult {
  motivations: Motivation[];
  immediateGoals: ImmediateGoal[];
  /** Motivations écartées sous le seuil, pour explicabilité. */
  excluded: Array<{ id: string; reason: string }>;
  needUrgencies: Readonly<Record<NeedKey, number>>;
  emotionUrgencies: Readonly<Record<EmotionKey, number>>;
}

export interface ScoreComponents {
  need: number;
  emotion: number;
  trait: number;
  circadian: number;
  cost: number;
  repetition: number;
  duration: number;
}

export interface ScoredCandidate {
  actionId: ActionId;
  feasible: boolean;
  score: number;
  components: ScoreComponents;
  rejections: Array<{ precondition: string; reason: string }>;
}

/** Artefact d'audit complet, reconstituable par rejeu. */
export interface DecisionExplanation {
  worldId: string;
  characterId: string;
  tick: number;
  day: number;
  hour: number;
  ruleId: 'decision.v1';
  motivations: Motivation[];
  immediateGoals: ImmediateGoal[];
  candidateScores: ScoredCandidate[];
  selectedActionId: ActionId;
  selectionRule: DecisionRule;
  reason: string;
  rejected: Array<{ actionId: ActionId; reasons: string[] }>;
  expectedEffects: ActionEffects;
  rngStateBefore: number;
  rngStateAfter: number;
  rngDraws: 0 | 1;
}

export interface DecisionResult {
  explanation: DecisionExplanation;
  /** État PRNG après au plus un tirage conditionnel. */
  rngState: number;
}

/** Entrée pure du moteur de sélection finale. */
export interface DecisionEngineInput {
  snapshot: AutonomousDecisionSnapshot;
  worldId: string;
  tick: number;
  day: number;
  hour: number;
  scored: readonly ScoredCandidate[];
  goals: GoalSelectionResult;
  params: DecisionParameters;
  rngStateBefore: number;
  /** Tirage au plus une fois, uniquement en cas d'ex æquo. */
  nextRandom: () => number;
}
