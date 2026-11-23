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

export interface Character {
  id: string;
  worldId: string;
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
}

export interface CharacterListResult {
  characters: Character[];
}