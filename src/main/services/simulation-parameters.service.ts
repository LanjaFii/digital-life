/**
 * Valeurs par défaut versionnées des règles Phase 3B.
 *
 * Toutes les constantes ci-dessous sont des hypothèses de calibration issues
 * de docs/NEEDS_EVOLUTION.md et docs/EMOTION_EVOLUTION.md. Elles sont
 * configurables via SimulationParametersV1 : aucun coefficient n'est choisi
 * pour forcer un résultat artificiallement satisfaisant.
 */
import { SIMULATION_PARAMETERS_VERSION, type SimulationParametersV1 } from '../../shared/simulation-rules';

export const DEFAULT_SIMULATION_PARAMETERS: SimulationParametersV1 = {
  version: SIMULATION_PARAMETERS_VERSION,
  // Décision définitive : centièmes stockés dans les colonnes JSON existantes.
  precision: 2,
  deficitThreshold: 60,
  comfortThreshold: 60,
  emotionThreshold: 50,
  emotionDeadZone: 0.5,
  // Une pondération de confort complète déplace la cible de 6 points.
  comfortSpan: 6,
  emotionTargetSpan: 5,
  caps: {
    emotionPressure: 8,
    emotionDelta: 10,
    healthLoss: 1.2,
  },
  // Phase 3C : hypothèses de calibration, documentées dans
  // docs/AUTONOMOUS_DECISION_SYSTEM.md. Le poids émotionnel est exprimé pour
  // une échelle d'effets /100 : 10 transforme un effet de -1 en +0.10 de score.
  decision: {
    tieBreak: 'rng',
    decisionScorePrecision: 3,
    maxRngDrawsPerCharacterTick: 1,
    needWeight: 1,
    emotionWeight: 10,
    traitWeight: 0.25,
    circadianWeight: 0.1,
    costWeight: 0.8,
    repetitionWeight: 0.3,
    durationWeight: 0.05,
    minimumMotivationUrgency: 0.25,
    immediateGoalLimit: 3,
    criticalUrgency: 0.85,
    trendWeight: 0.2,
    referenceDecayFloor: 0.5,
    maxActionDurationTicks: 8,
    actionHistorySize: 5,
    minTicksBeforeInterrupt: 1,
  },
  needs: {
    hunger: {
      decay: 0.8,
      traitModifiers: { discipline: -0.1, impulsivity: 0.1 },
      accelerators: [{ source: 'health', kind: 'need_below', threshold: 30, amount: 0.1 }],
    },
    thirst: {
      decay: 1.6,
      traitModifiers: { discipline: -0.08, impulsivity: 0.08 },
      accelerators: [{ source: 'health', kind: 'need_below', threshold: 30, amount: 0.1 }],
    },
    energy: {
      decay: 1.0,
      traitModifiers: { resilience: -0.1, discipline: -0.06, impulsivity: 0.1 },
      accelerators: [
        { source: 'sleep', kind: 'need_below', threshold: 30, amount: 0.4 },
        { source: 'hunger', kind: 'need_below', threshold: 25, amount: 0.2 },
        { source: 'thirst', kind: 'need_below', threshold: 25, amount: 0.2 },
        { source: 'health', kind: 'need_below', threshold: 30, amount: 0.2 },
      ],
    },
    sleep: {
      decay: 0.9,
      traitModifiers: { discipline: -0.05 },
      accelerators: [
        { source: 'stress', kind: 'emotion_above', threshold: 70, amount: 0.2 },
        { source: 'anxiety', kind: 'emotion_above', threshold: 70, amount: 0.2 },
      ],
    },
    health: {
      decay: 0,
      traitModifiers: { resilience: -0.15, discipline: -0.05 },
      accelerators: [
        { source: 'hunger', kind: 'need_below', threshold: 15, amount: 0.3 },
        { source: 'thirst', kind: 'need_below', threshold: 10, amount: 0.8 },
        { source: 'sleep', kind: 'need_below', threshold: 15, amount: 0.2 },
        { source: 'hygiene', kind: 'need_below', threshold: 15, amount: 0.1 },
      ],
      recovery: {
        kind: 'requires_comfort',
        requires: ['hunger', 'thirst', 'sleep', 'energy'],
        threshold: 60,
        rate: 0.05,
        max: 90,
      },
      lossCap: 1.2,
    },
    hygiene: {
      decay: 0.5,
      traitModifiers: { discipline: -0.1, impulsivity: 0.1 },
      accelerators: [{ source: 'health', kind: 'need_below', threshold: 25, amount: 0.1 }],
    },
    socialization: {
      decay: 0.6,
      traitModifiers: { sociability: 0.3, independence: -0.2 },
      accelerators: [],
    },
    safety: {
      // Décision tranchée : pas de déclin naturel, retour lent vers une baseline
      // personnelle (65) quand aucun facteur négatif n'est actif.
      decay: 0,
      traitModifiers: { courage: -0.2, timidity: 0.2, distrust: 0.15 },
      accelerators: [
        { source: 'health', kind: 'need_below', threshold: 20, amount: 0.3 },
        { source: 'anxiety', kind: 'emotion_above', threshold: 70, amount: 0.2 },
      ],
      recovery: {
        kind: 'below_baseline',
        baseline: 65,
        rate: 0.2,
        recoveryTraits: { resilience: 0.25 },
      },
    },
  },
  emotions: {
    happiness: {
      baseline: 55, min: 25, max: 80, recoveryRate: 0.06,
      needWeights: { hunger: -0.4, thirst: -0.4, energy: -0.4, sleep: -0.4, socialization: -0.4, health: -0.2, hygiene: -0.15, safety: -0.4 },
      comfortWeights: { hunger: 0.25, thirst: 0.25, energy: 0.25, sleep: 0.25, socialization: 0.25, health: 0.15, hygiene: 0.1, safety: 0.25 },
      emotionWeights: { sadness: -0.3, stress: -0.4, anxiety: -0.3 },
      emotionTargetWeights: { satisfaction: 0.5, confidence: 0.3 },
      baselineTraits: { optimism: 8, resilience: 5, distrust: -4 },
      pressureTraits: { optimism: -0.15, resilience: -0.15, distrust: 0.1 },
      recoveryTraits: { optimism: 0.2, resilience: 0.25 },
    },
    sadness: {
      baseline: 25, min: 10, max: 60, recoveryRate: 0.05,
      needWeights: { socialization: 0.8, health: 0.4, energy: 0.4, sleep: 0.4 },
      comfortWeights: { socialization: -0.5, health: -0.3 },
      emotionWeights: { loneliness: 0.5, happiness: -0.3 },
      emotionTargetWeights: { happiness: -0.4, confidence: -0.2 },
      baselineTraits: { optimism: -6, resilience: -5 },
      pressureTraits: { optimism: -0.2, resilience: -0.2 },
      recoveryTraits: { optimism: 0.25, resilience: 0.3 },
    },
    stress: {
      baseline: 30, min: 10, max: 70, recoveryRate: 0.1,
      needWeights: { sleep: 0.8, energy: 0.8, hunger: 0.4, thirst: 0.4, safety: 0.8 },
      comfortWeights: { sleep: -0.4, safety: -0.4 },
      emotionWeights: { anxiety: 0.5, fear: 0.4 },
      emotionTargetWeights: {},
      baselineTraits: { resilience: -6, patience: -4, impulsivity: 5, discipline: -3 },
      pressureTraits: { resilience: -0.25, patience: -0.15, impulsivity: 0.2, discipline: -0.1 },
      recoveryTraits: { resilience: 0.3, patience: 0.1 },
    },
    anxiety: {
      baseline: 25, min: 10, max: 70, recoveryRate: 0.05,
      needWeights: { safety: 0.8, health: 0.8, sleep: 0.4 },
      comfortWeights: { safety: -0.5, health: -0.3 },
      emotionWeights: { stress: 0.5 },
      emotionTargetWeights: { confidence: -0.4 },
      baselineTraits: { timidity: 8, distrust: 6, courage: -6, resilience: -4 },
      pressureTraits: { timidity: 0.25, distrust: 0.2, courage: -0.2, resilience: -0.15 },
      recoveryTraits: { courage: 0.2, resilience: 0.25 },
    },
    anger: {
      baseline: 20, min: 5, max: 65, recoveryRate: 0.12,
      needWeights: { hunger: 0.4, thirst: 0.4, sleep: 0.4, safety: 0.4 },
      comfortWeights: { hunger: -0.2, thirst: -0.2 },
      emotionWeights: { stress: 0.3 },
      emotionTargetWeights: {},
      baselineTraits: { aggression: 6, impulsivity: 5, patience: -5 },
      pressureTraits: { aggression: 0.25, impulsivity: 0.2, patience: -0.25, empathy: -0.15 },
      recoveryTraits: { patience: 0.3 },
    },
    fear: {
      baseline: 20, min: 5, max: 65, recoveryRate: 0.08,
      needWeights: { safety: 0.8, health: 0.4 },
      comfortWeights: { safety: -0.4 },
      emotionWeights: { anxiety: 0.5 },
      emotionTargetWeights: { confidence: -0.3 },
      baselineTraits: { timidity: 6, courage: -6, resilience: -4, distrust: 3 },
      pressureTraits: { timidity: 0.25, courage: -0.2, distrust: 0.15, resilience: -0.15 },
      recoveryTraits: { courage: 0.25, resilience: 0.25 },
    },
    confidence: {
      baseline: 55, min: 20, max: 85, recoveryRate: 0.05,
      needWeights: { health: -0.4, safety: -0.8, energy: -0.4, sleep: -0.4 },
      comfortWeights: { health: 0.4, safety: 0.5, energy: 0.3, sleep: 0.3 },
      emotionWeights: { fear: -0.5, anxiety: -0.5, stress: -0.4 },
      emotionTargetWeights: { motivation: 0.4, satisfaction: 0.4 },
      baselineTraits: { courage: 6, resilience: 6, optimism: 5, timidity: -5 },
      pressureTraits: { courage: -0.15, resilience: -0.15 },
      recoveryTraits: { courage: 0.15, resilience: 0.2 },
    },
    loneliness: {
      baseline: 25, min: 5, max: 70, recoveryRate: 0.05,
      needWeights: { socialization: 0.8 },
      comfortWeights: { socialization: -0.6 },
      emotionWeights: { sadness: 0.3, happiness: -0.2 },
      emotionTargetWeights: {},
      baselineTraits: { sociability: 6, independence: -6 },
      pressureTraits: { sociability: 0.25, independence: -0.25 },
      recoveryTraits: { independence: 0.2 },
    },
    motivation: {
      baseline: 55, min: 20, max: 85, recoveryRate: 0.07,
      needWeights: { energy: 0.8, sleep: 0.8, health: 0.4, hunger: 0.4 },
      comfortWeights: { energy: 0.4, sleep: 0.4, health: 0.3 },
      emotionWeights: { stress: -0.4, sadness: -0.4 },
      emotionTargetWeights: { confidence: 0.4, satisfaction: 0.4 },
      baselineTraits: { ambition: 6, optimism: 5, discipline: 4, resilience: 3 },
      pressureTraits: { ambition: -0.15, optimism: -0.15, discipline: -0.1 },
      recoveryTraits: { ambition: 0.15, optimism: 0.2, discipline: 0.15 },
    },
    satisfaction: {
      baseline: 55, min: 20, max: 85, recoveryRate: 0.05,
      needWeights: { hunger: -0.4, thirst: -0.4, energy: -0.4, sleep: -0.4, safety: -0.4, health: -0.15, hygiene: -0.15, socialization: -0.15 },
      comfortWeights: { hunger: 0.25, thirst: 0.25, energy: 0.25, sleep: 0.25, safety: 0.25, health: 0.1, hygiene: 0.1, socialization: 0.1 },
      emotionWeights: { stress: -0.5, sadness: -0.4 },
      emotionTargetWeights: { motivation: 0.3, confidence: 0.3 },
      baselineTraits: { optimism: 6, discipline: 4, resilience: 5 },
      pressureTraits: { optimism: -0.15, discipline: -0.1, resilience: -0.15 },
      recoveryTraits: { optimism: 0.2, discipline: 0.1, resilience: 0.25 },
    },
  },
};
