import { describe, expect, it } from 'vitest';
import { assertActionExecutable, executeActionEffects } from '../src/main/services/action-execution.service';
import { getActionDefinition } from '../src/main/services/action-registry.service';
import { DEFAULT_SIMULATION_PARAMETERS } from '../src/main/services/simulation-parameters.service';
import { makeDecisionSnapshot } from './phase3c-fixtures';

function execute(actionId: Parameters<typeof getActionDefinition>[0], overrides: Parameters<typeof makeDecisionSnapshot>[0] = {}) {
  const snapshot = makeDecisionSnapshot(overrides);
  return executeActionEffects({
    characterId: snapshot.characterId,
    tick: 1,
    definition: getActionDefinition(actionId),
    projectedNeeds: snapshot.needs,
    projectedEmotions: snapshot.emotions,
    traits: snapshot.traits,
    params: DEFAULT_SIMULATION_PARAMETERS,
    active: null,
    selectionRule: 'score_tiebreak_id',
  });
}

describe('exécution des effets d’action (Phase 3C)', () => {
  it('applique un gain nominal borné par la marge disponible', () => {
    const result = execute('eat', { needs: { hunger: 95 } });
    expect(result.needs.hunger).toBe(100);
    const delta = result.deltas.find((item) => item.field === 'needs.hunger');
    expect(delta).toMatchObject({ expected: 25, applied: 5, ruleId: 'action.eat.effect' });
  });

  it('ajoute les effets aux valeurs projetées avant une seule quantification', () => {
    const result = execute('eat', { needs: { hunger: 20.335 } });
    expect(result.needs.hunger).toBe(45.34);
    expect(result.deltas).toHaveLength(4);
  });

  it('applique le multiplicateur de personnalité aux effets', () => {
    const disciplined = execute('rest', { traits: { discipline: 100, patience: 100 } });
    const neutral = execute('rest');
    expect(disciplined.deltas.find((d) => d.field === 'needs.energy')?.applied)
      .toBeGreaterThan(neutral.deltas.find((d) => d.field === 'needs.energy')?.applied ?? 0);
  });

  it('ne fait jamais descendre un besoin sous zéro', () => {
    const result = execute('be_alone', { needs: { socialization: 0.5 } });
    expect(result.needs.socialization).toBe(0);
    const delta = result.deltas.find((item) => item.field === 'needs.socialization');
    expect(delta?.applied).toBe(-0.5);
  });

  it('borne une émotion négative à sa baseline sans la dépasser', () => {
    const result = execute('rest', { emotions: { stress: 5 } });
    expect(result.emotions.stress).toBeGreaterThanOrEqual(0);
    expect(result.emotions.stress).toBeLessThanOrEqual(30);
    const delta = result.deltas.find((item) => item.field === 'emotions.stress');
    expect(delta?.applied).toBeLessThanOrEqual(0);
  });

  it('ramène à zéro un effet qui dépasse la baseline d’une émotion négative', () => {
    const snapshot = makeDecisionSnapshot({ emotions: { stress: 5 } });
    const result = executeActionEffects({
      characterId: snapshot.characterId,
      tick: 1,
      definition: {
        ...getActionDefinition('rest'),
        emotionalEffects: { stress: -5 },
      },
      projectedNeeds: snapshot.needs,
      projectedEmotions: snapshot.emotions,
      traits: snapshot.traits,
      params: DEFAULT_SIMULATION_PARAMETERS,
      active: null,
      selectionRule: 'score_tiebreak_id',
    });
    expect(result.deltas.find((d) => d.field === 'emotions.stress')?.applied).toBe(0);
    expect(result.emotions.stress).toBe(5);
  });

  it('conserve les effets déjà appliqués lors d’une règle d’échec', () => {
    const snapshot = makeDecisionSnapshot({ needs: { thirst: 5 } });
    const active = {
      actionId: 'sleep' as const, startedTick: 1, endsAtTick: 8, lastAppliedTick: 1, interruptedCount: 0,
    };
    const result = executeActionEffects({
      characterId: snapshot.characterId,
      tick: 2,
      definition: getActionDefinition('sleep'),
      projectedNeeds: snapshot.needs,
      projectedEmotions: snapshot.emotions,
      traits: snapshot.traits,
      params: DEFAULT_SIMULATION_PARAMETERS,
      active,
      selectionRule: 'action_failed',
    });
    expect(result.failure).toMatchObject({ ruleId: 'sleep.thirst_critical', onFailure: 'keep_partial' });
    expect(result.deltas).toEqual([]);
    expect(result.needs).toEqual(snapshot.needs);
  });

  it('laisse `idle` sans effet', () => {
    const snapshot = makeDecisionSnapshot();
    const result = execute('idle');
    expect(result.deltas).toEqual([]);
    expect(result.needs).toEqual(snapshot.needs);
    expect(result.emotions).toEqual(snapshot.emotions);
  });

  it('refuse d’exécuter une action Tier B ou un effet non numérique', () => {
    expect(() => assertActionExecutable(getActionDefinition('wash'))).toThrow('environnement absent');
    expect(() => assertActionExecutable({
      ...getActionDefinition('idle'),
      sideEffects: [{ kind: 'event', eventType: 'test' }],
    })).toThrow('Effet non numérique');
  });
});
