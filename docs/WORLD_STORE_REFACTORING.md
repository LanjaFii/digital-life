# Refactorisation progressive de `world-store.service.ts` — Phase 3D-B partielle

> La façade `world-store.service.ts` conserve tous ses imports publics. La
> tranche 3D-B a extrait la connexion, le schéma, la persistance atomique et le
> verrou global. Le CRUD et l'écriture du tick restent dans la façade mais ne
> touchent plus directement au fichier ni à la transaction : ils passent par les
> nouveaux services. Aucune réécriture générale n'a été tentée.
>
> Les sous-tranches 3D-C1 et 3D-C2 sont implémentées et validées depuis le
> 2026-11-26 : protocole partagé, modules canoniques et `tick-writer.service.ts`
> extrait, worker de calcul autonome mais non branché. L'intégration 3D-C3 et le
> nettoyage final 3D-D restent à valider séparément.

## 1. État réel après 3D-B

`src/main/services/world-store.service.ts` contient toujours :

- le CRUD des mondes, personnages et modèles ;
- l'horloge et les commandes de simulation ;
- `loadTickSnapshots()`, l'écriture du tick et le hook de test rollback ;
- les gardes `simulation_stopped` et `assertWorldPreparation` ;
- les helpers de test `_...ForTests` exportés par la façade.

Il a en revanche perdu :

- le chemin, le cycle de vie et la restoration de la base sql.js ;
- `ensureSchema()` et les migrations additives ;
- `persist()` avec `writeFileSync` ;
- toute transaction ou mutation sans verrou global.

Ce fichier est importé directement par `world.ipc.ts`, `character.ipc.ts`,
`src/main/main.ts`, `simulation-manager.service.ts` et les tests. Aucun appelant
n'a été modifié pour la connexion, le schéma ou la persistance.

## 2. Principe directeur

`world-store.service.ts` reste une **façade** : les modules extraits dépendent
des services, jamais de la façade. Aucun import circulaire n'est introduit.

```text
world-store.service.ts  (façade, exports stables)
  ├── database-connection.service.ts   ✅ extrait en 3D-B
  ├── database-schema.service.ts       ✅ extrait en 3D-B
  ├── db-write-lock.service.ts         ✅ extrait en 3D-B
  ├── persistence.service.ts           ✅ extrait en 3D-B
  ├── decision-history.store.ts        ✅ extrait en 3D-A
  ├── decision-record.service.ts       ✅ extrait en 3D-A
  ├── world-crud.service.ts            ⏳ reste dans la façade (3D-B : verrouillé)
  ├── character-crud.service.ts        ⏳ reste dans la façade (3D-B : verrouillé)
  ├── simulation-clock.service.ts      ⏳ reste dans la façade (3D-B : verrouillé)
  └── tick-writer.service.ts           ✅ extrait en 3D-C1, appelé en synchrone
```

En 3D-C1, `src/shared/worker-protocol.ts` et les modules partagés purs
(`canonicalization.ts`, `decision-validation.ts`) ont été ajoutés ;
`decision-record.service.ts` réexporte les fonctions déplacées pour conserver
tous les imports existants.

## 3. Responsabilités livrées

### 3.1 `database-connection.service.ts`

- `getSql()`, `getDb()`, `getDbPath()`, `getDataDir()` ;
- initialisation WASM via `resource.service.ts` ;
- `snapshotDatabase()`, `snapshotDatabaseFromDisk()` ;
- `restoreDatabaseFromBuffer()`, `persistSnapshotOrRestore()`,
  `runDbTransaction()` ;
- `closeDatabaseForTests()` ;
- `PRAGMA foreign_keys = ON` ; aucun CRUD métier.

`db.export()` alloue déjà un `Uint8Array` indépendant : aucun second copiage n'est
effectué. Le cache `lastPersistedBuffer` évite une exportation supplémentaire à
chaque mutation tout en restant restaurable octet pour octet.

### 3.2 `database-schema.service.ts`

- `ensureSchema(db)` extract strict du store ;
- `CREATE TABLE IF NOT EXISTS`, `PRAGMA table_info`, `ALTER TABLE ADD COLUMN` ;
- backfill legacy inchangé ;
- appel à `ensureDecisionHistorySchema(db)` de 3D-A ;
- aucune migration supplémentaire en 3D-B.

### 3.3 `db-write-lock.service.ts`

- `withDbWrite<T>()` et `DbWriteLockTimeoutError` ;
- une seule file de promesses globale, timeout 30 s sur l'attente ;
- libération dans tous les cas, y compris après erreur ;
- aucun accès à sql.js.

### 3.4 `persistence.service.ts`

- `atomicPersist(dbPath, buffer, options?)` ;
- `getPersistenceTempPath()`, `cleanupStalePersistenceTemp()` ;
- `AtomicPersistResult.directoryFsyncError` ;
- hooks de test par étape, injection contrôlée de `fsync` et de plateforme ;
- aucun CRUD métier.

### 3.5 Façade : CRUD et tick

Chaque mutation de la façade suit le même patron :

```ts
await withDbWrite(async () => {
  const db = await getDb();
  const before = snapshotDatabaseFromDisk();
  // ... mutations SQL ou runDbTransaction(db, before, () => { ... })
});
```

`getWorld()` continue d'écrire `last_opened_at`/`updated_at`, mais sous verrou.
`stepSimulation()` conserve la transaction 3D-A, l'insertion de l'historique et
le hook `_setTickFailureForTests()` ; seule l'écriture disque change. Les helpers
de test restent exportés sous les mêmes noms.

En 3D-C, `stepSimulation()` sera scindé en trois sections : lecture du snapshot
sous verrou global, attente du worker sous verrou du monde seul, puis reprise du
verrou global pour relire l'horloge, exporter `before` avant `BEGIN`, écrire et
persister. L'extraction de `tick-writer.service.ts` réalisée en 3D-C1 a conservé l'appel
**synchrone** et tous les exports publics ; aucun repli production vers le calcul
direct n'a été introduit en 3D-C2.

## 4. Ordre d'extraction

| Étape | Tranche | Extraction | État |
|---:|---|---|---|
| 1 | 3D-A | `decision-history.store.ts`, `decision-record.service.ts` | livrée |
| 2 | 3D-B | `database-connection.service.ts`, `database-schema.service.ts`, `persistence.service.ts` | livrée |
| 3 | 3D-B | `db-write-lock.service.ts`, mise sous verrou de toutes les mutations | livrée |
| 4 | 3D-B/3D-D | `world-crud.service.ts`, `character-crud.service.ts`, `simulation-clock.service.ts` | reportée : façade stable conservée, mutations déjà verrouillées |
| 5 | 3D-C1 | `worker-protocol.ts`, modules canoniques partagés, `tick-writer.service.ts` (appel synchrone) | livrée |
| 6 | 3D-C2 | `tick-compute.worker.ts` autonome, parité et checksum | livrée, non branchée |
| 6b | 3D-C3 | intégration manager, verrous et annulation | non commencée |
| 7 | 3D-D | nettoyage final de la façade et documentation | non commencée |

Le report de l'étape 4 est un choix de réversibilité : déplacer le CRUD aurait
augmenté le diff sans améliorer la garantie de persistance. La façade expose déjà
les mêmes exports et tous les appels passent par les services extraits.

## 5. Façade et compatibilité

Tous les exports publics restent valides, notamment :

```ts
createWorld, listWorlds, getWorld, deleteWorld,
listCharacters, createCharacterInWorld, updateCharacterInstance, deleteCharacterInstance,
createTemplate, listTemplates, getTemplate, updateTemplate, deleteTemplate, instantiateTemplate,
getSimulationStatus, getSimulationClock, startSimulation, pauseSimulation, resumeSimulation,
stepSimulation, setSimulationSpeed, stopSimulation, recoverSimulationClocksAfterRestart,
isWorldPreparationStatus,
_resetWorldStoreForTests,
_getCharacterJsonColumnsForTests, _setCharacterActionJsonForTests,
_setTickFailureForTests, _setPersistenceFailureForTests,
_setSimulationClockForTests, _setWorldStatusForTests,
_insertDecisionRecordForTests, _listDecisionRecordsForTests, _getDecisionRecordForTests,
_countDecisionRecordsForTests, _getDecisionRecordRowsForTests,
_exportDatabaseForTests
```

Les helpers `_...ForTests` restent strictement hors production. Les tests
existants n'ont pas été modifiés pour s'adapter à la refactorisation.

## 6. Risques et prévention

| Risque | Prévention vérifiée |
|---|---|
| Import circulaire | Aucun module extrait n'importe la façade. |
| `getWorld()` modifié par erreur | `last_opened_at` toujours mis à jour, sous verrou, test existant conservé. |
| Migration legacy cassée | Tests de base Phase 1/3C et migration `3D-1` rejoués. |
| Verrou oublié sur une mutation | Revue de chaque ancien site `persist(db)` : tous convertis. |
| Interblocage | Ordre unique monde → global, y compris suppression ; test dédié. |
| Nettoyage de `worldLocks` inefficace | Promesse chaînée stockée et comparée ; test de suppression concurrente. |
| Historique écrit hors transaction | Hook rollback 3D-A inchangé et rejoué. |
| Gros diff | Quatre modules extraits, façade conservée, CRUD non déplacé. |
| Réponse tardive après suppression | Tombeau et annulation avant verrous (P5), `pendingComputes` retiré avant rejet, contrôle avant `BEGIN`. |
| Deux canonicaliseurs / trois hashes | Module partagé pur, réexports de `decision-record.service.ts`, noyau Golden Hash unique pour le checksum. |

## 7. Critères d'acceptation

- Tous les imports publics existants restent valides.
- À la livraison 3D-B, la suite était **264/264** (27 fichiers, benchmark et test long
  exclus) ; 21 tests 3D-B ont été ajoutés et le test long isolé passait **9/9**. Après
  3D-C1/C2, la suite est **279/279** (30 fichiers, tests longs et benchmark exclus).
- Aucun changement de schéma ni de valeur calculée par le moteur.
- Golden Hash 18 scénarios byte-identique.
- Aucune mutation de la façade n'échappe à `withDbWrite`.
- `world-store.service.ts` ne contient plus ni connexion, ni schéma, ni
  `writeFileSync`.
- Typecheck 4 configurations et build de production OK ; `worlds.sqlite` utilisateur
  inchangé.

Critères prévus pour 3D-C : façade et hooks `_...ForTests` inchangés, aucun
repli production vers le calcul direct, 18 Golden Hash byte-identiques en suite
ordinaire, matrice complète en test long isolé, aucune écriture depuis le worker,
aucune écriture ciblant un monde pendant le calcul d'un tick de ce monde.
