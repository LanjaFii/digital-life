# HANDOFF.md — Transfert de contexte

## Où en est le développement

- **Branche** : `main`, remote `git@github.com:LanjaFii/digital-life.git`.
- **HEAD avant implémentation 3D-B** : `a64d483d46984eeef859cf40cec674575b9ec36c`, identique à `origin/main`, arbre propre (la conception documentaire 3D avait démarré à `276384e`).
- **Tranche courante** : **Phase 3D-B — persistance atomique et verrous implémentée et validée**. 3D-C et 3D-D restent conçues mais non implémentées et nécessitent une validation explicite distincte chacune. Aucun preload, renderer, worker de calcul, appel LLM, schéma, PRNG, Golden Hash ni canal IPC ajouté par 3D-B ; seul le comportement de `WORLD_DELETE` a changé dans le handler existant.
- **État moteur réel** : horloge/PRNG sérialisable, tick SQLite atomique, évolution passive
  déterministe des 8 besoins et 10 émotions **puis** objectifs immédiats, scoring, décision,
  effets numériques et runtime persistés. Les artefacts du résultat (`decisions`,
  `actionDeltas`, `actionRuntimeStates`, `deltas`, `warnings`) sont remplis et, depuis 3D-A,
  **une ligne complète par décision est persistée** dans `decision_records`. Depuis 3D-B,
  toute mutation passe par une file globale et le fichier SQLite est écrit par
  `temp + fsync + SHA-256 + rename`, avec restauration mémoire depuis le dernier état disque
  validé en cas d'échec avant `rename`. Aucun environnement, lieu, objet, ressource partagée,
  relation, événement, souvenir, mort ni dialogue n'existe.

## Ce qui vient d'être réalisé (Phase 3C — documentaire)

- `docs/AUTONOMOUS_DECISION_SYSTEM.md` : audit Git/code, cycle complet, snapshot et
  équité multi-personnages, scoring, sélection finale, protocole PRNG, explicabilité,
  adaptation, découpe en six services purs, contrats proposés, compatibilité transactionnelle,
  politique `simulation_stopped`, scénarios et critères de détection.
- `docs/ACTION_SYSTEM.md` : catalogue extensible (11 actions dont `idle`), classement
  Tier A immédiatement réalisable / Tier B nécessitant un environnement futur,
  préconditions, effets nominaux, coûts, traits, machine à états des actions longues,
  interruption, échec, cooldown, registre extensible, contrats proposés.
- `docs/GOAL_SELECTION_SYSTEM.md` : urgences des besoins et émotions, motivations,
  objectifs immédiats non persistés, non-interprétation de `CharacterGoal.label`,
  hystérésis reportée, extension `CharacterGoalV2` reportée, contrats proposés.
- `docs/SIMULATION_ENGINE.md` : encart précisant que le cycle 16 étapes reste [Planifié]
  et renvoyant vers les trois documents Phase 3C.
- `PROGRESS.md`, `HANDOFF.md`, `CHANGELOG.md`, `README.md` mis à jour.

## Ce qui vient d'être réalisé (Phase 3C — tranche 1)

- `src/shared/action.ts` : types du catalogue (11 actions), préconditions dont `any_of`,
  effets, runtime sérialisable, `DecisionRule` étendu de `action_failed`, valeur par défaut
  du runtime.
- `src/shared/decision.ts` : motivations, objectifs immédiats, composantes de score,
  `ScoredCandidate`, `DecisionExplanation`, `DecisionResult`.
- `src/shared/simulation-rules.ts` : `AutonomousDecisionSnapshot`, `DecisionParameters`,
  entrées/sorties additives du tick, cause `action_effect`.
- `src/main/services/simulation-parameters.service.ts` : paramètres de décision par défaut
  (`emotionWeight = 10` : hypothèse de calibration documentée).
- `src/main/services/action-registry.service.ts` : catalogue Tier A/Tier B, validation
  stricte, lookup, listes déterministes.
- `docs/AUTONOMOUS_DECISION_SYSTEM.md` §12.4 : recette complète de `forkFromStopped`
  (nouveau monde et nouvelles lignes, source intacte, horloge/rngState copiés, branche
  en pause, transaction unique). **Non implémenté, non exposé, à valider par le produit.**
- `tests/action-registry.test.ts` : 10 tests du catalogue.
- Validations : check-deps OK, typecheck 4 configs OK, tests **158/158** (16 fichiers).

## Ce qui vient d'être réalisé (Phase 3C — tranche 2)

- `src/main/services/goal-selection.service.ts` : criticités des besoins, direction des
  émotions, pressions avec tendance, signal circadien, regroupement en objectifs immédiats.
- `src/main/services/action-candidacy.service.ts` : toutes les préconditions évaluées depuis
  le snapshot ; Tier B toujours rejeté ; `idle` toujours faisable.
- `src/main/services/action-scoring.service.ts` : score borné `[-5, 5]` quantifié à 3
  décimales, `idle = 0`, répétition et durée pénalisées, bonus nuit pour `sleep`.
- `src/main/services/decision-engine.service.ts` : poursuite, interruption (4 conditions),
  échec, `forced_idle`, départage `id` ou PRNG (1 tirage maximum), explication complète.
- `src/main/services/action-runtime.service.ts` : parse strict, sérialisation, transitions,
  cooldowns, historique borné, compteur d'interruption.
- `src/main/services/action-execution.service.ts` : gains bornés par la marge, baseline des
  émotions négatives, trait multiplier, quantification unique, `ActionEffectDelta`, refus des
  effets non numériques.
- `tests/phase3c-fixtures.ts` et six fichiers de test : **51 tests**, scénarios affamé,
  anxieux, sociable/indépendant, coûts critiques, répétition, nuit, cooldown, départage
  rejouable, poursuite, interruption, échec, corruption, bornes d'effets.
- `docs/AUTONOMOUS_DECISION_SYSTEM.md` : `EMOTION_WEIGHT = 10` justifié (0.35 rendait les
  émotions négligeables), sept services, rôle de `interruptionScored`, état d'implémentation.
- Validations : check-deps OK, typecheck 4 configs OK, tests **209/209** (22 fichiers), build OK.

## Ce qui vient d'être réalisé (Phase 3C — tranche 3)

- `src/main/services/character-tick.service.ts` : snapshot étendu, deux jeux scorés, PRNG
  séquencé par identifiant trié, explications, effets sur valeurs projetées, quantification
  unique, `decisions`/`actionDeltas`/`actionRuntimeStates` remplis.
- `src/main/services/decision-engine.service.ts` : garde anti-churn (score > 0 pour quitter
  `idle` ou interrompre) et interruption limitée au besoin le plus urgent traité par l'action
  de remplacement ; suppression des interruptions sans bénéfice mesurable.
- `src/main/services/world-store.service.ts` : `current_action_json` au schéma + migration
  additive, parse strict au chargement, écriture runtime/états/horloge/`rngState` en une
  transaction et un seul `persist`, helpers de test `_getCharacterJsonColumnsForTests` et
  `_setCharacterActionJsonForTests`.
- `tests/simulation.test.ts`, `tests/simulation-long.test.ts`, `tests/character-tick.test.ts` :
  6 tests SQLite, 9 tests longs adaptés, traçabilité PRNG. Total **215/215 tests**.
- `docs/AUTONOMOUS_DECISION_SYSTEM.md`, `docs/ACTION_SYSTEM.md`, `docs/GOAL_SELECTION_SYSTEM.md` :
  statut d'implémentation mis à jour, observations de calibration et critères longs documentés.

## Ce qui vient d'être réalisé (Phase 3D — conception documentaire)

- Audit croisé du réel : services, worker planificateur, manager, schéma SQLite, IPC/preload et renderer relus ; corrections apportées à l'audit précédent.
- `docs/PHASE_3D_DESIGN.md` : architecture cible, quatre tranches détaillées, décisions techniques, garanties, croissance estimée, avis indépendant.
- `docs/DECISION_HISTORY_SYSTEM.md` : `DecisionRecordV1`, table `decision_records`, validation stricte, migration additive, distinction avec le journal Phase 5.
- `docs/WORKER_TICK_PROTOCOL.md` : second worker de calcul, protocole versionné, `requestId`, doublons/tardifs/timeout/recréation, Golden Hash.
- `docs/SAFE_PERSISTENCE.md` : export avant mutation, `temp + fsync + SHA-256 + rename`, restauration mémoire, verrou global ordonné, suppression de monde sérialisée.
- `docs/WORLD_STORE_REFACTORING.md` : façade stable, modules extraits progressivement, helpers de test conservés.
- `docs/DECISION_INSPECTOR_UI.md` : IPC de lecture, filtres bornés, throttle 500 ms, jeton de requête, états et tests.
- `docs/DATABASE.md`, `docs/ARCHITECTURE.md`, `docs/SIMULATION_ENGINE.md`, `docs/EVENT_AND_MEMORY_SYSTEM.md` : constats obsolètes corrigés et liens Phase 3D ajoutés.
- Audit indépendant intégré : payload/hash alignés, double verrou explicite, séquence `beforeBuffer` après reprise du verrou global, recréation worker sans `simulationGetStatus()`, façade stable vérifiée, `characterName` capturé dans l'historique, orthographe corrigée.
- Aucun fichier applicatif, schéma, migration, IPC, preload, UI, worker, donnée utilisateur ni appel LLM modifié.

## Ce qui vient d'être réalisé (Phase 3D-A — implémentation)

- **Contrats additifs** : `DecisionRecordPayloadV1` (produit par le tick, sans horloge/hash/compression) et `DecisionRecordV1` (complété par le store avec `payloadSha256`, `uncompressedBytes`, `createdAt`). Constantes `DECISION_ENGINE_VERSION = 'phase3d.1'`, `DECISION_RECORD_VERSION = 1` et `DECISION_RULES` exportée depuis `src/shared/action.ts` ; la copie privée de `action-runtime.service.ts` est supprimée.
- `src/main/services/decision-record.service.ts` (nouveau) : canonicaliseur récursif strict, SHA-256 sur la charge utile, `deflateSync`/`inflateSync`, validation exacte des clés/versions/bornes/actions/règles/PRNG et comparaison de toutes les colonnes de contrôle à la lecture. Limites : 65 536 o canoniques, 16 384 o compressés, bornes structurelles indépendantes des paramètres.
- `src/main/services/decision-history.store.ts` (nouveau) : `decision_records`, `schema_migrations` (`3D-1`), deux index, insertion dans la transaction courante, lecteurs internes bornés (défaut 50, max 500).
- `src/main/services/character-tick.service.ts` : `CharacterTickResult.decisionRecords` indexé comme `decisions`, `stateBefore`/`stateAfter` exacts, score issu de `interruptionScored`/`scored` ou `0`, `ruleIds` union triée, avertissements préfixés, nom copié depuis `CharacterTickInput.characterNameByCharacterId`.
- `src/main/services/world-store.service.ts` : cohérence des charges utiles avec les états avant écriture, insertion avant le hook d'erreur, rollback sans orphelin, helpers `_insert/_list/_get/_count/_getDecisionRecordRowsForTests`.
- `docs/DECISION_HISTORY_SYSTEM.md`, `docs/PHASE_3D_DESIGN.md`, `docs/DATABASE.md` : corrections identifiées par l'audit (pas de timestamp dans le calcul pur, pas d'inférence des identifiants de règles d'échec depuis le texte libre, `stateBefore`/`stateAfter` précis, migration sans backfill, décisions validées).
- `tests/decision-record.test.ts` (10), `tests/decision-history.test.ts` (9), `tests/decision-golden-hash.test.ts` (18) : 37 nouveaux tests. Le test long existant de `tests/simulation.test.ts` reçoit un délai explicite de 30 s documenté (le coût de `persist()` croît avec l'historique).
- Aucun backfill, aucune purge, aucun export, aucun canal IPC/preload/renderer/worker ajouté.

## Ce qui vient d'être réalisé (Phase 3D-B — implémentation)

- `src/main/services/database-connection.service.ts` (nouveau) : cycle de vie sql.js, `getDbPath()`, WASM, `PRAGMA foreign_keys = ON`, `snapshotDatabase()`, `snapshotDatabaseFromDisk()` avec cache `lastPersistedBuffer`, `restoreDatabaseFromBuffer()`, `persistSnapshotOrRestore()`, `runDbTransaction()`, nettoyage du temporaire résiduel à l'ouverture.
- `src/main/services/database-schema.service.ts` (nouveau) : `ensureSchema()` extrait strictement ; aucune migration ni changement de schéma.
- `src/main/services/persistence.service.ts` (nouveau) : temporaire sur le même répertoire (mode 0600), `writeSync`, `fsyncSync`, vérification taille + SHA-256, `renameSync`, `fsync` du répertoire POSIX et `directoryFsyncError` journalisé ; hooks de test par étape ; `EPERM` sous Windows reste une erreur dure.
- `src/main/services/db-write-lock.service.ts` (nouveau) : `withDbWrite<T>()`, file module-level, timeout 30 s sur l'attente, libération après erreur.
- `src/main/services/world-store.service.ts` : façade et exports publics conservés ; toutes les mutations passent par `withDbWrite()` et soit `runDbTransaction()`, soit `persistSnapshotOrRestore()` ; `getWorld()` reste une écriture sous verrou ; helpers `_...ForTests` conservés.
- `src/main/services/simulation-manager.service.ts` : `worldLocks` stocke la promesse chaînée comparée en `finally`, timeout 30 s, tombeau `deletedWorldIds`, sync/broadcast sous le verrou du monde, commandes encapsulées dans `withWorldCommandLock()`, `simulationDeleteWorld()` ordonné monde → global, `_resetSimulationManagerForTests()`.
- `src/main/ipc/world.ipc.ts` : `WORLD_DELETE` appelle `simulationDeleteWorld(id)` au lieu de `deleteWorld()` puis un nettoyage séparé.
- `tests/atomic-persistence.test.ts` (13), `tests/db-write-lock.test.ts` (3), `tests/simulation-manager-lock.test.ts` (5) : 21 nouveaux tests. `tests/zz-benchmark.tmp.test.ts` reste un outil local ignoré, exclu des validations et jamais lancé pendant la validation finale.
- Aucun changement de schéma, PRNG, Golden Hash, moteur de décision, preload, renderer, worker de calcul ni appel LLM.

## Décisions de conception Phase 3C

- **Périmètre** : conception documentaire validée ; implémentation progressive sans
  modification du comportement Phase 3B tant que l'intégration n'est pas livrée.
- **Ordre du tick** : besoins projetés → émotions projetées → motivations → objectifs
  immédiats → candidats → scoring → décision → effets → **une seule** quantification finale.
- **Snapshot cohérent** : tous les personnages décident depuis le même état de début de
  tick ; effets appliqués différément ; tri lexicographique par `characterId` (comme le code
  réel, contrairement à une mention `localeCompare` dans un doc Phase 3B).
- **Équité** : aucune ressource partagée n'existe ; aucune action ne modifie un autre
  personnage ; conflits futurs à arbitrer centralement [Reporté].
- **Personnalité** : `traitAffinity` par action via le helper existant `traitMultiplier()`
  borné `[0.5, 1.5]` ; règles testables, aucun script narratif.
- **Actions longues** : pas de re-décision à chaque tick ; interruption uniquement si
  4 conditions cumulatives sont vraies ; `idle` explicite si aucune action réalisable.
- **Objectifs** : `current_goals_json` jamais écrit par le moteur ; `label` (texte libre)
  non interprété, LLM interdit pour la décision.
- **PRNG** : au plus un tirage par personnage et par tick, uniquement en cas d'ex æquo
  après quantification du score ; `rngState` écrit dans la transaction, tracé dans
  `DecisionExplanation`. `tieBreak: 'id'` reste disponible pour les rejeux de test.
- **`simulation_stopped`** : comportement actuel inchangé ; recommandation = **nouvelle
  branche explicite** (`forkFromStopped`) préservant le monde arrêté [Reporté].
- **Scores et urgences** : alignement signé des effets émotionnels (réduire le stress
  augmente le score), tendance mesurée uniquement au-delà de la dérive de référence,
  motivations regroupées par cible avant tri déterministe.
- **Services proposés** : `action-registry`, `goal-selection`, `action-candidacy`,
  `action-scoring`, `decision-engine`, `action-execution`, tous purs, orchestrés par
  `character-tick.service.ts` existant.

## Décisions Phase 3D (validées ; 3D-A et 3D-B implémentées)

- **Ordre des tranches** : 3D-A historique (**livrée**) → 3D-B persistance/verrous (**livrée**) → 3D-C worker de calcul → 3D-D IPC/UI. Chaque tranche encore à venir exige une validation explicite distincte.
- **Décisions ouvertes résolues** (ex-§10 de `docs/PHASE_3D_DESIGN.md`) : aucune purge automatique ; aucun export/archivage en 3D-A ; timeout worker futur fixé à 30 s sans implémentation ; `engineVersion = 'phase3d.1'` avec stratégie de versionnement documentée (mineur pour changement de forme, ajout aux versions acceptées par le lecteur, aucun réécriture des anciens enregistrements).
- **Workers** : le planificateur existant reste inchangé ; un second worker calcule tout le tick ou aucun hybride n'est accepté.
- **SQLite** : main seul propriétaire. Historique complet compressé, `UNIQUE(world_id, tick, character_id)`, FK monde en cascade, aucune FK vers `characters`.
- **Atomicité** : verrou global repris après le calcul, relecture de l'horloge, `beforeBuffer` avant `BEGIN`, transaction courte, `afterBuffer`, `temp + fsync + SHA-256 + rename`, restauration mémoire si une étape échoue.
- **Verrous** : ordre unique monde → global ; en 3D-B le verrou monde couvre tick/sync/broadcast et commandes, le verrou global couvre les accès SQLite et la persistance. Le nettoyage de `worldLocks` est corrigé et `WORLD_DELETE` passe par `simulationDeleteWorld()`. En 3D-C, le verrou global sera relâché pendant l'attente du worker puis repris pour relire l'horloge et exporter `before` juste avant `BEGIN`.
- **Erreurs worker** : step manuel rejette l'IPC ; tick automatique journalise sans écrire ; aucun rejeu automatique ni double tick.
- **UI** : deux canaux de lecture, `limit <= 500`, throttle 500 ms, jeton de requête, aucune API Node dans le renderer.
- **Golden Hash** : comparaison obligatoire entre référence Phase 3C et worker sur plusieurs seeds, 6 profils, 1/2/10/50 personnages et 24/72/168/720 ticks.

## État technique hérité (à ne pas recréer)

- **PRNG** (`src/main/services/prng.ts`) : mulberry32 sérialisable ; domaine simulation
  `world.seed ^ 0x85ebca6b` ; `getState/setState` uint32 strict.
- **Horloge** (`src/shared/simulation.ts`, `simulation_clock`) : 1 tick = 1 h, 24 ticks/jour,
  `tick/day/hour/status/speed/rngState/lastProcessedOrder`, recovery `running → paused`.
- **Tick** (`stepSimulation` dans `world-store.service.ts`) : `BEGIN` avant chargement,
  snapshot, calcul pur, écritures `current_*_json` + miroirs legacy, `upsertClock`,
  `COMMIT`, une seule écriture atomique via `persistSnapshotOrRestore()`, rollback SQL et
  restauration mémoire sur erreur (hooks `_setTickFailureForTests()` et
  `_setPersistenceFailureForTests()`).
- **Services Phase 3B** : `personality-influence`, `needs-evolution`,
  `emotion-evolution`, `character-tick` ; centièmes, `roundHalfEven` via `quantize`,
  `safety` sans déclin, anti-saturation par marge vers la baseline, PRNG non consommé par ces règles seules (la décision 3C peut le tirer sur ex æquo),
  `TickDelta[]` calculés mais non exposés via IPC/UI.
- **Worker/Manager** : worker planification/signaux uniquement ; main valide, verrou par
  monde, anti double-tick, broadcast ; aucune écriture SQLite depuis le worker. Messages
  `start`/`step` déclarés mais non utilisés par le manager. Depuis 3D-B, `worldLocks` est
  réellement nettoyé (promesse chaînée stockée et comparée) et un tombeau `deletedWorldIds`
  ignore les ticks tardifs d'un monde supprimé.
- **Persistance** : toute mutation passe par `withDbWrite()` ; `db.export()` alimente un
  temporaire vérifié puis `renameSync`. `getWorld()` écrit `last_opened_at`/`updated_at` sous
  verrou : ce n'est pas une lecture pure. `WORLD_DELETE` passe par `simulationDeleteWorld()`.
  Aucun WAL, aucun worker SQLite, aucune compression générale de la base.
- **Renderer** : `onSimulationStatusChanged` met à jour le statut et le statut du monde, mais
  ne recharge pas les personnages ; l'action courante n'est pas exposée dans `CharacterInstance`.
- **Sécurité** : `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`,
  navigation externe refusée, clé OpenRouter jamais dans le renderer.

## Validation réalisée (Phase 3C)

- `./.tools/node/versions/v26.13.1-linux-x64/bin/node scripts/check-deps.mjs` : OK.
- `./.tools/node/versions/v26.13.1-linux-x64/bin/node scripts/typecheck.mjs` : OK (4 tsconfigs).
- `./.tools/node/versions/v26.13.1-linux-x64/bin/node scripts/test.mjs` : **215/215 OK** (22 fichiers).
- `./.tools/node/versions/v26.13.1-linux-x64/bin/node scripts/build.mjs` : OK.
- Aucune donnée utilisateur lue ni modifiée ; aucun smoke Electron nécessaire (pas de changement
  IPC/UI). Le chemin SQLite est couvert par les tests d'intégration avec base temporaire.

## Validation réalisée (Phase 3D — documentaire)

- `./.tools/node/versions/v26.13.1-linux-x64/bin/node scripts/check-deps.mjs` : OK.
- `./.tools/node/versions/v26.13.1-linux-x64/bin/node scripts/typecheck.mjs` : OK (4 tsconfigs).
- `./.tools/node/versions/v26.13.1-linux-x64/bin/node scripts/test.mjs` : **215/215 OK** (22 fichiers).
- `./.tools/node/versions/v26.13.1-linux-x64/bin/node scripts/build.mjs` : OK.
- Vérification documentaire : liens Markdown locaux valides, `git diff --check` OK, audit indépendant intégré, aucun secret ni fichier généré ajouté, aucun fichier applicatif modifié.

## Validation réalisée (Phase 3D-A — implémentation)

- `./.tools/node/versions/v26.13.1-linux-x64/bin/node scripts/check-deps.mjs` : OK.
- `./.tools/node/versions/v26.13.1-linux-x64/bin/node scripts/typecheck.mjs` : OK (4 tsconfigs).
- `./.tools/node/versions/v26.13.1-linux-x64/bin/node scripts/test.mjs` : **252/252 OK** (25 fichiers). Ciblés : 37/37 (10 sérialisation, 9 SQLite, 18 Golden Hash).
- `./.tools/node/versions/v26.13.1-linux-x64/bin/node scripts/build.mjs` : OK.
- Vérifications spécifiques : migration d'une base legacy sans historique (`schema_migrations` `3D-1`, colonnes et index inspectés dans le fichier persisté), rollback sans orphelin, une ligne par personnage/tick, doublon rejeté, conservation après suppression d'instance pendant la préparation, cascade monde, réouverture, tailles BLOB à 10/50/100 personnages.
- Golden Hash : 18 scénarios (6 profils/720 ticks, 1–50 personnages/24–720 ticks) inchangés ; chaque charge utile générée est validée strictement.
- Aucune donnée utilisateur réelle lue ni modifiée ; aucun smoke Electron nécessaire (aucun IPC/UI modifié). Aucun secret ni fichier généré ajouté ; `git status` ne montre que les fichiers attendus.

## Validation réalisée (Phase 3D-B — implémentation)

- Sauvegarde hors dépôt vérifiée avant validation : archive `pre-validation-20261125-013741-final.tar.gz`, 14 fichiers copiés, manifeste 22/22 OK, extraction réussie ; dépôt inchangé (6 suivis modifiés, 8 non suivis).
- `./.tools/node/versions/v26.13.1-linux-x64/bin/node scripts/typecheck.mjs` : OK (4 tsconfigs).
- `bash scripts/test.sh` avec `--maxWorkers=1 --no-file-parallelism` et exclusions explicites du benchmark et du test long : **264/264 OK** (27 fichiers), code 0, 75,18 s. RAM disponible min 7 587 MiB, swap max 0, RSS max 259 232 KiB, charge max 1,80.
- Test long isolé `tests/simulation-long.test.ts` : **9/9 OK** en 6,00 s, une seule instance Vitest, timeout 60 s. RAM disponible min 7 836 MiB, swap 0, RSS max 262 072 KiB, charge max 1,44 ; aucun seuil d'arrêt franchi. `tests/zz-benchmark.tmp.test.ts` n'a jamais été lancé.
- `./.tools/node/versions/v26.13.1-linux-x64/bin/node scripts/build.mjs` : OK (2 145 modules, 1,91 s, WASM copié à l'identique, check-deps OK). RAM disponible min 7 767 MiB, swap 0, RSS max 255 648 KiB, charge max 0,77. Aucun processus résiduel.
- Vérifications spécifiques : panne à chaque étape de l'écriture atomique, hash altéré, `fsync` refusé, `rename` `EPERM` simulé, erreur après `rename` journalisée, restauration mémoire/disque octet pour octet, sérialisation de deux ticks de mondes différents, file libérée après erreur et timeout, suppression pendant tick, deux suppressions concurrentes, absence de deadlock.
- `data/saves/worlds.sqlite` inchangé : 24 576 octets, SHA-256 `562c36d1fc672bc47569eef56656a7dd32b5c11b13130ebff8ebad9bf4898182`. Aucun secret ni donnée personnelle ajouté au diff.

## Problèmes / points d'attention

- `simulation_stopped` reste terminal pour `start/resume` : ne pas contourner cette garde
  avant validation produit de la recommandation §12 du document principal.
- La simulation est désormais autonome au sens Phase 3C (décisions/actions numériques),
  mais reste limitée aux actions Tier A : santé et hygiène peuvent rester à 0 faute
  d'environnement (`wash` est Tier B). Ce n'est pas un bug de persistance.
- Les seuils numériques de décision (scoring, urgences, durées, cooldowns, détection des
  boucles) sont des hypothèses configurables, à calibrer par simulation longue avant
  implémentation définitive.
- `current_action_json` est une colonne réelle, migrée de façon additive ; une valeur
  corrompue est une erreur technique et rollback du tick, jamais une réparation silencieuse.
- Les explications complètes sont persistées depuis 3D-A dans `decision_records`, avec hash
  et colonnes de contrôle. Aucune purge automatique, aucun backfill et aucun export : les
  ticks antérieurs à la migration restent sans historique.
- Le verrou global d'écriture et la persistance atomique sont **implémentés** ; le worker de
  calcul reste conçu et absent du code. Le calcul est toujours synchrone dans le main, donc
  le verrou global reste détenu pendant le tick : ne pas supposer que 3D-C existe déjà.
- **Performance** : `persist()` réexporte toute la base à chaque tick ; avec l'historique, le
  coût par tick croît avec le nombre d'enregistrements (3D-A : ~52 ms à ~157 ms pour
  3 personnages entre les ticks 25 et 200 ; benchmarks 3D-B locaux : 63,68 ms au tick 10,
  377,56 ms au tick 200 pour 3 personnages, 548,45 ms pour 10, 1 329,12 ms pour 50,
  1 652,77 ms pour 100, 1 254,09 ms/tick pour 3×10 mondes). Aucune mesure 3D-A comparable
  à effectif égal : ne pas en déduire une amélioration. Le test long concerné a un délai
  explicite de 30 s, il passe en 6,00 s isolément. Ne pas monter en charge sans optimisations
  (hash en flux, persistance groupée, rétention) non encore implémentées.
- Le nettoyage de `worldLocks` est corrigé (promesse chaînée stockée et comparée) et
  `WORLD_DELETE` passe par `simulationDeleteWorld()`. En 3D-C, ajouter l'annulation explicite
  des `pendingComputes` avant de relâcher le verrou du monde.
- Linux restreint (AppArmor/userns) : `--no-sandbox` dev uniquement via `scripts/dev.mjs`,
  sans modifier `src/main/security/window.ts`.
- Ne pas lancer check-deps, typecheck, tests et build en parallèle : sous contention, le test
  « 3000 ticks » a dépassé son timeout de 5 s (147/148 observé). Un délai explicite de 20 s
  est maintenant appliqué à ce scénario ; la validation reste **séquentielle**.

## Fichiers importants à examiner

- `docs/AUTONOMOUS_DECISION_SYSTEM.md`, `docs/ACTION_SYSTEM.md`,
  `docs/GOAL_SELECTION_SYSTEM.md` — source de vérité Phase 3C.
- `src/shared/character.ts` — 21 traits / 10 émotions / 8 besoins / 3 objectifs.
- `src/shared/simulation.ts`, `src/shared/simulation-rules.ts` — contrats existants.
- `src/main/services/character-tick.service.ts` — point d'insertion de la Phase 3C.
- `src/main/services/world-store.service.ts` — transaction, snapshot, persistance, garde
  `simulation_stopped`, insertion de l'historique et helpers de test.
- `src/main/services/decision-record.service.ts`, `decision-history.store.ts` — contrat,
  hash/compression/validation stricte, schéma `3D-1` et lecteurs bornés.
- `src/main/services/database-connection.service.ts`, `database-schema.service.ts`,
  `persistence.service.ts`, `db-write-lock.service.ts` — cœur de la persistance 3D-B.
- `tests/decision-record.test.ts`, `tests/decision-history.test.ts`, `tests/decision-golden-hash.test.ts` — référence de non-régression et d'intégrité.
- `tests/atomic-persistence.test.ts`, `tests/db-write-lock.test.ts`, `tests/simulation-manager-lock.test.ts` — pannes injectées, sérialisation et suppression concurrente.
- `src/main/services/personality-influence.service.ts` — `traitMultiplier`,
  `deficitPressure`, `quantize`, helpers réutilisables par la décision.
- `src/main/services/needs-evolution.service.ts`, `emotion-evolution.service.ts`,
  `simulation-parameters.service.ts` — origine des valeurs projetées.
- `src/main/services/simulation-manager.service.ts`, `src/main/simulation/simulation.worker.ts`
  — frontière worker/main et anti double-tick.
- `docs/CHARACTER_TICK_RULES.md` — protocole Phase 3B à étendre sans casser les garanties.
- `docs/PHASE_3D_DESIGN.md` — référence centrale et découpage en tranches.
- `docs/DECISION_HISTORY_SYSTEM.md`, `docs/WORKER_TICK_PROTOCOL.md`, `docs/SAFE_PERSISTENCE.md`, `docs/WORLD_STORE_REFACTORING.md`, `docs/DECISION_INSPECTOR_UI.md` — conception détaillée.
- `docs/DATABASE.md`, `docs/ARCHITECTURE.md` — constats corrigés sur la persistance et les workers.
- `docs/EVENT_AND_MEMORY_SYSTEM.md`, `docs/SIMULATION_ENGINE.md` — étapes reportées et frontière avec l'historique technique.

## Commande de relance

```bash
# Bootstrap
bash scripts/bootstrap.sh

# Dév
bash scripts/dev.sh

# Vérifications
./.tools/node/versions/v26.13.1-linux-x64/bin/node scripts/check-deps.mjs
./.tools/node/versions/v26.13.1-linux-x64/bin/node scripts/typecheck.mjs
./.tools/node/versions/v26.13.1-linux-x64/bin/node scripts/test.mjs
./.tools/node/versions/v26.13.1-linux-x64/bin/node scripts/build.mjs
```

## Prochaine tâche recommandée

1. Les tranches **3D-A et 3D-B sont terminées et validées**. Ne pas les recommencer.
2. Attendre une **validation explicite distincte** pour démarrer la tranche **3D-C** : worker
   de calcul dédié, protocole versionné, `pendingComputes`, relâchement du verrou global
   pendant l'attente du worker puis relecture de l'horloge et export de `before` avant
   `BEGIN`, annulation des requêtes en attente sous verrou du monde, Golden Hash.
3. Ensuite seulement : 3D-D (IPC de lecture et inspecteur UI). La politique
   `simulation_stopped` reste inchangée ; `forkFromStopped` reste reporté. Aucune purge,
   aucun export, aucun LLM.
