import { randomUUID } from 'node:crypto';
import type { Character, CharacterEmotions, CharacterGender, CharacterGoal, CharacterNeeds, CharacterTraits } from '../../shared/character';
import { SeededRng } from './prng';

const FIRST_NAMES: Record<CharacterGender, readonly string[]> = {
  female: ['Aline', 'Maya', 'Clara', 'Nora', 'Inès', 'Lina', 'Sofia', 'Élise', 'Jade', 'Mina', 'Helena', 'Yuna', 'Camille', 'Romy', 'Tessa'],
  male: ['Adam', 'Noah', 'Léo', 'Hugo', 'Sami', 'Victor', 'Elias', 'Milan', 'Jonas', 'Theo', 'Nolan', 'Arthur', 'Remy', 'Kian', 'Oscar'],
  nonbinary: ['Alex', 'Charlie', 'Sacha', 'Noa', 'Eden', 'Robin', 'Ari', 'Morgan', 'Lou', 'Rei', 'Sky', 'Jamie', 'Taylor', 'Kim', 'Drew'],
};

const LAST_NAMES = [
  'Martin', 'Bernard', 'Dubois', 'Moreau', 'Laurent', 'Simon', 'Lefèvre', 'Mercier', 'Faure', 'Blanc',
  'Roux', 'Garnier', 'Meyer', 'Perrin', 'Robin', 'Renaud', 'Colin', 'Vidal', 'Boyer', 'Lambert',
];

const PRIMARY_GOALS = [
  'Trouver un équilibre stable au quotidien',
  'Se faire de vrais amis',
  'Devenir plus confiant',
  'Construire une vie paisible',
  'Comprendre les autres',
  'Protéger les personnes proches',
  'Apprendre quelque chose de nouveau',
  'Trouver un but personnel',
];

const SECONDARY_GOALS = [
  'Améliorer sa routine',
  'Explorer les environs',
  'Gérer mieux son stress',
  'Développer une compétence',
  'Prendre soin de sa santé',
  'Avoir des conversations sincères',
];

function clamp(n: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, Math.round(n)));
}

function trait(rng: SeededRng, base = 50, spread = 20): number {
  // distribution simple centrée, clampée 0-100
  const value = base + (rng.next() + rng.next() + rng.next() - 1.5) * spread;
  return clamp(value);
}

function makeTraits(rng: SeededRng): CharacterTraits {
  const sociability = trait(rng, 50, 28);
  const timidity = clamp(100 - sociability + rng.int(-15, 15));
  const courage = clamp(100 - timidity * 0.5 + rng.int(-20, 20));
  const aggression = trait(rng, 35, 22);
  const empathy = clamp(trait(rng, 55, 22) - aggression * 0.15);
  const patience = clamp(trait(rng, 55, 22) - aggression * 0.1);
  const impulsivity = clamp(100 - patience + rng.int(-15, 15));
  const distrust = trait(rng, 40, 22);
  const honesty = clamp(trait(rng, 60, 18) - distrust * 0.05);
  const optimism = trait(rng, 55, 24);
  const resilience = clamp(trait(rng, 55, 20) + optimism * 0.1);
  return {
    sociability,
    empathy,
    aggression,
    patience,
    impulsivity,
    curiosity: trait(rng, 55, 24),
    intelligence: trait(rng, 55, 20),
    creativity: trait(rng, 55, 24),
    honesty,
    altruism: clamp(trait(rng, 55, 20) + empathy * 0.15),
    ambition: trait(rng, 50, 24),
    courage,
    timidity,
    distrust,
    optimism,
    humor: trait(rng, 50, 25),
    jealousy: clamp(trait(rng, 35, 20) + distrust * 0.15),
    discipline: clamp(trait(rng, 50, 22) + (100 - impulsivity) * 0.1),
    independence: trait(rng, 50, 24),
    loyalty: clamp(trait(rng, 60, 18) + honesty * 0.1),
    resilience,
  };
}

function makeEmotions(rng: SeededRng, traits: CharacterTraits): CharacterEmotions {
  const happiness = clamp(45 + traits.optimism * 0.25 - traits.distrust * 0.1 + rng.int(-10, 10));
  const sadness = clamp(30 - traits.optimism * 0.1 + rng.int(-8, 12));
  const stress = clamp(35 + (100 - traits.resilience) * 0.15 + rng.int(-10, 10));
  const anxiety = clamp(30 + traits.distrust * 0.15 + stress * 0.1 + rng.int(-8, 10));
  return {
    happiness,
    sadness,
    stress,
    anxiety,
    anger: clamp(20 + traits.aggression * 0.2 + rng.int(-5, 10)),
    fear: clamp(25 + traits.timidity * 0.2 + anxiety * 0.1 + rng.int(-8, 8)),
    confidence: clamp(45 + traits.courage * 0.2 + traits.optimism * 0.1 - anxiety * 0.1 + rng.int(-8, 8)),
    loneliness: clamp(35 + (100 - traits.sociability) * 0.2 - happiness * 0.1 + rng.int(-8, 10)),
    motivation: clamp(50 + traits.ambition * 0.2 + traits.optimism * 0.1 - sadness * 0.1 + rng.int(-8, 8)),
    satisfaction: clamp(45 + happiness * 0.2 - stress * 0.1 + rng.int(-8, 8)),
  };
}

function makeNeeds(rng: SeededRng): CharacterNeeds {
  const base = () => clamp(rng.int(55, 90));
  return {
    hunger: base(),
    thirst: base(),
    energy: base(),
    sleep: base(),
    health: clamp(rng.int(70, 100)),
    hygiene: base(),
    socialization: base(),
    safety: clamp(rng.int(60, 95)),
  };
}

function makeGoals(rng: SeededRng): CharacterGoal[] {
  const primary = rng.pick(PRIMARY_GOALS);
  const secondaryPool = SECONDARY_GOALS.filter((g) => g !== primary);
  const s1 = rng.pick(secondaryPool);
  const s2 = rng.pick(secondaryPool.filter((g) => g !== s1));
  const makeId = () => `goal_${rng.int(100000, 999999)}_${rng.int(100000, 999999)}`;
  return [
    { id: makeId(), label: primary, kind: 'primary' },
    { id: makeId(), label: s1, kind: 'secondary' },
    { id: makeId(), label: s2, kind: 'secondary' },
  ];
}

function makeBiography(firstName: string, age: number, traits: CharacterTraits, rng: SeededRng): string {
  const temperament = traits.sociability > 65 ? 'sociable' : traits.sociability < 40 ? 'réservé' : 'équilibré';
  const drive = traits.ambition > 65 ? 'ambitieux' : traits.curiosity > 65 ? 'curieux' : 'pragmatique';
  const quirk = rng.pick(['aime les routines calmes', 'observe beaucoup avant d’agir', 'cherche du sens dans les petites choses', 'apprend vite des autres', 'garde un humour discret']);
  return `${firstName}, ${age} ans, personnalité ${temperament} et ${drive}, ${quirk}.`;
}

function makeGender(rng: SeededRng): CharacterGender {
  const roll = rng.next();
  if (roll < 0.45) return 'female';
  if (roll < 0.9) return 'male';
  return 'nonbinary';
}

export function generateCharactersForWorld(worldId: string, seed: number, count: number, createdAt = new Date().toISOString()): Character[] {
  const rng = new SeededRng(seed ^ 0x9e3779b9);
  const result: Character[] = [];
  const usedNames = new Set<string>();
  for (let i = 0; i < count; i += 1) {
    // dérive une sous-sequence stable par index
    const local = new SeededRng(seed + i * 1013904223);
    const gender = makeGender(local);
    let firstName = local.pick(FIRST_NAMES[gender]);
    let lastName = local.pick(LAST_NAMES);
    let guard = 0;
    while (usedNames.has(`${firstName} ${lastName}`) && guard < 50) {
      firstName = local.pick(FIRST_NAMES[gender]);
      lastName = local.pick(LAST_NAMES);
      guard += 1;
    }
    usedNames.add(`${firstName} ${lastName}`);
    const age = local.int(18, 65);
    const traits = makeTraits(local);
    const emotions = makeEmotions(local, traits);
    const needs = makeNeeds(local);
    const goals = makeGoals(local);
    result.push({
      id: `char_${seed.toString(36)}_${i}_${local.int(1000, 9999)}`,
      worldId,
      firstName,
      lastName,
      age,
      gender,
      biography: makeBiography(firstName, age, traits, local),
      traits,
      emotions,
      needs,
      goals,
      createdAt,
    });
  }
  // consume rng to keep deterministic dependency explicit (not necessary but harmless)
  void rng.next();
  return result;
}