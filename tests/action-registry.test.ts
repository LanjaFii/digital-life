import { describe, expect, it } from 'vitest';
import {
  ACTION_REGISTRY,
  getActionDefinition,
  listActionIds,
  listAvailableActionIds,
  validateRegistry,
} from '../src/main/services/action-registry.service';
import {
  ACTION_HISTORY_SIZE,
  MAX_ACTION_DURATION_TICKS,
  type ActionId,
} from '../src/shared/action';

describe('catalogue d\'actions (Phase 3C)', () => {
  it('passe la validation complète du registre', () => {
    expect(() => validateRegistry(ACTION_REGISTRY)).not.toThrow();
  });

  it('expose exactement les 11 identifiants prévus', () => {
    expect(listActionIds()).toEqual([
      'eat', 'drink', 'sleep', 'rest', 'wash', 'entertain_self',
      'explore', 'practice_activity', 'be_alone', 'seek_company', 'idle',
    ]);
  });

  it('ne rend disponibles que les actions Tier A', () => {
    const available = listAvailableActionIds();
    expect(available).not.toContain('wash');
    expect(available).not.toContain('explore');
    expect(available).not.toContain('practice_activity');
    for (const id of ['eat', 'drink', 'sleep', 'rest', 'entertain_self', 'be_alone', 'seek_company', 'idle']) {
      expect(available).toContain(id);
    }
  });

  it('déclare une dépendance environment pour chaque action Tier B', () => {
    for (const id of ['wash', 'explore', 'practice_activity'] as ActionId[]) {
      const definition = getActionDefinition(id);
      expect(definition.availability).toBe('requires_environment');
      expect(definition.environmentRequirement).toBeTruthy();
      expect(definition.preconditions.some((p) => p.kind === 'environment_available')).toBe(true);
    }
  });

  it('garde idle sans effet, sans cooldown et sans précondition', () => {
    const idle = getActionDefinition('idle');
    expect(idle.preconditions).toEqual([]);
    expect(idle.satisfies).toEqual({});
    expect(idle.costs).toEqual({});
    expect(idle.emotionalEffects).toEqual({});
    expect(idle.cooldownTicks).toBe(0);
    expect(idle.durationTicks).toBe(1);
  });

  it('respecte les bornes de durée et la cohérence on_completion', () => {
    for (const id of listActionIds()) {
      const definition = getActionDefinition(id);
      expect(definition.durationTicks).toBeGreaterThanOrEqual(1);
      expect(definition.durationTicks).toBeLessThanOrEqual(MAX_ACTION_DURATION_TICKS);
      if (definition.effectTiming === 'on_completion') expect(definition.durationTicks).toBe(1);
    }
  });

  it('ne contient aucune intention non numérique exécutable', () => {
    for (const id of listActionIds()) {
      expect(getActionDefinition(id).sideEffects).toEqual([]);
    }
  });

  it('décrit une règle d\'échec bornée pour le sommeil', () => {
    const sleep = getActionDefinition('sleep');
    expect(sleep.failureRules).toHaveLength(1);
    expect(sleep.failureRules[0]).toMatchObject({
      kind: 'need_below_during_action',
      need: 'thirst',
      threshold: 15,
      onFailure: 'keep_partial',
    });
  });

  it('rejette un identifiant inconnu', () => {
    expect(() => getActionDefinition('inconnu' as ActionId)).toThrow('Action inconnue');
  });

  it('borne l\'historique documenté', () => {
    expect(ACTION_HISTORY_SIZE).toBe(5);
  });
});
