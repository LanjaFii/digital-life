import { deflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import {
  canonicalDecisionPayload,
  canonicalize,
  deserializeDecisionRecord,
  finalizeDecisionRecord,
  serializeDecisionRecord,
  validateDecisionRecordPayload,
} from '../src/main/services/decision-record.service';
import type { ActionId } from '../src/shared/action';
import type { DecisionRecordPayloadV1 } from '../src/shared/decision';
import { makeDecisionPayload } from './decision-record-fixtures';

const CREATED_AT = '2026-11-24T12:34:56.789Z';

function clone(payload: DecisionRecordPayloadV1): DecisionRecordPayloadV1 {
  return structuredClone(payload) as DecisionRecordPayloadV1;
}

function reorder(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reorder);
  if (value === null || typeof value !== 'object') return value;
  const entries = Object.entries(value as Record<string, unknown>).reverse();
  return Object.fromEntries(entries.map(([key, child]) => [key, reorder(child)]));
}

function noisyString(length: number, offset = 0): string {
  let state = (0x12345678 + offset) >>> 0;
  let result = '';
  const alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  for (let index = 0; index < length; index += 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    result += alphabet[state % alphabet.length];
  }
  return result;
}

describe('enregistrement de décision — sérialisation (3D-A)', () => {
  it('canonicalise indépendamment de l’ordre des clés', () => {
    const payload = makeDecisionPayload();
    expect(canonicalize(reorder(payload))).toBe(canonicalDecisionPayload(payload));
  });

  it('ajoute un hash et une taille déterministes puis relit le BLOB sans perte', () => {
    const payload = makeDecisionPayload();
    const record = finalizeDecisionRecord(payload, CREATED_AT);
    const row = serializeDecisionRecord(record);
    const decoded = deserializeDecisionRecord(row);

    expect(record.payloadSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(record.uncompressedBytes).toBe(Buffer.byteLength(canonicalDecisionPayload(payload), 'utf8'));
    expect(record.createdAt).toBe(CREATED_AT);
    expect(row.payload_blob.length).toBeLessThan(Buffer.byteLength(canonicalize(record), 'utf8'));
    expect(decoded).toEqual(record);
  });

  it('rejette une version inconnue', () => {
    const payload = clone(makeDecisionPayload());
    (payload as unknown as { recordVersion: number }).recordVersion = 2;
    expect(() => validateDecisionRecordPayload(payload)).toThrow(/version/i);
  });

  it('rejette un hash invalide et une colonne de hash incohérente', () => {
    const record = finalizeDecisionRecord(makeDecisionPayload(), CREATED_AT);
    expect(() => serializeDecisionRecord({ ...record, payloadSha256: '0'.repeat(64) })).toThrow(/hash/i);
    const row = serializeDecisionRecord(record);
    expect(() => deserializeDecisionRecord({ ...row, payload_sha256: '0'.repeat(64) })).toThrow(/payload_sha256/);
  });

  it('rejette un JSON corrompu après décompression', () => {
    const row = serializeDecisionRecord(finalizeDecisionRecord(makeDecisionPayload(), CREATED_AT));
    expect(() => deserializeDecisionRecord({
      ...row,
      payload_blob: new Uint8Array(deflateSync(Buffer.from('{'))),
    })).toThrow(/corrompu/);
  });

  it('rejette une taille canonique excessive', () => {
    const payload = clone(makeDecisionPayload());
    payload.warnings = [noisyString(70_000)];
    expect(() => finalizeDecisionRecord(payload, CREATED_AT)).toThrow(/uncompressedBytes|Taille/i);
  });

  it('rejette un BLOB compressé trop volumineux', () => {
    const payload = clone(makeDecisionPayload());
    payload.warnings = Array.from({ length: 64 }, (_, index) => noisyString(400, index));
    const record = finalizeDecisionRecord(payload, CREATED_AT);
    expect(() => serializeDecisionRecord(record)).toThrow(/BLOB/i);
  });

  it('rejette une action, une règle, un PRNG ou une plage de valeurs invalides', () => {
    const action = clone(makeDecisionPayload());
    action.explanation.selectedActionId = 'unknown' as ActionId;
    expect(() => validateDecisionRecordPayload(action)).toThrow(/action/i);

    const rule = clone(makeDecisionPayload());
    rule.explanation.selectionRule = 'unknown' as typeof rule.explanation.selectionRule;
    expect(() => validateDecisionRecordPayload(rule)).toThrow(/règle/i);

    const draws = clone(makeDecisionPayload());
    (draws.explanation.rngDraws as number) = 2;
    expect(() => validateDecisionRecordPayload(draws)).toThrow(/rngDraws/i);

    const needs = clone(makeDecisionPayload());
    needs.stateAfter.needs.hunger = 101;
    expect(() => validateDecisionRecordPayload(needs)).toThrow(/bornes/i);
  });

  it('rejette une date de diagnostic invalide', () => {
    expect(() => finalizeDecisionRecord(makeDecisionPayload(), 'hier')).toThrow(/createdAt/i);
  });

  it('exige zéro pour les décisions sans nouvelle évaluation de score', () => {
    const payload = clone(makeDecisionPayload());
    payload.explanation.selectionRule = 'continue_active';
    payload.newAction.rule = 'continue_active';
    payload.score = 1;
    expect(() => validateDecisionRecordPayload(payload)).toThrow(/score/i);
  });
});
