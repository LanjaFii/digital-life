/**
 * Urgences, motivations et objectifs immédiats (Phase 3C).
 *
 * Service pur : aucune écriture, aucun PRNG, aucune dépendance Electron/SQLite.
 * Les objectifs persistants sont reçus pour audit mais leur `label` n'est jamais
 * interprété : seules les données structurées produisent des motivations.
 */
import { EMOTION_KEYS, NEED_KEYS, type EmotionKey, type NeedKey } from '../../shared/character';
import type { GoalSelectionInput, GoalSelectionResult, ImmediateGoal, Motivation } from '../../shared/decision';
import { clamp, deficitPressure, emotionPressure, lowEmotionPressure } from './personality-influence.service';

/** Poids de survie des besoins : hypothèses calibrables documentées. */
export const NEED_CRITICALITY: Readonly<Record<NeedKey, number>> = {
  thirst: 1,
  hunger: 0.95,
  sleep: 0.9,
  health: 0.9,
  energy: 0.8,
  safety: 0.75,
  socialization: 0.6,
  hygiene: 0.5,
};

/** Direction de soulagement de chaque émotion (décision structurelle). */
export const EMOTION_DIRECTION: Readonly<Record<EmotionKey, 'increase' | 'decrease'>> = {
  happiness: 'increase',
  sadness: 'decrease',
  stress: 'decrease',
  anxiety: 'decrease',
  anger: 'decrease',
  fear: 'decrease',
  confidence: 'increase',
  loneliness: 'decrease',
  motivation: 'increase',
  satisfaction: 'increase',
};

const NEED_LABELS: Readonly<Record<NeedKey, string>> = {
  hunger: 'la faim',
  thirst: 'la soif',
  energy: 'l’énergie',
  sleep: 'le sommeil',
  health: 'la santé',
  hygiene: 'l’hygiène',
  socialization: 'la socialisation',
  safety: 'la sécurité',
};

const EMOTION_LABELS: Readonly<Record<EmotionKey, string>> = {
  happiness: 'le bonheur',
  sadness: 'la tristesse',
  stress: 'le stress',
  anxiety: 'l’anxiété',
  anger: 'la colère',
  fear: 'la peur',
  confidence: 'la confiance',
  loneliness: 'la solitude',
  motivation: 'la motivation',
  satisfaction: 'la satisfaction',
};

export function computeNeedUrgencies(input: GoalSelectionInput): Record<NeedKey, number> {
  const urgencies = {} as Record<NeedKey, number>;
  for (const key of NEED_KEYS) {
    const value = input.projectedNeeds[key];
    const deficitBase = deficitPressure(value, input.params.deficitThreshold);
    const referenceDecay = Math.max(input.params.needs[key].decay, input.decisionParams.referenceDecayFloor);
    const excessLoss = Math.max(0, -input.needDeltas[key] - referenceDecay);
    const trend = clamp(excessLoss / referenceDecay, 0, 1);
    const deficit = deficitBase * NEED_CRITICALITY[key];
    urgencies[key] = clamp(deficit + input.decisionParams.trendWeight * trend, 0, 1);
  }
  return urgencies;
}

export function computeEmotionUrgencies(input: GoalSelectionInput): Record<EmotionKey, number> {
  const urgencies = {} as Record<EmotionKey, number>;
  for (const key of EMOTION_KEYS) {
    const value = input.emotions[key];
    const direction = EMOTION_DIRECTION[key];
    urgencies[key] = direction === 'decrease'
      ? emotionPressure(value, input.params.emotionThreshold)
      : lowEmotionPressure(value, input.params.emotionThreshold);
  }
  return urgencies;
}

function compareMotivations(a: Motivation, b: Motivation): number {
  if (a.urgency !== b.urgency) return b.urgency - a.urgency;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function groupLabel(motivation: Motivation): string {
  if (motivation.source === 'circadian') return 'Se reposer (nuit)';
  if (motivation.source === 'need') return `Rétablir ${NEED_LABELS[motivation.targetKey as NeedKey]}`;
  const label = EMOTION_LABELS[motivation.targetKey as EmotionKey];
  return motivation.direction === 'decrease' ? `Réduire ${label}` : `Renforcer ${label}`;
}

function groupId(motivation: Motivation): string {
  if (motivation.source === 'circadian') return 'rest:night';
  const prefix = motivation.direction === 'decrease' ? 'reduce' : 'restore';
  return `${prefix}:${motivation.targetKey}`;
}

/**
 * Construit les motivations puis les objectifs immédiats, triés par urgence
 * décroissante et identifiant lexicographique croissant (jamais par ordre d'objet).
 */
export function selectImmediateGoals(input: GoalSelectionInput): GoalSelectionResult {
  const needUrgencies = computeNeedUrgencies(input);
  const emotionUrgencies = computeEmotionUrgencies(input);
  const motivations: Motivation[] = [];

  for (const key of NEED_KEYS) {
    const urgency = needUrgencies[key];
    if (urgency <= 0) continue;
    motivations.push({
      id: `need:${key}`,
      source: 'need',
      refKey: key,
      targetKey: key,
      urgency,
      direction: 'increase',
      reason: `${NEED_LABELS[key]} à ${input.projectedNeeds[key].toFixed(2)}/100 (pression ${urgency.toFixed(3)})`,
    });
  }

  for (const key of EMOTION_KEYS) {
    const urgency = emotionUrgencies[key];
    if (urgency <= 0) continue;
    const direction = EMOTION_DIRECTION[key];
    motivations.push({
      id: `emotion:${key}`,
      source: 'emotion',
      refKey: key,
      targetKey: key,
      urgency,
      direction,
      reason: `${EMOTION_LABELS[key]} à ${input.emotions[key].toFixed(2)}/100 (pression ${urgency.toFixed(3)})`,
    });
  }

  if (input.hour >= 22 || input.hour < 7) {
    motivations.push({
      id: 'circadian:night',
      source: 'circadian',
      refKey: 'night',
      targetKey: 'sleep',
      urgency: 0.3,
      direction: 'increase',
      reason: `Signal circadien nocturne à ${input.hour} h (pondération uniquement, aucune contrainte)`,
    });
  }

  motivations.sort(compareMotivations);

  const groups = new Map<string, { id: string; urgency: number; motivations: Motivation[] }>();
  for (const motivation of motivations) {
    const id = groupId(motivation);
    const existing = groups.get(id);
    if (!existing) {
      groups.set(id, { id, urgency: motivation.urgency, motivations: [motivation] });
    } else {
      existing.urgency = Math.max(existing.urgency, motivation.urgency);
      existing.motivations.push(motivation);
      existing.motivations.sort(compareMotivations);
    }
  }

  const sortedGroups = [...groups.values()].sort((a, b) => {
    if (a.urgency !== b.urgency) return b.urgency - a.urgency;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  const excluded: GoalSelectionResult['excluded'] = [];
  const immediateGoals: ImmediateGoal[] = [];
  for (const group of sortedGroups) {
    if (group.urgency < input.decisionParams.minimumMotivationUrgency) {
      for (const motivation of group.motivations) {
        excluded.push({ id: motivation.id, reason: 'urgence sous le seuil de motivation' });
      }
      continue;
    }
    if (immediateGoals.length >= input.decisionParams.immediateGoalLimit) {
      for (const motivation of group.motivations) {
        excluded.push({ id: motivation.id, reason: 'limite d’objectifs immédiats atteinte' });
      }
      continue;
    }
    const representative = group.motivations[0];
    immediateGoals.push({
      id: group.id,
      label: groupLabel(representative),
      rank: immediateGoals.length + 1,
      urgency: group.urgency,
      motivations: group.motivations.map((m) => ({ ...m })),
      ruleId: 'goal.immediate.v1',
    });
  }

  const explainedIds = new Set<string>([
    ...immediateGoals.flatMap((goal) => goal.motivations.map((m) => m.id)),
    ...excluded.map((item) => item.id),
  ]);
  if (motivations.some((m) => !explainedIds.has(m.id))) {
    throw new Error('Une motivation calculée n’est ni retenue ni exclue.');
  }

  return {
    motivations: motivations.map((m) => ({ ...m })),
    immediateGoals,
    excluded: excluded.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
    needUrgencies,
    emotionUrgencies,
  };
}
