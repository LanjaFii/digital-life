/**
 * Frontière d'écriture d'un tick (Phase 3D-C1).
 *
 * Ce service regroupe la préparation des états, la validation de cohérence de
 * l'historique, l'écriture des états et de l'historique, puis l'avance de
 * l'horloge. Il ne possède aucune transaction propre : toutes ces fonctions
 * doivent être appelées dans la transaction existante de `stepSimulation()`.
 * Le calcul reste synchrone dans le main pour cette tranche ; le worker de
 * calcul n'est pas branché ici.
 */
import type { Database } from 'sql.js';
import type { CharacterActionRuntime } from '../../shared/action';
import type { CharacterEmotions, CharacterNeeds } from '../../shared/character';
import { canonicalize } from '../../shared/canonicalization';
import type { DecisionRecordPayloadV1 } from '../../shared/decision';
import type { SimulationClock } from '../../shared/simulation';
import type { CharacterTickResult } from '../../shared/simulation-rules';
import { serializeActionRuntime } from './action-runtime.service';
import { insertDecisionRecords } from './decision-history.store';

export interface TickCharacterState {
  characterId: string;
  needs: CharacterNeeds;
  emotions: CharacterEmotions;
  runtime: CharacterActionRuntime;
}

/** Apparie les runtimes aux états calculés, en préservant l'ordre du résultat. */
export function buildTickStates(result: CharacterTickResult): TickCharacterState[] {
  const runtimes = new Map(result.actionRuntimeStates.map((entry) => [entry.characterId, entry.runtime]));
  if (runtimes.size !== result.characterStates.length) {
    throw new Error('Nombre de runtimes d’action incohérent avec les états calculés.');
  }
  return result.characterStates.map((state) => {
    const runtime = runtimes.get(state.characterId);
    if (!runtime) throw new Error(`Runtime d’action manquant pour ${state.characterId}.`);
    return { ...state, runtime };
  });
}

/**
 * Vérifie que les charges utiles d'historique correspondent exactement aux
 * états calculés et à l'ordre des personnages avant toute écriture SQLite.
 */
export function assertDecisionRecordsMatchTick(
  records: readonly DecisionRecordPayloadV1[],
  states: readonly TickCharacterState[],
): void {
  if (records.length !== states.length) {
    throw new Error('Nombre d’enregistrements de décision incohérent avec les états du tick.');
  }
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    const state = states[index];
    if (record.explanation.characterId !== state.characterId) {
      throw new Error('Ordre des enregistrements de décision incohérent avec les états.');
    }
    const expectedState = {
      needs: state.needs,
      emotions: state.emotions,
      runtime: state.runtime,
    };
    if (canonicalize(record.stateAfter) !== canonicalize(expectedState)) {
      throw new Error(`État final de décision incohérent pour ${state.characterId}.`);
    }
  }
}

/** Écrit les états calculés dans la transaction courante, en ordre déterministe. */
export function writeTickCharacterStates(
  db: Database,
  states: readonly TickCharacterState[],
  updatedAt: string,
): void {
  const sorted = [...states].sort((a, b) => (a.characterId < b.characterId ? -1 : a.characterId > b.characterId ? 1 : 0));
  const stmt = db.prepare(`
    UPDATE characters
    SET emotions_json=?, needs_json=?,
        current_emotions_json=?, current_needs_json=?, current_action_json=?,
        updated_at=?
    WHERE id=?
  `);
  for (const state of sorted) {
    const emotionsJson = JSON.stringify(state.emotions);
    const needsJson = JSON.stringify(state.needs);
    stmt.run([
      emotionsJson,
      needsJson,
      emotionsJson,
      needsJson,
      serializeActionRuntime(state.runtime),
      updatedAt,
      state.characterId,
    ]);
  }
  stmt.free();
}

/** Écrit l'historique dans la transaction courante et retourne le nombre inséré. */
export function writeTickDecisionHistory(
  db: Database,
  records: readonly DecisionRecordPayloadV1[],
  createdAt: string,
): number {
  return insertDecisionRecords(db, records, createdAt);
}

/** Construit l'horloge suivante sans ambiguïté sur le statut runtime. */
export function buildNextClock(
  previous: SimulationClock,
  nextTick: number,
  day: number,
  hour: number,
  rngState: number,
  updatedAt: string,
): SimulationClock {
  return {
    ...previous,
    tick: nextTick,
    day,
    hour,
    // step en pause conserve la pause ; step en running conserve running.
    status: previous.status,
    rngState: rngState >>> 0,
    lastProcessedOrder: 0,
    updatedAt,
  };
}

/** Écrit l'horloge de simulation dans la transaction courante. */
export function upsertClock(db: Database, clock: SimulationClock): void {
  const stmt = db.prepare(`
    INSERT INTO simulation_clock (
      world_id, tick, day, hour, status, speed, rng_state, last_processed_order, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(world_id) DO UPDATE SET
      tick = excluded.tick,
      day = excluded.day,
      hour = excluded.hour,
      status = excluded.status,
      speed = excluded.speed,
      rng_state = excluded.rng_state,
      last_processed_order = excluded.last_processed_order,
      updated_at = excluded.updated_at
  `);
  stmt.run([
    clock.worldId,
    clock.tick,
    clock.day,
    clock.hour,
    clock.status,
    clock.speed,
    clock.rngState >>> 0,
    clock.lastProcessedOrder,
    clock.createdAt,
    clock.updatedAt,
  ]);
  stmt.free();
}

/** Met à jour le statut persistant du monde dans la transaction courante. */
export function setWorldStatus(
  db: Database,
  worldId: string,
  status: 'simulation_running' | 'simulation_paused' | 'simulation_stopped',
  updatedAt: string,
): void {
  const stmt = db.prepare('UPDATE worlds SET status = ?, updated_at = ? WHERE id = ?');
  stmt.run([status, updatedAt, worldId]);
  stmt.free();
}
