/**
 * Évolution passive des 10 émotions (Phase 3B).
 *
 * Service pur : les émotions sont calculées depuis le snapshot de début de tick
 * et les besoins projetés du tick courant (entrée de calcul uniquement).
 * Aucune écriture croisée entre émotions pendant le calcul.
 */
import { EMOTION_KEYS, type CharacterEmotions, type CharacterNeeds, type EmotionKey, type NeedKey } from '../../shared/character';
import type {
  CharacterTickSnapshot,
  EmotionDelta,
  SimulationParametersV1,
} from '../../shared/simulation-rules';
import {
  assertBoundedValue,
  clamp,
  comfortLevel,
  emotionBaseline,
  emotionDeviation,
  emotionPressure,
  lowEmotionPressure,
  traitMultiplier,
} from './personality-influence.service';

export interface EmotionProjection {
  emotions: CharacterEmotions;
  deltas: EmotionDelta[];
}

/**
 * Calcule les émotions projetées d'un personnage et les deltas explicables.
 *
 * @param snapshot État immuable de début de tick.
 * @param projectedNeeds Besoins projetés au tick courant, calculés à part.
 * @param params Paramètres versionnés.
 */
export function projectEmotions(
  snapshot: CharacterTickSnapshot,
  projectedNeeds: Readonly<CharacterNeeds>,
  params: SimulationParametersV1,
): EmotionProjection {
  const emotions = {} as CharacterEmotions;
  const deltas: EmotionDelta[] = [];

  for (const key of EMOTION_KEYS) {
    const rule = params.emotions[key];
    const before = assertBoundedValue(snapshot.emotions[key], `emotions.${key}`);
    const causes: EmotionDelta['causes'] = [];

    // 1) Pression issue des déficits de besoins projetés. Un besoin bas pousse
    // une émotion selon le signe de son poids configuré.
    let pressure = 0;
    for (const needKey of Object.keys(rule.needWeights) as NeedKey[]) {
      const weight = rule.needWeights[needKey];
      if (weight === undefined || weight === 0) continue;
      const deficit = 1 - projectedNeeds[needKey] / 100;
      if (deficit <= 0) continue;
      const contribution = weight * deficit;
      pressure += contribution;
      causes.push({
        kind: 'need_deficit',
        source: `needs.${needKey}`,
        weight,
        contribution,
      });
    }

    // 2) Confort : pousse en sens inverse du déficit. Ces poids sont déjà
    // signés dans la configuration et s'annulent quand le besoin est < 60.
    for (const needKey of Object.keys(rule.comfortWeights) as NeedKey[]) {
      const weight = rule.comfortWeights[needKey];
      if (weight === undefined || weight === 0) continue;
      const comfort = comfortLevel(projectedNeeds[needKey], params.comfortThreshold);
      if (comfort <= 0) continue;
      const contribution = weight * comfort * params.comfortSpan;
      pressure += contribution;
      causes.push({
        kind: 'comfort',
        source: `needs.${needKey}`,
        weight,
        contribution,
      });
    }

    // 3) Influences émotion -> émotion. Toutes lisent le snapshot : aucun
    // résultat déjà calculé n'est utilisé.
    for (const source of Object.keys(rule.emotionWeights) as EmotionKey[]) {
      const weight = rule.emotionWeights[source];
      if (weight === undefined || weight === 0) continue;
      const sourceValue = snapshot.emotions[source];
      const level = weight > 0
        ? emotionPressure(sourceValue, params.emotionThreshold)
        : lowEmotionPressure(sourceValue, params.emotionThreshold);
      if (level <= 0) continue;
      const contribution = weight * level * params.emotionTargetSpan;
      pressure += contribution;
      causes.push({
        kind: 'emotion_pressure',
        source: `emotions.${source}`,
        weight,
        contribution,
      });
    }

    // 4) Cibles émotionnelles : l'écart de l'émotion source à son seuil décale
    // la cible de l'émotion courante, avec amplification configurable.
    for (const source of Object.keys(rule.emotionTargetWeights) as EmotionKey[]) {
      const weight = rule.emotionTargetWeights[source];
      if (weight === undefined || weight === 0) continue;
      const deviation = emotionDeviation(snapshot.emotions[source], params.emotionThreshold);
      if (deviation === 0) continue;
      const contribution = weight * deviation * params.emotionTargetSpan;
      pressure += contribution;
      causes.push({
        kind: 'emotion_target',
        source: `emotions.${source}`,
        weight,
        contribution,
      });
    }

    // 5) Anti-saturation : seule la pression positive issue du confort est
    // limitée par la marge restante vers la baseline. La pression négative
    // (déficits persistants) doit pouvoir abaisser durablement l'émotion,
    // conformément aux règles de NEEDS/EMOTION_EVOLUTION.md.
    const baseline = emotionBaseline(rule, snapshot.traits);
    const headroomUp = baseline - before;
    const boundedPressure = pressure > 0
      ? Math.min(pressure, Math.max(0, headroomUp))
      : pressure;
    if (boundedPressure !== pressure) {
      causes.push({
        kind: 'clamp',
        source: 'baseline.headroom',
        contribution: boundedPressure - pressure,
        note: 'pression limitée par la marge vers la baseline',
      });
    }

    // Plafond de pression configuré, puis modulation par la personnalité.
    const cappedPressure = clamp(boundedPressure, -params.caps.emotionPressure, params.caps.emotionPressure);
    if (cappedPressure !== pressure) {
      causes.push({
        kind: 'clamp',
        source: 'caps.emotionPressure',
        contribution: cappedPressure - pressure,
      });
    }
    const pressureMultiplier = traitMultiplier(snapshot.traits, rule.pressureTraits);
    let delta = cappedPressure * pressureMultiplier;

    // 6) Retour vers la baseline personnelle, avec zone morte anti-oscillation.
    const gap = baseline - before;
    if (Math.abs(gap) >= params.emotionDeadZone) {
      const recoveryMultiplier = traitMultiplier(snapshot.traits, rule.recoveryTraits);
      const recovery = rule.recoveryRate * gap * recoveryMultiplier;
      delta += recovery;
      causes.push({
        kind: 'baseline_recovery',
        source: `baseline.${key}`,
        weight: rule.recoveryRate,
        contribution: recovery,
        note: `cible ${baseline.toFixed(2)}`,
      });
    }

    if (pressureMultiplier !== 1 && cappedPressure !== 0) {
      causes.push({
        kind: 'trait_modifier',
        source: `traits.pressure.${key}`,
        weight: pressureMultiplier - 1,
        contribution: cappedPressure * (pressureMultiplier - 1),
      });
    }

    // 7) Plafond du delta final, puis application et bornage.
    const cappedDelta = clamp(delta, -params.caps.emotionDelta, params.caps.emotionDelta);
    if (cappedDelta !== delta) {
      causes.push({
        kind: 'clamp',
        source: 'caps.emotionDelta',
        contribution: cappedDelta - delta,
      });
    }
    const raw = before + cappedDelta;
    if (!Number.isFinite(raw)) throw new Error(`Émotion ${key} non finie après calcul.`);
    const after = clamp(raw, 0, 100);
    if (after !== raw) {
      causes.push({ kind: 'clamp', source: 'bounds.0_100', contribution: after - raw });
    }

    emotions[key] = after;
    if (after !== before) {
      deltas.push({
        entityId: snapshot.characterId,
        field: `emotions.${key}`,
        before,
        after,
        delta: after - before,
        causes,
        ruleId: `emotions.${key}.evolution`,
      });
    }
  }

  return { emotions, deltas };
}

/** Alias explicite pour les tests et la documentation. */
export const EVOLVABLE_EMOTIONS = EMOTION_KEYS;
