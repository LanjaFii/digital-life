/**
 * Stockage SQLite de l'historique technique des décisions (Phase 3D-A).
 *
 * Node/main uniquement : ce module ne connaît ni IPC ni renderer. Toutes les
 * écritures sont prévues pour être appelées dans une transaction existante
 * (cellule du tick), afin que l'historique suive exactement le sort de l'état.
 */
import type { Database } from 'sql.js';
import type { DecisionRecordPayloadV1, DecisionRecordV1 } from '../../shared/decision';
import {
  DECISION_BLOB_MAX_BYTES,
  DECISION_PAYLOAD_MAX_BYTES,
  deserializeDecisionRecord,
  finalizeDecisionRecord,
  serializeDecisionRecord,
  type DecisionRecordRow,
} from './decision-record.service';

export const DECISION_HISTORY_MIGRATION = '3D-1';
export const DECISION_HISTORY_DEFAULT_READ_LIMIT = 50;
export const DECISION_HISTORY_MAX_READ_LIMIT = 500;

export interface DecisionHistoryReadQuery {
  worldId: string;
  characterId?: string;
  fromTick?: number;
  toTick?: number;
  limit?: number;
}

/** Crée les tables et index de façon additive, puis enregistre la migration. */
export function ensureDecisionHistorySchema(db: Database): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL,
      description TEXT NOT NULL
    );
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS decision_records (
      id TEXT PRIMARY KEY,
      world_id TEXT NOT NULL,
      character_id TEXT NOT NULL,
      tick INTEGER NOT NULL,
      day INTEGER NOT NULL,
      hour INTEGER NOT NULL,

      record_version INTEGER NOT NULL,
      engine_version TEXT NOT NULL,
      registry_version INTEGER NOT NULL,
      parameters_version INTEGER NOT NULL,

      character_name TEXT NOT NULL,
      previous_action_id TEXT,
      selected_action_id TEXT NOT NULL,
      selection_rule TEXT NOT NULL,
      score REAL NOT NULL,
      reason TEXT NOT NULL,

      rng_state_before INTEGER NOT NULL,
      rng_state_after INTEGER NOT NULL,
      rng_draws INTEGER NOT NULL CHECK (rng_draws BETWEEN 0 AND 1),

      warnings_json TEXT NOT NULL,
      state_before_json TEXT NOT NULL,
      state_after_json TEXT NOT NULL,
      deltas_json TEXT NOT NULL,

      payload_blob BLOB NOT NULL,
      payload_sha256 TEXT NOT NULL,
      uncompressed_bytes INTEGER NOT NULL CHECK (uncompressed_bytes BETWEEN 0 AND ${DECISION_PAYLOAD_MAX_BYTES}),

      created_at TEXT NOT NULL,

      UNIQUE (world_id, tick, character_id),
      FOREIGN KEY (world_id) REFERENCES worlds(id) ON DELETE CASCADE
    );
  `);
  db.run(`
    CREATE INDEX IF NOT EXISTS idx_decision_records_world_tick
      ON decision_records(world_id, tick DESC);
  `);
  db.run(`
    CREATE INDEX IF NOT EXISTS idx_decision_records_character_tick
      ON decision_records(world_id, character_id, tick DESC);
  `);

  const stmt = db.prepare('SELECT 1 FROM schema_migrations WHERE version = ?');
  stmt.bind([DECISION_HISTORY_MIGRATION]);
  const applied = stmt.step();
  stmt.free();
  if (!applied) {
    const insert = db.prepare(
      'INSERT INTO schema_migrations (version, applied_at, description) VALUES (?, ?, ?)',
    );
    insert.run([
      DECISION_HISTORY_MIGRATION,
      new Date().toISOString(),
      'Historique technique des décisions (DecisionRecordV1)',
    ]);
    insert.free();
  }
}

/**
 * Insère les charges utiles du tick dans la transaction courante.
 * L'horodatage est unique pour le tick et n'influence aucune règle métier.
 */
export function insertDecisionRecords(
  db: Database,
  payloads: readonly DecisionRecordPayloadV1[],
  createdAt: string,
): number {
  if (payloads.length === 0) return 0;
  const sql = `
    INSERT INTO decision_records (
      id, world_id, character_id, tick, day, hour,
      record_version, engine_version, registry_version, parameters_version,
      character_name, previous_action_id, selected_action_id, selection_rule, score, reason,
      rng_state_before, rng_state_after, rng_draws,
      warnings_json, state_before_json, state_after_json, deltas_json,
      payload_blob, payload_sha256, uncompressed_bytes, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;
  const stmt = db.prepare(sql);
  try {
    let inserted = 0;
    for (const payload of payloads) {
      const record: DecisionRecordV1 = finalizeDecisionRecord(payload, createdAt);
      const row = serializeDecisionRecord(record);
      if (row.payload_blob.length > DECISION_BLOB_MAX_BYTES) {
        throw new Error('BLOB d’enregistrement trop volumineux.');
      }
      stmt.run([
        row.id, row.world_id, row.character_id, row.tick, row.day, row.hour,
        row.record_version, row.engine_version, row.registry_version, row.parameters_version,
        row.character_name, row.previous_action_id, row.selected_action_id, row.selection_rule,
        row.score, row.reason, row.rng_state_before, row.rng_state_after, row.rng_draws,
        row.warnings_json, row.state_before_json, row.state_after_json, row.deltas_json,
        row.payload_blob, row.payload_sha256, row.uncompressed_bytes, row.created_at,
      ]);
      inserted += 1;
    }
    return inserted;
  } finally {
    stmt.free();
  }
}

function rowFromDb(row: Record<string, unknown>): DecisionRecordRow {
  if (!(row.payload_blob instanceof Uint8Array)) throw new Error('BLOB d’enregistrement SQLite invalide.');
  return {
    id: String(row.id),
    world_id: String(row.world_id),
    character_id: String(row.character_id),
    tick: Number(row.tick),
    day: Number(row.day),
    hour: Number(row.hour),
    record_version: Number(row.record_version),
    engine_version: String(row.engine_version),
    registry_version: Number(row.registry_version),
    parameters_version: Number(row.parameters_version),
    character_name: String(row.character_name),
    previous_action_id: row.previous_action_id === null ? null : String(row.previous_action_id),
    selected_action_id: String(row.selected_action_id),
    selection_rule: String(row.selection_rule),
    score: Number(row.score),
    reason: String(row.reason),
    rng_state_before: Number(row.rng_state_before),
    rng_state_after: Number(row.rng_state_after),
    rng_draws: Number(row.rng_draws),
    warnings_json: String(row.warnings_json),
    state_before_json: String(row.state_before_json),
    state_after_json: String(row.state_after_json),
    deltas_json: String(row.deltas_json),
    payload_blob: row.payload_blob,
    payload_sha256: String(row.payload_sha256),
    uncompressed_bytes: Number(row.uncompressed_bytes),
    created_at: String(row.created_at),
  };
}

function boundedLimit(limit: number | undefined): number {
  if (limit === undefined) return DECISION_HISTORY_DEFAULT_READ_LIMIT;
  if (!Number.isInteger(limit) || limit < 1 || limit > DECISION_HISTORY_MAX_READ_LIMIT) {
    throw new Error(`Limite de lecture invalide : 1..${DECISION_HISTORY_MAX_READ_LIMIT} attendu.`);
  }
  return limit;
}

/** Lecture interne bornée, utilisée par les tests 3D-A puis par l'IPC 3D-D. */
export function listDecisionRecords(
  db: Database,
  query: DecisionHistoryReadQuery,
): DecisionRecordV1[] {
  if (!query.worldId || typeof query.worldId !== 'string') throw new Error('Identifiant de monde invalide.');
  const limit = boundedLimit(query.limit);
  const clauses = ['world_id = ?'];
  const values: Array<string | number> = [query.worldId];
  if (query.characterId !== undefined) {
    if (!query.characterId || typeof query.characterId !== 'string') throw new Error('Identifiant de personnage invalide.');
    clauses.push('character_id = ?');
    values.push(query.characterId);
  }
  if (query.fromTick !== undefined) {
    if (!Number.isInteger(query.fromTick) || query.fromTick < 0) throw new Error('fromTick invalide.');
    clauses.push('tick >= ?');
    values.push(query.fromTick);
  }
  if (query.toTick !== undefined) {
    if (!Number.isInteger(query.toTick) || query.toTick < 0) throw new Error('toTick invalide.');
    clauses.push('tick <= ?');
    values.push(query.toTick);
  }
  values.push(limit);
  const stmt = db.prepare(`
    SELECT * FROM decision_records
    WHERE ${clauses.join(' AND ')}
    ORDER BY tick DESC, character_id ASC
    LIMIT ?
  `);
  stmt.bind(values);
  const rows: DecisionRecordRow[] = [];
  try {
    while (stmt.step()) rows.push(rowFromDb(stmt.getAsObject()));
  } finally {
    stmt.free();
  }
  return rows.map(deserializeDecisionRecord);
}

export function getDecisionRecord(db: Database, id: string): DecisionRecordV1 {
  if (!id || typeof id !== 'string') throw new Error('Identifiant d’enregistrement invalide.');
  const stmt = db.prepare('SELECT * FROM decision_records WHERE id = ?');
  stmt.bind([id]);
  const row = stmt.step() ? rowFromDb(stmt.getAsObject()) : null;
  stmt.free();
  if (!row) throw new Error('Enregistrement de décision introuvable.');
  return deserializeDecisionRecord(row);
}

export function countDecisionRecords(db: Database, worldId: string, characterId?: string): number {
  const clauses = ['world_id = ?'];
  const values: Array<string | number> = [worldId];
  if (characterId !== undefined) {
    clauses.push('character_id = ?');
    values.push(characterId);
  }
  const stmt = db.prepare(`SELECT COUNT(*) AS count FROM decision_records WHERE ${clauses.join(' AND ')}`);
  stmt.bind(values);
  const row = stmt.step() ? stmt.getAsObject() : null;
  stmt.free();
  return row ? Number(row.count) : 0;
}

export function getDecisionRecordRows(db: Database, worldId: string): DecisionRecordRow[] {
  const stmt = db.prepare('SELECT * FROM decision_records WHERE world_id = ? ORDER BY tick DESC, character_id ASC');
  stmt.bind([worldId]);
  const rows: DecisionRecordRow[] = [];
  try {
    while (stmt.step()) rows.push(rowFromDb(stmt.getAsObject()));
  } finally {
    stmt.free();
  }
  return rows;
}
