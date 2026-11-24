# Persistance sécurisée de la base SQLite — Phase 3D-B implémentée

> Tranche 3D-B livrée. Le fichier `data/saves/worlds.sqlite` n'est plus réécrit
> directement : toute mutation passe par un snapshot restaurable, une transaction
> courte et une écriture atomique `temp + fsync + SHA-256 + rename`. Aucun repli
> silencieux par copie partielle n'est autorisé.

## 1. Problème résolu

Avant 3D-B, `persist(db)` faisait `writeFileSync(getDbPath(), db.export())` juste
après `COMMIT`. Trois défauts étaient vérifiés dans le code :

1. le fichier cible était écrasé en place, sans atomïcité au niveau fichier ;
2. aucune vérification du contenu écrit n'était effectuée ;
3. si l'écriture échouait après `COMMIT`, la base mémoire conservait le tick alors
   que le disque conservait l'état précédent.

La tranche 3D-B couvre la persistance, la restauration mémoire, les verrous et la
suppression concurrente. Le calcul reste dans le main (3D-C non commencée).

## 2. Séquence réelle d'un tick

L'ordre des verrous est strict : **verrou du monde puis verrou global SQLite**.

```text
withWorldLock(worldId)                 // manager, couvre tout le tick
  withDbWrite                          // file globale SQLite
    valider monde + horloge (sans mutation)
    before = snapshotDatabaseFromDisk() // dernier état disque validé, mis en cache
    BEGIN TRANSACTION
    charger snapshots/runtimes/PRNG
    calculer le tick (synchrone en 3D-B)
    écrire états, runtime, historique, horloge, statut
    COMMIT
    after = db.export()
    atomicPersist(after)
    si échec avant rename : restoreDatabaseFromBuffer(before), puis relancer
  fin withDbWrite
  syncWorkerForStatus + broadcast       // toujours sous le verrou du monde
fin withWorldLock
```

Le calcul est synchrone dans le main en 3D-B : le verrou global reste donc détenu
pendant cette section courte, mais jamais pendant un `await` externe. En 3D-C, le
calcul deviendra asynchrone : le verrou global sera relâché pendant l'attente du
worker, puis repris pour relire l'horloge et exporter `before` juste avant
`BEGIN`. Un export pris avant une attente asynchrone écraserait les écritures
d'autres mondes survenues pendant cette attente.

`before` est fourni par `snapshotDatabaseFromDisk()`, qui retourne une copie du
dernier tampon validé par `atomicPersist`. Le verrou global garantit que ce tampon
est exactement l'état mémoire courant au début de la mutation : cela évite un
second `db.export()` complet sans perdre la restaurabilité octet pour octet.

## 3. Écriture atomique

`atomicPersist(dbPath, buffer, options?)` dans `persistence.service.ts` :

1. nettoie `worlds.sqlite.tmp` résiduel sans toucher au fichier cible ;
2. ouvre le temporaire avec `wx` et mode `0600` sur le **même répertoire** ;
3. écrit tous les octets avec `writeSync`, puis `fsyncSync` du fichier ;
4. relit le temporaire et compare taille + SHA-256 avec le tampon source ;
5. `renameSync(temp, target)` remplace la cible atomiquement ;
6. POSIX uniquement : `fsyncSync` du répertoire parent.

Le hash est calculé dans le main avec `node:crypto`. `created_at` est produit
avant l'écriture et ne dépend pas du `rename`. Le temporaire n'est jamais utilisé
comme base de données. Une erreur avant `rename` lève une erreur dure, supprime le
temporaire et laisse la cible intacte. Après un `rename` réussi, la base disque est
considérée validée : une erreur de `fsync` du répertoire est journalisée et
retournée dans `directoryFsyncError`, sans restauration mémoire (qui créerait une
divergence inverse). Ce champ n'est jamais ignoré silencieusement : il est
journalisé dans le main et couvert par un test.

Les options `fsync`, `directoryFsync` et `platform` existent uniquement pour les
tests : elles permettent de simuler un `fsync` refusé ou une plateforme Windows
sans introduire de dépendance native.

## 4. Restauration de la base mémoire

`restoreDatabaseFromBuffer(buffer)` :

1. crée une nouvelle `Database` sql.js depuis `buffer` ;
2. rejoue `PRAGMA foreign_keys = ON` ;
3. remplace `dbPromise` et `currentDb` ;
4. réinitialise le cache du dernier état disque validé avec `buffer` ;
5. ferme l'ancienne instance.

Aucune migration n'est rejouée : le snapshot contient déjà le schéma, ce qui
garantit l'égalité octet pour octet avec l'état antérieur. Le verrou global est
toujours détenu pendant la restauration, donc aucune écriture ne peut
s'intercaler. Les hooks de test sont appelés avant l'écriture, dans la
transaction (rollback SQL existant de 3D-A), puis aux étapes de l'écriture
atomique (`beforeWrite`, `beforeFsync`, `beforeVerify`, `beforeRename`,
`afterRename`).

## 5. Verrous

### 5.1 Verrou global SQLite

`db-write-lock.service.ts` expose `withDbWrite<T>()` : une file de promesses
module-level sérialise toutes les opérations qui peuvent écrire dans la base
sql.js partagée. Une erreur précédente ne poisonne pas la file. Un timeout de
30 s couvre l'attente de la file ; la libération a lieu dans tous les cas.

Toutes les mutations passent par ce verrou : initialisation, CRUD monde et
personnage, bibliothèque de modèles, `getWorld()` (qui écrit `last_opened_at`),
commandes de simulation, tick, helpers de test et suppression. Les lectures pures
restent hors verrou.

### 5.2 Verrou par monde

Le manager corrige le nettoyage de `worldLocks` : la map stocke désormais la
promesse chaînée réellement comparée dans le `finally`. Un timeout de 30 s est
appliqué à l'attente du verrou. Le verrou du monde couvre le tick, la
synchronisation du worker et le broadcast, ainsi que toutes les commandes de
simulation et la suppression. Les ticks tardifs d'un monde supprimé sont ignorés
grâce au tombeau `deletedWorldIds`.

### 5.3 Suppression concurrente d'un monde

`WORLD_DELETE` appelle désormais `simulationDeleteWorld(id)`, jamais
`deleteWorld()` directement. Séquence :

1. prendre le verrou du monde (attend la fin du tick en cours) ;
2. poser le tombeau et envoyer `stop` au planificateur ;
3. nettoyer `activeTickWorlds` ;
4. prendre le verrou global via `deleteWorld()`, supprimer les lignes et
   persister atomiquement ;
5. relâcher les verrous dans l'ordre inverse.

En 3D-B il n'existe pas encore de calcul asynchrone ni de `pendingComputes` : le
tombeau suffit à invalider les signaux déjà en file. La tranche 3D-C devra ajouter
l'annulation explicite des requêtes en attente avant de relâcher le verrou du
monde. Le service interne `deleteWorld()` reste disponible mais n'est plus appelé
par l'IPC.

## 6. Plateformes

| Plateforme | Comportement vérifié | Précaution |
|---|---|---|
| Linux / macOS | `renameSync` remplace la cible de façon atomique ; `fsync` du fichier et du répertoire parent. | Vérification que la cible n'est pas un répertoire. |
| Windows | Node/libuv utilise `MoveFileEx` avec remplacement via `renameSync`. Aucun repli par copie. | `EPERM`/`EACCES` reste une erreur dure : cible intacte, temporaire supprimé, mémoire restaurée. Simulé en test via `platform: 'win32'`. |

Aucune dépendance native n'est ajoutée. `sql.js` reste le moteur ; le WASM embarqué
continue d'être chargé via `resource.service.ts`. Le remplacement atomique est une
propriété du système de fichiers, pas de SQLite.

## 7. Démarrage et récupération

À l'ouverture :

1. détecter `worlds.sqlite.tmp` et le supprimer ;
2. charger `worlds.sqlite` ;
3. exécuter `ensureSchema(db)`, qui inclut les migrations additives et la table
   `decision_records` de 3D-A, sans seconde passe ;
4. convertir les horloges `running` en `paused` ;
5. initialiser le cache du dernier état disque validé avec l'export produit par
   `ensureSchema()`.

Un temporaire résiduel n'est jamais fusionné ni importé.

## 8. Matrice d'échecs

| Échec | État disque | État mémoire | Action |
|---|---|---|---|
| Échec avant `BEGIN` | inchangé | inchangé | erreur remontée |
| Échec pendant écritures SQL | inchangé | `ROLLBACK` transactionnel | erreur remontée |
| Échec du `db.export()` après `COMMIT` | inchangé | restauré depuis `before` | erreur remontée |
| Échec d'écriture du temporaire | inchangé | restauré | temporaire supprimé |
| Échec du `fsync` du fichier | inchangé | restauré | temporaire supprimé |
| Échec de vérification SHA-256 | inchangé | restauré | temporaire supprimé |
| Échec du `rename` (`EPERM` inclus) | inchangé | restauré | temporaire supprimé, erreur dure |
| `fsync` du répertoire après `rename` | nouvel état complet | conservé | journalisé dans `directoryFsyncError` |
| Arrêt avant `rename` | ancien état | sans objet | temporaire nettoyé au prochain démarrage |
| Arrêt après `rename` | nouvel état complet | sans objet | reprise normale |

## 9. Tests livrés

- écriture atomique nominale, suppression du temporaire ;
- panne avant écriture, avant fsync, fsync refusé, hash altéré, avant rename ;
- erreur après rename : nouveau fichier conservé et erreur journalisée ;
- `rename` `EPERM` simulé sur Windows : aucune copie partielle ;
- temporaire résiduel nettoyé au démarrage sans import ;
- tick avec échec avant `rename` : mémoire et disque restaurés octet pour octet ;
- tick avec hash altéré : restauration mémoire et horloge inchangée ;
- deux ticks de mondes différents : sérialisation, aucun tick perdu, mémoire = disque ;
- file d'écriture globale : sérialisation, libération après erreur, timeout ;
- manager : deux ticks du même monde, deux mondes distincts, suppression pendant
  tick, deux suppressions concurrentes, erreur sous verrou, absence de deadlock.

Validation : 13 tests d'écriture atomique, 3 de file globale et 5 de manager, soit
21 nouveaux tests ; suite hors benchmark/test long **264/264**, test long isolé **9/9**,
typecheck 4 configs et build de production OK.

## 10. Limitation de performance

La durabilité ajoutée (temporaire, double hash, `fsync` fichier et répertoire)
coûte plus cher que l'ancien `writeFileSync` direct. `db.export()` réexporte
toujours toute la base, avec double copie mémoire et double SHA-256 ;
`decision_records` croît sans purge ni rétention. Les benchmarks 3D-B locaux
(non rejoués pendant la validation finale) donnent 63,68 ms au tick 10 et
377,56 ms au tick 200 pour 3 personnages, 548,45 ms pour 10, 1 329,12 ms pour 50,
1 652,77 ms pour 100 et 1 254,09 ms/tick pour 3×10 mondes. Aucune mesure 3D-A
comparable à effectif égal n'est disponible : ces chiffres ne prouvent pas une
amélioration. Aucun timeout de test n'a été relevé artificiellement pour masquer
ce coût ; le test long isolé passe en 6,00 s avec son délai explicite de 30 s.
Le déplacement du calcul dans un worker (3D-C), l'IPC/UI (3D-D) et les
optimisations (hash en flux, persistance groupée, rétention) restent ouverts.

## 11. Hors périmètre

WAL natif, better-sqlite3, sauvegarde automatique périodique, export/import par
monde, compression générale de la base, chiffrement, déplacement de SQLite dans
un worker, annulation de `pendingComputes` (3D-C).
