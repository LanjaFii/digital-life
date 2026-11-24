/**
 * Mathématiques communes et influence de la personnalité (Phase 3B).
 *
 * Service pur : aucune dépendance à Electron, SQLite, au réseau ou au PRNG.
 * Les fonctions d'arrondi sont déterministes et symétriques pour les valeurs
 * positives et négatives (arrondi bancaire / half-even).
 */
import type { CharacterTraits, TraitKey } from '../../shared/character';
import type { EmotionRule, SimulationParametersV1 } from '../../shared/simulation-rules';

/** Borne une valeur dans [min, max]. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Arrondi au plus proche avec départage des demi-valeurs vers le pair le plus
 * proche (banker's rounding). Symétrique : roundHalfEven(-0.5) = -0 et
 * roundHalfEven(1.5) = 2, contrairement à Math.round() qui n'est pas symétrique.
 */
export function roundHalfEven(value: number): number {
  if (!Number.isFinite(value)) throw new Error('Arrondi d’une valeur non finie.');
  const floor = Math.floor(value);
  const fraction = value - floor;
  if (fraction < 0.5) return floor;
  if (fraction > 0.5) return floor + 1;
  // Cas exactement à mi-chemin : le pair gagne. Le reste JS fonctionne aussi
  // pour les négatifs (-1 % 2 = -1, donc impair).
  return floor % 2 === 0 ? floor : floor + 1;
}

/** Arrondi à une précision décimale contrôlée, avec arrondi half-even. */
export function quantize(value: number, precision: number): number {
  if (!Number.isInteger(precision) || precision < 0 || precision > 6) {
    throw new Error('Précision de simulation invalide.');
  }
  const scale = 10 ** precision;
  return roundHalfEven(value * scale) / scale;
}

/** Valide qu'une valeur persistée est un nombre fini dans [0, 100]. */
export function assertBoundedValue(value: number, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100) {
    throw new Error(`${label} invalide : nombre fini entre 0 et 100 attendu.`);
  }
  return value;
}

/** Facteur d'un trait dans [-1, 1]. */
export function traitFactor(traits: Readonly<CharacterTraits>, key: TraitKey): number {
  const value = traits[key];
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100) {
    throw new Error(`Trait ${key} invalide.`);
  }
  return (value - 50) / 50;
}

/**
 * Produit Π(1 + k * traitFactor) borné dans [0.5, 1.5].
 * Chaque facteur individuel est borné pour éviter qu'un trait extrême.ne
 * produise un coefficient artificiel.
 */
export function traitMultiplier(
  traits: Readonly<CharacterTraits>,
  modifiers: Partial<Record<TraitKey, number>>,
): number {
  let product = 1;
  for (const key of Object.keys(modifiers) as TraitKey[]) {
    const k = modifiers[key];
    if (k === undefined) continue;
    product *= clamp(1 + k * traitFactor(traits, key), 0.5, 1.5);
  }
  return clamp(product, 0.5, 1.5);
}

/**
 * Pression de déficit : 0 quand le besoin est au-dessus du seuil de gêne,
 * croît jusqu'à 1 quand le besoin tombe à 0. `threshold` est en points 0-100,
 * comme `comfortThreshold` et `emotionThreshold`.
 */
export function deficitPressure(value: number, threshold: number): number {
  const bounded = assertBoundedValue(value, 'Besoin');
  return clamp((threshold - bounded) / threshold, 0, 1);
}

/** Confort : 0 sous le seuil, 1 au besoin maximal. */
export function comfortLevel(value: number, threshold: number): number {
  return clamp((assertBoundedValue(value, 'Besoin') - threshold) / (100 - threshold), 0, 1);
}

/** Pression d'une émotion élevée : 0 sous le seuil, 1 à 100. */
export function emotionPressure(value: number, threshold: number): number {
  return clamp((assertBoundedValue(value, 'Émotion') - threshold) / (100 - threshold), 0, 1);
}

/** Pression d'une émotion faible : 0 au-dessus du seuil, 1 à 0. */
export function lowEmotionPressure(value: number, threshold: number): number {
  return clamp((threshold - assertBoundedValue(value, 'Émotion')) / threshold, 0, 1);
}

/** Écart d'une émotion à son seuil, borné [-1, 1] (décalage de cible). */
export function emotionDeviation(value: number, threshold: number): number {
  return clamp((assertBoundedValue(value, 'Émotion') - threshold) / 50, -1, 1);
}

/** Baseline personnelle d'une émotion, dérivée des traits pertinents. */
export function emotionBaseline(rule: EmotionRule, traits: Readonly<CharacterTraits>): number {
  let baseline = rule.baseline;
  for (const key of Object.keys(rule.baselineTraits) as TraitKey[]) {
    const bias = rule.baselineTraits[key];
    if (bias !== undefined) baseline += bias * traitFactor(traits, key);
  }
  return clamp(baseline, rule.min, rule.max);
}

/** Intensité d'un déclencheur de dégradation d'un besoin. */
export function acceleratorSeverity(
  value: number,
  kind: 'need_below' | 'need_above' | 'emotion_above',
  threshold: number,
): number {
  if (kind === 'need_below') return clamp((threshold - assertBoundedValue(value, 'Besoin')) / threshold, 0, 1);
  if (kind === 'need_above') return clamp((assertBoundedValue(value, 'Besoin') - threshold) / (100 - threshold), 0, 1);
  return emotionPressure(value, threshold);
}

/** Arrondi final d'une valeur de simulation dans [0, 100]. */
export function finalizeValue(raw: number, params: SimulationParametersV1): number {
  return clamp(quantize(raw, params.precision), 0, 100);
}
