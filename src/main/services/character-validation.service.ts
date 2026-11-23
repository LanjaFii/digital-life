import { randomUUID } from 'node:crypto';
import {
  EMOTION_KEYS,
  NEED_KEYS,
  TRAIT_KEYS,
  type CharacterDraft,
  type CharacterGender,
  type CharacterGoal,
} from '../../shared/character';

const GENDERS: readonly CharacterGender[] = ['female', 'male', 'nonbinary'];

function asObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} invalide.`);
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown, label: string, { required = true, max = 200 }: { required?: boolean; max?: number } = {}): string {
  if (typeof value !== 'string') throw new Error(`${label} invalide.`);
  const trimmed = value.trim();
  if (required && !trimmed) throw new Error(`${label} obligatoire.`);
  if (trimmed.length > max) throw new Error(`${label} trop long (${max} caractères max).`);
  return trimmed;
}

function asInt(value: unknown, label: string, min: number, max: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n)) throw new Error(`${label} doit être un entier.`);
  if (n < min || n > max) throw new Error(`${label} doit être entre ${min} et ${max}.`);
  return n;
}

function asScore(value: unknown, label: string): number {
  return asInt(value, label, 0, 100);
}

function asGender(value: unknown): CharacterGender {
  if (typeof value !== 'string' || !GENDERS.includes(value as CharacterGender)) {
    throw new Error('Genre invalide.');
  }
  return value as CharacterGender;
}

function validateScoreMap<T extends readonly string[]>(value: unknown, keys: T, label: string): Record<T[number], number> {
  const obj = asObject(value, label);
  const out: Record<string, number> = {};
  for (const key of keys) {
    out[key] = asScore(obj[key], `${label}.${key}`);
  }
  return out as Record<T[number], number>;
}

function validateGoals(value: unknown): CharacterGoal[] {
  if (!Array.isArray(value)) throw new Error('Objectifs invalides.');
  const goals = value.map((raw, i) => {
    const obj = asObject(raw, `Objectif ${i + 1}`);
    const kind = obj.kind === 'primary' || obj.kind === 'secondary' ? obj.kind : null;
    if (!kind) throw new Error('Type d’objectif invalide.');
    const label = asString(obj.label, `Libellé d’objectif ${i + 1}`, { required: true, max: 120 });
    const id = typeof obj.id === 'string' && obj.id.trim() ? obj.id.trim().slice(0, 100) : randomUUID();
    return { id, label, kind } as CharacterGoal;
  });
  const primary = goals.filter((g) => g.kind === 'primary');
  const secondary = goals.filter((g) => g.kind === 'secondary');
  if (primary.length !== 1) throw new Error('Un objectif principal est requis.');
  if (secondary.length !== 2) throw new Error('Deux objectifs secondaires sont requis.');
  return [...primary, ...secondary];
}

export function validateCharacterDraft(value: unknown): CharacterDraft {
  const obj = asObject(value, 'Personnage');
  return {
    firstName: asString(obj.firstName, 'Prénom', { required: true, max: 40 }),
    lastName: asString(obj.lastName, 'Nom', { required: true, max: 40 }),
    age: asInt(obj.age, 'Âge', 18, 65),
    gender: asGender(obj.gender),
    biography: asString(obj.biography, 'Biographie', { required: false, max: 500 }),
    traits: validateScoreMap(obj.traits, TRAIT_KEYS, 'Trait'),
    emotions: validateScoreMap(obj.emotions, EMOTION_KEYS, 'Émotion'),
    needs: validateScoreMap(obj.needs, NEED_KEYS, 'Besoin'),
    goals: validateGoals(obj.goals),
  };
}
