/**
 * Contrats des règles d'évolution des personnages (Phase 3B).
 * Aucun code Node ici : types et valeurs par défaut importables par le main
 * comme par les tests, sans Electron ni SQLite.
 */
import type { ActionEffectDelta, CharacterActionRuntime } from './action';
import type { CharacterEmotions, CharacterNeeds, CharacterTraits, EmotionKey, NeedKey, TraitKey } from './character';
import type { DecisionExplanation, DecisionRecordPayloadV1 } from './decision';

/** Précision décimale des valeurs évolutives (centièmes). */
export const SIMULATION_VALUE_PRECISION = 2;

/** Version des paramètres de règles ; source unique pour le protocole et l'historique. */
export const SIMULATION_PARAMETERS_VERSION = 1 as const;

/** Causes autorisées d'un delta explicable, ordre stable de référence. */
export const TICK_DELTA_CAUSE_KINDS = [
  'base_decay', 'need_deficit', 'comfort', 'emotion_pressure', 'emotion_target',
  'trait_modifier', 'baseline_recovery', 'action_effect', 'clamp', 'rounding',
] as const;

/** Clés exactes des paramètres de décision surchargeables. */
export const DECISION_PARAMETER_KEYS = [
  'tieBreak', 'decisionScorePrecision', 'maxRngDrawsPerCharacterTick',
  'needWeight', 'emotionWeight', 'traitWeight', 'circadianWeight',
  'costWeight', 'repetitionWeight', 'durationWeight', 'minimumMotivationUrgency',
  'immediateGoalLimit', 'criticalUrgency', 'trendWeight', 'referenceDecayFloor',
  'maxActionDurationTicks', 'actionHistorySize', 'minTicksBeforeInterrupt',
] as const;

/** Origine d'une contribution à un delta, utilisée pour l'explicabilité. */
export type TickDeltaCauseKind = (typeof TICK_DELTA_CAUSE_KINDS)[number];

export interface TickDeltaCause {
  kind: TickDeltaCauseKind;
  /** Exemple : "needs.sleep", "traits.resilience", "rule.decay". */
  source: string;
  /** Poids configuré ayant produit la contribution. */
  weight?: number;
  /** Contribution au delta brut, avant clamp/arrondi final. */
  contribution?: number;
  note?: string;
}

/** Delta explicable d'un champ d'un personnage pour un tick. */
export interface TickDelta {
  entityId: string;
  /** Exemple : "needs.hunger", "emotions.stress". */
  field: string;
  before: number;
  after: number;
  delta: number;
  causes: TickDeltaCause[];
  ruleId: string;
}

export interface NeedDelta extends TickDelta {
  field: `needs.${NeedKey}`;
}

export interface EmotionDelta extends TickDelta {
  field: `emotions.${EmotionKey}`;
}

/** Snapshot immuable d'un personnage au début d'un tick. */
export interface CharacterTickSnapshot {
  characterId: string;
  traits: Readonly<CharacterTraits>;
  needs: Readonly<CharacterNeeds>;
  emotions: Readonly<CharacterEmotions>;
  /** Lecture seule en Phase 3B : aucun objectif n'évolue. */
  goals: ReadonlyArray<{ id: string; label: string; kind: 'primary' | 'secondary' }>;
}

/** Snapshot étendu utilisé par les règles de décision (Phase 3C). */
export interface AutonomousDecisionSnapshot extends CharacterTickSnapshot {
  /** Heure logique du tick, issue de l'horloge (jamais de Date.now()). */
  hour: number;
  /** Valeur par défaut si la colonne de runtime est absente. */
  actionRuntime: CharacterActionRuntime;
  /** Deltas passifs du tick, avant tout effet d'action. */
  passiveNeedDeltas: Readonly<Record<NeedKey, number>>;
  /** Déduit du nombre de personnages du tick, jamais inventé. */
  otherCharacterExists: boolean;
}

/** Paramètres de décision versionnés, tous explicitement calibrables. */
export interface DecisionParameters {
  /** Départage des ex æquo : 'id' deterministe ou 'rng' conditionnel. */
  tieBreak: 'id' | 'rng';
  decisionScorePrecision: number;
  maxRngDrawsPerCharacterTick: 1;
  needWeight: number;
  emotionWeight: number;
  traitWeight: number;
  circadianWeight: number;
  costWeight: number;
  repetitionWeight: number;
  durationWeight: number;
  minimumMotivationUrgency: number;
  immediateGoalLimit: number;
  criticalUrgency: number;
  trendWeight: number;
  referenceDecayFloor: number;
  maxActionDurationTicks: number;
  actionHistorySize: number;
  minTicksBeforeInterrupt: number;
}

/** Entrée pure du moteur de tick. */
export interface CharacterTickInput {
  worldId: string;
  /** Tick calculé (tick courant + 1), jamais le tick déjà persisté. */
  tick: number;
  day: number;
  hour: number;
  seed: number;
  /** uint32 ; conservé sauf départage PRNG effectif (Phase 3C). */
  rngState: number;
  /** Ordre quelconque : le service trie par identifiant avant calcul. */
  characters: readonly CharacterTickSnapshot[];
  params: SimulationParametersV1;
  /** Surcharge optionnelle des paramètres de décision (tests, rejeux). */
  decisionParams?: Partial<DecisionParameters>;
  /** Runtime par identifiant ; valeur par défaut si absent. */
  actionRuntimeByCharacter?: Readonly<Record<string, CharacterActionRuntime>>;
  /** Noms affichés copiés dans l'historique ; sans effet sur les règles. */
  characterNameByCharacterId?: Readonly<Record<string, string>>;
}

/** Résultat pur d'un tick : aucun effet Electron/SQLite. */
export interface CharacterTickResult {
  worldId: string;
  tick: number;
  rngState: number;
  characterStates: Array<{
    characterId: string;
    needs: CharacterNeeds;
    emotions: CharacterEmotions;
  }>;
  deltas: TickDelta[];
  /** Explications complètes, calculées même pour une action poursuivie. */
  decisions: DecisionExplanation[];
  /** Charges utiles d'historique, indexées comme `decisions`. */
  decisionRecords: DecisionRecordPayloadV1[];
  actionDeltas: ActionEffectDelta[];
  actionRuntimeStates: Array<{ characterId: string; runtime: CharacterActionRuntime }>;
  warnings: string[];
}

/** Contexte mis à disposition des règles (PRNG non consommé en Phase 3B). */
export interface TickRuleContext {
  params: SimulationParametersV1;
  rng?: { getState(): number; next(): number };
}

/** Déclencheur d'une accélération de dégradation d'un besoin. */
export interface NeedAccelerator {
  /** Besoin ou émotion.source lu dans le snapshot de début de tick. */
  source: NeedKey | EmotionKey;
  kind: 'need_below' | 'need_above' | 'emotion_above';
  /** Seuil à partir duquel l'effet apparaît. */
  threshold: number;
  /** Contribution maximale à la dégradation (points/tick). */
  amount: number;
}

/** Récupération passive d'un besoin (désactivée par défaut sauf exceptions documentées). */
export interface NeedRecovery {
  kind: 'below_baseline' | 'requires_comfort';
  baseline?: number;
  rate: number;
  requires?: readonly NeedKey[];
  threshold?: number;
  max?: number;
  /** Modificateurs de traits appliqués uniquement à la récupération. */
  recoveryTraits?: Partial<Record<TraitKey, number>>;
}

/** Coefficients d'un besoin, tous exprimés en points par tick (1 h simulée). */
export interface NeedRule {
  /** Dégradation de base, positive = perte. */
  decay: number;
  /** k tel que mod = Π(1 + k * traitFactor) ; k < 0 réduit la perte. */
  traitModifiers: Partial<Record<TraitKey, number>>;
  accelerators: readonly NeedAccelerator[];
  recovery?: NeedRecovery;
  /** Plafond de perte totale par tick, si défini. */
  lossCap?: number;
}

/** Coefficients d'une émotion. */
export interface EmotionRule {
  baseline: number;
  min: number;
  max: number;
  /** Taux de retour vers la cible (0.02 à 0.12 / tick). */
  recoveryRate: number;
  /** w tel que déficit_b * w pousse l'émotion (signe inclus). */
  needWeights: Partial<Record<NeedKey, number>>;
  /** w tel que confort_b * w décale la cible (signe inclus). */
  comfortWeights: Partial<Record<NeedKey, number>>;
  /** w tel que pression(émotion source) * pousse l'émotion (signe inclus). */
  emotionWeights: Partial<Record<EmotionKey, number>>;
  /** w tel que l'écart à la cible d'une émotion décale la cible (signe inclus). */
  emotionTargetWeights: Partial<Record<EmotionKey, number>>;
  /** Biais de baseline : baseline += Σ b * traitFactor (borné par min/max). */
  baselineTraits: Partial<Record<TraitKey, number>>;
  /** Modificateurs appliqués à la pression (k < 0 atténue). */
  pressureTraits: Partial<Record<TraitKey, number>>;
  /** Modificateurs appliqués à la récupération (k > 0 accélère). */
  recoveryTraits: Partial<Record<TraitKey, number>>;
}

/**
 * Paramètres versionnés de la simulation. Toutes les valeurs sont des
 * hypothèses de calibration documentées : modifier ce objet doit être
 * accompagné d'un test long et d'une mise à jour de la documentation.
 */
export interface SimulationParametersV1 {
  version: 1;
  precision: number;
  /** Déficit nul tant que le besoin est >= 80 (seuil de gêne). */
  deficitThreshold: number;
  /** Confort nul tant que le besoin est <= 60. */
  comfortThreshold: number;
  /** Centre des pressions émotionnelles. */
  emotionThreshold: number;
  /** Zone morte du retour vers la cible, évite l'oscillation d'arrondi. */
  emotionDeadZone: number;
  /** Amplification en points d'un poids de confort complet. */
  comfortSpan: number;
  /** Amplification en points d'un poids de cible émotionnelle complet. */
  emotionTargetSpan: number;
  caps: {
    emotionPressure: number;
    emotionDelta: number;
    healthLoss: number;
  };
  /** Phase 3C : poids et politiques de décision, calibrables indépendamment. */
  decision: DecisionParameters;
  needs: Record<NeedKey, NeedRule>;
  emotions: Record<EmotionKey, EmotionRule>;
}
