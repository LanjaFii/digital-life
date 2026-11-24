/**
 * Évaluation des préconditions d'actions (Phase 3C).
 *
 * Service pur, sans scoring : une précondition échouée exclut l'action, elle ne
 * la pénalise pas. Aucune action n'est appliquée ici et aucune donnée absente
 * (environnement, objet, relation) n'est inventée.
 */
import type { ActionCandidate, ActionDefinition, ActionPrecondition, ActionRegistry } from '../../shared/action';
import type { AutonomousDecisionSnapshot } from '../../shared/simulation-rules';
import { assertBoundedValue } from './personality-influence.service';
import { ACTION_REGISTRY, listActionIds } from './action-registry.service';

export const ENVIRONMENT_UNAVAILABLE = 'environment_unavailable';

export interface PreconditionCheck {
  ok: boolean;
  reason?: string;
}

function hourMatches(from: number, to: number, hour: number): boolean {
  if (from <= to) return hour >= from && hour <= to;
  return hour >= from || hour <= to;
}

/** Évalue une précondition depuis le seul snapshot étendu et le tick courant. */
export function evaluatePrecondition(
  precondition: ActionPrecondition,
  snapshot: AutonomousDecisionSnapshot,
  tick: number,
): PreconditionCheck {
  const runtime = snapshot.actionRuntime;
  switch (precondition.kind) {
    case 'need_below': {
      const value = assertBoundedValue(snapshot.needs[precondition.need], `needs.${precondition.need}`);
      return value < precondition.threshold
        ? { ok: true }
        : { ok: false, reason: `need_below:${precondition.need}:${value}>=${precondition.threshold}` };
    }
    case 'need_above': {
      const value = assertBoundedValue(snapshot.needs[precondition.need], `needs.${precondition.need}`);
      return value > precondition.threshold
        ? { ok: true }
        : { ok: false, reason: `need_above:${precondition.need}:${value}<=${precondition.threshold}` };
    }
    case 'emotion_above': {
      const value = assertBoundedValue(snapshot.emotions[precondition.emotion], `emotions.${precondition.emotion}`);
      return value > precondition.threshold
        ? { ok: true }
        : { ok: false, reason: `emotion_above:${precondition.emotion}:${value}<=${precondition.threshold}` };
    }
    case 'emotion_below': {
      const value = assertBoundedValue(snapshot.emotions[precondition.emotion], `emotions.${precondition.emotion}`);
      return value < precondition.threshold
        ? { ok: true }
        : { ok: false, reason: `emotion_below:${precondition.emotion}:${value}>=${precondition.threshold}` };
    }
    case 'trait_above': {
      const value = assertBoundedValue(snapshot.traits[precondition.trait], `traits.${precondition.trait}`);
      return value > precondition.threshold
        ? { ok: true }
        : { ok: false, reason: `trait_above:${precondition.trait}:${value}<=${precondition.threshold}` };
    }
    case 'hour_between':
      return hourMatches(precondition.from, precondition.to, snapshot.hour)
        ? { ok: true }
        : { ok: false, reason: `hour_between:${snapshot.hour} hors [${precondition.from},${precondition.to}]` };
    case 'other_character_exists':
      return snapshot.otherCharacterExists
        ? { ok: true }
        : { ok: false, reason: 'other_character_exists:aucun autre personnage' };
    case 'no_active_action':
      return runtime.active === null
        ? { ok: true }
        : { ok: false, reason: `no_active_action:${runtime.active.actionId}` };
    case 'cooldown_elapsed': {
      const expiry = runtime.cooldowns[precondition.actionId];
      return expiry === undefined || tick >= expiry
        ? { ok: true }
        : { ok: false, reason: `cooldown_elapsed:${precondition.actionId}:jusqu'à ${expiry}` };
    }
    case 'environment_available':
      return { ok: false, reason: `${ENVIRONMENT_UNAVAILABLE}:${precondition.requirement}` };
    case 'any_of': {
      if (precondition.conditions.length === 0) return { ok: false, reason: 'any_of:vide' };
      const failures: string[] = [];
      for (const child of precondition.conditions) {
        const check = evaluatePrecondition(child, snapshot, tick);
        if (check.ok) return { ok: true };
        failures.push(check.reason ?? child.kind);
      }
      return { ok: false, reason: `any_of:${failures.join('|')}` };
    }
    default:
      throw new Error('Précondition d’action inconnue.');
  }
}

/** Candidats dans l'ordre lexicographique des identifiants, sans aucun scoring. */
export function buildActionCandidates(
  snapshot: AutonomousDecisionSnapshot,
  tick: number,
  definitions: ActionRegistry = ACTION_REGISTRY,
  enabledIds: readonly ActionCandidate['actionId'][] = listActionIds(),
): ActionCandidate[] {
  const candidates: ActionCandidate[] = [];
  for (const actionId of [...enabledIds].sort()) {
    const definition: ActionDefinition = getActionDefinitionFrom(definitions, actionId);
    const rejections: ActionCandidate['rejections'] = [];
    for (const precondition of definition.preconditions) {
      const check = evaluatePrecondition(precondition, snapshot, tick);
      if (!check.ok) {
        rejections.push({ precondition: precondition.kind, reason: check.reason ?? precondition.kind });
      }
    }
    candidates.push({
      actionId,
      feasible: rejections.length === 0,
      rejections,
    });
  }
  return candidates;
}

function getActionDefinitionFrom(registry: ActionRegistry, id: ActionCandidate['actionId']): ActionDefinition {
  const definition = registry.definitions[id];
  if (!definition) throw new Error(`Action absente du registre : ${id}.`);
  return definition;
}

/** Alias explicite : une action sans précondition est toujours faisable. */
export function isAlwaysFeasible(definition: ActionDefinition): boolean {
  return definition.preconditions.length === 0;
}
