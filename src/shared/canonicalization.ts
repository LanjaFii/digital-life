/**
 * Sérialisations canoniques partagées, sans aucune dépendance Node.
 *
 * Deux notions sont volontairement distinctes :
 * - `canonicalize()` est stricte (undefined et nombres non finis interdits) et
 *   sert à l'intégrité des Decision Records ;
 * - `canonicalizeGoldenTickResult()` reproduit exactement le noyau historique
 *   des 18 Golden Hash (undefined mappé sur `'null'`), utilisé comme checksum
 *   du protocole worker.
 *
 * `collectRuleIds()` est également déplacé ici : il s'agit d'une canonicalisation
 * (tri et déduplication) d'identifiants de règles, sans dépendance au hachage.
 */
import type { ActionEffectDelta } from './action';
import type { DecisionExplanation } from './decision';
import type { CharacterTickResult, TickDelta } from './simulation-rules';

/** Noyau exact des Golden Hash : `decisionRecords` est exclu. */
export interface GoldenTickCore {
  worldId: string;
  tick: number;
  rngState: number;
  characterStates: CharacterTickResult['characterStates'];
  deltas: CharacterTickResult['deltas'];
  decisions: CharacterTickResult['decisions'];
  actionDeltas: CharacterTickResult['actionDeltas'];
  actionRuntimeStates: CharacterTickResult['actionRuntimeStates'];
  warnings: CharacterTickResult['warnings'];
}

/** JSON canonique strict : clés triées récursivement, valeurs finies obligatoires. */
export function canonicalize(value: unknown): string {
  if (value === undefined) throw new Error('Valeur undefined interdite dans un enregistrement de décision.');
  if (value === null) return 'null';
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Nombre non fini interdit dans un enregistrement de décision.');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([key, child]) => `${JSON.stringify(key)}:${canonicalize(child)}`).join(',')}}`;
  }
  throw new Error('Type non sérialisable dans un enregistrement de décision.');
}

/** Sérialisation historique des Golden Hash, identique à la mesure de référence. */
export function canonicalizeGolden(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalizeGolden).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalizeGolden(record[key])}`).join(',')}}`;
}

/** Extrait le noyau haché d'un résultat complet, sans recopier les champs ailleurs. */
export function extractGoldenTickCore(result: CharacterTickResult): GoldenTickCore {
  return {
    worldId: result.worldId,
    tick: result.tick,
    rngState: result.rngState,
    characterStates: result.characterStates,
    deltas: result.deltas,
    decisions: result.decisions,
    actionDeltas: result.actionDeltas,
    actionRuntimeStates: result.actionRuntimeStates,
    warnings: result.warnings,
  };
}

/** Sérialisation canonique du noyau Golden Hash d'un résultat de tick. */
export function canonicalizeGoldenTickResult(result: CharacterTickResult): string {
  return canonicalizeGolden(extractGoldenTickCore(result));
}

/** Ordonne et déduplique les identifiants de règles d'un enregistrement. */
export function collectRuleIds(parts: {
  explanation: DecisionExplanation;
  passiveDeltas: readonly TickDelta[];
  actionDeltas: readonly ActionEffectDelta[];
  appliedDeltas: readonly TickDelta[];
}): string[] {
  const ids = new Set<string>([parts.explanation.ruleId]);
  for (const goal of parts.explanation.immediateGoals) ids.add(goal.ruleId);
  for (const delta of parts.passiveDeltas) ids.add(delta.ruleId);
  for (const delta of parts.actionDeltas) ids.add(delta.ruleId);
  for (const delta of parts.appliedDeltas) ids.add(delta.ruleId);
  return [...ids].sort();
}
