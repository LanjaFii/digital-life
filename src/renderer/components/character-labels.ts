import type { CharacterDraft, CharacterInstance, CharacterTemplate } from '../../shared/character';
import { EMOTION_KEYS, NEED_KEYS, TRAIT_KEYS } from '../../shared/character';

export const TRAIT_LABELS: Record<string, string> = {
  sociability: 'Sociabilité', empathy: 'Empathie', aggression: 'Agressivité', patience: 'Patience',
  impulsivity: 'Impulsivité', curiosity: 'Curiosité', intelligence: 'Intelligence', creativity: 'Créativité',
  honesty: 'Honnêteté', altruism: 'Altruisme', ambition: 'Ambition', courage: 'Courage',
  timidity: 'Timidité', distrust: 'Méfiance', optimism: 'Optimisme', humor: 'Humour',
  jealousy: 'Jalousie', discipline: 'Discipline', independence: 'Indépendance', loyalty: 'Loyauté', resilience: 'Résilience',
};

export const TRAIT_DESCRIPTIONS: Record<string, string> = {
  sociability: 'Recherche le contact et les échanges.',
  empathy: 'Comprend et ressent les émotions des autres.',
  aggression: 'Tendance à réagir avec hostilité.',
  patience: 'Capacité à attendre et supporter la frustration.',
  impulsivity: 'Agit sans réfléchir aux conséquences.',
  curiosity: 'Envie d’apprendre et d’explorer.',
  intelligence: 'Facilité de raisonnement et d’adaptation.',
  creativity: 'Produit des idées originales.',
  honesty: 'Dit la vérité et agit avec franchise.',
  altruism: 'Aide les autres sans attendre de retour.',
  ambition: 'Veut progresser et atteindre des objectifs.',
  courage: 'Affronte le risque et l’inconnu.',
  timidity: 'Réserve face aux situations sociales.',
  distrust: 'Se méfie des intentions des autres.',
  optimism: 'Voit plutôt le positif.',
  humor: 'Aime rire et dédramatiser.',
  jealousy: 'Craint de perdre ce qui lui tient à cœur.',
  discipline: 'Organisé et constant dans l’effort.',
  independence: 'Préfère agir par lui-même.',
  loyalty: 'Fidèle aux personnes et aux engagements.',
  resilience: 'Se remet des difficultés.',
};

export const EMOTION_LABELS: Record<string, string> = {
  happiness: 'Bonheur', sadness: 'Tristesse', stress: 'Stress', anxiety: 'Anxiété',
  anger: 'Colère', fear: 'Peur', confidence: 'Confiance', loneliness: 'Solitude',
  motivation: 'Motivation', satisfaction: 'Satisfaction',
};

export const NEED_LABELS: Record<string, string> = {
  hunger: 'Faim', thirst: 'Soif', energy: 'Énergie', sleep: 'Sommeil',
  health: 'Santé', hygiene: 'Hygiène', socialization: 'Socialisation', safety: 'Sécurité',
};

export function emptyDraft(): CharacterDraft {
  const traits = Object.fromEntries(TRAIT_KEYS.map((k) => [k, 50])) as unknown as CharacterDraft['traits'];
  const emotions = Object.fromEntries(EMOTION_KEYS.map((k) => [k, 50])) as unknown as CharacterDraft['emotions'];
  const needs = Object.fromEntries(NEED_KEYS.map((k) => [k, 80])) as unknown as CharacterDraft['needs'];
  return {
    firstName: '', lastName: '', age: 25, gender: 'nonbinary', biography: '',
    traits, emotions, needs,
    goals: [
      { id: 'goal-primary', label: '', kind: 'primary' },
      { id: 'goal-secondary-1', label: '', kind: 'secondary' },
      { id: 'goal-secondary-2', label: '', kind: 'secondary' },
    ],
  };
}

export function draftFromCharacter(c: CharacterInstance | CharacterTemplate): CharacterDraft {
  const state = 'currentState' in c ? c.currentState : c;
  return {
    firstName: c.firstName, lastName: c.lastName, age: c.age, gender: c.gender, biography: c.biography,
    traits: { ...state.traits }, emotions: { ...state.emotions }, needs: { ...state.needs },
    goals: state.goals.map((g) => ({ ...g })),
  };
}
