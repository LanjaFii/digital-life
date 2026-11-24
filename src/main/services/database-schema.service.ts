/**
 * Schéma et migrations additives SQLite (Phase 3D-B).
 *
 * Extrait sans modification de `world-store.service.ts`. Aucune migration
 * supplémentaire n'est introduite : la table `decision_records` et la migration
 * `3D-1` proviennent de la Phase 3D-A.
 */

import type { Database } from 'sql.js';
import { DEFAULT_CHARACTER_ACTION_RUNTIME_JSON } from '../../shared/action';
import { ensureDecisionHistorySchema } from './decision-history.store';

export function ensureSchema(db: Database): void {
  db.run('PRAGMA foreign_keys = ON;');
  db.run(`
    CREATE TABLE IF NOT EXISTS worlds (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      seed INTEGER NOT NULL,
      character_count INTEGER NOT NULL DEFAULT 0,
      generation_mode TEXT NOT NULL DEFAULT 'empty',
      status TEXT NOT NULL DEFAULT 'preparation',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_opened_at TEXT
    );
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS characters (
      id TEXT PRIMARY KEY,
      world_id TEXT NOT NULL,
      template_id TEXT,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      age INTEGER NOT NULL,
      gender TEXT NOT NULL,
      biography TEXT NOT NULL,
      traits_json TEXT NOT NULL,
      emotions_json TEXT NOT NULL,
      needs_json TEXT NOT NULL,
      goals_json TEXT NOT NULL,
      initial_traits_json TEXT,
      initial_emotions_json TEXT,
      initial_needs_json TEXT,
      initial_goals_json TEXT,
      current_traits_json TEXT,
      current_emotions_json TEXT,
      current_needs_json TEXT,
      current_goals_json TEXT,
      current_action_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (world_id) REFERENCES worlds(id) ON DELETE CASCADE
    );
  `);
  db.run(`CREATE INDEX IF NOT EXISTS idx_characters_world_id ON characters(world_id);`);

  db.run(`
    CREATE TABLE IF NOT EXISTS character_templates (
      id TEXT PRIMARY KEY,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      age INTEGER NOT NULL,
      gender TEXT NOT NULL,
      biography TEXT NOT NULL,
      traits_json TEXT NOT NULL,
      emotions_json TEXT NOT NULL,
      needs_json TEXT NOT NULL,
      goals_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  db.run(`CREATE INDEX IF NOT EXISTS idx_templates_updated_at ON character_templates(updated_at DESC);`);

  db.run(`
    CREATE TABLE IF NOT EXISTS simulation_clock (
      world_id TEXT PRIMARY KEY,
      tick INTEGER NOT NULL DEFAULT 0,
      day INTEGER NOT NULL DEFAULT 1,
      hour INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'paused',
      speed INTEGER NOT NULL DEFAULT 1,
      rng_state INTEGER NOT NULL,
      last_processed_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (world_id) REFERENCES worlds(id) ON DELETE CASCADE
    );
  `);
  db.run(`CREATE INDEX IF NOT EXISTS idx_simulation_clock_status ON simulation_clock(status);`);

  // Migrations additives (bases existantes).
  const worldColumns = db.exec('PRAGMA table_info(worlds)');
  const worldNames = new Set((worldColumns[0]?.values ?? []).map((row) => String(row[1])));
  if (!worldNames.has('generation_mode')) {
    db.run("ALTER TABLE worlds ADD COLUMN generation_mode TEXT NOT NULL DEFAULT 'empty'");
  }
  if (!worldNames.has('status')) {
    db.run("ALTER TABLE worlds ADD COLUMN status TEXT NOT NULL DEFAULT 'preparation'");
  }

  const charColumns = db.exec('PRAGMA table_info(characters)');
  const charNames = new Set((charColumns[0]?.values ?? []).map((row) => String(row[1])));
  const addCharCol = (name: string, ddl: string) => {
    if (!charNames.has(name)) db.run(`ALTER TABLE characters ADD COLUMN ${ddl}`);
  };
  addCharCol('template_id', 'template_id TEXT');
  addCharCol('updated_at', 'updated_at TEXT');
  addCharCol('initial_traits_json', 'initial_traits_json TEXT');
  addCharCol('initial_emotions_json', 'initial_emotions_json TEXT');
  addCharCol('initial_needs_json', 'initial_needs_json TEXT');
  addCharCol('initial_goals_json', 'initial_goals_json TEXT');
  addCharCol('current_traits_json', 'current_traits_json TEXT');
  addCharCol('current_emotions_json', 'current_emotions_json TEXT');
  addCharCol('current_needs_json', 'current_needs_json TEXT');
  addCharCol('current_goals_json', 'current_goals_json TEXT');
  addCharCol('current_action_json', 'current_action_json TEXT');

  // Backfill instances existantes : initial/current = valeurs existantes.
  // Le runtime d'action reçoit explicitement sa valeur par défaut versionnée.
  db.run(`
    UPDATE characters
    SET
      updated_at = COALESCE(updated_at, created_at),
      initial_traits_json = COALESCE(initial_traits_json, traits_json),
      initial_emotions_json = COALESCE(initial_emotions_json, emotions_json),
      initial_needs_json = COALESCE(initial_needs_json, needs_json),
      initial_goals_json = COALESCE(initial_goals_json, goals_json),
      current_traits_json = COALESCE(current_traits_json, traits_json),
      current_emotions_json = COALESCE(current_emotions_json, emotions_json),
      current_needs_json = COALESCE(current_needs_json, needs_json),
      current_goals_json = COALESCE(current_goals_json, goals_json),
      current_action_json = COALESCE(current_action_json, '${DEFAULT_CHARACTER_ACTION_RUNTIME_JSON}')
    WHERE
      updated_at IS NULL OR
      initial_traits_json IS NULL OR initial_emotions_json IS NULL OR initial_needs_json IS NULL OR initial_goals_json IS NULL OR
      current_traits_json IS NULL OR current_emotions_json IS NULL OR current_needs_json IS NULL OR current_goals_json IS NULL OR
      current_action_json IS NULL
  `);

  // Index sur template_id créé après migration additive (bases existantes sans la colonne).
  db.run('CREATE INDEX IF NOT EXISTS idx_characters_template_id ON characters(template_id);');

  // Phase 3D-A : historique additif. Les migrations existantes restent actives.
  ensureDecisionHistorySchema(db);
}
