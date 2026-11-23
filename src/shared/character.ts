/**
 * Modèle personnage initial (Phase 1).
 * Échelles numériques : traits 0-100, émotions 0-100, besoins 0-100.
 * Aucun code Node ici.
 */

export type CharacterGender = 'female' | 'male' | 'nonbinary';

export interface CharacterTraits {
  /** 0-100 */ sociability: number;
  /** 0-100 */ empathy: number;
  /** 0-100 */ aggression: number;
  /** 0-100 */ patience: number;
  /** 0-100 */ impulsivity: number;
  /** 0-100 */ curiosity: number;
  /** 0-100 */ intelligence: number;
  /** 0-100 */ creativity: number;
  /** 0-100 */ honesty: number;
  /** 0-100 */ altruism: number;
  /** 0-100 */ ambition: number;
  /** 0-100 */ courage: number;
  /** 0-100 */ timidity: number;
  /** 0-100 */ distrust: number;
  /** 0-100 */ optimism: number;
  /** 0-100 */ humor: number;
  /** 0-100 */ jealousy: number;
  /** 0-100 */ discipline: number;
  /** 0-100 */ independence: number;
  /** 0-100 */ loyalty: number;
  /** 0-100 */ resilience: number;
}

export interface CharacterEmotions {
  /** 0-100 */ happiness: number;
  /** 0-100 */ sadness: number;
  /** 0-100 */ stress: number;
  /** 0-100 */ anxiety: number;
  /** 0-100 */ anger: number;
  /** 0-100 */ fear: number;
  /** 0-100 */ confidence: number;
  /** 0-100 */ loneliness: number;
  /** 0-100 */ motivation: number;
  /** 0-100 */ satisfaction: number;
}

export interface CharacterNeeds {
  /** 0-100, 100 = besoin satisfait */ hunger: number;
  /** 0-100 */ thirst: number;
  /** 0-100 */ energy: number;
  /** 0-100 */ sleep: number;
  /** 0-100 */ health: number;
  /** 0-100 */ hygiene: number;
  /** 0-100 */ socialization: number;
  /** 0-100 */ safety: number;
}

export interface CharacterGoal {
  id: string;
  label: string;
  kind: 'primary' | 'secondary';
}

/** État d'un personnage (initial ou courant). */
export interface CharacterState {
  traits: CharacterTraits;
  emotions: CharacterEmotions;
  needs: CharacterNeeds;
  goals: CharacterGoal[];
}

/** Instance de personnage appartenant à un monde. */
export interface CharacterInstance {
  id: string;
  worldId: string;
  templateId: string | null;
  firstName: string;
  lastName: string;
  age: number;
  gender: CharacterGender;
  biography: string;
  /** Paramètres de départ (verrouillés quand la simulation démarre). */
  initialState: CharacterState;
  /** État courant (évoluera avec la simulation future). */
  currentState: CharacterState;
  createdAt: string;
  updatedAt: string;
}

/** Alias de compatibilité : un Character est une instance de monde. */
export type Character = CharacterInstance;

export interface CharacterListResult {
  characters: CharacterInstance[];
}

/** Modèle réutilisable dans la bibliothèque personnelle. */
export interface CharacterTemplate {
  id: string;
  firstName: string;
  lastName: string;
  age: number;
  gender: CharacterGender;
  biography: string;
  traits: CharacterTraits;
  emotions: CharacterEmotions;
  needs: CharacterNeeds;
  goals: CharacterGoal[];
  createdAt: string;
  updatedAt: string;
}

export interface CharacterTemplateListResult {
  templates: CharacterTemplate[];
}

export const TRAIT_KEYS = [
  'sociability', 'empathy', 'aggression', 'patience', 'impulsivity', 'curiosity',
  'intelligence', 'creativity', 'honesty', 'altruism', 'ambition', 'courage',
  'timidity', 'distrust', 'optimism', 'humor', 'jealousy', 'discipline',
  'independence', 'loyalty', 'resilience',
] as const;

export const EMOTION_KEYS = [
  'happiness', 'sadness', 'stress', 'anxiety', 'anger', 'fear',
  'confidence', 'loneliness', 'motivation', 'satisfaction',
] as const;

export const NEED_KEYS = [
  'hunger', 'thirst', 'energy', 'sleep', 'health', 'hygiene', 'socialization', 'safety',
] as const;

export type TraitKey = (typeof TRAIT_KEYS)[number];
export type EmotionKey = (typeof EMOTION_KEYS)[number];
export type NeedKey = (typeof NEED_KEYS)[number];

/** Données communes pour création/modification de personnage. */
export interface CharacterDraft {
  firstName: string;
  lastName: string;
  age: number;
  gender: CharacterGender;
  biography: string;
  traits: CharacterTraits;
  emotions: CharacterEmotions;
  needs: CharacterNeeds;
  goals: CharacterGoal[];
}

export interface CreateCharacterInWorldInput extends CharacterDraft {
  worldId: string;
  /** Enregistrer aussi comme modèle dans la bibliothèque. */
  saveAsTemplate?: boolean;
}

export interface CreateTemplateInput extends CharacterDraft {}

export interface UpdateTemplateInput extends CharacterDraft {
  id: string;
}

export interface UpdateCharacterInstanceInput extends CharacterDraft {
  id: string;
  worldId: string;
}

export interface InstantiateTemplateInput {
  templateId: string;
  worldId: string;
}

export interface RandomCharacterDraft {
  traits: CharacterTraits;
  emotions: CharacterEmotions;
  needs: CharacterNeeds;
}