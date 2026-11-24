/**
 * Orchestration pure d'un tick personnage (Phase 3B).
 *
 * Ce service ne touche ni SQLite, ni Electron, ni le réseau, ni le PRNG.
 * Il trie les personnages par identifiant, calcule chaque personnage depuis un
 * snapshot immuable, agrège les deltas, puis applique clamp + arrondi
 * déterministe de façon uniforme avant de retourner le résultat.
 */
import { EMOTION_KEYS, NEED_KEYS, type CharacterEmotions, type CharacterNeeds } from '../../shared/character';
import type {
  CharacterTickInput,
  CharacterTickResult,
  CharacterTickSnapshot,
  TickDelta,
} from '../../shared/simulation-rules';
import { finalizeValue } from './personality-influence.service';
import { projectEmotions } from './emotion-evolution.service';
import { projectNeeds } from './needs-evolution.service';

/** Tri stable et indépendant de la locale des identifiants. */
export function orderSnapshots(
  characters: readonly CharacterTickSnapshot[],
): CharacterTickSnapshot[] {
  return [...characters].sort((a, b) => {
    const left = a.characterId < b.characterId ? -1 : a.characterId > b.characterId ? 1 : 0;
    return left;
  });
}

/**
 * Applique arrondi déterministe et bornage final à toutes les valeurs.
 * Les deltas sont recalculés après arrondi pour refléter exactement ce qui
 * sera persisté (un delta peut devenir nul après quantification).
 */
function finalizeCharacter(
  snapshot: CharacterTickSnapshot,
  needs: CharacterNeeds,
  emotions: CharacterEmotions,
  rawDeltas: TickDelta[],
  input: CharacterTickInput,
): CharacterTickResult['characterStates'][number] & { deltas: TickDelta[]; warnings: string[] } {
  const needsFinal = {} as CharacterNeeds;
  const emotionsFinal = {} as CharacterEmotions;
  const deltas: TickDelta[] = [];
  const warnings: string[] = [];

  for (const key of NEED_KEYS) {
    const before = snapshot.needs[key];
    const after = finalizeValue(needs[key], input.params);
    needsFinal[key] = after;
    if (after !== before) {
      const raw = rawDeltas.find((d) => d.field === `needs.${key}`);
      deltas.push({
        entityId: snapshot.characterId,
        field: `needs.${key}`,
        before,
        after,
        delta: after - before,
        causes: raw?.causes ?? [{ kind: 'rounding', source: 'rule.finalize', contribution: after - before }],
        ruleId: `needs.${key}.evolution`,
      });
    }
  }

  for (const key of EMOTION_KEYS) {
    const before = snapshot.emotions[key];
    const after = finalizeValue(emotions[key], input.params);
    emotionsFinal[key] = after;
    if (after !== before) {
      const raw = rawDeltas.find((d) => d.field === `emotions.${key}`);
      deltas.push({
        entityId: snapshot.characterId,
        field: `emotions.${key}`,
        before,
        after,
        delta: after - before,
        causes: raw?.causes ?? [{ kind: 'rounding', source: 'rule.finalize', contribution: after - before }],
        ruleId: `emotions.${key}.evolution`,
      });
    }
  }

  if (needsFinal.safety === 0) warnings.push(`${snapshot.characterId}: safety à 0`);
  if (needsFinal.health === 0) warnings.push(`${snapshot.characterId}: health à 0`);

  return { characterId: snapshot.characterId, needs: needsFinal, emotions: emotionsFinal, deltas, warnings };
}

/**
 * Calcule le tick complet de tous les personnages. Résultat purement mémoire.
 */
export function computeCharacterTick(input: CharacterTickInput): CharacterTickResult {
  const ordered = orderSnapshots(input.characters);
  const characterStates: CharacterTickResult['characterStates'] = [];
  const deltas: TickDelta[] = [];
  const warnings: string[] = [];

  for (const snapshot of ordered) {
    const projectedNeeds = projectNeeds(snapshot, input.params);
    const projectedEmotions = projectEmotions(snapshot, projectedNeeds.needs, input.params);
    const finalized = finalizeCharacter(
      snapshot,
      projectedNeeds.needs,
      projectedEmotions.emotions,
      [...projectedNeeds.deltas, ...projectedEmotions.deltas],
      input,
    );
    characterStates.push({ characterId: finalized.characterId, needs: finalized.needs, emotions: finalized.emotions });
    deltas.push(...finalized.deltas);
    warnings.push(...finalized.warnings);
  }

  return {
    worldId: input.worldId,
    tick: input.tick,
    // Aucune règle Phase 3B ne consomme le PRNG : l'état est strictement conservé.
    rngState: input.rngState,
    characterStates,
    deltas,
    // La Phase 3C remplacera ces tableaux par les artefacts calculés ; la
    // tranche actuelle ne produit aucune décision ni effet d'action.
    decisions: [],
    actionDeltas: [],
    actionRuntimeStates: [],
    warnings,
  };
}
