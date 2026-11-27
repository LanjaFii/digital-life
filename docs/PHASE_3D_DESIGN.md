# Phase 3D — Consolidation du moteur

> **Statut : conception validée. Les tranches 3D-A, 3D-B, 3D-C1, 3D-C2, 3D-C3 et 3D-C4 sont
> implémentées et validées ; seule 3D-D reste planifiée.** HEAD avant conception 3D :
> `276384eb993e91f80a309e0864a54dbe1fdf8d53`, identique à `origin/main`. HEAD après
> publication de la conception : `e060a07a71cad43932444ae56a00de13d72a1cf0`.
> Ce document sert de référence d'architecture pour les tranches 3D-A à 3D-D.
>
> **Les arbitrages définitifs de l'audit de préparation 3D-C ont été validés le 2026-11-26**
> (§2.1 et §10). Les sous-tranches **3D-C1 à 3D-C4 sont livrées** : protocole, canonicalisation
> partagée, frontière d'écriture, worker de calcul, intégration au manager, verrous et
> documentation finale. Le calcul direct reste la référence de test, jamais un repli de production.

## 1. Périmètre retenu

La Phase 3D consolide le moteur livré en Phase 3C avant toute nouvelle règle de gameplay.

Elle couvre :

1. un historique technique persistant, strictement validé, une décision par personnage et par tick ;
2. le déplacement du **calcul pur du tick** dans un worker dédié, le main restant propriétaire de SQLite ;
3. une persistance asynchrone, vérifiée et atomique au niveau fichier, avec restauration de l'état mémoire en cas d'échec ;
4. une refactorisation progressive de `world-store.service.ts` derrière une façade stable ;
5. une interface minimale et sobre : action courante, dernières actions, inspecteur de décision, filtres et rafraîchissement après tick.

Hors périmètre : environnement, lieux, ressources, relations, événements canoniques, souvenirs, mort, deuil, LLM/OpenRouter, UI avancée avec graphiques, `forkFromStopped`.

## 2. Correction de l'audit précédent

Les vérifications directes dans le code imposent plusieurs corrections à la recommandation initiale.

| Point | Recommandation précédente | Correction retenue | Raison vérifiée dans le code |
|---|---|---|---|
| Worker | Étendre `simulation.worker.ts` avec un message `compute-tick` | **Ajouter un second worker dédié** `tick-compute.worker.ts` ; le worker actuel reste planificateur | `simulation.worker.ts` gère déjà les intervalles par monde via `setInterval` ; son `handleCommand()` est synchrone. Mélanger calcul long et timer violerait « un fichier = une responsabilité » et retarderait les signaux. |
| Ordre des tranches | Calcul worker, persistance et historique dans une même phase | **Historique → persistance/verrou → worker → IPC/UI** | Le calcul asynchrone exige de séparer le verrou du monde du verrou global d'accès à SQLite. Poser les deux en même temps que le worker rendrait les régressions difficiles à isoler. |
| Table d'historique | FK `character_id → characters(id) ON DELETE CASCADE` | **Aucune FK sur `character_id`** ; FK `world_id → worlds(id) ON DELETE CASCADE` | L'historique est un audit : il doit survivre à la suppression d'une instance. La suppression d'un monde doit au contraire tout emporter. |
| Explication | `explanation_json` TEXT non compressé | **`payload_blob` BLOB zlib + hash SHA-256 + taille canonique bornée** | Le JSON complet contient 11 candidats, des motivations, des rejets, des effets et des états ; non compressé, il devient coûteux à 100 personnages et 10x. Les urgences ne sont pas dans `DecisionExplanation` actuel : elles seront ajoutées dans l'enveloppe `DecisionRecordV1`. |
| Migration | Introduire `schema_migrations` comme source de vérité | **Table `schema_migrations` complémentaire**, sans supprimer les `PRAGMA table_info` existants | Les bases legacy n'ont pas cette table ; la compatibilité doit rester fondée sur l'inspection réelle du schéma. |
| Persistance | `temp + rename` après `COMMIT` | **`COMMIT` puis écriture atomique, avec restauration de l'état mémoire depuis un export précédent en cas d'échec** | `stepSimulation()` fait aujourd'hui `COMMIT` puis `persist(db)`. Si `persist()` échoue, la base mémoire est déjà modifiée : il faut pouvoir revenir en arrière. |
| Refactorisation | Découper en plusieurs services dans la même tranche que le worker | **Façade `world-store.service.ts` conservée, modules extraits tranche par tranche** | IPC, tests et manager importent actuellement cette façade ; un big bang casserait la compatibilité. |
| UI | Afficher l'historique immédiatement | **UI en dernière tranche**, avec throttle et abonnement limité | Le renderer met déjà à jour statut et horloge via `simulation:status-changed`, mais ne recharge ni les personnages ni l'historique. Le throttle 500 ms ne s'applique qu'à ces rechargements. |
| `getWorld()` | Considéré comme lecture | **Écriture réelle de `last_opened_at` + `updated_at` + `persist()`** | Toute opération dite « lecture » peut écrire ; le verrou global doit donc couvrir ce chemin. |
| Verrous | Verrou global seul | **Ordre de verrou unique : verrou du monde puis verrou global d'écriture** | Le manager DETIENT déjà le verrou par monde autour des commandes/ticks. Inverser l'ordre pour la suppression créerait un risque d'interblocage. Le nettoyage de `worldLocks` comparait une promesse chaînée et ne supprimait pas l'entrée : corrigé en 3D-B. |
| Erreurs worker | « Remonter à l'IPC » | **Step manuel : rejet IPC. Tick automatique : journalisation main, aucun état écrit, statut inchangé** | Un signal du planificateur n'a pas d'appelant IPC à qui renvoyer une erreur. |

### 2.1 Arbitrages définitifs de l'audit 3D-C (2026-11-26)

| Point | Décision définitive | Raison vérifiée |
|---|---|---|
| P1 — Verrouillage des écritures | Le **verrou du monde couvre toute opération IPC qui modifie un monde, ses personnages ou ses instances** ; l'ordre reste monde → global. | Le verrou global sera relâché pendant l'attente du worker. Sans verrou monde, une écriture concurrente pourrait s'appliquer sur un snapshot devenu périmé. |
| P2 — Checksum | Le checksum du protocole utilise **exactement le noyau Golden Hash historique**, qui exclut `decisionRecords`. | Préserve les 18 hashes de référence et distingue le checksum de transport du `payloadSha256` de l'historique. |
| P3 — Canonicaliseur | `canonicalize()` et `collectRuleIds()` sont extraits dans un **module partagé pur, sans dépendance Node** ; `decision-record.service.ts` conserve ses exports actuels. | Les règles et utilitaires partagés restent indépendants d'Electron/Node ; façade, imports et tests existants ne cassent pas. |
| P5 — Suppression | Poser le **tombeau et annuler immédiatement les `pendingComputes` avant d'attendre les verrous**. | Aucune réponse tardive ne peut valider un tick pour un monde supprimé, même si le calcul est encore en attente. |
| P6 — Origine du tick | Marqueur interne `origin: 'auto' \| 'manual'` ; erreur manuelle propagée à l'IPC, erreur automatique journalisée sans écriture ni modification de statut. | Préserve les comportements publics sans ajouter de canal IPC. |
| P7 — Workers | Séparation stricte entre le planificateur existant et le worker de calcul ; la consultation du statut **ne recrée jamais le worker de calcul**. | Évite de retarder les signaux de planification et de confondre deux durées de vie distinctes. |
| P8 — Timeout | Constante fixe de **30 s**, sans nouvelle surface de configuration ; toute entrée `pending` est retirée avant le rejet, doublons et réponses tardives ignorés. | Cohérent avec les timeouts de verrous déjà présents (30 s), sans paramètre utilisateur supplémentaire. |
| Golden Hash | Les **18 scénarios historiques restent dans la suite ordinaire** ; la matrice complète profils × effectifs × horizons est exécutée dans le **test long isolé**. | Non-régression rapide à chaque validation et couverture exhaustive séparée du coût. |

Ces décisions sont définitives pour la Phase 3D ; cette mission documentaire ne prend aucune nouvelle décision architecturale.

Aucune suppression de champ ou de contrat n'est proposée dans cette phase. Les champs actuellement sans effet ou non interprétés sont **conservés** : `CharacterTickInput.seed`, `maxRngDrawsPerCharacterTick`, `caps.healthLoss`, `lastProcessedOrder` (validé et persisté, mais non utilisé par les règles), les `goals` de `GoalSelectionInput` (lus mais dont le libellé n'est pas interprété) et les messages `start`/`step` du worker (implémentés mais jamais envoyés par le manager). `world.seed` et `projectedEmotions` sont déjà utilisés dans le code réel et ne sont pas concernés par cette liste. Toute activation ou tout retrait fera l'objet d'une décision séparée et justifiée.

## 3. Architecture retenue

```mermaid
flowchart LR
    UI[Renderer React] -->|IPC limité| PRE[Preload contextBridge]
    PRE --> IPC[ipcMain.handle]
    IPC --> MGR[Simulation Manager]
    IPC --> STORE[Façade world-store]

    MGR -->|planification| SCHED[Worker planificateur]
    SCHED -->|signal tick| MGR

    MGR -->|compute-tick + snapshot| COMPUTE[Worker de calcul pur]
    COMPUTE -->|résultat + checksum| MGR

    MGR --> WLOCK[Verrou par monde]
    WLOCK --> LOCK[Verrou global d'écriture]
    STORE --> LOCK
    LOCK --> DB[(sql.js en mémoire)]
    DB --> PERSIST[Persistance atomique temp + rename]
    PERSIST --> FILE[(data/saves/worlds.sqlite)]
```

Principes :

- Le **main reste le seul propriétaire de SQLite** ; aucun worker n'ouvre le fichier ni n'appelle sql.js.
- Le worker de calcul reçoit des données sérialisables ; **les règles et les utilitaires partagés n'importent ni Electron ni Node** (arbitrage P3), et il renvoie un résultat pur. Le worker étant un `worker_threads` Node, le SHA-256 du checksum de transport peut y être calculé avec `node:crypto`, mais il est toujours recalculé dans le main : le hachage n'est pas une règle métier.
- L'ordre des verrous est toujours **monde → global**. Le verrou **monde** est détenu pendant tout le tick, y compris l'attente du worker. Le verrou **global** ne couvre que les accès SQLite : lecture du snapshot, relecture de l'horloge après calcul, transaction, export et persistance. Il est relâché pendant `await compute-tick`, afin qu'un autre monde puisse écrire.
- La transaction SQLite ne reste jamais ouverte pendant l'aller-retour worker. Le snapshot est lu sous verrou global, le calcul est attendu sous verrou monde uniquement, puis le verrou global est repris pour relire l'horloge, valider l'absence de changement, et écrire états, historique, horloge et PRNG dans une transaction courte.
- L'export `beforeBuffer` est réalisé **après la reprise du verrou global et avant `BEGIN`**, afin de pouvoir restaurer exactement l'état mémoire du moment de l'écriture si la persistance échoue après `COMMIT`. Un export pris avant le calcul serait obsolète si un autre monde a écrit entre-temps.

Références détaillées :

- [DECISION_HISTORY_SYSTEM.md](DECISION_HISTORY_SYSTEM.md)
- [WORKER_TICK_PROTOCOL.md](WORKER_TICK_PROTOCOL.md)
- [SAFE_PERSISTENCE.md](SAFE_PERSISTENCE.md)
- [WORLD_STORE_REFACTORING.md](WORLD_STORE_REFACTORING.md)
- [DECISION_INSPECTOR_UI.md](DECISION_INSPECTOR_UI.md)

## 4. Découpage en tranches

| Tranche | Objectif | Dépendances | Critère d'acceptation principal |
|---|---|---|---|
| **3D-A** | Historique des décisions : contrat `DecisionRecordV1`, table `decision_records`, écriture dans le tick actuel, validation stricte, tests | Phase 3C | Une ligne par personnage et par tick, écrite dans la même transaction que l'état ; rollback sans orphelin ; anciennes sauvegardes lisibles. **Livrée et validée.** |
| **3D-B** | Persistance sécurisée, verrou global d'écriture, refactorisation de la connexion et du schéma | 3D-A | Aucune écriture concurrente ; échec de `persist()` sans divergence mémoire/disque ; suppression de monde sérialisée. **Livrée et validée.** |
| **3D-C** | Worker de calcul dédié, protocole, validation, Golden Hash | 3D-B | Résultats byte-identiques entre calcul direct et calcul worker ; 18 Golden Hash inchangés en suite ordinaire, matrice complète en test long isolé ; aucun tick partiel. Découpage en 3D-C1 à 3D-C4 (§4.3). |
| **3D-D** | IPC de lecture, UI minimale, rafraîchissement, documentation finale | 3D-C | Aucun accès Node dans le renderer ; filtres bornés ; aucun tick ne déclenche un flux IPC non limité. |

Chaque tranche est autonome : tests, documentation, validation séquentielle (`check-deps`, typecheck, tests, build), revue du diff, commit et push sans force sur `origin/main`.

### 4.1 Tranche 3D-A — Historique des décisions

- **Objectif** : ne plus perdre les `DecisionExplanation` calculées à chaque tick et les relier aux effets appliqués.
- **Périmètre** : contrat additif, table additive, écriture/validation strictes, lecture IPC interne aux tests. Aucun changement de calcul, de worker ou de persistance fichier.
- **Fichiers livrés** : `src/shared/action.ts`, `src/shared/decision.ts`, `src/shared/simulation-rules.ts`, `src/main/services/decision-record.service.ts` (nouveau), `src/main/services/decision-history.store.ts` (nouveau), `src/main/services/character-tick.service.ts`, `src/main/services/world-store.service.ts`, `docs/DECISION_HISTORY_SYSTEM.md`, tests dédiés. `DECISION_RULES` est ajouté comme constante runtime dans `src/shared/action.ts` et remplace la copie privée de `action-runtime.service.ts`.
- **SQLite** : `decision_records`, deux index, `schema_migrations` ; aucune FK vers `characters` ; cascade depuis `worlds`.
- **Contrats/services** : `DecisionRecordPayloadV1` produit par le tick, `DecisionRecordV1` complété par le store, `CharacterTickResult.decisionRecords`, `insertDecisionRecords`, `parseDecisionRecord`, `DECISION_RULES`.
- **Dépendances** : Phase 3C livrée.
- **Tests** : sérialisation, hash, bornes, compression, migration legacy, rollback, une ligne par personnage/tick, cascade monde, conservation après suppression d'instance avec insertion directe de test, mesure de taille.
- **Acceptation** : 215 tests existants toujours verts avant ajout ; 37 nouveaux tests verts (252 au total) ; aucune divergence entre `decisions` et `decisionRecords` ; aucune ligne orpheline après rollback injecté ; Golden Hash 18 scénarios inchangé ; check-deps, typecheck 4 configs et build OK.
- **Risques/prévention** : volume → compression et mesure ; corruption → version/hash/bornes ; régression calcul → Golden Hash de référence conservé dans les tests.
- **Exclusions** : worker, verrou global, UI IPC, purge, événements Phase 5.

### 4.2 Tranche 3D-B — Persistance et verrous

- **Objectif** : rendre la persistance atomique au niveau fichier et réversible en mémoire, puis sérialiser toutes les écritures.
- **Périmètre livré** : export avant mutation, transaction courte, `temp + fsync + hash + rename`, restauration mémoire, verrou global, correction du nettoyage de `worldLocks`, suppression de monde atomique. Le CRUD reste dans la façade, déjà verrouillée.
- **Fichiers livrés** : `database-connection.service.ts`, `database-schema.service.ts`, `persistence.service.ts`, `db-write-lock.service.ts`, `world-store.service.ts`, `world.ipc.ts`, `simulation-manager.service.ts`, tests. Les modules `world-crud.service.ts`, `character-crud.service.ts` et `simulation-clock.service.ts` restent reportés pour préserver la façade.
- **SQLite** : aucun changement de schéma ; migration `3D-1` déjà posée en 3D-A.
- **Contrats/services** : `withDbWrite<T>()`, `atomicPersist(path, buffer)`, `restoreDatabaseFromBuffer()`, `simulationDeleteWorld()`.
- **Dépendances** : 3D-A.
- **Tests** : échec avant/après `COMMIT`, hash invalide, `rename` impossible, temporaire résiduel, restauration octet pour octet, deux mondes concurrents, suppression pendant tick, files et timeouts, 21 tests dédiés. Les benchmarks 10/50/100 restent un outil local exclu des validations.
- **Acceptation vérifiée** : aucun écart mémoire/disque après échec injecté ; ordre des verrous toujours monde → global ; suite **264/264**, test long isolé **9/9**, typecheck 4 configs et build OK.
- **Risques/prévention** : interblocage → ordre unique documenté et testé ; Windows → erreur dure ; gros diff → une responsabilité par module.
- **Exclusions** : worker de calcul, UI, changement de moteur SQLite, WAL, compression générale de la base, optimisations de persistance.

### 4.3 Tranche 3D-C — Worker de calcul (découpage définitif)

- **Objectif** : déplacer uniquement le calcul pur du tick hors du thread principal, sans changer une seule valeur calculée.
- **Périmètre global** : second worker, protocole versionné `protocolVersion = 1`, corrélation par `requestId`, validation complète dans le main, verrou monde étendu, annulation à la suppression, Golden Hash préservé. Aucune transaction dans le worker, aucun changement de schéma SQLite, aucun canal IPC ni changement UI.
- **Règle de production** : aucun mode hybride. Depuis 3D-C3, le calcul du tick passe par le worker de calcul ; `stepSimulation()` du store reste la référence synchrone pour les tests de parité uniquement, jamais comme repli en production.
- **Découpage validé** :

| Sous-tranche | Contenu | Critère d'acceptation |
|---|---|---|
| **3D-C1 — Fondations contractuelles** | `src/shared/worker-protocol.ts` (nouveau) avec `ComputeTickRequest`, `ComputeTickResponse`, versions et validateurs purs ; extraction de `canonicalize()`, `collectRuleIds()` et de la sérialisation du noyau Golden Hash dans un module partagé sans Node, avec réexports depuis `decision-record.service.ts` ; extraction de `tick-writer.service.ts` derrière la façade inchangée, encore appelé **synchrone** par `stepSimulation()`. | Protocole validé (versions, champs, erreurs) ; un seul canonicaliseur de production et un seul noyau Golden Hash partagés ; 18 Golden Hash inchangés ; façade et hooks `_...ForTests` inchangés ; aucun fichier IPC/UI/schéma modifié. |
| **3D-C2 — Worker autonome** | `src/main/simulation/tick-compute.worker.ts` (nouveau), résolution du chemin du second worker, harnais `worker_threads` avec point d'injection contrôlé, réponses `result`/`error`, checksum sur le noyau Golden Hash. À cette sous-tranche, la production utilisait encore le calcul direct ; le branchement est réalisé en 3D-C3. | Messages valides/invalides et versions inconnues rejetés ; entrée identique → sortie identique ; aucun état résiduel entre requêtes ; checksum identique côté main et aux 18 hashes ; aucun SQLite, IPC ni fichier ouvert par le worker. |
| **3D-C3 — Intégration et verrous** | `pendingComputes`, compteur `requestId`, timeout fixe 30 s, doublons/tardifs ignorés, gestion `error`/`exit`, recréation paresseuse, marqueur `origin: 'auto' \| 'manual'`, annulation immédiate à la suppression, scission de `stepSimulation()` en snapshot sous global / attente sous verrou monde / reprise globale avec `expected`, `before`, transaction courte et persistance. | Aucune écriture concurrente du même monde ; aucun tick partiel ; suppression pendant calcul sans écriture tardive ; timeout et crash rejettent l'IPC manuelle sans laisser `ipcMain.handle` sans réponse ; erreur automatique sans écriture ni changement de statut ; relecture d'horloge et restauration 3D-B intactes. |
| **3D-C4 — Documentation et validation finale** | Mise à jour des documents concernés, puis séquence complète : check-deps → typecheck 4 configs → tests ciblés → suite complète → test long isolé → build → revue du diff. | 18 Golden Hash ordinaires verts et matrice complète en test long isolé ; suite complète verte ; build OK ; aucun secret ni fichier généré versionné ; commit et push sans force. |

- **Statut des sous-tranches (2026-11-27)** : 3D-C1 **livrée**, 3D-C2 **livrée**, 3D-C3 **livrée** (client de calcul, `pendingComputes`, verrous, origine, suppression sécurisée), 3D-C4 **livrée** (documentation et validation finale). Le client de calcul isolé dans `src/main/simulation/tick-compute-client.service.ts` est le seul point d'injection production du worker ; aucun repli synchrone n'est prévu.
- **Validation** : 3D-C3/C4 ont été validées par check-deps, typecheck 4 configs, suite complète, Golden Hash, matrice longue isolée et build, puis livrées sur `origin/main` sans force. 3D-D reste à valider séparément avant tout démarrage.
- **Exclusions globales** : SQLite dans le worker, LLM, événements Phase 5, compression des résultats, optimisation opportuniste de la persistance.

### 4.4 Tranche 3D-D — IPC et interface minimale

- **Objectif** : rendre l'historique consultable sans surcharger l'IPC ni exposer Node au renderer.
- **Périmètre** : deux canaux de lecture, filtres bornés, action courante, dernières actions, inspecteur, rafraîchissement après changement de tick.
- **Fichiers prévus** : `src/shared/ipc.ts`, `src/preload/preload.ts`, `src/main/ipc/decision.ipc.ts` (nouveau), quatre composants renderer (`DecisionInspector.tsx`, `DecisionFilters.tsx`, `DecisionSummaryList.tsx`, `DecisionDetailView.tsx`), `WorldView.tsx`, `CharacterDetail.tsx`, tests UI/IPC, documentation.
- **SQLite** : aucun changement de schéma.
- **Contrats/services** : `DecisionHistoryQuery`, `DecisionSummaryView`, `getDecisionHistory`, `getDecisionRecord`.
- **Dépendances** : 3D-C.
- **Tests** : validation des bornes de requête, filtres monde/personnage/tick, absence de BLOB brut, charger/erreur/vide, throttle, désabonnement, absence de `ipcRenderer`/Node dans le renderer.
- **Acceptation** : zéro accès Node dans le renderer ; `limit <= 500` ; une recharge au plus toutes les 500 ms ; aucun événement IPC par personnage.
- **Risques/prévention** : surcharge → throttle et demande à la sélection ; données périmées → jeton de requête ; régression UI → tests Testing Library.
- **Exclusions** : graphiques Recharts, historique temps réel par personnage, filtres textuels, purge, export/import.

## 5. Décisions techniques

### 5.1 Historique complet ou sélectif ?

**Retenu : une ligne complète mais compacte et compressée par décision.** Le stockage sélectif (seulement les décisions « notables ») est rejeté pour cette phase : il casserait la promesse d'explicabilité intégrale et rendrait les tests de rejeu dépendants d'un filtre arbitraire.

Le compromis est apporté par la compression zlib du JSON canonique et par des colonnes de requête séparées. L'UI n'affiche qu'une fenêtre glissante, mais le stockage complet est conservé.

### 5.2 Format et versionnement

`DecisionRecordV1` est un contrat additif : il enveloppe le `DecisionExplanation` existant sans le casser et ajoute ce qui manque aujourd'hui — urgences, versions, états avant/après, avertissements, runtime avant/après, somme de contrôle et identifiant stable.

Correction apportée avant implémentation : le calcul pur produit `DecisionRecordPayloadV1`, sans horloge ni hash. Le store ajoute `createdAt`, `payloadSha256` et `uncompressedBytes` pour obtenir `DecisionRecordV1`. Ainsi les résultats Phase 3C restent byte-identiques à entrées égales.

Chaque enregistrement porte :

- `id` déterministe au format `${worldId}:${tick}:${characterId}` ;
- `recordVersion: 1` ;
- `engineVersion: 'phase3d.1'`, `registryVersion`, `parametersVersion` ;
- `ruleIds` explicites : union triée de `decision.v1`, `goal.immediate.v1`, `ruleId` des deltas et `ruleId` des effets d'action ;
- `payloadSha256` calculé sur le JSON canonique du `DecisionRecordPayloadV1` avant compression. Le BLOB contient le JSON canonique du `DecisionRecordV1` complet, compressé et vérifié à la lecture ;
- `uncompressedBytes` mesurant le JSON canonique de la charge utile seule, sans référence circulaire ni dépendance à `createdAt`.

La lecture est **stricte** : version inconnue, hash invalide, action inconnue, valeur hors bornes ou JSON invalide = erreur technique exposée à l'IPC, jamais une réparation silencieuse.

### 5.3 Taille maximale d'une explication

- JSON canonique : cible < 16 KiB, **rejet dur au-delà de 64 KiB**.
- BLOB compressé : cible < 4 KiB, **rejet dur au-delà de 16 KiB**.

Ces limites sont des garde-fous de corruption, pas des seuils de gameplay. Elles doivent être testées avec 11 candidats, 19 motivations et 3 objectifs immédiats, c'est-à-dire le pire cas structurel actuel.

### 5.4 Rétention

Aucune purge automatique n'est prévue en 3D : la suppression de données d'audit contreviendrait à la règle « ne jamais perdre les données d'une simulation ». La rétention est donc :

- stockage : complet ;
- affichage : fenêtre de 500 entrées maximum, filtrable ;
- futur : export/archivage explicite par monde, à décider séparément.

Une politique de purge calculée sur un nombre de ticks reste une question ouverte si les simulations 10x/100 personnages deviennent un usage réel.

### 5.5 Calcul intégral ou progressif dans le worker ?

**Retenu : worker dédié et calcul intégral du tick, mais introduit seulement en 3D-C.** Le worker planificateur existant ne change pas de responsabilité. Le déplacement est « progressif » dans le temps, pas partiel dans les règles : un tick est soit entièrement calculé dans le main (3D-A/B), soit entièrement calculé dans le worker (3D-C). Aucun scénario hybride n'est accepté, car il rendrait le Golden Hash ambigu.

### 5.6 Erreurs et redémarrage du worker

- Chaque requête possède un `requestId` monotone local au manager ; aucun UUID n'est nécessaire et aucun aléa n'entre dans la simulation.
- Une table `pendingComputes` corrèle requêtes et réponses ; l'entrée est **retirée avant le rejet** sur timeout, `error`, `exit` ou annulation.
- Délai d'attente **fixe de 30 s** (arbitrage P8) : aucune surface de configuration n'est ajoutée. Les timeouts du verrou du monde et de la file d'écriture restent indépendants, à 30 s.
- Réponse tardive, doublon ou `worldId`/`tick` inattendu : ignorée après journalisation, jamais persistée.
- `worker.on('error')` et `worker.on('exit')` rejettent toutes les requêtes en attente et vident la map ; aucun tick n'est rejoué automatiquement. Le worker de calcul est recréé automatiquement au prochain signal de tick ou à la prochaine commande active qui en a besoin (`step` manuel) ; un simple `simulationGetStatus()` ne le recrée pas (arbitrage P7).
- Erreur de calcul sur `step` manuel : rejet de l'appel IPC. Sur tick automatique : journalisation dans le main, aucun état écrit, statut inchangé en valeur, aucun retry automatique (arbitrage P6).
- Les horodatages de diagnostic ne sont jamais utilisés comme entrée des règles ni comme clé de requête.

### 5.7 Verrous et suppression concurrente

Deux verrous distincts sont nécessaires :

- le **verrou du monde** couvre toute opération ciblant un monde, y compris un tick avec attente du worker ;
- le **verrou global d'écriture** couvre uniquement les accès à la base SQLite partagée.

L'ordre est toujours **monde → global** quand les deux sont nécessaires. Le verrou global n'est **pas** détenu pendant `await compute-tick` : il bloquerait les écritures des autres mondes pendant jusqu'à 30 s. Le tick le reprend après le calcul pour relire l'horloge, valider l'absence de changement, exporter `beforeBuffer`, écrire et persister. Le verrou du monde garantit qu'aucune opération du même monde ne modifie la base pendant le calcul.

Toute opération qui peut écrire un monde — y compris `getWorld()` (`last_opened_at`), le CRUD personnage et l'instanciation de modèle via leurs handlers IPC — doit prendre le verrou du monde avant le verrou global (arbitrage P1). **Aucune écriture ciblant un monde ne peut intervenir pendant le calcul d'un tick de ce même monde.** Les opérations purement globales, comme la récupération des horloges au démarrage, prennent seulement le verrou global.

La suppression d'un monde doit être séquencée dans cet ordre (arbitrage P5) :

1. **dès l'appel `simulationDeleteWorld()`, avant toute attente de verrou** : poser le tombeau `deletedWorldIds` et annuler les `pendingComputes` du monde (retrait des entrées puis rejet des promesses) ;
2. prendre le verrou du monde, ce qui attend la fin du tick en cours et empêche tout nouveau tick ;
3. arrêter la planification du monde et nettoyer `activeTickWorlds` ;
4. prendre le verrou global d'écriture ;
5. supprimer les lignes SQLite et persister la base dans la même section verrouillée ;
6. nettoyer la map des verrous, puis relâcher le verrou global puis le verrou du monde.

Aucune réponse tardive, y compris après timeout, ne peut valider un tick : le tombeau et l'absence d'entrée dans `pendingComputes` sont contrôlés avant validation et avant `BEGIN`. L'annulation ne dépend pas de l'acquisition du verrou monde, ce qui évite qu'un timeout laisse un calcul encore pending.

Le nettoyage de `worldLocks` est correct depuis la tranche 3D-B : la map stocke la promesse chaînée réellement comparée (`const chained = previous.then(() => current, () => current); worldLocks.set(worldId, chained); … if (worldLocks.get(worldId) === chained) worldLocks.delete(worldId);`). La variante sans gestion du rejet de la promesse précédente (`previous.then(() => current)`) n'est pas retenue, car elle laisserait un waiter bloqué si le titulaire précédent échoue.

Le handler IPC `WORLD_DELETE` ne doit plus appeler `simulationClearWorld()` après coup. Un helper manager dédié, par exemple `simulationDeleteWorld()`, garantit cet ordre. Le comportement public `deleteWorld()` reste disponible comme service interne.

### 5.8 Écriture asynchrone et remplacement atomique

Séquence retenue dans `SAFE_PERSISTENCE.md` : reprise du verrou global, relecture de l'horloge, export `beforeBuffer`, transaction courte, `db.export()` en `afterBuffer`, écriture dans `worlds.sqlite.tmp`, `fsync`, vérification SHA-256, `rename` atomique, puis restauration depuis `beforeBuffer` si une étape échoue.

- Linux/macOS : `rename` remplace le fichier cible de façon atomique.
- Windows : `fs.rename()` est utilisé avec le même contrat ; en cas d'échec dû à un verrou antivirus ou à un fichier ouvert, l'erreur est **dure**, sans repli silencieux par copie partielle.
- Un fichier temporaire résiduel au démarrage est supprimé : il n'est jamais une source de vérité.

### 5.9 Découpage de `world-store.service.ts`

Façade conservée, modules extraits sans changer les imports publics :

```text
database-connection.service.ts   SQL.js, chemin, cycle de vie, restauration
database-schema.service.ts       CREATE TABLE, migrations, schema_migrations
db-write-lock.service.ts         mutex global d'écriture
persistence.service.ts           temp, fsync, hash, rename, cleanup
world-crud.service.ts            mondes
character-crud.service.ts        instances et modèles
simulation-clock.service.ts      horloge et statuts
tick-writer.service.ts           snapshot, écriture tick + historique
decision-history.store.ts        insertion et lecture strictes
world-store.service.ts           façade de ré-export
```

### 5.10 Rafraîchissement UI sans surcharge IPC

L'événement `simulation:status-changed` existe déjà et contient `clock.tick`. L'UI doit :

- ne rien charger si le tick n'a pas changé ;
- rafraîchir la liste des personnages au plus une fois par intervalle minimal (valeur initiale proposée : 500 ms) ;
- ne charger l'historique que pour le personnage sélectionné, avec `limit` borné ;
- ne pas créer d'événement IPC par personnage ;
- utiliser un jeton local pour ignorer une réponse arrivée après un changement de filtre ou de sélection.

Deux canaux de lecture suffisent : un résumé d'historique filtrable et un enregistrement complet par `id`. Voir [DECISION_INSPECTOR_UI.md](DECISION_INSPECTOR_UI.md).

## 6. Garanties à préserver

- Déterminisme : mêmes seed, entrées, paramètres et versions = mêmes résultats.
- Même ordre de traitement : tri lexicographique par `characterId`, inchangé.
- Aucun `Math.random()` ni `Date.now()` dans les règles ; horodatages réservés aux métadonnées de persistance.
- PRNG inchangé : uint32 sérialisé, au plus un tirage en ex æquo réel, tracé avant/après.
- Atomicité : états, horloge, PRNG, runtime et historique dans la même transaction, avec relecture de l'horloge après le calcul.
- Rollback complet sur erreur de calcul, d'écriture ou de validation ; aucune écriture différée ne peut s'appliquer après suppression d'un monde.
- Isolation par `world_id` sur toutes les tables.
- Compatibilité additive des anciennes sauvegardes.
- Aucun accès SQLite ou Node depuis le renderer.
- Aucun réseau ni LLM dans le moteur de décision.
- Golden Hash : comparer ancien calcul direct et nouveau calcul worker sur plusieurs seeds, profils (6 profils existants), effectifs 1/2/10/50 et horizons 24/72/168/720 ticks. Les **18 scénarios historiques restent dans la suite ordinaire** ; la matrice complète est exécutée dans le **test long isolé**. Le checksum du protocole utilise le même noyau, qui exclut `decisionRecords` (arbitrage P2).

## 7. Croissance estimée du stockage

Hypothèse conservatrice : ~8 KiB de JSON canonique par décision, ~1,5 KiB après compression. Le tick vaut 1 h simulée, soit 24 ticks par jour simulé. Le code réel fixe `SIMULATION_MS_PER_TICK_AT_1X = 60_000` : 1x = 1 tick/minute, 10x = 1 tick/6 s, soit respectivement 1440 et 14400 ticks par jour réel.

| Personnages | Par jour simulé (24 ticks) | À 1x (1440 ticks/jour réel) | À 10x (14400 ticks/jour réel) |
|---:|---:|---:|---:|
| 10 | ~360 KiB | ~22 MiB | ~216 MiB |
| 50 | ~1,8 MiB | ~108 MiB | ~1,1 GiB |
| 100 | ~3,6 MiB | ~216 MiB | ~2,2 GiB |

Ces ordres de grandeur justifient la compression, les index et l'absence de purge implicite.

**Mesures réelles (3D-A)**, après un tick avec la génération aléatoire par défaut (10/50/100 personnages, un enregistrement chacun) :

| Personnages | Enregistrements | BLOB total | BLOB moyen | BLOB min/max | Charge utile canonique moyenne |
|---:|---:|---:|---:|---:|---:|
| 10 | 10 | 47 592 o | 4 759,2 o | 4 641 / 4 931 o | 42 231,7 o |
| 50 | 50 | 237 752 o | 4 755,0 o | 4 386 / 5 069 o | 41 872,8 o |
| 100 | 100 | 404 895 o | 4 048,9 o | 3 381 / 5 136 o | 38 086,8 o |

La charge utile canonique réelle (~38–42 Ko) est supérieure à l'hypothèse de 8 Ko, mais la compression la ramène à ~4 Ko par décision. Aucune purge n'est introduite pour autant : la limitation opérationnelle identifiée est ailleurs. `persist()` réexporte l'intégralité de la base à chaque tick, si bien que le coût par tick croît avec l'historique déjà stocké (mesuré en 3D-A de ~52 ms à ~157 ms pour 3 personnages entre les ticks 25 et 200 ; benchmarks 3D-B locaux : 63,68 ms au tick 10 et 377,56 ms au tick 200 pour 3 personnages, 548,45/1 329,12/1 652,77 ms pour 10/50/100 personnages). Aucune mesure 3D-A comparable à effectif égal ne permet de conclure à une amélioration. La tranche 3D-B est livrée, mais le coût reste ouvert : voir [DECISION_HISTORY_SYSTEM.md](DECISION_HISTORY_SYSTEM.md) §7 et [SAFE_PERSISTENCE.md](SAFE_PERSISTENCE.md) §10.

## 8. Risques principaux

| Risque | Prévention |
|---|---|
| Divergence déterministe lors du passage au worker | Golden Hash, contrat de calcul unique, aucun hybride, validation stricte des entrées. |
| Chevauchement d'écritures pendant l'attente worker | Verrou monde étendu à toute écriture IPC ciblant un monde, verrou global limité aux accès SQLite, relecture de l'horloge avant écriture, `worldLocks` corrigé. |
| Deux canonicaliseurs / trois notions de hash | Un seul noyau Golden Hash partagé pour le checksum, `payloadSha256` réservé à l'historique, réexports de la façade conservés. |
| Réponse tardive après suppression | Tombeau et annulation avant verrous, `pendingComputes` retiré avant rejet, contrôle avant `BEGIN`. |
| Échec de disque après `COMMIT` | Export initial conservé, restauration de la base mémoire, erreur remontée sans réparation tacite. |
| Corruption d'une explication | Version, hash, bornes de taille, parse strict, erreur technique. |
| Croissance SQLite rapide | Compression, index, fenêtre UI, mesure à 10/50/100 personnages, décision de rétention explicite. |
| Refactorisation cassant les imports | Façade stable, extraction incrémentale, tests d'intégration existants rejoués à chaque tranche. |
| Surcharge IPC | Throttle, filtres bornés, un seul canal résumé + un canal détaillé. |
| Régression Windows | Tests `rename` sur cible existante, erreur explicite en cas de verrou, aucun repli silencieux. |

## 9. Avis indépendant

Le découpage proposé est le plus sûr, mais il n'est pas le plus court. La tranche 3D-A est celle que je recommande de commencer : elle apporte une valeur immédiate — les décisions sont enfin conservées — sans modifier l'exécution du tick ni introduire de concurrence. Elle permet aussi de mesurer la taille réelle des explications avant de figer la compression et la rétention.

Une architecture alternative consisterait à déplacer toute la base SQLite dans le worker de calcul. Elle serait plus homogène à long terme, mais elle imposerait de refaire toute la couche IPC/store et rendrait le Golden Hash beaucoup plus difficile à isoler. Elle n'est pas retenue pour la Phase 3D.

La principale erreur serait de faire marcher le worker et la persistance en parallèle avant d'avoir séparé le verrou du monde du verrou global d'accès à SQLite : on obtiendrait un système plus rapide en apparence, mais non reproductible sous charge et potentiellement incohérent après une panne.

## 10. Décisions validées

1. **Rétention** : aucune purge automatique en 3D. Les mesures de 3D-A restent utiles pour une décision produit ultérieure, mais aucune suppression automatique n'est introduite.
2. **Archivage/export** : aucun système d'export ou d'archivage dans 3D-A ; le format éventuel d'un export manuel reste une décision séparée.
3. **Timeout worker** : **30 s**, valeur fixe retenue pour 3D-C, sans surface de configuration ni implémentation dans 3D-A/3D-B.
4. **Identifiant de moteur** : `engineVersion = 'phase3d.1'` est la valeur initiale. Stratégie de versionnement : incrémenter le segment mineur (`phase3d.2`, …) pour tout changement de forme du payload ou de sémantique des champs ; un changement de règles de calcul qui modifie le contenu sans changer la forme conserve la version mais doit être couvert par un nouveau Golden Hash ; toute nouvelle version doit être ajoutée à la liste des versions acceptées par le lecteur, sans réécriture des anciens enregistrements.
5. **Verrouillage des écritures (P1)** : verrou du monde sur toute opération IPC modifiant un monde, ses personnages ou ses instances ; ordre monde → global ; aucune écriture du même monde pendant le calcul d'un tick.
6. **Checksum (P2)** : définition historique du noyau Golden Hash, sans `decisionRecords`, utilisée par le protocole worker ; les 18 hashes restent la référence de la suite ordinaire.
7. **Canonicaliseur (P3)** : extraction en module partagé pur, sans Node ; `decision-record.service.ts` conserve ses exports.
8. **Suppression (P5)** : tombeau et annulation des calculs `pending` immédiats, avant l'attente des verrous.
9. **Origine du tick (P6)** : marqueur interne `origin: 'auto' | 'manual'`, sans nouveau canal IPC ; step manuel rejette l'IPC, tick automatique journalise sans écriture ni changement de statut.
10. **Workers (P7)** : séparation stricte planificateur/calculateur ; `simulationGetStatus()` ne recrée jamais le worker de calcul.
11. **Timeout et concurrence (P8)** : constante 30 s ; entrée `pending` retirée avant rejet ; doublons et réponses tardives ignorés ; aucun retry automatique.
12. **Golden Hash** : 18 scénarios historiques en suite ordinaire ; matrice complète 6 profils × 1/2/10/50 personnages × 24/72/168/720 ticks en test long isolé.

Aucune de ces décisions n'autorise un appel réseau, une modification de l'UI, un changement de schéma SQLite ou un benchmark. Le calcul a été déplacé hors du main uniquement dans la tranche 3D-C3 validée ; 3D-C1 et 3D-C2 avaient respecté la limite en livrant le worker sans branchement. 3D-D reste soumise à une validation explicite distincte.

## 11. Références

- [AGENTS.md](../AGENTS.md)
- [PROGRESS.md](../PROGRESS.md)
- [HANDOFF.md](../HANDOFF.md)
- [DATABASE.md](DATABASE.md)
- [ARCHITECTURE.md](ARCHITECTURE.md)
- [AUTONOMOUS_DECISION_SYSTEM.md](AUTONOMOUS_DECISION_SYSTEM.md)
- [CHARACTER_TICK_RULES.md](CHARACTER_TICK_RULES.md)
