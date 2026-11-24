import { describe, expect, it } from 'vitest';
import {
  buildActionCandidates,
} from '../src/main/services/action-candidacy.service';
import { decideAction } from '../src/main/services/decision-engine.service';
import { scoreActionCandidates } from '../src/main/services/action-scoring.service';
import { selectImmediateGoals } from '../src/main/services/goal-selection.service';
import { SeededRng } from '../src/main/services/prng';
import { DEFAULT_SIMULATION_PARAMETERS } from '../src/main/services/simulation-parameters.service';
import { createDefaultActionRuntime } from '../src/shared/action';
import type { DecisionEngineInput, ScoredCandidate } from '../src/shared/decision';
import type { AutonomousDecisionSnapshot, DecisionParameters } from '../src/shared/simulation-rules';
import { makeDecisionSnapshot, makeGoalInput } from './phase3c-fixtures';

function inputFor(
  snapshot: AutonomousDecisionSnapshot,
  changes: Partial<DecisionEngineInput> = {},
): DecisionEngineInput {
  const goals = selectImmediateGoals(makeGoalInput({
    projectedNeeds: snapshot.needs,
    emotions: snapshot.emotions,
    hour: snapshot.hour,
  }));
  const scored = scoreActionCandidates({
    snapshot,
    candidates: buildActionCandidates(snapshot, 1),
    goals,
    projectedNeeds: snapshot.needs,
    projectedEmotions: snapshot.emotions,
    params: DEFAULT_SIMULATION_PARAMETERS.decision,
  });
  const released: AutonomousDecisionSnapshot = {
    ...snapshot,
    actionRuntime: { ...snapshot.actionRuntime, active: null },
  };
  const interruptionScored = scoreActionCandidates({
    snapshot: released,
    candidates: buildActionCandidates(released, 1),
    goals,
    projectedNeeds: released.needs,
    projectedEmotions: released.emotions,
    params: DEFAULT_SIMULATION_PARAMETERS.decision,
  });
  return {
    snapshot,
    worldId: 'world-1',
    tick: 1,
    day: 1,
    hour: snapshot.hour,
    scored,
    interruptionScored,
    goals,
    params: DEFAULT_SIMULATION_PARAMETERS.decision,
    rng: new SeededRng(42),
    ...changes,
  };
}

function fakeScore(actionId: ScoredCandidate['actionId'], score: number, feasible = true): ScoredCandidate {
  return {
    actionId,
    feasible,
    score,
    components: { need: 0, emotion: 0, trait: 0, circadian: 0, cost: 0, repetition: 0, duration: 0 },
    rejections: feasible ? [] : [{ precondition: 'need_below', reason: 'seuil' }],
  };
}

function activeSleep(startedTick = 1) {
  const runtime = createDefaultActionRuntime();
  runtime.active = {
    actionId: 'sleep', startedTick, endsAtTick: startedTick + 7,
    lastAppliedTick: startedTick, interruptedCount: 0,
  };
  return runtime;
}

describe('moteur de décision (Phase 3C)', () => {
  it('choisit le meilleur score par identifiant sans consommer le PRNG', () => {
    const result = decideAction(inputFor(makeDecisionSnapshot({ needs: { hunger: 10 } })));
    expect(result.explanation.selectedActionId).toBe('eat');
    expect(result.explanation.selectionRule).toBe('score_tiebreak_id');
    expect(result.explanation.rngDraws).toBe(0);
    expect(result.explanation.rngStateBefore).toBe(result.explanation.rngStateAfter);
  });

  it('départage un ex æquo par identifiant quand tieBreak = id', () => {
    const input = inputFor(makeDecisionSnapshot(), {
      scored: [fakeScore('drink', 0.5), fakeScore('eat', 0.5)],
      params: { ...DEFAULT_SIMULATION_PARAMETERS.decision, tieBreak: 'id' },
    });
    const result = decideAction(input);
    expect(result.explanation.selectedActionId).toBe('drink');
    expect(result.explanation.rngDraws).toBe(0);
  });

  it('consomme exactement un tirage pour un ex æquo avec tieBreak = rng', () => {
    const params: DecisionParameters = { ...DEFAULT_SIMULATION_PARAMETERS.decision, tieBreak: 'rng' };
    const input = inputFor(makeDecisionSnapshot(), {
      scored: [fakeScore('eat', 0.5), fakeScore('drink', 0.5)],
      params,
    });
    const result = decideAction(input);
    expect(result.explanation.selectionRule).toBe('score_tiebreak_rng');
    expect(result.explanation.rngDraws).toBe(1);
    expect(result.explanation.rngStateAfter).not.toBe(result.explanation.rngStateBefore);
    expect(result.rngState).toBe(result.explanation.rngStateAfter);

    const replay = decideAction(inputFor(makeDecisionSnapshot(), {
      scored: [fakeScore('eat', 0.5), fakeScore('drink', 0.5)],
      params,
    }));
    expect(replay.explanation.selectedActionId).toBe(result.explanation.selectedActionId);
    expect(replay.rngState).toBe(result.rngState);
  });

  it('retourne `forced_idle` quand aucune action autre que idle n’est faisable', () => {
    const input = inputFor(makeDecisionSnapshot(), {
      scored: [fakeScore('idle', 0), fakeScore('eat', 0.8, false)],
    });
    const result = decideAction(input);
    expect(result.explanation.selectedActionId).toBe('idle');
    expect(result.explanation.selectionRule).toBe('forced_idle');
    expect(result.explanation.rejected[0].reasons.length).toBeGreaterThan(0);
  });

  it('poursuit une action longue sans re-scoring ni tirage', () => {
    const snapshot = makeDecisionSnapshot({ actionRuntime: activeSleep() });
    const result = decideAction(inputFor(snapshot, { tick: 3 }));
    expect(result.explanation.selectedActionId).toBe('sleep');
    expect(result.explanation.selectionRule).toBe('continue_active');
    expect(result.explanation.rngDraws).toBe(0);
  });

  it('interrompt une action interruptible quand les quatre conditions sont réunies', () => {
    const snapshot = makeDecisionSnapshot({
      needs: { hunger: 0 },
      actionRuntime: activeSleep(1),
    });
    const result = decideAction(inputFor(snapshot, { tick: 3 }));
    expect(result.explanation.selectionRule).toBe('interruption');
    expect(result.explanation.selectedActionId).toBe('eat');
  });

  it('n’interrompt pas au premier tick d’une action longue', () => {
    const snapshot = makeDecisionSnapshot({
      needs: { hunger: 0 },
      actionRuntime: activeSleep(1),
    });
    const result = decideAction(inputFor(snapshot, { tick: 1 }));
    expect(result.explanation.selectionRule).toBe('continue_active');
  });

  it('détecte une règle d’échec avant toute interruption', () => {
    const snapshot = makeDecisionSnapshot({
      needs: { hunger: 0, thirst: 5 },
      actionRuntime: activeSleep(1),
    });
    const result = decideAction(inputFor(snapshot, { tick: 3 }));
    expect(result.explanation.selectionRule).toBe('action_failed');
    expect(result.explanation.selectedActionId).toBe('sleep');
    expect(result.explanation.reason).toContain('sleep.thirst_critical');
  });

  it('produit une explication complète et reconstituable', () => {
    const result = decideAction(inputFor(makeDecisionSnapshot({ needs: { hunger: 10 } })));
    expect(result.explanation).toMatchObject({
      worldId: 'world-1',
      characterId: 'char-test',
      tick: 1,
      day: 1,
      hour: 12,
      ruleId: 'decision.v1',
    });
    expect(result.explanation.motivations.length).toBeGreaterThan(0);
    expect(result.explanation.immediateGoals.length).toBeGreaterThan(0);
    expect(result.explanation.candidateScores.length).toBe(11);
    expect(result.explanation.expectedEffects.needs).toBeDefined();
  });
});
