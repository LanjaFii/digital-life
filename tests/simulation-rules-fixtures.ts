/** Filières de test partagées pour les règles Phase 3B (profils documentés). */
import type { CharacterEmotions, CharacterNeeds, CharacterTraits } from '../src/shared/character';
import type { CharacterTickSnapshot } from '../src/shared/simulation-rules';

export const BASE_TRAITS: CharacterTraits = {
  sociability: 50, empathy: 50, aggression: 50, patience: 50, impulsivity: 50,
  curiosity: 50, intelligence: 50, creativity: 50, honesty: 50, altruism: 50,
  ambition: 50, courage: 50, timidity: 50, distrust: 50, optimism: 50,
  humor: 50, jealousy: 50, discipline: 50, independence: 50, loyalty: 50,
  resilience: 50,
};

export const BASE_NEEDS: CharacterNeeds = {
  hunger: 80, thirst: 80, energy: 80, sleep: 80,
  health: 90, hygiene: 80, socialization: 80, safety: 80,
};

export const BASE_EMOTIONS: CharacterEmotions = {
  happiness: 60, sadness: 20, stress: 30, anxiety: 25, anger: 20,
  fear: 20, confidence: 55, loneliness: 20, motivation: 60, satisfaction: 60,
};

export const PROFILES: Record<string, Partial<CharacterTraits>> = {
  'optimiste résilient': { optimism: 80, resilience: 80, discipline: 60 },
  'anxieux peu résilient': { timidity: 75, distrust: 70, courage: 30, resilience: 25 },
  'discipliné': { discipline: 85, impulsivity: 25, patience: 70 },
  'impulsif': { impulsivity: 85, discipline: 20, patience: 30 },
  'très sociable': { sociability: 90, independence: 20 },
  'indépendant': { sociability: 30, independence: 85 },
};

interface SnapshotOverrides extends Partial<Omit<CharacterTickSnapshot, 'traits' | 'needs' | 'emotions'>> {
  traits?: Partial<CharacterTraits>;
  needs?: Partial<CharacterNeeds>;
  emotions?: Partial<CharacterEmotions>;
}

export function makeSnapshot(overrides: SnapshotOverrides = {}): CharacterTickSnapshot {
  return {
    characterId: overrides.characterId ?? 'char-test',
    traits: { ...BASE_TRAITS, ...(overrides.traits ?? {}) },
    needs: { ...BASE_NEEDS, ...(overrides.needs ?? {}) },
    emotions: { ...BASE_EMOTIONS, ...(overrides.emotions ?? {}) },
    goals: overrides.goals ?? [],
  };
}

export function profileSnapshot(profile: keyof typeof PROFILES): CharacterTickSnapshot {
  return makeSnapshot({ characterId: profile, traits: { ...BASE_TRAITS, ...PROFILES[profile] } });
}
