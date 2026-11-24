import { describe, expect, it } from 'vitest';
import { selectImmediateGoals } from '../src/main/services/goal-selection.service';
import { NEED_KEYS } from '../src/shared/character';
import { makeGoalInput } from './phase3c-fixtures';

describe('sélection des objectifs immédiats (Phase 3C)', () => {
  it('classe un besoin critique en première urgence', () => {
    const result = selectImmediateGoals(makeGoalInput({ projectedNeeds: { hunger: 8 } }));
    expect(result.immediateGoals[0].id).toBe('restore:hunger');
    expect(result.needUrgencies.hunger).toBeGreaterThan(result.needUrgencies.thirst);
    expect(result.motivations.find((m) => m.id === 'need:hunger')?.urgency).toBeGreaterThan(0.8);
  });

  it('produit une motivation de réduction pour une émotion négative élevée', () => {
    const result = selectImmediateGoals(makeGoalInput({ emotions: { anxiety: 95, stress: 80 } }));
    const anxiety = result.motivations.find((m) => m.id === 'emotion:anxiety');
    expect(anxiety).toMatchObject({ source: 'emotion', direction: 'decrease' });
    expect(result.immediateGoals.some((g) => g.id === 'reduce:anxiety')).toBe(true);
  });

  it('ajoute un signal circadien la nuit sans contraindre le moteur', () => {
    const settledEmotions = {
      happiness: 80, confidence: 80, motivation: 80, satisfaction: 80,
      sadness: 10, stress: 10, anxiety: 10, anger: 10, fear: 10, loneliness: 10,
    };
    const night = selectImmediateGoals(makeGoalInput({ hour: 23, emotions: settledEmotions }));
    const day = selectImmediateGoals(makeGoalInput({ hour: 12, emotions: settledEmotions }));
    expect(night.motivations.some((m) => m.id === 'circadian:night')).toBe(true);
    expect(day.motivations.some((m) => m.id === 'circadian:night')).toBe(false);
    expect(night.immediateGoals.find((g) => g.id === 'rest:night')?.rank).toBeGreaterThan(0);
  });

  it('exclut les motivations sous le seuil et borne le nombre d’objectifs', () => {
    const result = selectImmediateGoals(makeGoalInput({
      projectedNeeds: { hunger: 20, thirst: 30, energy: 35 },
      emotions: { stress: 90 },
      decisionParams: { immediateGoalLimit: 2 },
    }));
    expect(result.immediateGoals).toHaveLength(2);
    expect(result.excluded.length).toBeGreaterThan(0);
    expect(result.motivations.every((m) => (
      result.immediateGoals.some((g) => g.motivations.some((kept) => kept.id === m.id))
      || result.excluded.some((e) => e.id === m.id)
    ))).toBe(true);
  });

  it('ne dépend pas de l’ordre de création des clés de besoin', () => {
    const reversedNeeds = {} as Record<(typeof NEED_KEYS)[number], number>;
    for (const key of [...NEED_KEYS].reverse()) reversedNeeds[key] = 80;
    reversedNeeds.hunger = 10;
    reversedNeeds.thirst = 12;
    const first = selectImmediateGoals(makeGoalInput({ projectedNeeds: { hunger: 10, thirst: 12 } }));
    const second = selectImmediateGoals(makeGoalInput({ projectedNeeds: reversedNeeds }));
    expect(first.immediateGoals.map((g) => g.id)).toEqual(second.immediateGoals.map((g) => g.id));
    expect(first.needUrgencies).toEqual(second.needUrgencies);
  });

  it('n’interprète jamais le libellé d’un objectif persistant', () => {
    const withLabel = makeGoalInput({ projectedNeeds: { hunger: 10 } });
    withLabel.goals = [{ id: 'g1', label: 'Manger immédiatement', kind: 'primary' }];
    const result = selectImmediateGoals(withLabel);
    expect(result.motivations.some((m) => String(m.source) === 'goal')).toBe(false);
    expect(result.immediateGoals.some((g) => g.label.includes('Manger immédiatement'))).toBe(false);
  });

  it('augmente l’urgence quand la dégradation dépasse la référence', () => {
    const normal = selectImmediateGoals(makeGoalInput({ projectedNeeds: { hunger: 40 } }));
    const worsening = selectImmediateGoals(makeGoalInput({
      projectedNeeds: { hunger: 40 },
      needDeltas: { hunger: -2 },
    }));
    expect(worsening.needUrgencies.hunger).toBeGreaterThan(normal.needUrgencies.hunger);
  });
});
