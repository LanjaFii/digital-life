# Persistance sécurisée de la base SQLite — [Planifié, Phase 3D]

> Aucun changement de persistance n'est implémenté par cette tranche documentaire.
> Le comportement réel aujourd'hui est `db.export()` puis `writeFileSync(path, Buffer)` dans
> `world-store.service.ts`.

## 1. État actuel et problème

`persist(db)` réécrit l'intégralité du fichier `data/saves/worlds.sqlite` à chaque mutation, y compris :

- l'initialisation `getDb()` (`ensureSchema()` puis `persist()`) ;
- la création/suppression de monde et de personnage, ainsi que toute la bibliothèque de modèles ;
- `getWorld()`, qui met à jour `last_opened_at` et `updated_at` ;
- chaque tick réussi, après `COMMIT` ;
- les helpers de test `_setCharacterActionJsonForTests()`, `_setSimulationClockForTests()`, `_setWorldStatusForTests()` et `_resetWorldStoreForTests()`.

Quatre limites sont vérifiées dans le code :

1. `writeFileSync` est synchrone dans le processus principal ;
2. l'écriture directe sur le fichier cible n'est pas atomique ;
3. si `persist()` échoue après `COMMIT`, la base mémoire contient le tick mais le fichier contient encore l'état précédent ;
4. `persist(db): void` est appelé sans `await` : il deviendra `atomicPersist(buffer): Promise<void>` et tous les appelants devront attendre la promesse.

Le correctif doit donc couvrir à la fois le fichier et la cohérence mémoire/disque.

## 2. Séquence retenue pour un tick

Deux verrous distincts sont nécessaires :

- le **verrou du monde**, détenu pendant tout le tick, y compris l'attente du calcul ;
- le **verrou global d'accès à SQLite**, pris uniquement autour des sections qui lisent ou écrivent la base.

L'ordre est toujours **monde → global**. Le verrou global n'est pas détenu pendant `await compute-tick` : il bloquerait les écritures des autres mondes pendant jusqu'à 30 s. Le verrou du monde garantit qu'aucune opération du même monde ne modifie la base pendant le calcul.

```text
withWorldLock(worldId):
  // Section 1 : lecture du snapshot, sous verrou global
  withDbWrite:
    1. valider monde + horloge (sans mutation)
    2. lire snapshot, runtimes et état PRNG
    3. mémoriser expected = { worldId, tick, day, hour, rngState initial }

  // Calcul : aucun verrou global, aucun accès SQLite
  4. calculer le tick (main en 3D-A/B, worker en 3D-C)

  // Section 2 : validation et écriture, sous verrou global
  withDbWrite:
    5. relire monde + horloge ; si expected a changé, erreur sans écriture
    6. beforeBuffer = db.export()   // état exact avant mutation
    7. BEGIN TRANSACTION
    8. écrire états, runtime, historique, horloge, status
    9. COMMIT
   10. afterBuffer = db.export()
   11. atomicPersist(afterBuffer)   // temp, fsync, hash, rename
   12. si échec à 10 ou 11 : restoreDatabaseFromBuffer(beforeBuffer), puis relancer
```

Le `beforeBuffer` est exporté **après** le calcul et **avant** `BEGIN`, sous le verrou global : il capture les écritures concurrentes des autres mondes survenues pendant le calcul. Restaurer un export pris avant le calcul effacerait ces écritures.

Le coût passe d'un export complet par tick à deux exports. C'est le prix de la réversibilité en cas d'échec disque ; il doit être mesuré dans les tests 3D-B avec 10, 50 et 100 personnages.

La transaction SQLite ne reste pas ouverte pendant l'attente du worker : c'est le verrou du monde qui exclut les opérations concurrentes du même monde, et le verrou global qui exclut les accès SQLite simultanés.

## 3. Écriture atomique

Chemin temporaire : `data/saves/worlds.sqlite.tmp`.

```text
writeFile(temp, buffer)
open(temp, 'r+') → fsync()
readFile(temp) → compare taille + SHA-256 avec buffer
rename(temp, target)
POSIX uniquement : open(dir, 'r') → fsync()
```

- Le hash est calculé dans le main avec `node:crypto`.
- `created_at` des enregistrements est produit avant l'écriture ; il ne dépend pas de la réussite du `rename`.
- Le fichier temporaire n'est jamais utilisé comme base de données.
- Si une étape échoue avant `rename`, le temporaire est supprimé et la base mémoire est restaurée depuis `beforeBuffer`.
- Si le processus s'arrête avant `rename`, le fichier cible reste intact et le temporaire est nettoyé au démarrage suivant.
- Si le processus s'arrête après `rename`, le fichier cible contient le tick complet.

## 4. Restauration de la base mémoire

`database-connection.service.ts` expose une fonction de restauration interne :

```ts
restoreDatabaseFromBuffer(buffer: Uint8Array): void;
```

Comportement :

1. fermer l'instance `sql.js` courante ;
2. créer une nouvelle `Database` depuis `beforeBuffer` ;
3. remplacer la promesse de base courante ;
4. rejouer `PRAGMA foreign_keys = ON` et les gardes de schéma nécessaires ;
5. rendre le contrôle à l'appelant, qui relance l'erreur d'origine après la restauration.

Aucune autre opération SQLite ne peut s'intercaler, car le verrou global est toujours détenu pendant la restauration. Les hooks de test existants sont appelés **dans** la transaction, après `writeTickCharacterStates()` et avant `upsertClock()`. La tranche 3D-B ajoutera des hooks distincts avant `BEGIN`, après `COMMIT`, avant `rename` et pendant la vérification du hash.

## 5. Verrou global d'écriture

Le verrou est une chaîne de promesses module-level :

```ts
withDbWrite<T>(fn: () => T | Promise<T>): Promise<T>;
```

L'ordre de verrou est toujours **verrou du monde puis verrou global d'écriture** pour toute opération ciblant un monde. Le manager détient déjà le verrou par monde autour des ticks et des commandes ; les handlers et services qui écrivent un monde doivent l'utiliser aussi. Aucune opération ne doit prendre le verrou global avant le verrou du monde quand les deux sont nécessaires.

Toutes les opérations qui peuvent écrire doivent passer par ce verrou :

- initialisation de la base (`ensureSchema()` + `persist()`) et récupération des horloges au démarrage, sous verrou global seul ;
- `createWorld`, `deleteWorld`, `getWorld` (qui écrit `last_opened_at`) ;
- création/modification/suppression de personnages et de modèles ;
- `start/pause/resume/step/setSpeed/stop` et lecture de statut si elle touche à la base ;
- insertion et lecture des enregistrements de décision si la lecture décompresse ou valide ;
- helpers `_set*ForTests` et `_resetWorldStoreForTests`, ou exemption explicite documentée hors production.

Les lectures purement en mémoire qui ne touchent jamais la base peuvent rester hors verrou. En cas de doute, une opération passe par le verrou.

Le nettoyage actuel de `worldLocks` est incorrect : la map stocke `previous.then(() => current)` alors que le `finally` compare `current`. Il faut conserver la promesse chaînée réellement stockée, par exemple `const chained = previous.then(() => current); worldLocks.set(worldId, chained); … if (worldLocks.get(worldId) === chained) worldLocks.delete(worldId);`.

### 5.1 Suppression concurrente d'un monde

Le handler IPC `WORLD_DELETE` ne doit plus faire :

```ts
deleteWorld(id);
simulationClearWorld(id);
```

Il appelle un helper manager garantissant cet ordre :

1. prendre le verrou du monde, ce qui attend la fin du tick en cours et empêche tout nouveau tick ;
2. arrêter la planification et annuler les `pendingComputes` de ce monde ; aucune réponse tardive ne pourra écrire ;
3. prendre le verrou global d'écriture ;
4. supprimer les lignes SQLite et persister la base dans la même section verrouillée ;
5. nettoyer `activeTickWorlds` et la map des verrous ;
6. relâcher le verrou global puis le verrou du monde, puis notifier l'UI.

L'ancien comportement de `deleteWorld()` reste disponible comme service interne, mais n'est plus appelé directement par l'IPC. Le `simulationClearWorld()` actuel poste `stop` et vide les maps sans attendre : il doit être remplacé par ce helper orchestré.

## 6. Plateformes

| Plateforme | Comportement attendu | Précaution |
|---|---|---|
| Linux / macOS | `rename(temp, target)` remplace atomiquement le fichier. Le `fsync` du répertoire est tenté si le runtime le permet. | Vérifier que le fichier cible n'est pas un répertoire. |
| Windows | Node/libuv utilise `MoveFileEx` avec remplacement ; aucun repli par copie n'est autorisé. | Un verrou antivirus ou un handles ouvert peut produire `EPERM`/`EACCES` : erreur dure, restauration mémoire, aucun fichier partiel. |

Aucune dépendance native n'est ajoutée. `sql.js` reste le moteur ; le WASM embarqué continue d'être chargé via `resource.service.ts`. Le remplacement atomique est une propriété du système de fichiers, pas de SQLite.

## 7. Démarrage et récupération

À l'ouverture :

1. détecter `worlds.sqlite.tmp` et le supprimer ;
2. charger `worlds.sqlite` ;
3. exécuter `ensureSchema(db)`, qui inclut déjà `PRAGMA table_info`, `ALTER TABLE ADD COLUMN`, le backfill legacy et, depuis la 3D-A, `decision_records` avec `schema_migrations` ; ne pas ajouter une seconde passe de migrations ;
4. convertir les horloges `running` en `paused`, comportement inchangé.

Un fichier temporaire résiduel n'est jamais fusionné ni importé.

## 8. Matrice d'échecs

| Échec | État disque | État mémoire | Action |
|---|---|---|---|
| Échec avant `BEGIN` | inchangé | inchangé | erreur remontée |
| Échec pendant écritures SQL | inchangé | `ROLLBACK` transactionnel | erreur remontée |
| Échec du `db.export()` après `COMMIT` | inchangé | restauré depuis `beforeBuffer` | erreur remontée |
| Échec d'écriture du temporaire | inchangé | restauré | temporaire supprimé |
| Échec de vérification hash | inchangé | restauré | temporaire supprimé |
| Échec du `rename` | inchangé | restauré | temporaire supprimé, erreur dure |
| Arrêt avant `rename` | ancien état | sans objet | temporaire nettoyé au prochain démarrage |
| Arrêt après `rename` | nouvel état complet | sans objet | reprise normale |

## 9. Tests prévus

- hooks injectés avant `BEGIN`, dans la transaction (existant), après `COMMIT`, avant `rename` et pendant la vérification du hash ;
- fichier cible verrouillé/inexistant selon la plateforme simulée ;
- redémarrage avec temporaire résiduel ;
- base mémoire restaurée vérifiée octet pour octet contre `beforeBuffer` ;
- deux mondes qui écrivent en parallèle : aucun chevauchement détectable et aucune écriture perdue ;
- relecture d'horloge divergente : erreur sans écriture ;
- suppression de monde pendant un tick et pendant un calcul worker ;
- benchmarks 10/50/100 personnages : durée de `export`, durée d'écriture, taille fichier ;
- ancienne sauvegarde Phase 1/3C ouverte après migration.

## 10. Hors périmètre

WAL natif, better-sqlite3, sauvegarde automatique périodique, export/import par monde, compression générale de la base, chiffrement, déplacement de SQLite dans un worker.
