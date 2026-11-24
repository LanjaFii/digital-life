import { describe, expect, it } from 'vitest';
import {
  clearActiveActionRuntime,
  continueActionRuntime,
  parseActionRuntime,
  serializeActionRuntime,
  startActionRuntime,
} from '../src/main/services/action-runtime.service';
import { createDefaultActionRuntime } from '../src/shared/action';

describe('runtime d’action (Phase 3C)', () => {
  it('initialise un runtime vide pour une colonne absente', () => {
    expect(parseActionRuntime(null)).toEqual(createDefaultActionRuntime());
    expect(parseActionRuntime('{"version":1,"active":null,"recentActionIds":[],"cooldowns":{},"lastDecision":null,"interruptedCount":0}'))
      .toEqual(createDefaultActionRuntime());
  });

  it('rejette un runtime corrompu au lieu de le réparer', () => {
    expect(() => parseActionRuntime('{"version":2}')).toThrow();
    expect(() => parseActionRuntime('{"version":1,"active":{"actionId":"inconnu"}}')).toThrow();
    expect(() => parseActionRuntime('{"version":1,"recentActionIds":["inconnu"],"cooldowns":{}}')).toThrow();
    expect(() => parseActionRuntime('{"version":1,"recentActionIds":[],"cooldowns":{"inconnu":3}}')).toThrow();
  });

  it('démarre une action longue et la poursuit jusqu’à achèvement', () => {
    let runtime = startActionRuntime(createDefaultActionRuntime(), 'sleep', 1, 8, 4, 5, 'score_tiebreak_id', 'test');
    expect(runtime.active).toMatchObject({ actionId: 'sleep', startedTick: 1, endsAtTick: 8, lastAppliedTick: 1 });
    for (let tick = 2; tick <= 7; tick += 1) {
      runtime = continueActionRuntime(runtime, tick, 4);
      expect(runtime.active?.lastAppliedTick).toBe(tick);
    }
    runtime = continueActionRuntime(runtime, 8, 4);
    expect(runtime.active).toBeNull();
    expect(runtime.cooldowns.sleep).toBe(12);
    expect(runtime.lastDecision?.actionId).toBe('sleep');
  });

  it('pose un cooldown pour une action courte sans état actif', () => {
    const runtime = startActionRuntime(createDefaultActionRuntime(), 'eat', 3, 1, 2, 5, 'score_tiebreak_id', 'test');
    expect(runtime.active).toBeNull();
    expect(runtime.cooldowns.eat).toBe(5);
    expect(runtime.recentActionIds).toEqual(['eat']);
  });

  it('ignore un cooldown expiré au redémarrage d’une action', () => {
    const runtime = createDefaultActionRuntime();
    runtime.cooldowns = { eat: 3 };
    const restarted = startActionRuntime(runtime, 'eat', 5, 1, 2, 5, 'score_tiebreak_id', 'test');
    expect(restarted.cooldowns.eat).toBe(7);
  });

  it('trace une interruption et incrémente le compteur racine', () => {
    const active = startActionRuntime(createDefaultActionRuntime(), 'sleep', 1, 8, 4, 5, 'score_tiebreak_id', 'test');
    const interrupted = clearActiveActionRuntime(active, 3, 'sleep', 'interruption', 'faim critique');
    expect(interrupted.active).toBeNull();
    expect(interrupted.interruptedCount).toBe(1);
    expect(interrupted.lastDecision).toMatchObject({ tick: 3, rule: 'interruption', actionId: 'sleep' });
  });

  it('trace un échec sans incrémenter le compteur d’interruption', () => {
    const active = startActionRuntime(createDefaultActionRuntime(), 'sleep', 1, 8, 4, 5, 'score_tiebreak_id', 'test');
    const failed = clearActiveActionRuntime(active, 4, 'sleep', 'action_failed', 'soif critique');
    expect(failed.interruptedCount).toBe(0);
    expect(failed.lastDecision?.rule).toBe('action_failed');
  });

  it('borne l’historique glissant', () => {
    let runtime = createDefaultActionRuntime();
    for (const id of ['eat', 'drink', 'rest', 'sleep', 'idle', 'eat'] as const) {
      runtime = startActionRuntime(runtime, id, 10, 1, 0, 5, 'score_tiebreak_id', 'test');
    }
    expect(runtime.recentActionIds).toEqual(['drink', 'rest', 'sleep', 'idle', 'eat']);
  });

  it('effectue un aller-retour sérialisation/parse sans perte', () => {
    const runtime = startActionRuntime(createDefaultActionRuntime(), 'sleep', 2, 8, 4, 5, 'score_tiebreak_rng', 'test');
    expect(parseActionRuntime(serializeActionRuntime(runtime))).toEqual(runtime);
  });
});
