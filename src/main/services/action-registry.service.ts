/**
 * Catalogue statique et versionné des actions (Phase 3C).
 *
 * Service pur : aucune dépendance à Electron, SQLite, au réseau ou au PRNG.
 * Les actions Tier B sont conservées pour contrat mais leur disponibilité
 * `requires_environment` les rend toujours infaisables dans le moteur actuel.
 */
import {
  ACTION_HISTORY_SIZE,
  ACTION_IDS,
  ACTION_REGISTRY_VERSION,
  MAX_ACTION_DURATION_TICKS,
  type ActionDefinition,
  type ActionId,
  type ActionPrecondition,
  type ActionRegistry,
  type SideEffectIntent,
} from '../../shared/action';
import { EMOTION_KEYS, NEED_KEYS, TRAIT_KEYS } from '../../shared/character';

const needSet = new Set<string>(NEED_KEYS);
const emotionSet = new Set<string>(EMOTION_KEYS);
const traitSet = new Set<string>(TRAIT_KEYS);
const actionSet = new Set<string>(ACTION_IDS);

export const ACTION_REGISTRY: ActionRegistry = {
  version: ACTION_REGISTRY_VERSION,
  definitions: {
    eat: {
      id: 'eat',
      label: 'Manger',
      description: 'Subsistance minimale non modélisée : restauration directe de la faim.',
      category: 'sustenance',
      version: 1,
      availability: 'available',
      environmentRequirement: null,
      preconditions: [
        { kind: 'need_below', need: 'hunger', threshold: 85 },
        { kind: 'no_active_action' },
        { kind: 'cooldown_elapsed', actionId: 'eat' },
      ],
      satisfies: { hunger: 25 },
      costs: { energy: -1 },
      emotionalEffects: { satisfaction: 2, happiness: 1 },
      durationTicks: 1,
      effectTiming: 'on_completion',
      interruptible: false,
      cooldownTicks: 2,
      traitAffinity: { discipline: 0.05, impulsivity: -0.05 },
      failureRules: [],
      sideEffects: [],
    },
    drink: {
      id: 'drink',
      label: 'Boire',
      description: 'Hydratation minimale non modélisée : restauration directe de la soif.',
      category: 'sustenance',
      version: 1,
      availability: 'available',
      environmentRequirement: null,
      preconditions: [
        { kind: 'need_below', need: 'thirst', threshold: 85 },
        { kind: 'no_active_action' },
        { kind: 'cooldown_elapsed', actionId: 'drink' },
      ],
      satisfies: { thirst: 30 },
      costs: { energy: -0.5 },
      emotionalEffects: { satisfaction: 1 },
      durationTicks: 1,
      effectTiming: 'on_completion',
      interruptible: false,
      cooldownTicks: 2,
      traitAffinity: { discipline: 0.05, impulsivity: -0.05 },
      failureRules: [],
      sideEffects: [],
    },
    sleep: {
      id: 'sleep',
      label: 'Dormir',
      description: 'Repos prolongé sur place ; aucun lit ni lieu n\'est modélisé.',
      category: 'rest',
      version: 1,
      availability: 'available',
      environmentRequirement: null,
      preconditions: [
        {
          kind: 'any_of',
          conditions: [
            { kind: 'need_below', need: 'sleep', threshold: 80 },
            { kind: 'need_below', need: 'energy', threshold: 40 },
          ],
        },
        { kind: 'no_active_action' },
        { kind: 'cooldown_elapsed', actionId: 'sleep' },
      ],
      satisfies: { sleep: 8, energy: 3 },
      costs: { hunger: -0.3, thirst: -0.4, hygiene: -0.1 },
      emotionalEffects: { stress: -1, anxiety: -0.5 },
      durationTicks: 8,
      effectTiming: 'per_tick',
      interruptible: true,
      cooldownTicks: 4,
      traitAffinity: { discipline: 0.1, impulsivity: -0.1 },
      failureRules: [
        {
          id: 'sleep.thirst_critical',
          kind: 'need_below_during_action',
          need: 'thirst',
          threshold: 15,
          onFailure: 'keep_partial',
        },
      ],
      sideEffects: [],
    },
    rest: {
      id: 'rest',
      label: 'Se reposer',
      description: 'Pause courte, sans lieu ni objet dédié.',
      category: 'rest',
      version: 1,
      availability: 'available',
      environmentRequirement: null,
      preconditions: [
        {
          kind: 'any_of',
          conditions: [
            { kind: 'need_below', need: 'energy', threshold: 70 },
            { kind: 'need_below', need: 'sleep', threshold: 60 },
          ],
        },
        { kind: 'no_active_action' },
        { kind: 'cooldown_elapsed', actionId: 'rest' },
      ],
      satisfies: { energy: 4, sleep: 3 },
      costs: {},
      emotionalEffects: { stress: -1.5, anxiety: -0.5 },
      durationTicks: 2,
      effectTiming: 'per_tick',
      interruptible: true,
      cooldownTicks: 1,
      traitAffinity: { patience: 0.1, impulsivity: -0.1 },
      failureRules: [],
      sideEffects: [],
    },
    wash: {
      id: 'wash',
      label: 'Se laver',
      description: 'Action Tier B : nécessite un point d\'eau inexistant dans le moteur actuel.',
      category: 'hygiene',
      version: 1,
      availability: 'requires_environment',
      environmentRequirement: 'washing_facility',
      preconditions: [
        { kind: 'need_below', need: 'hygiene', threshold: 75 },
        { kind: 'environment_available', requirement: 'washing_facility' },
      ],
      satisfies: { hygiene: 30 },
      costs: { energy: -1 },
      emotionalEffects: { happiness: 1, stress: -1 },
      durationTicks: 1,
      effectTiming: 'on_completion',
      interruptible: false,
      cooldownTicks: 3,
      traitAffinity: { discipline: 0.1, impulsivity: -0.05 },
      failureRules: [],
      sideEffects: [],
    },
    entertain_self: {
      id: 'entertain_self',
      label: 'Se divertir',
      description: 'Distraction mentale abstraite ; aucun objet ni loisir concret n\'est modélisé.',
      category: 'leisure',
      version: 1,
      availability: 'available',
      environmentRequirement: null,
      preconditions: [
        {
          kind: 'any_of',
          conditions: [
            { kind: 'need_below', need: 'socialization', threshold: 70 },
            { kind: 'emotion_above', emotion: 'stress', threshold: 60 },
            { kind: 'emotion_below', emotion: 'happiness', threshold: 40 },
          ],
        },
        { kind: 'no_active_action' },
        { kind: 'cooldown_elapsed', actionId: 'entertain_self' },
      ],
      satisfies: { socialization: 2 },
      costs: { energy: -0.5 },
      emotionalEffects: { happiness: 2, stress: -1.5, loneliness: -1 },
      durationTicks: 2,
      effectTiming: 'per_tick',
      interruptible: true,
      cooldownTicks: 2,
      traitAffinity: { humor: 0.15, creativity: 0.1, discipline: -0.05 },
      failureRules: [],
      sideEffects: [],
    },
    explore: {
      id: 'explore',
      label: 'Explorer',
      description: 'Action Tier B : aucun lieu ni déplacement n\'est modélisé.',
      category: 'exploration',
      version: 1,
      availability: 'requires_environment',
      environmentRequirement: 'locations',
      preconditions: [{ kind: 'environment_available', requirement: 'locations' }],
      satisfies: {},
      costs: { energy: -1.5, safety: -0.5 },
      emotionalEffects: { happiness: 1, stress: 0.5 },
      durationTicks: 4,
      effectTiming: 'per_tick',
      interruptible: true,
      cooldownTicks: 4,
      traitAffinity: { curiosity: 0.2, courage: 0.15, timidity: -0.15, distrust: 0.05 },
      failureRules: [],
      sideEffects: [],
    },
    practice_activity: {
      id: 'practice_activity',
      label: 'Pratiquer une activité',
      description: 'Action Tier B : aucune compétence ni outil n\'est modélisé.',
      category: 'leisure',
      version: 1,
      availability: 'requires_environment',
      environmentRequirement: 'activity_definition',
      preconditions: [{ kind: 'environment_available', requirement: 'activity_definition' }],
      satisfies: {},
      costs: { energy: -1 },
      emotionalEffects: { happiness: 1, confidence: 1, motivation: 1 },
      durationTicks: 4,
      effectTiming: 'per_tick',
      interruptible: true,
      cooldownTicks: 3,
      traitAffinity: { creativity: 0.2, ambition: 0.15, discipline: 0.1 },
      failureRules: [],
      sideEffects: [],
    },
    be_alone: {
      id: 'be_alone',
      label: 'Rester seul',
      description: 'Solitude délibérée : coût réel de socialisation.',
      category: 'social',
      version: 1,
      availability: 'available',
      environmentRequirement: null,
      preconditions: [{ kind: 'no_active_action' }],
      satisfies: { energy: 1 },
      costs: { socialization: -1 },
      emotionalEffects: { stress: -1, anxiety: -0.5 },
      durationTicks: 2,
      effectTiming: 'per_tick',
      interruptible: true,
      cooldownTicks: 2,
      traitAffinity: { independence: 0.2, sociability: -0.2 },
      failureRules: [],
      sideEffects: [],
    },
    seek_company: {
      id: 'seek_company',
      label: 'Rechercher de la compagnie',
      description: 'Présence d\'autres personnages uniquement ; aucune interaction ni relation créée.',
      category: 'social',
      version: 1,
      availability: 'available',
      environmentRequirement: null,
      preconditions: [
        { kind: 'other_character_exists' },
        {
          kind: 'any_of',
          conditions: [
            { kind: 'need_below', need: 'socialization', threshold: 80 },
            { kind: 'emotion_above', emotion: 'loneliness', threshold: 50 },
          ],
        },
        { kind: 'no_active_action' },
        { kind: 'cooldown_elapsed', actionId: 'seek_company' },
      ],
      satisfies: { socialization: 4 },
      costs: { energy: -0.5 },
      emotionalEffects: { loneliness: -2, happiness: 1 },
      durationTicks: 2,
      effectTiming: 'per_tick',
      interruptible: true,
      cooldownTicks: 3,
      traitAffinity: { sociability: 0.2, empathy: 0.1, independence: -0.15, timidity: -0.1 },
      failureRules: [],
      sideEffects: [],
    },
    idle: {
      id: 'idle',
      label: 'Ne rien faire',
      description: 'Décision de repli explicite, toujours réalisable et sans effet.',
      category: 'fallback',
      version: 1,
      availability: 'available',
      environmentRequirement: null,
      preconditions: [],
      satisfies: {},
      costs: {},
      emotionalEffects: {},
      durationTicks: 1,
      effectTiming: 'on_completion',
      interruptible: false,
      cooldownTicks: 0,
      traitAffinity: {},
      failureRules: [],
      sideEffects: [],
    },
  },
};

function assertFiniteNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${label} : nombre fini attendu.`);
  }
  return value;
}

function validateEffects(effects: Record<string, number | undefined>, label: string, keys: ReadonlySet<string>): void {
  for (const [key, value] of Object.entries(effects)) {
    if (!keys.has(key)) throw new Error(`${label} : clé inconnue ${key}.`);
    const numeric = assertFiniteNumber(value, `${label}.${key}`);
    if (numeric < -100 || numeric > 100) throw new Error(`${label}.${key} hors de [-100, 100].`);
  }
}

function validatePrecondition(precondition: ActionPrecondition, actionId: ActionId, depth = 0): void {
  if (depth > 4) throw new Error(`${actionId} : précondition trop profonde.`);
  switch (precondition.kind) {
    case 'need_below':
    case 'need_above':
      if (!needSet.has(precondition.need)) throw new Error(`${actionId} : besoin inconnu ${precondition.need}.`);
      assertFiniteNumber(precondition.threshold, `${actionId}.${precondition.kind}.threshold`);
      break;
    case 'emotion_above':
    case 'emotion_below':
      if (!emotionSet.has(precondition.emotion)) throw new Error(`${actionId} : émotion inconnue ${precondition.emotion}.`);
      assertFiniteNumber(precondition.threshold, `${actionId}.${precondition.kind}.threshold`);
      break;
    case 'trait_above':
      if (!traitSet.has(precondition.trait)) throw new Error(`${actionId} : trait inconnu ${precondition.trait}.`);
      assertFiniteNumber(precondition.threshold, `${actionId}.${precondition.kind}.threshold`);
      break;
    case 'hour_between': {
      const from = assertFiniteNumber(precondition.from, `${actionId}.hour_between.from`);
      const to = assertFiniteNumber(precondition.to, `${actionId}.hour_between.to`);
      if (from < 0 || from > 23 || to < 0 || to > 23) throw new Error(`${actionId} : plage horaire invalide.`);
      break;
    }
    case 'other_character_exists':
    case 'no_active_action':
      break;
    case 'cooldown_elapsed':
      if (!actionSet.has(precondition.actionId)) throw new Error(`${actionId} : action de cooldown inconnue.`);
      break;
    case 'environment_available':
      if (!precondition.requirement.trim()) throw new Error(`${actionId} : environnement vide.`);
      break;
    case 'any_of':
      if (precondition.conditions.length === 0) throw new Error(`${actionId} : any_of vide.`);
      for (const child of precondition.conditions) validatePrecondition(child, actionId, depth + 1);
      break;
    default:
      throw new Error(`${actionId} : précondition inconnue.`);
  }
}

/** Valide le catalogue complet ; toute incohérence est une erreur technique. */
export function validateRegistry(registry: ActionRegistry): void {
  if (registry.version !== 1) throw new Error('Version de registre non prise en charge.');
  const ids = Object.keys(registry.definitions) as ActionId[];
  if (ids.length !== ACTION_IDS.length || !ids.every((id) => actionSet.has(id))) {
    throw new Error('Le registre ne contient pas exactement les identifiants attendus.');
  }
  for (const id of ids) {
    const definition = registry.definitions[id];
    if (!definition || definition.id !== id) throw new Error(`Définition incohérente pour ${id}.`);
    if (!/^[a-z][a-z0-9_]*$/.test(id)) throw new Error(`Identifiant d'action invalide : ${id}.`);
    if (!definition.label.trim() || !definition.description.trim()) throw new Error(`${id} : libellé ou description vide.`);
    if (definition.version !== 1) throw new Error(`${id} : version de définition invalide.`);
    if (!Number.isInteger(definition.durationTicks)
      || definition.durationTicks < 1
      || definition.durationTicks > MAX_ACTION_DURATION_TICKS) {
      throw new Error(`${id} : durée invalide.`);
    }
    if (definition.effectTiming === 'on_completion' && definition.durationTicks !== 1) {
      throw new Error(`${id} : on_completion nécessite une durée d'un tick.`);
    }
    if (!Number.isInteger(definition.cooldownTicks) || definition.cooldownTicks < 0) {
      throw new Error(`${id} : cooldown invalide.`);
    }
    const hasEnvironment = definition.preconditions.some((p) => p.kind === 'environment_available');
    if (definition.availability === 'requires_environment') {
      if (!definition.environmentRequirement || !hasEnvironment) {
        throw new Error(`${id} : action Tier B sans environnement déclaré.`);
      }
    } else if (definition.environmentRequirement || hasEnvironment) {
      throw new Error(`${id} : action Tier A avec dépendance d'environnement.`);
    }
    if (definition.sideEffects.length > 0) throw new Error(`${id} : effet non numérique interdit en Phase 3C.`);
    validateEffects(definition.satisfies, `${id}.satisfies`, needSet);
    validateEffects(definition.costs, `${id}.costs`, needSet);
    validateEffects(definition.emotionalEffects, `${id}.emotionalEffects`, emotionSet);
    for (const key of Object.keys(definition.traitAffinity)) {
      if (!traitSet.has(key)) throw new Error(`${id} : trait inconnu ${key}.`);
      const value = assertFiniteNumber(definition.traitAffinity[key as keyof typeof definition.traitAffinity], `${id}.traitAffinity.${key}`);
      if (value < -1 || value > 1) throw new Error(`${id}.traitAffinity.${key} hors de [-1, 1].`);
    }
    for (const precondition of definition.preconditions) validatePrecondition(precondition, id);
    for (const rule of definition.failureRules) {
      if (!rule.id.trim()) throw new Error(`${id} : règle d'échec sans identifiant.`);
      if (rule.kind === 'need_below_during_action') {
        if (!rule.need || !needSet.has(rule.need)) throw new Error(`${id} : besoin d'échec invalide.`);
        assertFiniteNumber(rule.threshold, `${id}.failure.${rule.id}.threshold`);
      }
      if (rule.kind === 'tick_limit') {
        const max = assertFiniteNumber(rule.maxTicks, `${id}.failure.${rule.id}.maxTicks`);
        if (!Number.isInteger(max) || max < 1) throw new Error(`${id} : limite de ticks invalide.`);
      }
      if (rule.kind === 'interruption') throw new Error(`${id} : interruption gérée par le moteur, pas par une règle d'échec.`);
      if (rule.onFailure !== 'abort' && rule.onFailure !== 'keep_partial') {
        throw new Error(`${id} : politique d'échec invalide.`);
      }
    }
    const targeted = Object.keys(definition.satisfies).length + Object.keys(definition.emotionalEffects).length;
    if (targeted === 0 && definition.category !== 'fallback') {
      throw new Error(`${id} : action sans cible ni catégorie fallback justifiée.`);
    }
  }
  if (ACTION_HISTORY_SIZE < 1) throw new Error('Taille d\'historique invalide.');
}

/** Lookup strict : un identifiant inconnu est une erreur technique. */
export function getActionDefinition(id: ActionId): ActionDefinition {
  const definition = ACTION_REGISTRY.definitions[id];
  if (!definition) throw new Error(`Action inconnue : ${id}.`);
  return definition;
}

export function listActionIds(): readonly ActionId[] {
  return ACTION_IDS;
}

export function listAvailableActionIds(): readonly ActionId[] {
  return ACTION_IDS.filter((id) => ACTION_REGISTRY.definitions[id].availability === 'available');
}

/** Alias documenté pour les tests de registre. */
export const REGISTRY_VERSION = ACTION_REGISTRY.version;

/** Réservé : aucune intention non numérique n'est exécutée en Phase 3C. */
export type AllowedSideEffectIntent = SideEffectIntent;
