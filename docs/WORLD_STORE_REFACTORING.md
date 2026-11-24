# Refactorisation progressive de `world-store.service.ts` — [Planifié, Phase 3D]

> Aucun fichier source n'est modifié par cette tranche documentaire. Le découpage ci-dessous
> est un plan d'extraction derrière une façade stable, pas une refonte « big bang ».

## 1. Constat vérifié

`src/main/services/world-store.service.ts` contient aujourd'hui, dans un seul fichier :

- le chemin et le cycle de vie de la base sql.js ;
- `ensureSchema()` et les migrations additives ;
- `persist()` avec `writeFileSync` ;
- le CRUD des mondes, personnages et modèles ;
- l'horloge et les commandes de simulation ;
- `loadTickSnapshots()`, l'écriture du tick et le hook de test rollback ;
- la garde `simulation_stopped` ;
- les helpers de test `_getCharacterJsonColumnsForTests()` et `_setCharacterActionJsonForTests()`.

Ce fichier est importé directement par `world.ipc.ts`, `character.ipc.ts`, `src/main/main.ts` (pour `recoverSimulationClocksAfterRestart`), `simulation-manager.service.ts` et les tests. `simulation.ipc.ts` l'atteint indirectement via `simulation-manager.service.ts`. Toute extraction doit donc préserver les exports publics.

## 2. Principe directeur

`world-store.service.ts` devient une **façade** qui réexporte les fonctions existantes. Les nouveaux modules sont introduits un par un, sans modifier les imports des appelants.

```text
world-store.service.ts  (façade, exports stables)
 ├── database-connection.service.ts
 ├── database-schema.service.ts
 ├── db-write-lock.service.ts
 ├── persistence.service.ts
 ├── decision-history.store.ts
 ├── world-crud.service.ts
 ├── character-crud.service.ts
 ├── simulation-clock.service.ts
 └── tick-writer.service.ts
```

Aucun module ne doit importer la façade : les dépendances vont toujours des modules vers les modules, jamais en cercle.

## 3. Responsabilités

### 3.1 `database-connection.service.ts`

- `getSql()`, `getDb()`, `getDbPath()`, `getDataDir()` ;
- initialisation WASM via `resource.service.ts` ;
- `restoreDatabaseFromBuffer()` décrite dans [SAFE_PERSISTENCE.md](SAFE_PERSISTENCE.md) ;
- `PRAGMA foreign_keys = ON` ;
- aucun CRUD métier.

### 3.2 `database-schema.service.ts`

- `ensureSchema(db)` ;
- `CREATE TABLE IF NOT EXISTS` ;
- `PRAGMA table_info` + `ALTER TABLE ADD COLUMN` existants ;
- backfill legacy existant ;
- table `schema_migrations` en complément, jamais comme unique source de vérité ;
- création de `decision_records` en 3D-A. En 3D-A, `ensureSchema()` reste dans la façade et accueille cette table ; le module `database-schema.service.ts` n'est extrait qu'en 3D-B, avec la création de `decision_records` déjà en place.

### 3.3 `db-write-lock.service.ts`

- `withDbWrite<T>()` ;
- une seule file de promesses globale ;
- aucun accès à sql.js.

### 3.4 `persistence.service.ts`

- `atomicPersist(buffer: Uint8Array)` : écrit `beforeBuffer`/`afterBuffer` selon l'appelant ; aucun second helper `persistBuffer` n'est introduit ;
- chemin temporaire, `fsync`, hash, `rename`, nettoyage au démarrage ;
- journalisation des erreurs techniques ;
- aucun CRUD métier.

### 3.5 `decision-history.store.ts`

- `insertDecisionRecords(db, records)` ;
- `getDecisionSummaries(db, query)` ;
- `getDecisionRecord(db, id)` ;
- parser strict `parseDecisionRecord()` ;
- aucun calcul de simulation.

### 3.6 `world-crud.service.ts`

- `createWorld`, `listWorlds`, `getWorld`, `deleteWorld`, `setWorldStatus` ;
- `getWorld()` continue d'écrire `last_opened_at`, mais via le verrou global.

### 3.7 `character-crud.service.ts`

- `listCharacters`, `createCharacterInWorld`, `updateCharacterInstance`, `deleteCharacterInstance` ;
- `createTemplate`, `listTemplates`, `getTemplate`, `updateTemplate`, `deleteTemplate`, `instantiateTemplate` ;
- validation via `character-validation.service.ts` ;
- garde `assertWorldPreparation` inchangée : tout statut non-`preparation` est refusé.

### 3.8 `simulation-clock.service.ts`

- `getSimulationClockRow`, `clockRowToClock`, `upsertClock`, `deriveDayHour` ;
- `startSimulation`, `pauseSimulation`, `resumeSimulation`, `setSimulationSpeed`, `stopSimulation` ;
- `getSimulationStatus`, `recoverSimulationClocksAfterRestart` ;
- garde `simulation_stopped` inchangée.

### 3.9 `tick-writer.service.ts`

- `loadTickSnapshots(db, worldId)` ;
- `writeTickCharacterStates(db, states, updatedAt)` ;
- `writeDecisionRecords(db, records)` ;
- `applyTick(...)` : transaction courte, `COMMIT`, restauration mémoire en cas d'échec de persistance ;
- hook `_setTickFailureForTests()` conservé sous le même nom exporté par la façade.

Le calcul pur reste dans `character-tick.service.ts` en 3D-A/B, puis est appelé via le worker en 3D-C. Le tick writer ne décide rien : il reçoit un résultat validé.

## 4. Ordre d'extraction

| Étape | Tranche | Extraction | Risque |
|---:|---|---|---|
| 1 | 3D-A | `decision-history.store.ts` (nouveau, aucun déplacement) | faible |
| 2 | 3D-B | `database-connection.service.ts`, `database-schema.service.ts`, `persistence.service.ts` | moyen |
| 3 | 3D-B | `db-write-lock.service.ts`, mise sous verrou de toutes les mutations | moyen |
| 4 | 3D-B | `world-crud.service.ts`, `character-crud.service.ts`, `simulation-clock.service.ts` | faible |
| 5 | 3D-C | `tick-writer.service.ts`, passage au worker | élevé |
| 6 | 3D-D | nettoyage de la façade et documentation finale | faible |

À chaque étape : diff inspecté, tests existants rejoués, commit séparé si la tranche le permet.

## 5. Façade et compatibilité

La façade conserve tous les exports actuellement consommés :

```ts
export {
  createWorld, listWorlds, getWorld, deleteWorld,
  listCharacters, createCharacterInWorld, updateCharacterInstance, deleteCharacterInstance,
  createTemplate, listTemplates, getTemplate, updateTemplate, deleteTemplate, instantiateTemplate,
  getSimulationStatus, startSimulation, pauseSimulation, resumeSimulation,
  stepSimulation, setSimulationSpeed, stopSimulation,
  getSimulationClock, recoverSimulationClocksAfterRestart,
  isWorldPreparationStatus,
  _resetWorldStoreForTests,
  _getCharacterJsonColumnsForTests,
  _setCharacterActionJsonForTests,
  _setTickFailureForTests,
  _setSimulationClockForTests,
  _setWorldStatusForTests,
} from './...';
```

Les tests existants qui appellent ces helpers doivent passer sans modification. Les hooks de test restent strictement hors production.

## 6. Risques et prévention

| Risque | Prévention |
|---|---|
| Import circulaire entre façade et modules | Règle : aucun module ne importe la façade. |
| Comportement `getWorld()` modifié par erreur | Test dédié : `last_opened_at` toujours mis à jour. |
| Migration legacy cassée | Tests de base Phase 1 et Phase 3C rejoués à chaque extraction. |
| Verrou oublié sur une mutation | Revue de chaque `persist()` et de chaque `db.run` d'écriture ; test multi-mondes. |
| Interblocage entre verrous | Ordre unique monde → global, y compris pour la suppression ; test de suppression pendant tick. |
| Nettoyage de `worldLocks` inefficace | Stocker dans la map la promesse chaînée réellement comparée dans le `finally` ; test de création/suppression répétée. |
| Historique écrit hors transaction | Test rollback : aucune ligne `decision_records` après échec injecté. |
| Gros diff difficile à relire | Une responsabilité par commit, façade stable. |

## 7. Critères d'acceptation

- Tous les imports publics existants restent valides.
- 215 tests Phase 3C passent avant ajout des nouveaux tests.
- Aucune modification de schéma hors `decision_records` et `schema_migrations` en 3D-A.
- Aucune modification de règles métier ou de valeurs calculées.
- Le diff de chaque extraction peut être relu seul.
- Les helpers de test restent disponibles et non utilisés en production.
- `world-store.service.ts` ne contient plus, à la fin de la 3D-C, que des réexports et l'orchestration explicite du tick sous verrou.
