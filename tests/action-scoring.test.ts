import { describe, expect, it } from 'vitest';
import { buildActionCandidates } from '../src/main/services/action-candidacy.service';
import { scoreActionCandidates } from '../src/main/services/action-scoring.service';
import { selectImmediateGoals } from '../src/main/services/goal-selection.service';
import { DEFAULT_SIMULATION_PARAMETERS } from '../src/main/services/simulation-parameters.service';
import { PROFILES } from './simulation-rules-fixtures';
import { makeGoalInput, makeDecisionSnapshot } from './phase3c-fixtures';

function scoresFor(snapshot: ReturnType<typeof makeDecisionSnapshot>) {
  const goals = selectImmediateGoals(makeGoalInput({
    projectedNeeds: snapshot.needs,
    emotions: snapshot.emotions,
    hour: snapshot.hour,
  }));
  return scoreActionCandidates({
    snapshot,
    candidates: buildActionCandidates(snapshot, 1),
    goals,
    projectedNeeds: snapshot.needs,
    projectedEmotions: snapshot.emotions,
    params: DEFAULT_SIMULATION_PARAMETERS.decision,
  });
}

function scoreOf(snapshot: ReturnType<typeof makeDecisionSnapshot>, actionId: string): number {
  const found = scoresFor(snapshot).find((item) => item.actionId === actionId);
  if (!found) throw new Error(`Action ${actionId} absente.`);
  return found.score;
}

describe('scoring des actions (Phase 3C)', () => {
  it('préfère manger quand la faim est critique', () => {
    const snapshot = makeDecisionSnapshot({ needs: { hunger: 10 } });
    expect(scoreOf(snapshot, 'eat')).toBeGreaterThan(scoreOf(snapshot, 'drink'));
  });

  it('préfère une action qui réduit le stress quand le stress est élevé', () => {
    const snapshot = makeDecisionSnapshot({ emotions: { stress: 90, anxiety: 80 } });
    expect(scoreOf(snapshot, 'entertain_self')).toBeGreaterThan(scoreOf(snapshot, 'be_alone'));
  });

  it('distingue un personnage sociable d’un personnage indépendant', () => {
    const sociable = makeDecisionSnapshot({
      traits: PROFILES['très sociable'],
      needs: { socialization: 20 },
    });
    const independent = makeDecisionSnapshot({
      traits: PROFILES['indépendant'],
      needs: { socialization: 20 },
    });
    expect(scoreOf(sociable, 'seek_company')).toBeGreaterThan(scoreOf(sociable, 'be_alone'));
    expect(scoreOf(independent, 'be_alone')).toBeGreaterThan(scoreOf(independent, 'seek_company'));
  });

  it('pénalise le coût d’un besoin critique', () => {
    const snapshot = makeDecisionSnapshot({ needs: { socialization: 0 } });
    expect(scoreOf(snapshot, 'be_alone')).toBeLessThan(0);
  });

  it('donne à `idle` un score exactement nul, sans pénalité de répétition', () => {
    const snapshot = makeDecisionSnapshot({ needs: { hunger: 10 } });
    snapshot.actionRuntime.recentActionIds = ['idle', 'idle', 'idle', 'idle', 'idle'];
    expect(scoreOf(snapshot, 'idle')).toBe(0);
  });

  it('pénalise la répétition d’une action récente', () => {
    const fresh = makeDecisionSnapshot({ needs: { hunger: 10 } });
    const repeated = makeDecisionSnapshot({ needs: { hunger: 10 } });
    repeated.actionRuntime.recentActionIds = ['eat', 'eat', 'eat', 'eat', 'eat'];
    expect(scoreOf(repeated, 'eat')).toBeLessThan(scoreOf(fresh, 'eat'));
  });

  it('bonus circadien uniquement la nuit pour `sleep`', () => {
    const night = makeDecisionSnapshot({ hour: 23, needs: { sleep: 40 } });
    const day = makeDecisionSnapshot({ hour: 12, needs: { sleep: 40 } });
    expect(scoreOf(night, 'sleep')).toBeGreaterThan(scoreOf(day, 'sleep'));
  });

  it('ne score pas une action infaisable et conserve ses rejets', () => {
    const snapshot = makeDecisionSnapshot({ needs: { hunger: 95 } });
    const eaten = scoresFor(snapshot).find((item) => item.actionId === 'eat');
    expect(eaten).toMatchObject({ feasible: false, score: 0 });
    expect(eaten?.rejections.length).toBeGreaterThan(0);
  });

  it('reste déterministe et dans [-5, 5]', () => {
    const snapshot = makeDecisionSnapshot({ needs: { hunger: 5, thirst: 5 } });
    const first = scoresFor(snapshot);
    const second = scoresFor(snapshot);
    expect(first).toEqual(second);
    for (const item of first) {
      expect(item.score).toBeGreaterThanOrEqual(-5);
      expect(item.score).toBeLessThanOrEqual(5);
      expect(Number.isFinite(item.score)).toBe(true);
    }
  });
});
