import { describe, expect, it } from 'vitest';
import { projectNeeds } from '../src/main/services/needs-evolution.service';
import { DEFAULT_SIMULATION_PARAMETERS } from '../src/main/services/simulation-parameters.service';
import { BASE_NEEDS, BASE_TRAITS, makeSnapshot } from './simulation-rules-fixtures';

const params = DEFAULT_SIMULATION_PARAMETERS;

describe('évolution des besoins (Phase 3B)', () => {
  it('chaque besoin décroît conformément à sa formule', () => {
    const snapshot = makeSnapshot();
    const { needs, deltas } = projectNeeds(snapshot, params);
    expect(needs.hunger).toBeLessThan(BASE_NEEDS.hunger);
    expect(needs.thirst).toBeLessThan(BASE_NEEDS.thirst);
    expect(needs.hunger).toBeCloseTo(BASE_NEEDS.hunger - params.needs.hunger.decay, 6);
    expect(needs.thirst).toBeCloseTo(BASE_NEEDS.thirst - params.needs.thirst.decay, 6);
    expect(deltas.length).toBeGreaterThan(0);
    for (const d of deltas) {
      expect(d.causes.length).toBeGreaterThan(0);
      expect(d.ruleId).toContain('needs.');
    }
  });

  it('ne modifie pas le snapshot (pureté)', () => {
    const snapshot = makeSnapshot();
    const copy = JSON.stringify(snapshot);
    projectNeeds(snapshot, params);
    expect(JSON.stringify(snapshot)).toBe(copy);
  });

  it('health ne décroît pas quand les besoins primaires sont confortables', () => {
    const { needs } = projectNeeds(makeSnapshot({ needs: { health: 70 } }), params);
    expect(needs.health).toBeGreaterThanOrEqual(70); // récupération passive lente, aucune perte
  });

  it('health perd quand des besoins sont critiques, avec plafond', () => {
    const { needs } = projectNeeds(makeSnapshot({
      needs: { hunger: 5, thirst: 5, sleep: 5, hygiene: 5 },
    }), params);
    expect(needs.health).toBeLessThan(90);
    expect(90 - needs.health).toBeLessThanOrEqual(params.caps.healthLoss + 1e-6);
  });

  it('safety retourne vers sa baseline sans facteur négatif', () => {
    const low = projectNeeds(makeSnapshot({ needs: { safety: 50 } }), params);
    expect(low.needs.safety).toBeGreaterThan(50);
    const atBaseline = projectNeeds(makeSnapshot({ needs: { safety: 65 } }), params);
    expect(atBaseline.needs.safety).toBe(65);
  });

  it('les traits modifient la vitesse de dérive dans le bon sens', () => {
    const disciplined = projectNeeds(makeSnapshot({ traits: { discipline: 100 } }), params);
    const impulsive = projectNeeds(makeSnapshot({ traits: { impulsivity: 100 } }), params);
    expect(disciplined.needs.hunger).toBeGreaterThan(impulsive.needs.hunger);
    expect(disciplined.needs.thirst).toBeGreaterThan(impulsive.needs.thirst);
  });

  it('socialization décroît plus vite pour un profil très sociable', () => {
    const sociable = projectNeeds(makeSnapshot({ traits: { sociability: 100 } }), params);
    const independent = projectNeeds(makeSnapshot({ traits: { independence: 100 } }), params);
    expect(sociable.needs.socialization).toBeLessThan(independent.needs.socialization);
  });

  it('les valeurs restent bornées [0,100] même depuis des entrées extrêmes', () => {
    for (const value of [0, 100]) {
      const { needs } = projectNeeds(makeSnapshot({
        needs: { hunger: value, thirst: value, energy: value, sleep: value, health: value, hygiene: value, socialization: value, safety: value },
        emotions: { stress: 100, anxiety: 100 },
      }), params);
      for (const n of Object.values(needs)) {
        expect(n).toBeGreaterThanOrEqual(0);
        expect(n).toBeLessThanOrEqual(100);
      }
    }
  });

  it('un même snapshot produit exactement le même résultat', () => {
    const snapshot = makeSnapshot();
    expect(projectNeeds(snapshot, params)).toEqual(projectNeeds(snapshot, params));
  });
});
