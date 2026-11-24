/**
 * Évolution passive des 8 besoins (Phase 3B).
 *
 * Service pur : toutes les lectures proviennent du snapshot de début de tick.
 * Aucune écriture dans le snapshot, aucun accès SQLite/Electron/réseau/PRNG.
 * Les besoins projetés sont des valeurs de calcul transmises ensuite au service
 * émotionnel ; ils ne sont persistés qu'une fois le tick complet.
 */
import { NEED_KEYS, type CharacterEmotions, type CharacterNeeds, type NeedKey } from '../../shared/character';
import type {
  CharacterTickSnapshot,
  NeedDelta,
  SimulationParametersV1,
} from '../../shared/simulation-rules';
import {
  acceleratorSeverity,
  assertBoundedValue,
  clamp,
  traitMultiplier,
} from './personality-influence.service';

export interface NeedsProjection {
  needs: CharacterNeeds;
  deltas: NeedDelta[];
}

/** Lit une source de règle dans le snapshot immuable (besoin ou émotion). */
function readSource(snapshot: CharacterTickSnapshot, source: NeedKey | keyof CharacterEmotions): number {
  if ((NEED_KEYS as readonly string[]).includes(source)) {
    return assertBoundedValue(snapshot.needs[source as NeedKey], `needs.${source}`);
  }
  const value = snapshot.emotions[source as keyof CharacterEmotions];
  return assertBoundedValue(value, `emotions.${source}`);
}

/**
 * Calcule les besoins projetés d'un personnage et les deltas explicables.
 *
 * @param snapshot État immuable de début de tick.
 * @param params Paramètres versionnés.
 */
export function projectNeeds(
  snapshot: CharacterTickSnapshot,
  params: SimulationParametersV1,
): NeedsProjection {
  const needs = {} as CharacterNeeds;
  const deltas: NeedDelta[] = [];

  for (const key of NEED_KEYS) {
    const rule = params.needs[key];
    const before = assertBoundedValue(snapshot.needs[key], `needs.${key}`);
    const causes: NeedDelta['causes'] = [];

    // 1) Décroissance de base, modulée par les traits pertinents.
    const traitKeys = Object.keys(rule.traitModifiers) as Array<keyof typeof rule.traitModifiers>;
    const multiplier = traitMultiplier(snapshot.traits, rule.traitModifiers);
    const base = rule.decay * multiplier;
    if (base !== 0) {
      for (const trait of traitKeys) {
        const k = rule.traitModifiers[trait];
        if (k === undefined) continue;
        causes.push({
          kind: 'trait_modifier',
          source: `traits.${trait}`,
          weight: k,
          contribution: rule.decay * (multiplier - 1),
          note: 'modulation multiplicative du déclin de base',
        });
      }
      causes.push({
        kind: 'base_decay',
        source: 'rule.decay',
        weight: rule.decay,
        contribution: -base,
      });
    }

    // 2) Accélérateurs : lus dans le snapshot, jamais depuis une valeur déjà
    // projetée, pour garantir l'indépendance vis-à-vis de l'ordre de calcul.
    let loss = base;
    for (const accelerator of rule.accelerators) {
      const sourceValue = readSource(snapshot, accelerator.source);
      const severity = acceleratorSeverity(sourceValue, accelerator.kind, accelerator.threshold);
      if (severity <= 0) continue;
      const contribution = accelerator.amount * severity;
      loss += contribution;
      causes.push({
        kind: accelerator.kind === 'emotion_above' ? 'emotion_pressure' : 'need_deficit',
        source: `${(NEED_KEYS as readonly string[]).includes(accelerator.source) ? 'needs' : 'emotions'}.${accelerator.source}`,
        weight: accelerator.amount,
        contribution,
        note: `seuil ${accelerator.threshold}`,
      });
    }

    // 3) Récupérations passives documentées (santé, sécurité).
    if (rule.recovery) {
      const recovery = rule.recovery;
      if (recovery.kind === 'below_baseline') {
        const baseline = recovery.baseline ?? 50;
        if (before < baseline) {
          const recoverMultiplier = traitMultiplier(snapshot.traits, recovery.recoveryTraits ?? {});
          const amount = recovery.rate * recoverMultiplier;
          loss -= amount;
          causes.push({
            kind: 'baseline_recovery',
            source: `baseline.${key}`,
            weight: recovery.rate,
            contribution: -amount,
            note: `retour vers ${baseline}`,
          });
        }
      } else if (recovery.kind === 'requires_comfort') {
        const required = recovery.requires ?? [];
        const threshold = recovery.threshold ?? 60;
        const allComfortable = required.every((needKey) => snapshot.needs[needKey] > threshold);
        const cap = recovery.max ?? 100;
        if (allComfortable && before < cap) {
          loss -= recovery.rate;
          causes.push({
            kind: 'baseline_recovery',
            source: 'needs.primary_comfort',
            weight: recovery.rate,
            contribution: -recovery.rate,
            note: `besoins primaires > ${threshold}`,
          });
        }
      }
    }

    // 4) Plafond de perte par tick (santé notamment).
    if (rule.lossCap !== undefined && loss > rule.lossCap) {
      const capped = rule.lossCap;
      causes.push({
        kind: 'clamp',
        source: `caps.${key}`,
        weight: rule.lossCap,
        contribution: capped - loss,
      });
      loss = capped;
    }

    const raw = before - loss;
    if (!Number.isFinite(raw)) throw new Error(`Besoin ${key} non fini après calcul.`);
    const after = clamp(raw, 0, 100);
    if (after !== raw) {
      causes.push({
        kind: 'clamp',
        source: 'bounds.0_100',
        contribution: after - raw,
      });
    }

    needs[key] = after;
    if (after !== before) {
      deltas.push({
        entityId: snapshot.characterId,
        field: `needs.${key}`,
        before,
        after,
        delta: after - before,
        causes,
        ruleId: `needs.${key}.evolution`,
      });
    }
  }

  return { needs, deltas };
}

/** Alias explicite pour les tests et la documentation. */
export const EVOLVABLE_NEEDS = NEED_KEYS;
