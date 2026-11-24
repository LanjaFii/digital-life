/**
 * Sélection finale et explicabilité des décisions (Phase 3C).
 *
 * Service pur : aucun effet sur le monde, aucune écriture, aucune dépendance
 * Electron/SQLite. Le PRNG n'est consommé qu'en cas d'ex æquo réel et au plus
 * une fois par personnage et par tick.
 */
import type {
  ActionDefinition,
  ActionId,
  CharacterActionRuntime,
  DecisionRule,
} from '../../shared/action';
import type { CharacterNeeds, NeedKey } from '../../shared/character';
import type { DecisionEngineInput, DecisionResult, ScoredCandidate } from '../../shared/decision';
import { getActionDefinition } from './action-registry.service';
import { assertBoundedValue } from './personality-influence.service';

interface BestSelection {
  actionId: ActionId;
  rule: 'score_tiebreak_rng' | 'score_tiebreak_id';
  reason: string;
  rngDraws: 0 | 1;
}

function compareActionId(a: ScoredCandidate, b: ScoredCandidate): number {
  return a.actionId < b.actionId ? -1 : a.actionId > b.actionId ? 1 : 0;
}

/** Max par score quantifié, puis identifiant ; tirage unique si ex æquo. */
function selectBest(
  candidates: readonly ScoredCandidate[],
  input: DecisionEngineInput,
): BestSelection {
  if (candidates.length === 0) throw new Error('Sélection impossible sans candidat.');
  const sorted = [...candidates].sort(compareActionId);
  const bestScore = Math.max(...sorted.map((candidate) => candidate.score));
  const tied = sorted.filter((candidate) => candidate.score === bestScore);

  if (tied.length > 1 && input.params.tieBreak === 'rng') {
    const draw = input.rng.next();
    if (!Number.isFinite(draw) || draw < 0 || draw >= 1) throw new Error('Tirage PRNG invalide.');
    const index = Math.min(tied.length - 1, Math.floor(draw * tied.length));
    return {
      actionId: tied[index].actionId,
      rule: 'score_tiebreak_rng',
      reason: `score maximal ${bestScore} partagé par ${tied.length} actions ; tirage PRNG unique (index ${index})`,
      rngDraws: 1,
    };
  }

  return {
    actionId: tied[0].actionId,
    rule: 'score_tiebreak_id',
    reason: tied.length === 1
      ? `score maximal unique ${bestScore}`
      : `score maximal ${bestScore} partagé par ${tied.length} actions ; départage lexicographique`,
    rngDraws: 0,
  };
}

/** Contexte minimal nécessaire aux règles d'échec. */
export interface ActionFailureContext {
  needs: Readonly<CharacterNeeds>;
  active: CharacterActionRuntime['active'];
}

/** Évalue les règles d'échec de l'action active, sans modifier l'état. */
export function findActionFailure(
  definition: ActionDefinition,
  context: ActionFailureContext,
  tick: number,
): { ruleId: string; reason: string } | null {
  const active = context.active;
  if (!active) return null;
  const elapsed = tick - active.startedTick + 1;
  for (const rule of definition.failureRules) {
    if (rule.kind === 'need_below_during_action') {
      if (!rule.need || rule.threshold === undefined) throw new Error(`Règle d'échec incomplète : ${rule.id}.`);
      const value = assertBoundedValue(context.needs[rule.need], `needs.${rule.need}`);
      if (value < rule.threshold) {
        return {
          ruleId: rule.id,
          reason: `${rule.id} : ${rule.need} à ${value} sous ${rule.threshold} ; effets futurs abandonnés (${rule.onFailure})`,
        };
      }
    } else if (rule.kind === 'tick_limit') {
      if (!Number.isInteger(rule.maxTicks) || (rule.maxTicks ?? 0) < 1) {
        throw new Error(`Règle d'échec invalide : ${rule.id}.`);
      }
      if (elapsed > (rule.maxTicks as number)) {
        return {
          ruleId: rule.id,
          reason: `${rule.id} : durée ${elapsed} dépasse ${rule.maxTicks} ticks ; effets futurs abandonnés (${rule.onFailure})`,
        };
      }
    } else {
      throw new Error(`Type de règle d'échec non pris en charge : ${rule.kind}.`);
    }
  }
  return null;
}

/**
 * Besoin le plus urgent du tick. En cas d'égalité, l'ordre lexicographique
 * garantit un choix indépendant de l'ordre des objets.
 */
export function mostUrgentNeed(goals: DecisionEngineInput['goals']): NeedKey {
  const entries = Object.entries(goals.needUrgencies) as Array<[NeedKey, number]>;
  entries.sort((a, b) => (b[1] - a[1]) || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return entries[0][0];
}

/**
 * Une interruption n'a de sens que si l'action de remplacement apporte un gain
 * au besoin critique qui l'a déclenchée. Sans cette condition, un besoin non
 * réparable (santé, hygiène sans environnement) provoquerait un churn sans fin.
 */
export function addressesNeed(actionId: ActionId, need: NeedKey): boolean {
  return (getActionDefinition(actionId).satisfies[need] ?? 0) > 0;
}

/** Les quatre conditions cumulatives d'interruption du document ACTION_SYSTEM. */
export function canInterruptActiveAction(
  definition: ActionDefinition,
  input: DecisionEngineInput,
  feasibleAlternatives: readonly ScoredCandidate[],
): boolean {
  const active = input.snapshot.actionRuntime.active;
  if (!active) return false;
  const maxUrgency = Math.max(...Object.values(input.goals.needUrgencies));
  return definition.interruptible
    && maxUrgency > input.params.criticalUrgency
    && input.tick - active.startedTick >= input.params.minTicksBeforeInterrupt
    && feasibleAlternatives.length > 0;
}

/** Produit exactement une décision explicable par personnage et par tick. */
export function decideAction(input: DecisionEngineInput): DecisionResult {
  const rngStateBefore = input.rng.getState();
  const sorted = [...input.scored].sort(compareActionId);
  const feasible = sorted.filter((candidate) => candidate.feasible);
  const rejected = sorted
    .filter((candidate) => !candidate.feasible)
    .map((candidate) => ({ actionId: candidate.actionId, reasons: candidate.rejections.map((r) => r.reason) }));

  let selectedActionId: ActionId;
  let selectionRule: DecisionRule;
  let reason: string;
  let rngDraws: 0 | 1 = 0;

  const active = input.snapshot.actionRuntime.active;
  if (active) {
    const definition = getActionDefinition(active.actionId);
    const failure = findActionFailure(
      definition,
      { needs: input.snapshot.needs, active },
      input.tick,
    );
    const interruptionPool = [...(input.interruptionScored ?? input.scored)]
      .sort(compareActionId)
      .filter((candidate) => candidate.feasible);
    // Une action à score non positif n'est pas une raison d'interrompre une
    // action en cours : l'interruption doit avoir une utilité démontrable.
    const alternatives = interruptionPool.filter(
      (candidate) => candidate.actionId !== 'idle'
        && candidate.actionId !== active.actionId
        && candidate.score > 0,
    );
    if (failure) {
      selectedActionId = active.actionId;
      selectionRule = 'action_failed';
      reason = failure.reason;
    } else {
      const urgentNeed = mostUrgentNeed(input.goals);
      const relevant = alternatives.filter((candidate) => addressesNeed(candidate.actionId, urgentNeed));
      if (relevant.length > 0 && canInterruptActiveAction(definition, input, relevant)) {
        const best = selectBest(relevant, input);
        selectedActionId = best.actionId;
        selectionRule = 'interruption';
        reason = `interruption de ${active.actionId} après ${input.tick - active.startedTick} ticks ; ${best.reason}`;
        rngDraws = best.rngDraws;
      } else {
        selectedActionId = active.actionId;
        selectionRule = 'continue_active';
        reason = `action longue ${active.actionId} poursuivie jusqu'au tick ${active.endsAtTick} (aucune interruption utile)`;
      }
    }
  } else {
    // Sans gain net (score <= 0), aucune action ne justifie de quitter `idle` :
    // cela évite l'agitation artificielle quand tous les besoins sont couverts.
    const alternatives = feasible.filter(
      (candidate) => candidate.actionId !== 'idle' && candidate.score > 0,
    );
    if (alternatives.length === 0) {
      selectedActionId = 'idle';
      selectionRule = 'forced_idle';
      reason = 'aucune action réalisable : repli idle explicite';
    } else {
      const best = selectBest(alternatives, input);
      selectedActionId = best.actionId;
      selectionRule = best.rule;
      reason = best.reason;
      rngDraws = best.rngDraws;
    }
  }

  const rngStateAfter = input.rng.getState();
  if (rngDraws === 1 && rngStateAfter === rngStateBefore) {
    throw new Error('Tirage PRNG effectué sans avancement d’état : rejeu impossible.');
  }

  const definition = getActionDefinition(selectedActionId);
  const expectedNeeds: Record<string, number> = {};
  for (const [key, value] of Object.entries(definition.satisfies)) {
    if (value !== undefined) expectedNeeds[key] = value;
  }
  for (const [key, value] of Object.entries(definition.costs)) {
    if (value !== undefined) expectedNeeds[key] = (expectedNeeds[key] ?? 0) + value;
  }

  return {
    explanation: {
      worldId: input.worldId,
      characterId: input.snapshot.characterId,
      tick: input.tick,
      day: input.day,
      hour: input.hour,
      ruleId: 'decision.v1',
      motivations: input.goals.motivations.map((m) => ({ ...m })),
      immediateGoals: input.goals.immediateGoals.map((g) => ({ ...g, motivations: g.motivations.map((m) => ({ ...m })) })),
      candidateScores: sorted.map((candidate) => ({
        actionId: candidate.actionId,
        feasible: candidate.feasible,
        score: candidate.score,
        components: { ...candidate.components },
        rejections: candidate.rejections.map((r) => ({ ...r })),
      })),
      selectedActionId,
      selectionRule,
      reason,
      rejected,
      expectedEffects: {
        needs: expectedNeeds as DecisionResult['explanation']['expectedEffects']['needs'],
        emotions: { ...definition.emotionalEffects },
      },
      rngStateBefore,
      rngStateAfter,
      rngDraws,
    },
    rngState: rngStateAfter,
  };
}
