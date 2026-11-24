/** Filières de test partagées pour les services purs de la Phase 3C. */
import { DEFAULT_SIMULATION_PARAMETERS } from '../src/main/services/simulation-parameters.service';
import {
  createDefaultActionRuntime,
  type CharacterActionRuntime,
} from '../src/shared/action';
import { EMOTION_KEYS, NEED_KEYS, type CharacterEmotions, type CharacterNeeds } from '../src/shared/character';
import type { GoalSelectionInput } from '../src/shared/decision';
import type { AutonomousDecisionSnapshot, DecisionParameters } from '../src/shared/simulation-rules';
import { makeSnapshot } from './simulation-rules-fixtures';

export function flatNeeds(value: number): CharacterNeeds {
  const needs = {} as CharacterNeeds;
  for (const key of NEED_KEYS) needs[key] = value;
  return needs;
}

export function flatEmotions(value: number): CharacterEmotions {
  const emotions = {} as CharacterEmotions;
  for (const key of EMOTION_KEYS) emotions[key] = value;
  return emotions;
}

interface DecisionSnapshotOverrides {
  characterId?: string;
  traits?: NonNullable<Parameters<typeof makeSnapshot>[0]>['traits'];
  needs?: Partial<CharacterNeeds>;
  emotions?: Partial<CharacterEmotions>;
  hour?: number;
  actionRuntime?: CharacterActionRuntime;
  otherCharacterExists?: boolean;
}

export function makeDecisionSnapshot(overrides: DecisionSnapshotOverrides = {}): AutonomousDecisionSnapshot {
  const base = makeSnapshot({
    characterId: overrides.characterId,
    traits: overrides.traits,
    needs: { ...flatNeeds(80), ...(overrides.needs ?? {}) },
    emotions: { ...flatEmotions(30), ...(overrides.emotions ?? {}) },
  });
  const passiveNeedDeltas = {} as Record<(typeof NEED_KEYS)[number], number>;
  for (const key of NEED_KEYS) passiveNeedDeltas[key] = -0.5;
  return {
    ...base,
    hour: overrides.hour ?? 12,
    actionRuntime: overrides.actionRuntime ?? createDefaultActionRuntime(),
    passiveNeedDeltas,
    otherCharacterExists: overrides.otherCharacterExists ?? true,
  };
}

interface GoalInputOverrides {
  projectedNeeds?: Partial<CharacterNeeds>;
  needDeltas?: Partial<Record<(typeof NEED_KEYS)[number], number>>;
  emotions?: Partial<CharacterEmotions>;
  hour?: number;
  decisionParams?: Partial<DecisionParameters>;
}

export function makeGoalInput(overrides: GoalInputOverrides = {}): GoalSelectionInput {
  const needDeltas = {} as Record<(typeof NEED_KEYS)[number], number>;
  for (const key of NEED_KEYS) needDeltas[key] = overrides.needDeltas?.[key] ?? -0.5;
  return {
    characterId: 'char-test',
    tick: 1,
    hour: overrides.hour ?? 12,
    projectedNeeds: { ...flatNeeds(80), ...(overrides.projectedNeeds ?? {}) },
    needDeltas,
    emotions: { ...flatEmotions(30), ...(overrides.emotions ?? {}) },
    goals: [],
    params: DEFAULT_SIMULATION_PARAMETERS,
    decisionParams: { ...DEFAULT_SIMULATION_PARAMETERS.decision, ...(overrides.decisionParams ?? {}) },
  };
}
