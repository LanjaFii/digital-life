# Base de données — [Planifié, phase 1]

## Principe

Un fichier SQLite par monde : `data/saves/world_001.sqlite`, `world_002.sqlite`, …
Persistance via **sql.js**, WASM embarqué dans `resources/sqlite/`, aucun CDN.

## Tables prévues

`worlds`, `characters`, `character_personalities`, `character_needs`,
`character_emotions`, `character_goals`, `relationships`, `memories`, `events`,
`locations`, `resources`, `simulation_settings`, `simulation_snapshots`.

## Opérations

- Sauvegarde automatique périodique (par défaut toutes les 50 cycles).
- Sauvegarde manuelle.
- Chargement, renommage, suppression **avec confirmation**.
- Export (copie du fichier) et import (validation du schéma avant remplacement).
- Backup de secours dans `data/backups/` avant toute opération destructive.

## Performance

Ne pas réécrire toute la base à chaque cycle : transactions groupées, updates
ciblés, snapshots périodiques. Les données de la simulation restent dans le
worker ; le renderer ne reçoit qu'un état agrégé throttlé.

## Migrations

Table `schema_migrations` avec version, date, description. Toute évolution du
schéma passe par une migration versionnée, appliquée à l'ouverture, jamais par
une modification directe de la base existante.

## Restauration

Copier le fichier souhaité depuis `data/backups/` vers `data/saves/` puis
redémarrer l'application. Aucune sauvegarde n'est supprimée sans confirmation.
