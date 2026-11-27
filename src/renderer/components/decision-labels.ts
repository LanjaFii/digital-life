/** Libellés et formatages de l'inspecteur de décisions (Phase 3D-D). */
import type { ActionId, DecisionRule } from '../../shared/action';
import type { MotivationSource } from '../../shared/decision';
import { EMOTION_LABELS, NEED_LABELS } from './character-labels';

export const ACTION_LABELS: Record<ActionId, string> = {
  eat: 'Manger',
  drink: 'Boire',
  sleep: 'Dormir',
  rest: 'Se reposer',
  wash: 'Se laver',
  entertain_self: 'Se divertir',
  explore: 'Explorer',
  practice_activity: 'Pratiquer une activité',
  be_alone: 'Rester seul',
  seek_company: 'Chercher du contact',
  idle: 'Ne rien faire',
};

export const SELECTION_RULE_LABELS: Record<DecisionRule, string> = {
  score_tiebreak_rng: 'Égalité arbitrée par le tirage',
  score_tiebreak_id: 'Égalité arbitrée par l’identifiant',
  forced_idle: 'Inaction forcée',
  continue_active: 'Action en cours poursuivie',
  interruption: 'Action en cours interrompue',
  action_failed: 'Action interrompue par échec',
};

export const MOTIVATION_SOURCE_LABELS: Record<MotivationSource, string> = {
  need: 'Besoin',
  emotion: 'Émotion',
  circadian: 'Rythme journalier',
};

export function actionLabel(actionId: ActionId | string): string {
  return ACTION_LABELS[actionId as ActionId] ?? actionId;
}

export function ruleLabel(rule: DecisionRule | string): string {
  return SELECTION_RULE_LABELS[rule as DecisionRule] ?? rule;
}

export function motivationSourceLabel(source: MotivationSource | string): string {
  return MOTIVATION_SOURCE_LABELS[source as MotivationSource] ?? source;
}

export function formatScore(value: number): string {
  if (!Number.isFinite(value)) return '—';
  return value.toFixed(2).replace('-', '−');
}

export function formatSigned(value: number): string {
  if (!Number.isFinite(value)) return '—';
  const rounded = Number(value.toFixed(1));
  if (rounded === 0) return '0';
  return `${rounded > 0 ? '+' : '−'}${Math.abs(rounded).toFixed(1)}`;
}

/** Traduit un champ `needs.hunger` ou `emotions.stress` en libellé lisible. */
export function fieldLabel(field: string): string {
  const separator = field.indexOf('.');
  if (separator < 0) return field;
  const domain = field.slice(0, separator);
  const key = field.slice(separator + 1);
  if (domain === 'needs') return NEED_LABELS[key] ?? key;
  if (domain === 'emotions') return EMOTION_LABELS[key] ?? key;
  return field;
}

export function simulatedTime(day: number, hour: number): string {
  return `Jour ${day} — ${String(hour).padStart(2, '0')}:00`;
}

export function shortHash(hash: string): string {
  return hash.length > 12 ? `${hash.slice(0, 8)}…${hash.slice(-4)}` : hash;
}
