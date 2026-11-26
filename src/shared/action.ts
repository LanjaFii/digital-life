/**
 * Contrats du catalogue d'actions autonomes (Phase 3C).
 *
 * Aucun code Node ici : types et valeurs par défaut importables par le main,
 * le renderer et les tests. Les actions Tier B restent déclarées mais jamais
 * exécutables tant qu'aucun environnement n'existe dans le moteur.
 */
import type { CharacterEmotions, CharacterNeeds, EmotionKey, NeedKey, TraitKey } from './character';

export type ActionId =
  | 'eat' | 'drink' | 'sleep' | 'rest' | 'wash' | 'entertain_self'
  | 'explore' | 'practice_activity' | 'be_alone' | 'seek_company' | 'idle';

export type ActionCategory =
  | 'sustenance' | 'rest' | 'hygiene' | 'leisure'
  | 'exploration' | 'social' | 'fallback';

export type ActionAvailability = 'available' | 'requires_environment';

export type ActionEffectTiming = 'per_tick' | 'on_completion';

/** Règle ayant produit la décision finale d'un tick. */
export type DecisionRule =
  | 'score_tiebreak_rng'
  | 'score_tiebreak_id'
  | 'forced_idle'
  | 'continue_active'
  | 'interruption'
  | 'action_failed';

/** Source runtime unique des règles de décision (validation de l'historique 3D-A). */
export const DECISION_RULES: readonly DecisionRule[] = [
  'score_tiebreak_rng',
  'score_tiebreak_id',
  'forced_idle',
  'continue_active',
  'interruption',
  'action_failed',
] as const;

export interface ActionEffects {
  needs: Partial<Record<NeedKey, number>>;
  emotions: Partial<Record<EmotionKey, number>>;
}

export type ActionPrecondition =
  | { kind: 'need_below'; need: NeedKey; threshold: number }
  | { kind: 'need_above'; need: NeedKey; threshold: number }
  | { kind: 'emotion_above'; emotion: EmotionKey; threshold: number }
  | { kind: 'emotion_below'; emotion: EmotionKey; threshold: number }
  | { kind: 'trait_above'; trait: TraitKey; threshold: number }
  | { kind: 'hour_between'; from: number; to: number }
  | { kind: 'other_character_exists' }
  | { kind: 'no_active_action' }
  | { kind: 'cooldown_elapsed'; actionId: ActionId }
  | { kind: 'environment_available'; requirement: string }
  /** Regroupement OU documenté (ex. sommeil bas OU énergie basse). */
  | { kind: 'any_of'; conditions: readonly ActionPrecondition[] };

export interface ActionFailureRule {
  id: string;
  kind: 'need_below_during_action' | 'tick_limit' | 'interruption';
  need?: NeedKey;
  threshold?: number;
  maxTicks?: number;
  onFailure: 'abort' | 'keep_partial';
}

/**
 * Intention non numérique réservée pour les phases suivantes.
 * Phase 3C : le registre ne contient aucune intention et ne l'exécute jamais.
 */
export type SideEffectIntent =
  | { kind: 'event'; eventType: string }
  | { kind: 'relationship'; targetId: string; dimension: string }
  | { kind: 'memory'; targetId: string | null }
  | { kind: 'death' };

export interface ActionDefinition {
  id: ActionId;
  label: string;
  description: string;
  category: ActionCategory;
  version: 1;
  availability: ActionAvailability;
  environmentRequirement: string | null;
  preconditions: readonly ActionPrecondition[];
  satisfies: ActionEffects['needs'];
  costs: ActionEffects['needs'];
  emotionalEffects: ActionEffects['emotions'];
  durationTicks: number;
  effectTiming: ActionEffectTiming;
  interruptible: boolean;
  cooldownTicks: number;
  traitAffinity: Partial<Record<TraitKey, number>>;
  failureRules: readonly ActionFailureRule[];
  sideEffects: readonly SideEffectIntent[];
}

export interface ActionRegistry {
  version: 1;
  definitions: Readonly<Record<ActionId, ActionDefinition>>;
}

export interface ActionCandidate {
  actionId: ActionId;
  feasible: boolean;
  rejections: Array<{ precondition: ActionPrecondition['kind']; reason: string }>;
}

/** Écart entre l'effet nominal attendu et l'effet réellement appliqué. */
export interface ActionEffectDelta {
  characterId: string;
  actionId: ActionId;
  tick: number;
  field: `needs.${NeedKey}` | `emotions.${EmotionKey}`;
  expected: number;
  applied: number;
  ruleId: `action.${ActionId}.effect`;
}

/** État mutable d'une action, sérialisé dans `characters.current_action_json`. */
export interface CharacterActionRuntime {
  version: 1;
  active: {
    actionId: ActionId;
    startedTick: number;
    endsAtTick: number;
    lastAppliedTick: number;
    interruptedCount: number;
  } | null;
  /** Du plus ancien au plus récent, borné par `DecisionParameters.actionHistorySize`. */
  recentActionIds: ActionId[];
  /** tick à partir duquel l'action redevient éligible. */
  cooldowns: Partial<Record<ActionId, number>>;
  lastDecision: {
    tick: number;
    actionId: ActionId;
    rule: DecisionRule;
    reason: string;
  } | null;
  /** Compteur racine conservé même quand aucune action n'est active. */
  interruptedCount: number;
}

/** Version du catalogue statique ; source unique pour le protocole et l'historique. */
export const ACTION_REGISTRY_VERSION = 1 as const;

export const ACTION_IDS: readonly ActionId[] = [
  'eat', 'drink', 'sleep', 'rest', 'wash', 'entertain_self',
  'explore', 'practice_activity', 'be_alone', 'seek_company', 'idle',
] as const;

export const ACTION_HISTORY_SIZE = 5;
export const MAX_ACTION_DURATION_TICKS = 8;

export function createDefaultActionRuntime(): CharacterActionRuntime {
  return {
    version: 1,
    active: null,
    recentActionIds: [],
    cooldowns: {},
    lastDecision: null,
    interruptedCount: 0,
  };
}

/** Valeur de la colonne additive `current_action_json` pour les anciennes instances. */
export const DEFAULT_CHARACTER_ACTION_RUNTIME_JSON = JSON.stringify(createDefaultActionRuntime());

/** Alias de compatibilité pour les tests et la documentation. */
export type ProjectedNeeds = CharacterNeeds;
export type ProjectedEmotions = CharacterEmotions;
