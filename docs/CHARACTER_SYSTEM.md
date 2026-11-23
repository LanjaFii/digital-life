# Système de personnages

## État actuel (Phase 1 - fondation)

La génération initiale de personnages est implémentée pour les mondes `generationMode=random`.
Les personnages sont générés de manière déterministe (seed du monde + paramètres) et persistés en SQLite dans `data/saves/worlds.sqlite`, table `characters`, isolés par `world_id`.

Les systèmes de simulation (décisions, interactions, évolution dynamique, mémoire, mort) restent **[Planifié]**.

## Échelles numériques

- **Traits de personnalité** : entier `0-100` (0 = très faible, 50 = neutre/moyen, 100 = très fort).
- **Émotions** : entier `0-100` (0 = absent, 100 = intense).
- **Besoins** : entier `0-100` (100 = besoin satisfait, 0 = critique).
- **Âge** : entier plausible `18-65` à la génération initiale.

## Modèle implémenté

### Identité
- `id` (string, unique)
- `worldId` (string, FK logique vers le monde)
- `firstName`, `lastName`
- `age`
- `gender` (`female | male | nonbinary`)
- `biography` (courte, générée)
- `createdAt`

### Traits (0-100)
`sociability`, `empathy`, `aggression`, `patience`, `impulsivity`, `curiosity`,
`intelligence`, `creativity`, `honesty`, `altruism`, `ambition`, `courage`,
`timidity`, `distrust`, `optimism`, `humor`, `jealousy`, `discipline`,
`independence`, `loyalty`, `resilience`.

### Émotions initiales (0-100)
`happiness`, `sadness`, `stress`, `anxiety`, `anger`, `fear`, `confidence`,
`loneliness`, `motivation`, `satisfaction`.

### Besoins initiaux (0-100, 100=satisfait)
`hunger`, `thirst`, `energy`, `sleep`, `health`, `hygiene`, `socialization`, `safety`.

### Objectifs
- 1 objectif principal (`kind: primary`)
- 2 objectifs secondaires (`kind: secondary`)
- Chaque objectif a `id`, `label`, `kind`.

## Génération déterministe

- Générateur PRNG seedé (`mulberry32`) dans `src/main/services/prng.ts`.
- Aucun `Math.random()` dans le générateur de personnages.
- Même seed + mêmes paramètres => mêmes personnages.
- Les traits sont contraints pour limiter les incohérences évidentes (ex. sociabilité/timidité, agressivité/empathie, patience/impulsivité).

## Persistance

- Table SQLite `characters` avec colonnes identité + JSON (`traits_json`, `emotions_json`, `needs_json`, `goals_json`).
- Isolation par `world_id`.
- Suppression des personnages lors de la suppression du monde.
- Rechargement après redémarrage via SQLite.

## API / IPC

- Canal IPC : `character:list` (`IPC_CHANNELS.CHARACTER_LIST`).
- Preload : `window.digitalLife.listCharacters(worldId)`.
- Validation Main : `worldId` doit être une chaîne non vide.

## [Planifié]

- Évolution dynamique des traits/émotions/besoins.
- Relations, mémoire, décisions, événements, mort.
- Éditeur de personnage et ajout manuel après création du monde.