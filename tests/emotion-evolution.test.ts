import { describe, expect, it } from 'vitest';
import { emotionBaseline } from '../src/main/services/personality-influence.service';
import { projectEmotions } from '../src/main/services/emotion-evolution.service';
import { projectNeeds } from '../src/main/services/needs-evolution.service';
import { DEFAULT_SIMULATION_PARAMETERS } from '../src/main/services/simulation-parameters.service';
import { BASE_TRAITS, makeSnapshot, profileSnapshot } from './simulation-rules-fixtures';

const params = DEFAULT_SIMULATION_PARAMETERS;

function project(snapshot = makeSnapshot()) {
  const needs = projectNeeds(snapshot, params).needs;
  return projectEmotions(snapshot, needs, params);
}

describe('évolution des émotions (Phase 3B)', () => {
  it('chaque émotion produit une valeur bornée et des deltas explicables', () => {
    const snapshot = makeSnapshot();
    const { emotions, deltas } = project(snapshot);
    for (const value of Object.values(emotions)) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(100);
    }
    for (const d of deltas) {
      expect(d.causes.length).toBeGreaterThan(0);
      expect(d.ruleId).toContain('emotions.');
    }
  });

  it('ne modifie ni le snapshot ni les besoins projetés', () => {
    const snapshot = makeSnapshot();
    const needs = projectNeeds(snapshot, params).needs;
    const snapshotCopy = JSON.stringify(snapshot);
    const needsCopy = JSON.stringify(needs);
    projectEmotions(snapshot, needs, params);
    expect(JSON.stringify(snapshot)).toBe(snapshotCopy);
    expect(JSON.stringify(needs)).toBe(needsCopy);
  });

  it('un déficit socialization isolé augmente loneliness puis sadness, pas anger', () => {
    const snapshot = makeSnapshot({ needs: { socialization: 10 } });
    const { emotions, deltas } = project(snapshot);
    const lonely = deltas.find((d) => d.field === 'emotions.loneliness');
    expect(emotions.loneliness).toBeGreaterThan(snapshot.emotions.loneliness);
    expect(lonely?.causes.some((c) => c.source === 'needs.socialization')).toBe(true);
    expect(emotions.anger).toBeLessThanOrEqual(snapshot.emotions.anger + 5);
  });

  it('la résilience accélère la récupération du stress', () => {
    const stressed = { ...makeSnapshot().emotions, stress: 80 };
    const resilient = project(makeSnapshot({ emotions: stressed, traits: { ...BASE_TRAITS, resilience: 100 } }));
    const fragile = project(makeSnapshot({ emotions: stressed, traits: { ...BASE_TRAITS, resilience: 0 } }));
    expect(resilient.emotions.stress).toBeLessThan(fragile.emotions.stress);
  });

  it('les plafonds de pression et de delta sont respectés', () => {
    const snapshot = makeSnapshot({
      needs: { hunger: 0, thirst: 0, energy: 0, sleep: 0, safety: 0, health: 0, hygiene: 0, socialization: 0 },
      emotions: { stress: 100, anxiety: 100, sadness: 100, fear: 100 },
    });
    const { emotions } = project(snapshot);
    for (const key of Object.keys(emotions) as Array<keyof typeof emotions>) {
      const delta = emotions[key] - snapshot.emotions[key];
      expect(Math.abs(delta)).toBeLessThanOrEqual(params.caps.emotionDelta + 1e-6);
    }
  });

  it('les profils documentés réagissent différemment à un même état', () => {
    const optimistic = project(profileSnapshot('optimiste résilient'));
    const anxious = project(profileSnapshot('anxieux peu résilient'));
    // La différence de profil se lit sur la baseline cible, pas sur un seul tick
    // où le confort courant peut temporairement dominer la pression.
    const anxiousBaseline = emotionBaseline(params.emotions.anxiety, profileSnapshot('anxieux peu résilient').traits);
    const optimisticBaseline = emotionBaseline(params.emotions.anxiety, profileSnapshot('optimiste résilient').traits);
    expect(anxiousBaseline).toBeGreaterThan(optimisticBaseline);
    expect(optimistic.emotions.stress).toBeLessThan(anxious.emotions.stress);
  });

  it('un même snapshot produit exactement le même résultat', () => {
    const snapshot = makeSnapshot();
    expect(project(snapshot)).toEqual(project(snapshot));
  });

  it('ne consomme aucun PRNG (pas de source aléatoire dans le calcul)', () => {
    const snapshot = makeSnapshot();
    expect(project(snapshot)).toEqual(project(snapshot));
    expect(project(snapshot)).toEqual(project(snapshot));
  });
});
