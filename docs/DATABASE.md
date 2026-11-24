# Base de données

## État réel (Phase 3D-A)

Un **fichier SQLite unique** : `data/saves/worlds.sqlite` (sql.js, WASM embarqué dans
`resources/sqlite/`, aucun CDN). En dev : racine du projet ; en app packagée : `userData`.
Le fichier est réécrit intégralement (`db.export()` → `writeFileSync`) après chaque
mutation/transaction validée. Cette écriture est **synchrone et non atomique au niveau du
fichier** : la Phase 3D propose de la remplacer par `temp + fsync + hash + rename` avec
restauration de la base mémoire en cas d'échec
(voir [SAFE_PERSISTENCE.md](SAFE_PERSISTENCE.md)). Le renderer n'y accède **jamais**
directement : tout passe par preload → IPC → main → services/store.

> L'ancien concept « un fichier par monde » (`world_001.sqlite`, …) a été abandonné au
> profit d'une base unique avec isolation par `world_id`. Les sauvegardes par monde
> (export/import, backups) restent **[Planifié]**.

## Schéma actuel

### `worlds`

| Colonne | Type | Notes |
|---|---|---|
| `id` | TEXT PK | UUID |
| `name` | TEXT NOT NULL | non vide, validé main |
| `seed` | INTEGER NOT NULL | PRNG de génération et graine simulation dérivée |
| `character_count` | INTEGER NOT NULL DEFAULT 0 | resynchronisé après chaque ajout/retrait |
| `generation_mode` | TEXT NOT NULL DEFAULT 'empty' | `empty` \| `random` |
| `status` | TEXT NOT NULL DEFAULT 'preparation' | `preparation` \| `simulation_running` \| `simulation_paused` \| `simulation_stopped` (legacy lu : `simulation_started` → `simulation_running`) |
| `created_at` / `updated_at` | TEXT NOT NULL | ISO 8601 |
| `last_opened_at` | TEXT | nullable ; réécrit par `getWorld()` |

### `characters` (instances de monde)

| Colonne | Type | Notes |
|---|---|---|
| `id` | TEXT PK | UUID (ou id déterministe pour la génération aléatoire) |
| `world_id` | TEXT NOT NULL | FK → `worlds(id)` **ON DELETE CASCADE** |
| `template_id` | TEXT | référence **informative** au modèle d'origine, nullable, **aucune FK/cascade** |
| `first_name` / `last_name` | TEXT NOT NULL | |
| `age` | INTEGER NOT NULL | 18-65 |
| `gender` | TEXT NOT NULL | `female` \| `male` \| `nonbinary` |
| `biography` | TEXT NOT NULL | |
| `traits_json` / `emotions_json` / `needs_json` / `goals_json` | TEXT NOT NULL | colonnes legacy, miroir de l'état courant |
| `initial_traits_json` / `initial_emotions_json` / `initial_needs_json` / `initial_goals_json` | TEXT | paramètres de départ immuables |
| `current_traits_json` / `current_emotions_json` / `current_needs_json` / `current_goals_json` | TEXT | état courant ; `current_goals_json` n'est jamais écrit par le moteur |
| `current_action_json` | TEXT | runtime d'action versionné, parsé strictement ; corruption = erreur technique |
| `created_at` | TEXT NOT NULL | |
| `updated_at` | TEXT | backfill = `created_at` pour les lignes legacy |

Index : `idx_characters_world_id (world_id)`, `idx_characters_template_id (template_id)`.

### `character_templates` (bibliothèque)

| Colonne | Type | Notes |
|---|---|---|
| `id` | TEXT PK | UUID |
| `first_name` / `last_name` | TEXT NOT NULL | |
| `age` | INTEGER NOT NULL | |
| `gender` | TEXT NOT NULL | |
| `biography` | TEXT NOT NULL | |
| `traits_json` / `emotions_json` / `needs_json` / `goals_json` | TEXT NOT NULL | paramètres de départ du modèle |
| `created_at` / `updated_at` | TEXT NOT NULL | |

Index : `idx_templates_updated_at (updated_at DESC)`.

**Aucune contrainte de clé étrangère entre `characters.template_id` et
`character_templates`** : la suppression d'un modèle remet simplement
`characters.template_id = NULL` ; les instances survivent intactes.

### `simulation_clock` (Phase 3A)

| Colonne | Type | Notes |
|---|---|---|
| `world_id` | TEXT PK | FK → `worlds(id)` **ON DELETE CASCADE** ; une horloge par monde |
| `tick` | INTEGER NOT NULL DEFAULT 0 | tick logique, 0 au démarrage ; 1 tick = 1 h simulée |
| `day` | INTEGER NOT NULL DEFAULT 1 | dérivé de tick (`floor(tick/24)+1`) |
| `hour` | INTEGER NOT NULL DEFAULT 0 | dérivé de tick (`tick % 24`) |
| `status` | TEXT NOT NULL DEFAULT 'paused' | `running` \| `paused` \| `stopped` |
| `speed` | INTEGER NOT NULL DEFAULT 1 | 1,2,5,10 ; 1x = 60 s réelles par tick |
| `rng_state` | INTEGER NOT NULL | état uint32 mulberry32 du PRNG simulation |
| `last_processed_order` | INTEGER NOT NULL DEFAULT 0 | validé et persisté, toujours 0 dans les règles actuelles |
| `created_at` / `updated_at` | TEXT NOT NULL | ISO 8601 métadonnées |

Index : `idx_simulation_clock_status (status)`.

### `decision_records` (Phase 3D-A)

Une ligne complète par décision, écrite dans la même transaction que l'état du tick.
Colonnes : `id` TEXT PK (`${worldId}:${tick}:${characterId}`), `world_id` TEXT (FK →
`worlds(id)` **ON DELETE CASCADE**), `character_id` TEXT (**aucune FK** : l'historique
survit à la suppression d'une instance), `tick`, `day`, `hour`, `record_version`,
`engine_version`, `registry_version`, `parameters_version`, `character_name`,
`previous_action_id`, `selected_action_id`, `selection_rule`, `score`, `reason`,
`rng_state_before`, `rng_state_after`, `rng_draws` (CHECK 0–1), `warnings_json`,
`state_before_json`, `state_after_json`, `deltas_json`, `payload_blob` BLOB,
`payload_sha256`, `uncompressed_bytes` (CHECK 0–65536), `created_at`.

Index : `idx_decision_records_world_tick (world_id, tick DESC)`,
`idx_decision_records_character_tick (world_id, character_id, tick DESC)`.
`UNIQUE(world_id, tick, character_id)` garantit une décision par personnage et par tick.

### `schema_migrations` (Phase 3D-A)

`version` TEXT PK, `applied_at` TEXT NOT NULL, `description` TEXT NOT NULL. La version
`3D-1` est inscrite après création additive de `decision_records` et des index. Aucun
backfill : les ticks antérieurs à la migration ne sont pas reconstitués.

## Migrations additives (non destructives)

À chaque ouverture (`ensureSchema`) :

1. `CREATE TABLE IF NOT EXISTS` pour les tables courantes (dont `simulation_clock`).
2. `PRAGMA table_info` + `ALTER TABLE ADD COLUMN` pour les bases existantes :
   - `worlds.generation_mode`, `worlds.status` ;
   - `characters.template_id`, `updated_at`, `initial_*_json`, `current_*_json`,
     `current_action_json`.
3. Backfill des lignes legacy : `updated_at = created_at`,
   `initial_* = current_* = *_json` existants ; `current_action_json` reçoit le runtime
   par défaut versionné.
4. Index créés **après** migration (l'index sur `template_id` nécessite la colonne).
5. `CREATE TABLE IF NOT EXISTS` pour `schema_migrations` et `decision_records`, puis les
   deux index d'historique, puis insertion de `3D-1` si absente.

Les anciens mondes/personnages restent consultables ; la génération aléatoire
déterministe est inchangée. Les horloges `running` sont récupérées en `paused`
au démarrage de l'application (pas d'auto-reprise). Couvert par
`tests/character-library.test.ts` et `tests/simulation.test.ts`.

## Opérations (service `world-store.service.ts`)

- Mondes : `createWorld`, `listWorlds`, `getWorld`, `deleteWorld` (cascade personnages et horloge).
- Instances : `listCharacters`, `createCharacterInWorld` (+ modèle optionnel),
  `updateCharacterInstance`, `instantiateTemplate` (copie profonde, nouvel UUID),
  `deleteCharacterInstance(id, worldId)` (suppression ciblée, voir ci-dessous).
- Modèles : `createTemplate`, `listTemplates`, `getTemplate`, `updateTemplate`, `deleteTemplate`.
- Garde `assertWorldPreparation` : refuse création/instanciation/modification/**suppression**
  dès que le statut normalisé n'est pas `preparation` (contrôle côté main, pas seulement masquage UI).
- `syncWorldCharacterCount` maintient `worlds.character_count` exact (aussi après suppression).
- **Suppression d'instance** (`deleteCharacterInstance`, IPC `character:delete`) : valide
  les identifiants, vérifie l'existence du monde et son statut, contrôle l'appartenance avec
  `SELECT id FROM characters WHERE id = ? AND world_id = ?`, puis `DELETE` avec les deux
  mêmes prédicats — aucune manipulation IPC ne peut supprimer une instance d'un autre monde.
  Le modèle référencé par `template_id` n'est pas modifié (pas de cascade, pas de schéma modifié) ;
  la persistance est immédiate.
- **Tick** (`stepSimulation`) : une seule transaction écrit `current_*_json`, le runtime
  d'action, une ligne `decision_records` par personnage, l'horloge et `rngState`, puis un
  seul `persist(db)` ; rollback intégral sur erreur, sans enregistrement orphelin.

## Historique des décisions (implémenté en 3D-A)

Les artefacts calculés par `computeCharacterTick()` sont enveloppés dans une charge utile
déterministe `DecisionRecordPayloadV1`, puis complétés par le store (`payloadSha256`,
`uncompressedBytes`, `createdAt`) et compressés dans `payload_blob`. La lecture interne
décompresse, valide strictement la structure et vérifie hash, tailles et colonnes de
contrôle.

- `UNIQUE(world_id, tick, character_id)` : une décision par personnage et par tick ;
- FK `world_id → worlds(id) ON DELETE CASCADE` ;
- **aucune FK vers `characters`** : l'audit survit à la suppression d'une instance ;
- `payload_blob` compressé, hash SHA-256 sur la charge utile canonique, versions et bornes
  de taille (65 536 o canoniques, 16 384 o compressés) ;
- écriture dans la même transaction que l'état du tick ;
- aucun backfill, aucune purge, aucun export en 3D-A.

Voir [DECISION_HISTORY_SYSTEM.md](DECISION_HISTORY_SYSTEM.md) et
[PHASE_3D_DESIGN.md](PHASE_3D_DESIGN.md). Cet historique technique reste distinct du
journal canonique d'événements de la Phase 5.

## [Planifié, Phase 3D]

- Persistance asynchrone `temp + fsync + SHA-256 + rename`, nettoyage du temporaire au
  démarrage, restauration de la base mémoire en cas d'échec.
- Verrou global d'écriture ordonné après le verrou par monde.

## [Planifié, phases ultérieures]

- Sauvegarde automatique périodique, snapshots, backups `data/backups/`,
  export/import par monde, écritures incrémentales pendant la simulation.
- Tables simulation : `relationships`, `memories`, `events`, `locations`, etc.
