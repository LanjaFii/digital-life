import { describe, expect, it } from 'vitest';
import {
  buildActionCandidates,
  ENVIRONMENT_UNAVAILABLE,
  evaluatePrecondition,
} from '../src/main/services/action-candidacy.service';
import { ACTION_IDS, createDefaultActionRuntime } from '../src/shared/action';
import { makeDecisionSnapshot } from './phase3c-fixtures';

function candidatesFor(overrides: Parameters<typeof makeDecisionSnapshot>[0] = {}) {
  return buildActionCandidates(makeDecisionSnapshot(overrides), 1);
}

function candidate(id: string, overrides: Parameters<typeof makeDecisionSnapshot>[0] = {}) {
  const found = candidatesFor(overrides).find((item) => item.actionId === id);
  if (!found) throw new Error(`Candidat ${id} absent.`);
  return found;
}

describe('faisabilité des actions (Phase 3C)', () => {
  it('retourne tous les identifiants dans un ordre lexicographique stable', () => {
    expect(candidatesFor().map((item) => item.actionId)).toEqual([...ACTION_IDS].sort());
  });

  it('exclut `eat` quand la faim est au-dessus du seuil', () => {
    expect(candidate('eat', { needs: { hunger: 85 } }).feasible).toBe(false);
    expect(candidate('eat', { needs: { hunger: 84.99 } }).feasible).toBe(true);
  });

  it('exclut toute action Tier B par environnement absent', () => {
    for (const id of ['wash', 'explore', 'practice_activity']) {
      const result = candidate(id);
      expect(result.feasible).toBe(false);
      expect(result.rejections.some((r) => r.reason.includes(ENVIRONMENT_UNAVAILABLE))).toBe(true);
    }
  });

  it('exclut les actions déjà actives et celles en cooldown', () => {
    const runtime = createDefaultActionRuntime();
    runtime.active = {
      actionId: 'sleep',
      startedTick: 1,
      endsAtTick: 8,
      lastAppliedTick: 1,
      interruptedCount: 0,
    };
    expect(candidate('eat', { actionRuntime: runtime }).feasible).toBe(false);
    expect(candidate('sleep', { actionRuntime: runtime }).feasible).toBe(false);
    runtime.active = null;
    runtime.cooldowns = { eat: 5 };
    expect(candidate('eat', { actionRuntime: runtime }).feasible).toBe(false);
    expect(candidate('drink', { actionRuntime: runtime }).feasible).toBe(true);
  });

  it('exige un autre personnage pour `seek_company`', () => {
    const snapshot = makeDecisionSnapshot({ needs: { socialization: 20 }, otherCharacterExists: false });
    const result = buildActionCandidates(snapshot, 1).find((item) => item.actionId === 'seek_company');
    expect(result?.feasible).toBe(false);
    expect(result?.rejections.some((r) => r.precondition === 'other_character_exists')).toBe(true);
  });

  it('applique correctement un regroupement OU (`sleep`)', () => {
    expect(candidate('sleep', { needs: { sleep: 90, energy: 30 } }).feasible).toBe(true);
    expect(candidate('sleep', { needs: { sleep: 90, energy: 80 } }).feasible).toBe(false);
  });

  it('garde `idle` toujours faisable', () => {
    const runtime = createDefaultActionRuntime();
    runtime.active = {
      actionId: 'sleep', startedTick: 1, endsAtTick: 8, lastAppliedTick: 1, interruptedCount: 0,
    };
    expect(candidate('idle', { needs: { hunger: 0, thirst: 0, energy: 0 }, actionRuntime: runtime }).feasible).toBe(true);
  });

  it('évalue une plage horaire à cheval sur minuit', () => {
    const snapshot = makeDecisionSnapshot({ hour: 23 });
    expect(evaluatePrecondition({ kind: 'hour_between', from: 22, to: 7 }, snapshot, 1).ok).toBe(true);
    snapshot.hour = 3;
    expect(evaluatePrecondition({ kind: 'hour_between', from: 22, to: 7 }, snapshot, 1).ok).toBe(true);
    snapshot.hour = 12;
    expect(evaluatePrecondition({ kind: 'hour_between', from: 22, to: 7 }, snapshot, 1).ok).toBe(false);
  });
});
