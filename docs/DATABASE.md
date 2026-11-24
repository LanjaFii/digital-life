# Base de données

## État réel (Phase 1)

Un **fichier SQLite unique** : `data/saves/worlds.sqlite` (sql.js, WASM embarqué dans
`resources/sqlite/`, aucun CDN). En dev : racine du projet ; en app packagée : `userData`.
Le fichier est réécrit de façon atomique-en-un-bloc (`db.export()` → `writeFileSync`)
après chaque mutation. Le renderer n'y accède **jamais** directement : tout passe par
preload → IPC → main → `world-store.service.ts`.

> L'ancien concept « un fichier par monde » (`world_001.sqlite`, …) a été abandonné au
> profit d'une base unique avec isolation par `world_id`. Les sauvegardes par monde
> (export/import, backups) restent **[Planifié]**.

## Schéma actuel

### `worlds`

| Colonne | Type | Notes |
|---|---|---|
| `id` | TEXT PK | UUID |
| `name` | TEXT NOT NULL | non vide, validé main |
| `seed` | INTEGER NOT NULL | PRNG de génération |
| `character_count` | INTEGER NOT NULL DEFAULT 0 | resynchronisé après chaque ajout/retrait |
| `generation_mode` | TEXT NOT NULL DEFAULT 'empty' | `empty` \| `random` |
| `status` | TEXT NOT NULL DEFAULT 'preparation' | `preparation` \| `simulation_started` (futur) |
| `created_at` / `updated_at` | TEXT NOT NULL | ISO 8601 |
| `last_opened_at` | TEXT | nullable |

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
| `initial_traits_json` / `initial_emotions_json` / `initial_needs_json` / `initial_goals_json` | TEXT | paramètres de départ (futur : verrouillés) |
| `current_traits_json` / `current_emotions_json` / `current_needs_json` / `current_goals_json` | TEXT | état courant (futur : évolue avec la simulation) |
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

## Migrations additives (non destructives)

À chaque ouverture (`ensureSchema`) :

1. `CREATE TABLE IF NOT EXISTS` pour les trois tables (schéma courant).
2. `PRAGMA table_info` + `ALTER TABLE ADD COLUMN` pour les bases existantes :
   - `worlds.generation_mode` (tranche précédente), `worlds.status` ;
   - `characters.template_id`, `updated_at`, `initial_*_json`, `current_*_json`.
3. Backfill des lignes legacy : `updated_at = created_at`,
   `initial_* = current_* = *_json` existants.
4. Index créés **après** migration (l'index sur `template_id` nécessite la colonne).

Les anciens mondes/personnages restent consultables et modifiables ; la génération
aléatoire déterministe est inchangée. Couvert par `tests/character-library.test.ts`
(test « Migration additive d'une base Phase 1 existante »).

## Opérations (service `world-store.service.ts`)

- Mondes : `createWorld`, `listWorlds`, `getWorld`, `deleteWorld` (cascade personnages).
- Instances : `listCharacters`, `createCharacterInWorld` (+ modèle optionnel),
  `updateCharacterInstance`, `instantiateTemplate` (copie profonde, nouvel UUID),
  `deleteCharacterInstance(id, worldId)` (suppression ciblée, voir ci-dessous).
- Modèles : `createTemplate`, `listTemplates`, `getTemplate`, `updateTemplate`, `deleteTemplate`.
- Garde `assertWorldPreparation` : refuse création/instanciation/modification/**suppression**
  si `status = 'simulation_started'` (contrôle côté main, pas seulement masquage UI).
- `syncWorldCharacterCount` maintient `worlds.character_count` exact (aussi après suppression).
- **Suppression d'instance** (`deleteCharacterInstance`, IPC `character:delete`) : valide
  les identifiants, vérifie l'existence du monde et son statut, contrôle l'appartenance avec
  `SELECT id FROM characters WHERE id = ? AND world_id = ?`, puis `DELETE` avec les deux
  mêmes prédicats — aucune manipulation IPC ne peut supprimer une instance d'un autre monde.
  Le modèle référencé par `template_id` n'est pas modifié (pas de cascade, pas de schéma modifié) ;
  la persistance est immédiate.

## [Planifié]

- Table `schema_migrations` versionnée (quand le schéma se complexifiera).
- Sauvegarde automatique périodique, snapshots, backups `data/backups/`,
  export/import par monde, écritures incrémentales pendant la simulation (worker).
- Tables simulation : `relationships`, `memories`, `events`, `locations`, etc.
