/**
 * Sérialisation et transitions de l'état mutable d'action (Phase 3C).
 *
 * Service pur : aucune dépendance à Electron, SQLite ou au réseau. Les données
 * corrompues sont des erreurs techniques (le tick doit rollback), jamais des
 * décisions métier silencieusement réparées.
 */
import {
  ACTION_IDS,
  DECISION_RULES,
  createDefaultActionRuntime,
  type ActionId,
  type CharacterActionRuntime,
  type DecisionRule,
} from '../../shared/action';

const ACTION_SET = new Set<string>(ACTION_IDS);
const DECISION_RULE_SET = new Set<string>(DECISION_RULES);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireInteger(value: unknown, label: string, min: number): number {
  if (!Number.isInteger(value) || (value as number) < min) {
    throw new Error(`${label} invalide : entier >= ${min} attendu.`);
  }
  return value as number;
}

function requireActionId(value: unknown, label: string): ActionId {
  if (typeof value !== 'string' || !ACTION_SET.has(value)) {
    throw new Error(`${label} invalide : identifiant d'action inconnu.`);
  }
  return value as ActionId;
}

/**
 * Parse la valeur de `characters.current_action_json`.
 * Une colonne absente (`null`) reçoit la valeur par défaut ; une valeur présente
 * mais invalide est rejetée pour déclencher le rollback complet du tick.
 */
export function parseActionRuntime(raw: unknown): CharacterActionRuntime {
  if (raw == null) return createDefaultActionRuntime();
  const source = typeof raw === 'string' ? JSON.parse(raw) as unknown : raw;
  if (!isRecord(source)) throw new Error('Runtime d’action invalide : objet attendu.');
  if (source.version !== 1) throw new Error('Version de runtime d’action non prise en charge.');
  if (source.interruptedCount !== undefined) requireInteger(source.interruptedCount, 'interruptedCount', 0);
  if (!Array.isArray(source.recentActionIds) || !isRecord(source.cooldowns)) {
    throw new Error('Runtime d’action invalide : historique ou cooldowns manquants.');
  }

  let active: CharacterActionRuntime['active'] = null;
  if (source.active != null) {
    if (!isRecord(source.active)) throw new Error('Runtime d’action invalide : active incorrect.');
    const actionId = requireActionId(source.active.actionId, 'active.actionId');
    const startedTick = requireInteger(source.active.startedTick, 'active.startedTick', 0);
    const endsAtTick = requireInteger(source.active.endsAtTick, 'active.endsAtTick', startedTick);
    const lastAppliedTick = requireInteger(source.active.lastAppliedTick, 'active.lastAppliedTick', startedTick);
    if (lastAppliedTick > endsAtTick) throw new Error('Runtime d’action invalide : lastAppliedTick > endsAtTick.');
    const interruptedCount = requireInteger(source.active.interruptedCount, 'active.interruptedCount', 0);
    active = { actionId, startedTick, endsAtTick, lastAppliedTick, interruptedCount };
  }

  const recentActionIds = source.recentActionIds.map((id, index) => requireActionId(id, `recentActionIds[${index}]`));
  if (recentActionIds.length > 64) throw new Error('Historique d’actions trop long.');

  const cooldowns: CharacterActionRuntime['cooldowns'] = {};
  for (const [key, value] of Object.entries(source.cooldowns)) {
    const actionId = requireActionId(key, 'cooldowns.key');
    cooldowns[actionId] = requireInteger(value, `cooldowns.${key}`, 0);
  }

  let lastDecision: CharacterActionRuntime['lastDecision'] = null;
  if (source.lastDecision != null) {
    if (!isRecord(source.lastDecision)) throw new Error('Runtime d’action invalide : lastDecision incorrect.');
    const tick = requireInteger(source.lastDecision.tick, 'lastDecision.tick', 0);
    const actionId = requireActionId(source.lastDecision.actionId, 'lastDecision.actionId');
    if (typeof source.lastDecision.rule !== 'string' || !DECISION_RULE_SET.has(source.lastDecision.rule)) {
      throw new Error('Règle de décision inconnue dans lastDecision.');
    }
    if (typeof source.lastDecision.reason !== 'string') throw new Error('Raison de décision invalide.');
    lastDecision = {
      tick,
      actionId,
      rule: source.lastDecision.rule as DecisionRule,
      reason: source.lastDecision.reason,
    };
  }

  return {
    version: 1,
    active,
    recentActionIds,
    cooldowns,
    lastDecision,
    interruptedCount: source.interruptedCount === undefined ? 0 : source.interruptedCount as number,
  };
}

export function serializeActionRuntime(runtime: CharacterActionRuntime): string {
  return JSON.stringify(runtime);
}

function withoutExpiredCooldowns(runtime: CharacterActionRuntime, tick: number): CharacterActionRuntime['cooldowns'] {
  const cooldowns: CharacterActionRuntime['cooldowns'] = {};
  for (const [key, expiry] of Object.entries(runtime.cooldowns)) {
    if (expiry !== undefined && expiry > tick) cooldowns[key as ActionId] = expiry;
  }
  return cooldowns;
}

function appendHistory(runtime: CharacterActionRuntime, actionId: ActionId, historySize: number): ActionId[] {
  return [...runtime.recentActionIds, actionId].slice(-Math.max(1, historySize));
}

/** Démarre une action : longue => active, courte => effet immédiat + cooldown. */
export function startActionRuntime(
  runtime: CharacterActionRuntime,
  actionId: ActionId,
  tick: number,
  durationTicks: number,
  cooldownTicks: number,
  historySize: number,
  rule: DecisionRule,
  reason: string,
): CharacterActionRuntime {
  const cooldowns = withoutExpiredCooldowns(runtime, tick);
  const recentActionIds = appendHistory(runtime, actionId, historySize);
  const isLong = durationTicks > 1;
  if (isLong) {
    delete cooldowns[actionId];
    return {
      version: 1,
      active: {
        actionId,
        startedTick: tick,
        endsAtTick: tick + durationTicks - 1,
        lastAppliedTick: tick,
        interruptedCount: 0,
      },
      recentActionIds,
      cooldowns,
      lastDecision: { tick, actionId, rule, reason },
      interruptedCount: runtime.interruptedCount,
    };
  }
  if (cooldownTicks > 0) cooldowns[actionId] = tick + cooldownTicks;
  return {
    version: 1,
    active: null,
    recentActionIds,
    cooldowns,
    lastDecision: { tick, actionId, rule, reason },
    interruptedCount: runtime.interruptedCount,
  };
}

/** Poursuit une action active ; la termine et pose le cooldown au dernier tick. */
export function continueActionRuntime(
  runtime: CharacterActionRuntime,
  tick: number,
  cooldownTicks: number,
): CharacterActionRuntime {
  const active = runtime.active;
  if (!active) throw new Error('Aucune action active à poursuivre.');
  const cooldowns = withoutExpiredCooldowns(runtime, tick);
  const completed = tick >= active.endsAtTick;
  if (completed && cooldownTicks > 0) cooldowns[active.actionId] = tick + cooldownTicks;
  return {
    version: 1,
    active: completed ? null : { ...active, lastAppliedTick: tick },
    recentActionIds: [...runtime.recentActionIds],
    cooldowns,
    // Le dernier choix reste la source d'audit ; la poursuite est tracée par l'active.
    lastDecision: runtime.lastDecision,
    interruptedCount: runtime.interruptedCount,
  };
}

/** Interrompt ou fait échouer l'action active sans réappliquer d'effet ce tick. */
export function clearActiveActionRuntime(
  runtime: CharacterActionRuntime,
  tick: number,
  actionId: ActionId,
  rule: 'interruption' | 'action_failed',
  reason: string,
): CharacterActionRuntime {
  const cooldowns = withoutExpiredCooldowns(runtime, tick);
  return {
    version: 1,
    active: null,
    recentActionIds: [...runtime.recentActionIds],
    cooldowns,
    // L'événement d'interruption/échec est prioritaire dans le résumé compact.
    lastDecision: { tick, actionId, rule, reason },
    interruptedCount: runtime.interruptedCount + (rule === 'interruption' ? 1 : 0),
  };
}
