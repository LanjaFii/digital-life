import { describe, expect, it } from 'vitest';
import {
  clamp,
  quantize,
  roundHalfEven,
  traitFactor,
  traitMultiplier,
  deficitPressure,
  comfortLevel,
  emotionPressure,
  emotionBaseline,
} from '../src/main/services/personality-influence.service';
import { DEFAULT_SIMULATION_PARAMETERS } from '../src/main/services/simulation-parameters.service';
import { BASE_TRAITS } from './simulation-rules-fixtures';

describe('mathématiques déterministes (Phase 3B)', () => {
  it('clamp borne dans [0,100]', () => {
    expect(clamp(-5, 0, 100)).toBe(0);
    expect(clamp(120, 0, 100)).toBe(100);
    expect(clamp(42, 0, 100)).toBe(42);
  });

  it('roundHalfEven est symétrique pour positives et négatifs', () => {
    expect(roundHalfEven(0.5)).toBe(0);
    expect(roundHalfEven(1.5)).toBe(2);
    expect(roundHalfEven(2.5)).toBe(2);
    expect(roundHalfEven(3.5)).toBe(4);
    expect(roundHalfEven(-0.5)).toBe(0);
    expect(roundHalfEven(-1.5)).toBe(-2);
    expect(roundHalfEven(-2.5)).toBe(-2);
    expect(roundHalfEven(-3.5)).toBe(-4);
  });

  it('quantize applique la précision aux centièmes', () => {
    expect(quantize(1.234, 2)).toBe(1.23);
    expect(quantize(1.235, 2)).toBe(1.24); // 1.235 * 100 = 123.5 -> pair
    expect(quantize(-1.235, 2)).toBe(-1.24);
    expect(quantize(0.005, 2)).toBe(0);
  });

  it('rejette les valeurs non finies', () => {
    expect(() => roundHalfEven(Number.NaN)).toThrow();
    expect(() => quantize(1, 7)).toThrow();
  });
});

describe('influence de la personnalité', () => {
  it('traitFactor mappe 0->-1, 50->0, 100->1', () => {
    expect(traitFactor({ ...BASE_TRAITS, resilience: 0 }, 'resilience')).toBe(-1);
    expect(traitFactor(BASE_TRAITS, 'resilience')).toBe(0);
    expect(traitFactor({ ...BASE_TRAITS, resilience: 100 }, 'resilience')).toBe(1);
  });

  it('traitMultiplier est borné et neutre sans modificateur', () => {
    expect(traitMultiplier(BASE_TRAITS, {})).toBe(1);
    const m = traitMultiplier({ ...BASE_TRAITS, resilience: 100 }, { resilience: 0.5 });
    expect(m).toBeGreaterThan(1);
    expect(m).toBeLessThanOrEqual(1.5);
  });

  it('les pressions sont nulles sous le seuil et progressives au-dessus', () => {
    expect(deficitPressure(100, 20)).toBe(0);
    expect(deficitPressure(80, 20)).toBe(0);
    expect(deficitPressure(0, 20)).toBe(1);
    expect(comfortLevel(60, 60)).toBe(0);
    expect(comfortLevel(100, 60)).toBe(1);
    expect(emotionPressure(50, 50)).toBe(0);
    expect(emotionPressure(100, 50)).toBe(1);
  });

  it('la baseline émotionnelle dépend des traits et reste bornée', () => {
    const rule = DEFAULT_SIMULATION_PARAMETERS.emotions.happiness;
    const neutral = emotionBaseline(rule, BASE_TRAITS);
    const optimistic = emotionBaseline(rule, { ...BASE_TRAITS, optimism: 100, resilience: 100 });
    expect(optimistic).toBeGreaterThan(neutral);
    expect(optimistic).toBeLessThanOrEqual(rule.max);
  });
});
