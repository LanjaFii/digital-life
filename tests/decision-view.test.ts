import { describe, expect, it } from 'vitest';
import {
  DECISION_HISTORY_DEFAULT_LIMIT,
  DECISION_HISTORY_MAX_LIMIT,
  DECISION_HISTORY_MAX_OFFSET,
  validateDecisionHistoryQuery,
  validateDecisionRecordId,
  validateDecisionSummaryView,
  validateDecisionWorldId,
  type DecisionSummaryView,
} from '../src/shared/decision-view';

const summary: DecisionSummaryView = {
  id: 'world-1:2:char-a',
  characterId: 'char-a',
  characterName: 'Ada',
  tick: 2,
  day: 1,
  hour: 2,
  previousActionId: null,
  selectedActionId: 'eat',
  selectionRule: 'score_tiebreak_id',
  score: 1.25,
  reason: 'Besoin prioritaire',
  warningCount: 0,
};

describe('validateurs de consultation des décisions (3D-D)', () => {
  it('applique les valeurs par défaut et borne la requête', () => {
    expect(validateDecisionHistoryQuery({ worldId: ' world-1 ' })).toEqual({
      worldId: 'world-1', limit: DECISION_HISTORY_DEFAULT_LIMIT, offset: 0,
    });
    expect(validateDecisionHistoryQuery({ worldId: 'w', characterId: ' c ', fromTick: 2, toTick: 4, limit: DECISION_HISTORY_MAX_LIMIT, offset: 10 })).toEqual({
      worldId: 'w', characterId: 'c', fromTick: 2, toTick: 4,
      limit: DECISION_HISTORY_MAX_LIMIT, offset: 10,
    });
  });

  it.each([
    [null], [''], ['   '], [42], [{ worldId: 42 }], [{ worldId: 'w', limit: 0 }],
    [{ worldId: 'w', limit: DECISION_HISTORY_MAX_LIMIT + 1 }],
    [{ worldId: 'w', limit: 1.5 }], [{ worldId: 'w', offset: -1 }],
    [{ worldId: 'w', offset: DECISION_HISTORY_MAX_OFFSET + 1 }],
    [{ worldId: 'w', fromTick: -1 }], [{ worldId: 'w', fromTick: 5, toTick: 2 }],
    [{ worldId: 'w', characterId: '' }], [{ worldId: 'w', unknown: true }],
  ])('rejette une requête invalide : %j', (value) => {
    expect(() => validateDecisionHistoryQuery(value)).toThrow();
  });

  it('exige un identifiant de monde et un identifiant de décision valides', () => {
    expect(validateDecisionWorldId(' w ')).toBe('w');
    expect(() => validateDecisionWorldId(undefined)).toThrow();
    expect(validateDecisionRecordId('w:12:char')).toBe('w:12:char');
    for (const value of ['w:char', 'w:x:char', 'w:-1:char', 'w:1:', '', 42]) {
      expect(() => validateDecisionRecordId(value), String(value)).toThrow();
    }
  });

  it('valide strictement les vues envoyées au renderer', () => {
    expect(validateDecisionSummaryView(summary)).toEqual(summary);
    for (const patch of [
      { id: undefined }, { score: Number.NaN }, { tick: -1 },
      { warningCount: 1.2 }, { reason: undefined }, { extra: true },
      { characterId: null }, { selectionRule: '' },
    ]) {
      expect(() => validateDecisionSummaryView({ ...summary, ...patch }), JSON.stringify(patch)).toThrow();
    }
  });
});
