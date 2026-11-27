# PROGRESS.md — Suivi central du développement

## État actuel

- **Phase** : **Phase 3D-C1 à 3D-C4 implémentées, validées, commitées et poussées** (protocole, worker de calcul branché, intégration manager/verrous, documentation finale) ; seule l'IPC/UI 3D-D reste à implémenter.
- **Avancement approximatif** : Phase 1 ~85 % (CRUD préparation) ; Phase 2 documentaire terminée ; Phase 3A/3B/3C implémentées/validées/committées/poussées ; Phase 3D conçue et documentée, **tranches 3D-A, 3D-B et 3D-C1 à 3D-C4 implémentées/validées/committées/poussées**. L'IPC/UI (3D-D) n'est pas implémentée. `forkFromStopped` reste `[Reporté]`.
- **Dernière mise à jour** : 2026-11-27.
- **Git** : remote `git@github.com:LanjaFii/digital-life.git`, branche `main`. HEAD avant implémentation 3D-C1/C2 : `d900ecd908aac01c10c947d8abd1e4d758f2a235` ; HEAD avant intégration 3D-C3 : `c3a6232f70d830ca9adea311ee50377eb185b48d`, identique à `origin/main` au début de la tranche ; le commit de livraison 3D-C3/C4 est décrit dans `CHANGELOG.md`.

## Fonctionnalités terminées

- [x] Examen de l'environnement (Linux x86_64, Ubuntu 26.04.1, Node global ignoré).
- [x] Choix des versions stables et compatibles (voir AGENTS.md).
- [x] Arborescence modulaire créée (main / preload / renderer / shared / scripts / docs / data / tests).
- [x] package.json, tsconfigs (base, renderer, main, preload, tests), vite.config.ts.
- [x] Scripts portables : bootstrap.sh/.ps1, dev.sh/.ps1, build.sh/.ps1, test.sh/.ps1, ensure-node, runtime, copy-wasm, check-deps, dev/build/test/typecheck .mjs.
- [x] Contrat IPC partagé + preload contextBridge + handlers IPC + fenêtre sécurisée (contextIsolation, sandbox, nodeIntegration=false).
- [x] Squelette React (App, DiagnosticList, styles) avec diagnostic IPC réel et bouton d'actualisation fonctionnel.
- [x] Documentation obligatoire créée : AGENTS, PROGRESS, HANDOFF, CHANGELOG, README, 12 docs.
- [x] Tests Phase 0 créés (`tests/phase0.test.ts`).
- [x] Bootstrap exécuté : Node v26.13.1 installé localement, SHA-256 vérifié, dépendances npm installées, WASM sql.js copié.
- [x] Binaire Electron 45.4.1 linux-x64 installé depuis l'archive officielle GitHub, SHA-256 vérifié (`e1d077c7a087d7e344350ea0c5cd2b7dc5af3d9bf7979474f38e0fc1a560b875`).
- [x] Validations réussies : typecheck (4 configs), tests Vitest (8/8), build (main/preload/renderer).
- [x] Smoke test Electron validé via CDP : fenêtre/page `DIGITAL LIFE` chargée, `window.digitalLife` exposé, IPC `app:get-info` et `app:diagnostic` OK (diagnostic `ok: true`).

## Fonctionnalités en cours (Phase 1)

- [x] Fondation persistance mondes : `WorldStore` sql.js (SQLite local `data/saves/worlds.sqlite`), IPC `world:list/create/delete/get`, preload exposé, tests.
- [x] Menu principal UI : liste des mondes sauvegardés depuis SQLite, états chargement/erreur/vide, bouton actualiser.
- [x] Création de monde UI : nom, seed aléatoire ou personnalisée, mode monde vide/personnages aléatoires, nombre de personnages configurable (1-50) en mode aléatoire.
- [x] Suppression de monde avec confirmation modale.
- [x] Génération effective des personnages aléatoires : modèle personnage initial (identité, 21 traits, 10 émotions, 8 besoins, objectifs), PRNG seedé déterministe, persistance SQLite table `characters` isolée par `world_id`, IPC/preload `listCharacters`.
- [x] Reprise/chargement réel d'un monde sauvegardé : bouton "Reprendre" fonctionnel, chargement SQLite monde + personnages via IPC/preload, écran monde (métadonnées + cartes personnages), fiche personnage détaillée (21 traits, 10 émotions, 8 besoins, objectifs), navigation retour liste/menu, états chargement/erreur/monde introuvable, isolation par monde.
- [x] Création manuelle de personnages : formulaire 6 étapes (identité 18-65, 21 traits sliders FR + génération aléatoire cohérente, 10 émotions, 8 besoins, 1+2 objectifs, récapitulatif), options « monde seul » / « monde + bibliothèque », validation main complète, persistance SQLite, actualisation immédiate du monde.
- [x] Bibliothèque personnelle « Ma bibliothèque » : modèles `CharacterTemplate` persistés (table `character_templates`), cartes, recherche, détail, modification, suppression avec confirmation, création sans monde, action « Utiliser » (choix monde + instanciation), états chargement/vide/erreur/aucun résultat.
- [x] Ajout depuis la bibliothèque dans un monde : sélection → aperçu → confirmation → copie indépendante (nouvel UUID) → nombre de personnages actualisé.
- [x] Indépendance totale modèle/instances : édition/suppression de modèle sans effet sur les instances ; édition d'instance sans effet sur le modèle ni les autres mondes ; `template_id` informatif remis à NULL à la suppression du modèle.
- [x] Modification d'instance en préparation ; `worlds.status` (`preparation`/`simulation_started`) + garde main `assertWorldPreparation` (verrouillage futur, pas de faux démarrage).
- [x] Migration additive : `characters.template_id/updated_at/initial_*_json/current_*_json` backfillés depuis les colonnes legacy ; anciens mondes/personnages préservés (test dédié sur base legacy).
- [x] Suppression d'une instance de personnage : action sur la carte et la fiche, confirmation modale identifiant personnage/monde et caractère définitif, annulation, suppression via IPC dédié `character:delete`, actualisation liste/compteur, retour à la liste depuis la fiche, notification de succès, erreurs IPC affichées. Garde main : statut `preparation`, ids valides, appartenance réelle au monde ; modèle original et instances des autres mondes intacts, compteur resynchronisé, persistance SQLite.

## Phase 3A — Infrastructure simulation (terminée dans cette tranche)

- [x] Audit complet (docs, git, schéma, IPC, PRNG, tests, scripts, UI).
- [x] `SeededRng` sérialisable : `normalizeSeed`, `getState()`, `setState()` avec validation uint32 ; tests de déterminisme/reprise.
- [x] Contrats partagés `src/shared/simulation.ts` (clock, status, speed, commandes, normalisation legacy).
- [x] SQLite : table additive `simulation_clock`, index, migration non destructive, validation des données.
- [x] Store simulation : `start/pause/resume/step/setSpeed/stop/getStatus`, transactions atomiques, `persist` unique, recovery `running -> paused` au démarrage.
- [x] Séparation domaine PRNG simulation : `world.seed ^ 0x85ebca6b` (génération inchangée).
- [x] Worker Node `worker_threads` (`src/main/simulation/simulation.worker.ts`) : planification/signaux uniquement, sans SQLite.
- [x] Manager main (`simulation-manager.service.ts`) : verrou par monde, anti double-tick, sync worker, broadcast statut, shutdown propre.
- [x] IPC/preload/main : canaux simulation typés/validés, événement `simulation:status-changed`, `recoverSimulationClocksAfterRestart`, `shutdownSimulationManager`.
- [x] UI WorldView minimale : contrôles start/pause/resume/step/stop, vitesses 1x/2x/5x/10x, affichage jour/heure/tick/statut depuis le main, édition personnages désactivée hors préparation.
- [x] `simulation_stopped` : arrêt volontaire, données conservées, pas de redémarrage implicite (décision documentée).

## Conception Phase 3B (documentaire, terminée dans cette tranche)

- [x] Audit du réel confirmé : 21 traits, 10 émotions, 8 besoins (`100 = satisfait`), `initialState`/`currentState`, horloge 1 tick = 1 h, PRNG sérialisable, `stepSimulation` ne fait encore évoluer que l'horloge.
- [x] `docs/NEEDS_EVOLUTION.md` : 8 besoins (définition, dérive/tick, facteurs, traits pertinents, interactions, seuils critiques, conséquences futures, récupération), formule générale, calibration provisoire, limites et tests à prévoir.
- [x] `docs/EMOTION_EVOLUTION.md` : 10 émotions (causes hausse/baisse, besoins influents, traits pertinents, interactions, récupération), baselines provisoires, matrice besoin→émotion, anti-boucles, plafonds, tests à prévoir.
- [x] `docs/CHARACTER_TICK_RULES.md` : protocole snapshot → besoins projetés → émotions → agrégation → clamp/arrondi → application différée → transaction atomique + `persist` unique ; déterminisme/PRNG ; `TickDelta[]` explicable ; contrats TS proposés ; 4 services purs futurs ; calibration 24/72/168/720/plusieurs milliers de ticks ; profils et critères d'échec ; 2 diagrammes Mermaid ; décisions définitives / provisoires / à calibrer.
- [x] Aucun code applicatif, schéma SQLite, migration, worker, IPC, preload, UI, LLM, mort, relations, événements ou souvenirs modifié.

## Phase 3B — Implémentation (terminée dans cette tranche)

- [x] Audit préalable : git synchronisé (`a07d75a`), 3 docs lus intégralement, types/shared, `stepSimulation`, worker, manager, PRNG et tests existants examinés ; divergences documentées (coefficients émotionnels qualitatifs, arrondi/précision non tranchés, pas de `SimulationParameters`).
- [x] Décisions numériques tranchées : précision décimale aux centièmes (pas d'entiers), arrondi bancaire symétrique `roundHalfEven` via `quantize`, coefficients documentés conservés comme valeurs configurables `SimulationParametersV1` (version 1).
- [x] `src/shared/simulation-rules.ts` : contrats partagés (`CharacterTickInput`, `CharacterTickSnapshot`, `TickDelta`, `NeedDelta`, `EmotionDelta`, `CharacterTickResult`, causes incluant `base_decay`/`comfort`/`emotion_target`/`rounding`).
- [x] `src/main/services/simulation-parameters.service.ts` : coefficients versionnés des 8 besoins / 10 émotions / plafonds / seuils, identifiés comme hypothèses de calibration.
- [x] `src/main/services/personality-influence.service.ts` : helpers purs (clamp, half-even, quantize, traitFactor/Multiplier, pressions, baseline, finalizeValue).
- [x] `src/main/services/needs-evolution.service.ts` : 8 besoins projetés depuis le snapshot, accélérateurs, récupérations santé/sécurité, plafond de perte, deltas explicables.
- [x] `src/main/services/emotion-evolution.service.ts` : 10 émotions projetées depuis snapshot + besoins projetés, baselines personnelles, pressions bornées, zone morte, garde-fou anti-saturation.
- [x] `src/main/services/character-tick.service.ts` : tri déterministe, orchestration pure, quantification finale, PRNG strictement conservé.
- [x] Intégration `stepSimulation` : `BEGIN` avant chargement, snapshot immuable, calcul pur, écriture `current_*_json` + miroirs legacy, horloge, `COMMIT`, **un seul** `persist`, rollback complet sur erreur (hook de test injecté).
- [x] Tests : services purs (maths, traits, besoins, émotions, orchestration), intégration SQLite (tick, pause/step, rollback, réouverture, recovery, bornes), simulations longues 24/72/168/720/3000 ticks et 6 profils documentés.
- [x] Ajustement justifié observé en simulation longue : saturation de `happiness` à 100 en ~50 ticks sur scénario stable → pression positive plafonnée par la marge vers la baseline (cause `baseline.headroom`) ; documentation mise à jour. Aucun coefficient arbitrairement modifié.
- [x] Documentation mise à jour : 3 docs de conception (statut implémenté + décisions définitives), PROGRESS, HANDOFF, CHANGELOG.

## Phase 3C — Tranche 1 (contrats et catalogue, terminée)

- [x] Audit préalable : branche `main`, HEAD = `origin/main` = `c18e481`, arbre propre ; AGENTS/PROGRESS/HANDOFF relus ; trois documents Phase 3C lus intégralement ; services Phase 3B et `stepSimulation` réexaminés.
- [x] `src/shared/action.ts` : 11 identifiants stables, catégories, préconditions (dont `any_of`), effets, délais, cooldowns, machine à états, runtime sérialisable et valeur par défaut.
- [x] `src/shared/decision.ts` : motivations, objectifs immédiats, scores, explications complètes, contrat d'entrée du moteur de sélection.
- [x] `src/shared/simulation-rules.ts` : extension additive (snapshot étendu, paramètres de décision versionnés, champs de résultat `decisions`/`actionDeltas`/`actionRuntimeStates`, cause `action_effect`) ; `current_goals_json` reste hors écriture.
- [x] `src/main/services/simulation-parameters.service.ts` : paramètres de décision par défaut, poids explicitement identifiés comme hypothèses calibrables.
- [x] `src/main/services/action-registry.service.ts` : catalogue statique des 11 actions, Tier A exécutables / Tier B désactivés, validation stricte, lookup et listes déterministes.
- [x] `docs/AUTONOMOUS_DECISION_SYSTEM.md` §12.4 : recette technique précise de `forkFromStopped` (nouveau monde, nouvelles lignes, horloge/PRNG copiés, branche en pause, source intacte, transaction unique) ; **non implémenté**.
- [x] `tests/action-registry.test.ts` : validation du registre, 11 identifiants, Tier B jamais disponible, `idle` sans effet, bornes de durée, absence d'effets non numériques, règle d'échec du sommeil.
- [x] Validations : check-deps OK, typecheck 4 configs OK, tests **158/158 passés** (16 fichiers). Build non rejoué : aucun changement de bundle dans cette tranche de contrats.

## Phase 3C — Tranche 2 (services purs, terminée)

- [x] Audit préalable : HEAD = `origin/main` = `033fced`, arbre propre avant toute modification.
- [x] `src/main/services/goal-selection.service.ts` : urgences des 8 besoins / 10 émotions, signal circadien, motivations regroupées en objectifs immédiats, tri par urgence puis identifiant, exclusions tracées, aucun libellé interprété.
- [x] `src/main/services/action-candidacy.service.ts` : évaluation de toutes les préconditions (dont `any_of` et `environment_available`), Tier B toujours infaisable, `idle` toujours faisable, ordre lexicographique stable.
- [x] `src/main/services/action-scoring.service.ts` : formule documentée (besoins, émotions, traits, circadien, coût, répétition, durée), quantification à 3 décimales, borne `[-5, 5]`, `idle = 0`, candidats infaisables non scorés.
- [x] `src/main/services/decision-engine.service.ts` : poursuite d'action longue, interruption conditionnée par 4 critères, règles d'échec, `forced_idle`, départage par identifiant ou PRNG (au plus un tirage), explication complète.
- [x] `src/main/services/action-runtime.service.ts` : parse strict (corruption = erreur technique), sérialisation, démarrage/poursuite/interruption/échec, cooldowns, historique borné.
- [x] `src/main/services/action-execution.service.ts` : effets bornés par la marge, baseline des émotions négatives, multiplicateur de traits, quantification unique, `ActionEffectDelta`, règles d'échec `keep_partial` / `abort`, refus des actions Tier B et des effets non numériques.
- [x] `src/shared/decision.ts` : `GoalSelectionInput`, `DecisionRng`, et second jeu de candidats `interruptionScored` pour rendre l'interruption réellement évaluable.
- [x] `src/shared/simulation-rules.ts` : `AutonomousDecisionSnapshot.hour` ajouté (horloge logique, jamais `Date.now()`).
- [x] `tests/phase3c-fixtures.ts` + 6 fichiers de test : **51 tests** couvrant chaque service (affamé, anxieux, sociable/indépendant, coûts, répétition, nuit, faisabilité, cooldown, départage PRNG rejouable, poursuite, interruption, échec, runtime corrompu, bornes d'effets).
- [x] `docs/AUTONOMOUS_DECISION_SYSTEM.md` : calibration `EMOTION_WEIGHT = 10` justifiée, découpe des sept services, rôle de `interruptionScored`, état d'implémentation tranche 2.
- [x] Validations : check-deps OK, typecheck 4 configs OK, tests **209/209 passés** (22 fichiers), build OK. Aucun appel au tick : comportement Phase 3B inchangé.

## Phase 3C — Tranche 3 (intégration au tick et persistance, terminée)

- [x] Audit préalable : HEAD = `origin/main` = `7c42619`, arbre propre avant toute modification.
- [x] `src/main/services/character-tick.service.ts` : snapshot étendu (`hour`, runtime parsé, deltas passifs, `otherCharacterExists`), deux jeux scorés (runtime courant et runtime relâché), PRNG séquencé par identifiant trié, explications complètes, runtime/effets appliqués aux valeurs projetées avant unique quantification.
- [x] `src/main/services/decision-engine.service.ts` : garde anti-churn (score strictement positif pour partir de `idle` ou interrompre) et interruption conditionnée au besoin le plus urgent traité par l'alternative ; évite les centaines d'interruptions sans bénéfice sur besoins non réparables.
- [x] `src/main/services/world-store.service.ts` : colonne `current_action_json` ajoutée au schéma et à la migration additive avec valeur par défaut versionnée ; parse strict au chargement ; écriture runtime + besoins/émotions + `updated_at` + horloge/`rngState` dans une seule transaction et un seul `persist` ; `current_goals_json` jamais écrit.
- [x] `tests/simulation.test.ts` : 6 tests SQLite Phase 3C (action de subsistance, action longue persistée, rejeu après réouverture, rollback sur runtime corrompu, deux personnages, `current_goals_json` inchangé sur 200 ticks).
- [x] `tests/simulation-long.test.ts` : 9 tests longs adaptés (PRNG/runtime continus, anti-boucle sur décisions, critères d'oscillation documentés, divergence des 6 profils sur moyennes).
- [x] `tests/character-tick.test.ts` : trace PRNG vérifiée (`rngStateBefore`/`After`, chaînage des décisions, tirage conditionnel).
- [x] Validations : check-deps OK, typecheck 4 configs OK, tests **215/215 passés** (22 fichiers), build OK.

## Conception Phase 3D (documentaire, terminée dans cette tranche)

- [x] Audit croisé et relecture du code réel : HEAD = `origin/main` = `276384e`, arbre propre avant modification ; services, worker planificateur, manager, schéma SQLite, IPC/preload et renderer vérifiés.
- [x] Correction de l'audit précédent : worker de calcul dédié au lieu d'étendre le planificateur ; ordre historique → persistance/verrous → worker → UI ; aucune FK de l'historique vers `characters` ; restauration mémoire après échec de `persist()` ; façade stable pour le store.
- [x] `docs/PHASE_3D_DESIGN.md` : architecture, quatre tranches détaillées (objectif, périmètre, fichiers, SQLite, contrats, dépendances, tests, acceptation, risques, exclusions), décisions techniques, garanties, croissance estimée, avis indépendant.
- [x] `docs/DECISION_HISTORY_SYSTEM.md` : distinction avec le journal Phase 5, contrat `DecisionRecordV1`, table `decision_records`, validation stricte, migration additive, rétention sans purge, IPC de lecture, tests prévus.
- [x] `docs/WORKER_TICK_PROTOCOL.md` : deux workers, protocole versionné, `requestId`, validation main, doublons/tardifs/timeout/recréation, Golden Hash.
- [x] `docs/SAFE_PERSISTENCE.md` : export avant mutation, `temp + fsync + SHA-256 + rename`, restauration mémoire, verrou global ordonné, suppression de monde sérialisée, matrice d'échecs.
- [x] `docs/WORLD_STORE_REFACTORING.md` : façade stable, neuf modules proposés, ordre d'extraction, exports publics et helpers de test conservés.
- [x] `docs/DECISION_INSPECTOR_UI.md` : action courante, dernières actions, inspecteur, filtres bornés, throttle 500 ms, jeton de requête, états et tests.
- [x] Mise à jour de `docs/DATABASE.md`, `docs/ARCHITECTURE.md`, `docs/SIMULATION_ENGINE.md` et `docs/EVENT_AND_MEMORY_SYSTEM.md` : correction des constats obsolètes et liens vers la Phase 3D.
- [x] Audit indépendant des six documents intégré : contrat et payload d'historique alignés, verrous monde/global précisés, séquence de persistance corrigée, recréation du worker harmonisée, façade et exports du store vérifiés, `characterName` rendu stable, constats obsolètes et orthographe corrigés.
- [x] Décisions ouvertes consignées dans `docs/PHASE_3D_DESIGN.md` §10 : rétention/archivage, export manuel, timeout worker 30 s et `engineVersion`.
- [x] Aucun code applicatif, schéma SQLite, migration, IPC, preload, UI, worker, donnée utilisateur ni appel LLM modifié.

## Implémentation Phase 3D-A (terminée dans cette tranche)

- [x] Contrats additifs `DecisionRecordPayloadV1` / `DecisionRecordV1`, constantes `DECISION_ENGINE_VERSION = 'phase3d.1'`, `DECISION_RECORD_VERSION = 1` et `DECISION_RULES` (source runtime unique, la copie privée de `action-runtime.service.ts` est supprimée).
- [x] `computeCharacterTick()` produit `decisionRecords` indexé comme `decisions` : score issu de la liste de candidats réellement utilisée, `ruleIds` triés/uniques, urgences, runtime avant/après, états avant/après, deltas bruts/finaux et avertissements du personnage. Aucun timestamp, hash ni compression dans la règle pure.
- [x] Service `decision-record.service.ts` : canonicaliseur strict, SHA-256, `deflateSync`/`inflateSync`, validation exacte (structure, versions, bornes, PRNG, actions/règles) et vérification de toutes les colonnes de contrôle à la lecture.
- [x] Store `decision-history.store.ts` : tables `decision_records` et `schema_migrations` (`3D-1`), deux index, insertion dans la transaction du tick, lecteurs internes bornés (défaut 50, max 500).
- [x] `world-store.service.ts` : nom du personnage transmis au tick, cohérence des enregistrements avec les états, insertion avant le hook d'erreur, rollback sans orphelin, helpers de test.
- [x] Validation stricte à l'écriture et à la lecture, sans réparation silencieuse. Aucun backfill, aucune purge, aucun export.
- [x] Golden Hash : 18 scénarios (6 profils à 720 ticks, 1 à 50 personnages sur 24/72/168/720 ticks) byte-identiques à Phase 3C, avec validation stricte de chaque enregistrement généré.
- [x] Aucun IPC, preload, renderer, worker, verrou global, LLM ni changement de persistance fichier.

## Implémentation Phase 3D-B (terminée dans cette tranche)

- [x] Audit préalable : HEAD = `origin/main` = `a64d483d46984eeef859cf40cec674575b9ec36c`, sauvegarde hors dépôt vérifiée avant validation (`/home/lanjafii/Backups/Digital-Life-3DB/pre-validation-20261125-013741-final.tar.gz`), aucun processus concurrent.
- [x] `src/main/services/database-connection.service.ts` : cycle de vie sql.js, WASM, `PRAGMA foreign_keys`, `snapshotDatabaseFromDisk()` (cache du dernier état disque validé), `restoreDatabaseFromBuffer()`, `persistSnapshotOrRestore()`, `runDbTransaction()`, nettoyage du temporaire résiduel à l'ouverture.
- [x] `src/main/services/database-schema.service.ts` : `ensureSchema()` extrait de la façade, sans changement de schéma ni de migration (3D-1 conservée).
- [x] `src/main/services/persistence.service.ts` : `atomicPersist()` avec temporaire même répertoire (mode 0600), `writeSync`, `fsyncSync`, vérification taille + SHA-256, `renameSync`, `fsync` du répertoire et `directoryFsyncError` journalisé ; aucun repli par copie partielle ; hooks de panne par étape.
- [x] `src/main/services/db-write-lock.service.ts` : file globale d'écriture, timeout 30 s sur l'attente, libération après erreur.
- [x] `src/main/services/world-store.service.ts` : façade et exports publics conservés ; toutes les mutations passent par `withDbWrite()`, `runDbTransaction()` et la persistance atomique ; aucun CRUD déplacé.
- [x] `src/main/services/simulation-manager.service.ts` : correction du nettoyage de `worldLocks`, timeout 30 s, tombeau `deletedWorldIds`, verrou du monde couvrant tick/sync/broadcast, `simulationDeleteWorld()` ordonné monde → global.
- [x] `src/main/ipc/world.ipc.ts` : `WORLD_DELETE` passe par `simulationDeleteWorld()` ; aucun canal IPC, preload, renderer, worker, appel LLM, changement de schéma/PRNG/Golden Hash.
- [x] Tests : 21 nouveaux tests (13 persistance atomique et panne, 3 file globale, 5 manager) ; validation globale **264/264** (27 fichiers, benchmark et test long exclus) ; test long isolé **9/9** en 6,00 s ; typecheck 4 configurations OK ; build de production OK.
- [x] Documentation mise à jour : `SAFE_PERSISTENCE.md`, `WORLD_STORE_REFACTORING.md`, `DATABASE.md`, `PHASE_3D_DESIGN.md`, `DECISION_HISTORY_SYSTEM.md`, `ARCHITECTURE.md`, `SIMULATION_ENGINE.md`, `README.md`, `PROGRESS.md`, `HANDOFF.md`, `CHANGELOG.md`.

## Implémentation Phase 3D-C1 et 3D-C2 (terminée dans cette tranche)

- [x] Audit préalable : HEAD local = `origin/main` = `d900ecd`, arbres et documents relus, aucun changement de schéma, IPC, UI, PRNG ni Golden Hash.
- [x] `src/shared/worker-protocol.ts` : `WORKER_PROTOCOL_VERSION = 1`, `ComputeTickRequest`/`ComputeTickResultResponse`/`ComputeTickErrorResponse`/`ComputeWorkerReadyMessage`, validateurs stricts, `WorkerProtocolError`, codes `invalid_input`/`compute_error`/`unsupported_version`, erreurs corrélées ou non.
- [x] `src/shared/canonicalization.ts` : `canonicalize()` stricte pour l'intégrité des Decision Records et `canonicalizeGoldenTickResult()` (historique) isolées ; `collectRuleIds()` déplacé sans changement de comportement. 18 références inchangées.
- [x] `src/shared/decision-validation.ts` et `src/main/services/decision-record.service.ts` : validation partagée extraite, réexports conservés (`canonicalize`, `collectRuleIds`, limites, `validateDecisionRecordPayload`) ; versions `ACTION_REGISTRY_VERSION`, `SIMULATION_PARAMETERS_VERSION` et causes de deltas centralisées.
- [x] `src/main/services/tick-writer.service.ts` : préparation des états, contrôle de cohérence de l'historique, écritures états/historique/horloge/statut extraites de `stepSimulation()` ; transaction, ordre d'écriture, façade et hooks de test inchangés. Le calcul reste synchrone dans le main.
- [x] `src/main/simulation/tick-compute.worker.ts` : worker `worker_threads` autonome, `ready`, validation de la requête, calcul pur, checksum SHA-256 du noyau Golden Hash, réponse validée avant envoi, erreurs corrélées, aucun état résiduel. **Aucun branchement production** : ni manager, ni IPC, ni UI, ni repli synchrone silencieux.
- [x] Tests ciblés : protocole (8), tick-writer (4), parité worker/synchrone (3), 18 Golden Hash ordinaires ; matrice étendue 96 scénarios (6 profils × 1/2/10/50 × 24/72/168/720) figée et vérifiée en test long isolé.
- [x] Validations : typecheck 4 configurations OK, suite complète **279/279** (30 fichiers, benchmark et tests longs exclus), matrice longue **96/96**, build de production OK (check-deps inclus). Aucune modification de données utilisateur.

## Implémentation Phase 3D-C3 et clôture 3D-C4 (terminées dans cette tranche)

- [x] Audit préalable : HEAD local = `origin/main` = `c3a6232f` ; contrats C1/C2, worker, `tick-writer.service.ts`, manager, verrous monde/global, handlers IPC mutateurs, `simulationDeleteWorld()`, tests et documents relus. Aucun changement de schéma, PRNG, règle, UI, LLM ni donnée utilisateur.
- [x] `src/main/simulation/tick-compute-client.service.ts` (nouveau) : worker paresseux, `pendingComputes`, `requestId` monotone `compute-n`, timeout fixe 30 s, retrait avant rejet, doublons/tardifs ignorés, checksum recalculé, gestion `ready`/`error`/`exit`, annulation par monde, recréation paresseuse, aucun SQLite/IPC/renderer/état résiduel, entrée copiée par `structuredClone`.
- [x] `src/main/services/world-store.service.ts` : `writeCalculatedTick()` partagé, `stepSimulation()` conservé comme référence synchrone de test, nouveaux `prepareTickInput()` et `commitTickResult()` avec relecture d'horloge, validation `expected`, `before` exporté après reprise du verrou global, transaction courte et persistance atomique. Aucun `withDbWrite()` imbriqué.
- [x] `src/main/services/simulation-manager.service.ts` : `performTick(worldId, origin)` branche le client, garde l'anti-double-tick, propage l'erreur `manual` à l'IPC et journalise l'erreur `auto` sans écriture ni broadcast ; ordre monde → global, global relâché pendant l'attente ; `simulationDeleteWorld()` pose le tombeau et annule les calculs avant toute attente de verrou ; helpers `withWorldMutationLock()` / `withAllWorldLocks()` exportés.
- [x] `src/main/ipc/world.ipc.ts` et `src/main/ipc/character.ipc.ts` : toutes les opérations IPC modifiant un monde, ses personnages ou ses instances passent par le verrou monde (`WORLD_GET`, CRUD personnage, `TEMPLATE_INSTANTIATE`, `TEMPLATE_DELETE` avec verrous triés).
- [x] Tests : client worker (10), verrou manager (7, dont timeout du calcul), intégration manager/store/worker (7), helpers de worker factice ; parité avec le calcul direct, rollback complet, suppression pendant calcul, erreurs `manual`/`auto`, redémarrage, verrous IPC, absence de deadlock.
- [x] Documentation finale : `PROGRESS.md`, `HANDOFF.md`, `CHANGELOG.md`, `README.md`, `docs/PHASE_3D_DESIGN.md` (divergence `worldLocks` résolue), `docs/WORKER_TICK_PROTOCOL.md`, `docs/SAFE_PERSISTENCE.md`, `docs/WORLD_STORE_REFACTORING.md`, `docs/DECISION_HISTORY_SYSTEM.md`, `docs/ARCHITECTURE.md`, `docs/SIMULATION_ENGINE.md`, `docs/SIMULATION_TIME_AND_ENGINE.md`.
- [x] Validations séquentielles : check-deps OK, typecheck 4 configs OK, ciblés 57/57, Golden Hash ordinaires 18/18, suite complète **298/298** (32 fichiers), matrice longue **96/96**, simulation longue 3B **9/9**, build de production OK. Aucun benchmark lancé, aucun processus résiduel.

## Fonctionnalités non commencées

- [x] ~~Implémentation Phase 3B : appliquer les règles conçues (besoins + émotions + influence personnalité) dans un tick atomique~~ — **terminée cette tranche**.
- [x] ~~Phase 3C : intégration des services au tick, persistance du runtime, tests SQLite et simulations longues~~ — **terminée (tranche 3)**.
- [x] ~~Tranche 3D-A : historique technique des décisions~~ — **terminée et validée**.
- [x] ~~Tranche 3D-B : persistance atomique, restauration mémoire et verrous~~ — **terminée et validée cette tranche**.
- [x] ~~Tranche 3D-C1 : fondations contractuelles (protocole, canonicalisation partagée, frontière d'écriture)~~ — **terminée et validée cette tranche**.
- [x] ~~Tranche 3D-C2 : worker de calcul non branché et parité Golden Hash~~ — **terminée et validée**.
- [x] ~~Tranche 3D-C3 : intégration du worker, verrous et annulation~~ — **terminée et validée cette tranche**.
- [x] ~~Tranche 3D-C4 : documentation et validation finale~~ — **terminée et validée cette tranche**.
- [ ] Phase 3D : tranche 3D-D (IPC/UI de lecture et inspecteur minimal) — **conçue, en attente de validation explicite distincte**.
- [ ] Phase 3C complémentaire : `forkFromStopped`, hystérésis des objectifs, actions Tier B avec environnement (tous `[Reporté]`).
- [ ] Phases 4 à 8 : relations, événements canoniques, souvenirs, mort/deuil, LLM optionnel, interface avancée, stabilisation.

## Conception Phase 2 (documentaire, terminée dans cette tranche)

- [x] Audit de l'existant réalisé (types, SQLite/migrations, validation, persistance, IPC/preload, garde `worlds.status`, UI, tests 88/88, docs).
- [x] `docs/CHARACTER_STATE_ARCHITECTURE.md` : audit réel, séparation stable/dynamique, contrat `initialState` immuable / `currentState` évolutif, règles de cohérence, structures TS proposées, scénarios de non-régression.
- [x] `docs/RELATIONSHIP_SYSTEM.md` : relations asymétriques `ownerId → targetId`, absence = neutre, 9 dimensions 0-100, types dérivés calculés, table `relationships` additive proposée, exemples et règles d'intégrité.
- [x] `docs/EVENT_AND_MEMORY_SYSTEM.md` : distinction état courant / historique factuel / souvenirs subjectifs, types d'événements, `WorldEvent`/`Memory` proposés, immuabilité du journal, consolidation/oubli `faded`, frontière LLM, tests.
- [x] `docs/SIMULATION_TIME_AND_ENGINE.md` : options de tick/fréquence (provisoires, non finales), `SimulationClock`, déterminisme/seed/PRNG sérialisable, ordre stable, snapshot puis application, transaction par tick, pause/reprise, frontière worker/main/IPC, paramètres à calibrer.
- [x] Diagrammes Mermaid ajoutés dans les 4 documents.
- [x] Aucune modification de code, schéma, migration, IPC, worker, UI, LLM ou donnée utilisateur.

## Fichiers créés (Phase 0 / Phase 1 / Phase 2 design)

Principaux Phase 0 : `package.json`, `vite.config.ts`, `tsconfig*.json`, `scripts/*`,
`src/main/**`, `src/preload/**`, `src/renderer/**`, `src/shared/**`, `index.html`, docs.

Ajouts Phase 1 (menu + personnages) :
- `src/shared/world.ts`, `src/shared/character.ts`
- `src/main/services/world-store.service.ts`, `src/main/services/prng.ts`, `src/main/services/character-generator.service.ts`
- `src/main/ipc/world.ipc.ts`
- `src/renderer/components/CreateWorldDialog.tsx`
- `tests/world-store.test.ts`, `tests/character-generation.test.ts`

Ajouts tranche reprise :
- `src/renderer/components/WorldView.tsx`
- `src/renderer/components/CharacterDetail.tsx`
- `src/renderer/components/StatBar.tsx`
- `tests/world-resume-ui.test.tsx`

Ajouts tranche création manuelle + bibliothèque :
- `src/main/services/character-validation.service.ts`
- `src/main/ipc/character.ipc.ts`
- `src/renderer/components/CharacterForm.tsx`
- `src/renderer/components/LibraryView.tsx`
- `src/renderer/components/AddFromLibraryDialog.tsx`
- `src/renderer/components/UseInWorldDialog.tsx`
- `src/renderer/components/character-labels.ts`
- `tests/character-library.test.ts`, `tests/character-library-ui.test.tsx`

Ajouts tranche suppression d'instance :
- `src/renderer/components/ConfirmDeleteCharacterDialog.tsx`
- `tests/character-deletion.test.ts`, `tests/character-deletion-ui.test.tsx`

Ajouts tranche conception Phase 2 (documentaire uniquement) :
- `docs/CHARACTER_STATE_ARCHITECTURE.md`
- `docs/EVENT_AND_MEMORY_SYSTEM.md`
- `docs/SIMULATION_TIME_AND_ENGINE.md`

Ajouts tranche Phase 3A (infrastructure simulation) :
- `src/shared/simulation.ts`
- `src/main/ipc/simulation.ipc.ts`
- `src/main/services/simulation-manager.service.ts`
- `src/main/simulation/simulation.worker.ts`
- `tests/prng.test.ts`
- `tests/simulation.test.ts`

Ajouts tranche conception Phase 3B (documentaire uniquement) :
- `docs/NEEDS_EVOLUTION.md`
- `docs/EMOTION_EVOLUTION.md`
- `docs/CHARACTER_TICK_RULES.md`

Ajouts tranche implémentation Phase 3B :
- `src/shared/simulation-rules.ts`
- `src/main/services/simulation-parameters.service.ts`
- `src/main/services/personality-influence.service.ts`
- `src/main/services/needs-evolution.service.ts`
- `src/main/services/emotion-evolution.service.ts`
- `src/main/services/character-tick.service.ts`
- `tests/simulation-rules-fixtures.ts`
- `tests/personality-influence.test.ts`
- `tests/needs-evolution.test.ts`
- `tests/emotion-evolution.test.ts`
- `tests/character-tick.test.ts`
- `tests/simulation-long.test.ts`

Ajouts tranche conception Phase 3C (documentaire uniquement) :
- `docs/AUTONOMOUS_DECISION_SYSTEM.md`
- `docs/ACTION_SYSTEM.md`
- `docs/GOAL_SELECTION_SYSTEM.md`

Ajouts tranche implémentation Phase 3C — tranche 1 :
- `src/shared/action.ts`
- `src/shared/decision.ts`
- `src/main/services/action-registry.service.ts`
- `tests/action-registry.test.ts`

Ajouts tranche implémentation Phase 3C — tranche 3 :
- aucune nouvelle source ; modifications de `src/main/services/character-tick.service.ts`, `src/main/services/decision-engine.service.ts`, `src/main/services/world-store.service.ts`, `tests/simulation.test.ts`, `tests/simulation-long.test.ts`, `tests/character-tick.test.ts`.

Ajouts tranche conception Phase 3D (documentaire uniquement) :
- `docs/PHASE_3D_DESIGN.md`
- `docs/DECISION_HISTORY_SYSTEM.md`
- `docs/WORKER_TICK_PROTOCOL.md`
- `docs/SAFE_PERSISTENCE.md`
- `docs/WORLD_STORE_REFACTORING.md`
- `docs/DECISION_INSPECTOR_UI.md`

Ajouts tranche implémentation Phase 3D-A :
- `src/main/services/decision-record.service.ts`
- `src/main/services/decision-history.store.ts`
- `tests/decision-record.test.ts`
- `tests/decision-record-fixtures.ts`
- `tests/decision-history.test.ts`
- `tests/decision-golden-hash.test.ts`

Ajouts tranche implémentation Phase 3D-B :
- `src/main/services/database-connection.service.ts`
- `src/main/services/database-schema.service.ts`
- `src/main/services/db-write-lock.service.ts`
- `src/main/services/persistence.service.ts`
- `tests/atomic-persistence.test.ts`
- `tests/db-write-lock.test.ts`
- `tests/simulation-manager-lock.test.ts`
- `tests/zz-benchmark.tmp.test.ts` (outil local temporaire, exclu des validations et ignoré par Git, jamais lancé pendant la validation finale)

Ajouts tranche implémentation Phase 3D-C1/C2 :
- `src/shared/worker-protocol.ts`, `src/shared/canonicalization.ts`, `src/shared/decision-validation.ts`
- `src/main/services/tick-writer.service.ts`, `src/main/simulation/tick-compute.worker.ts`
- `tests/worker-tick-protocol.test.ts`, `tests/tick-writer.test.ts`, `tests/worker-tick-parity.test.ts`,
  `tests/worker-tick-golden-matrix.long.test.ts`, `tests/worker-tick-fixtures.ts`

Ajouts tranche implémentation Phase 3D-C3/C4 :
- `src/main/simulation/tick-compute-client.service.ts`
- `tests/compute-worker-test-helpers.ts`, `tests/tick-compute-client.test.ts`,
  `tests/simulation-worker-integration.test.ts`

Documentation arbitrages Phase 3D-C (mission documentaire du 2026-11-26) :
- aucun fichier créé ; aucun code, test, benchmark, commit ni push
- fichiers modifiés : `docs/PHASE_3D_DESIGN.md`, `docs/WORKER_TICK_PROTOCOL.md`,
  `docs/SAFE_PERSISTENCE.md`, `docs/WORLD_STORE_REFACTORING.md`,
  `docs/DECISION_HISTORY_SYSTEM.md`, `docs/CHARACTER_STATE_ARCHITECTURE.md`,
  `docs/SIMULATION_TIME_AND_ENGINE.md`, `docs/ARCHITECTURE.md`, `README.md`,
  `HANDOFF.md`, `PROGRESS.md`, `CHANGELOG.md`

Ajouts tranche implémentation Phase 3C — tranche 2 :
- `src/main/services/goal-selection.service.ts`
- `src/main/services/action-candidacy.service.ts`
- `src/main/services/action-scoring.service.ts`
- `src/main/services/decision-engine.service.ts`
- `src/main/services/action-runtime.service.ts`
- `src/main/services/action-execution.service.ts`
- `tests/phase3c-fixtures.ts`
- `tests/goal-selection.test.ts`
- `tests/action-candidacy.test.ts`
- `tests/action-scoring.test.ts`
- `tests/decision-engine.test.ts`
- `tests/action-runtime.test.ts`
- `tests/action-execution.test.ts`

## Fichiers modifiés

- Phase 0 : `tsconfig.base.json`, `tsconfig.test.json`, `src/main/ipc/app.ipc.ts`, `scripts/check-deps.mjs`, `scripts/dev.mjs`, `scripts/build.mjs`, `src/main/services/resource.service.ts`, docs mineures.
- Phase 1 menu : `src/shared/ipc.ts`, `src/preload/preload.ts`, `src/main/main.ts`, `src/renderer/App.tsx`, `src/renderer/styles/global.css`, `tests/phase0.test.ts`.
- Phase 1 personnages : `src/shared/ipc.ts`, `src/shared/world.ts`, `src/main/services/world-store.service.ts`, `src/main/ipc/world.ipc.ts`, `src/preload/preload.ts`, `tests/phase0.test.ts`, `docs/CHARACTER_SYSTEM.md`.
- Correctif dev Linux : `scripts/dev.mjs` (détection sandbox restreint, `--no-sandbox` dev uniquement, avertissement), `vite.config.ts` → `vite.config.mts`, `tsconfig.json`, `docs/TROUBLESHOOTING.md`, `docs/DEVELOPMENT.md`, `PROGRESS.md`, `HANDOFF.md`, `CHANGELOG.md`.
- Tranche reprise : `src/shared/ipc.ts`, `src/preload/preload.ts`, `src/main/ipc/world.ipc.ts`, `src/main/services/world-store.service.ts`, `src/renderer/App.tsx`, `src/renderer/styles/global.css`, `tests/phase0.test.ts`, `tests/world-store.test.ts`, `package.json`, `package-lock.json`, docs de suivi.
- Tranche création manuelle + bibliothèque : `src/shared/character.ts`, `src/shared/world.ts`, `src/shared/ipc.ts`, `src/preload/preload.ts`, `src/main/main.ts`, `src/main/services/world-store.service.ts`, `src/main/services/character-generator.service.ts`, `src/renderer/App.tsx`, `src/renderer/components/WorldView.tsx`, `src/renderer/components/CharacterDetail.tsx`, `src/renderer/styles/global.css`, `tests/phase0.test.ts`, `tests/character-generation.test.ts`, `tests/world-resume-ui.test.tsx`, `PROGRESS.md`, `HANDOFF.md`, `CHANGELOG.md`, `README.md`, `docs/CHARACTER_SYSTEM.md`, `docs/DATABASE.md`.
- Tranche suppression d'instance : `src/shared/ipc.ts`, `src/main/services/world-store.service.ts`, `src/main/ipc/character.ipc.ts`, `src/preload/preload.ts`, `src/renderer/components/WorldView.tsx`, `src/renderer/components/CharacterDetail.tsx`, `src/renderer/styles/global.css`, `tests/phase0.test.ts`, `tests/world-resume-ui.test.tsx`, `tests/character-library-ui.test.tsx`, `PROGRESS.md`, `HANDOFF.md`, `CHANGELOG.md`, `README.md`, `docs/CHARACTER_SYSTEM.md`, `docs/DATABASE.md`.
- Tranche conception Phase 2 (documentaire) : `docs/CHARACTER_STATE_ARCHITECTURE.md`, `docs/RELATIONSHIP_SYSTEM.md` (réécrit/étendu), `docs/EVENT_AND_MEMORY_SYSTEM.md`, `docs/SIMULATION_TIME_AND_ENGINE.md`, `PROGRESS.md`, `HANDOFF.md`, `CHANGELOG.md`, `README.md`.
- Tranche Phase 3A (infrastructure simulation) : `src/main/services/prng.ts`, `src/main/services/world-store.service.ts`, `src/main/ipc/world.ipc.ts`, `src/main/main.ts`, `src/preload/preload.ts`, `src/shared/ipc.ts`, `src/shared/world.ts`, `src/renderer/components/WorldView.tsx`, `src/renderer/components/UseInWorldDialog.tsx`, `src/renderer/styles/global.css`, `scripts/test.mjs`, `tests/phase0.test.ts`, `tests/character-library.test.ts`, `tests/character-library-ui.test.tsx`, `tests/character-deletion-ui.test.tsx`, `tests/world-resume-ui.test.tsx`, `docs/ARCHITECTURE.md`, `docs/DATABASE.md`, `docs/SIMULATION_TIME_AND_ENGINE.md`, `docs/DEVELOPMENT.md`, `README.md`, `CHANGELOG.md`, `PROGRESS.md`, `HANDOFF.md`.
- Tranche conception Phase 3B (documentaire) : `PROGRESS.md`, `HANDOFF.md`, `CHANGELOG.md`, `README.md` (liens docs uniquement, si pertinent). Aucun fichier applicatif modifié.
- Tranche implémentation Phase 3B : `src/main/services/world-store.service.ts` (tick atomique + hook de test rollback), `tests/simulation.test.ts` (intégration SQLite), `docs/NEEDS_EVOLUTION.md`, `docs/EMOTION_EVOLUTION.md`, `docs/CHARACTER_TICK_RULES.md`, `PROGRESS.md`, `HANDOFF.md`, `CHANGELOG.md`, `README.md` (si mention Phase 3B).
- Tranche conception Phase 3C (documentaire) : `docs/AUTONOMOUS_DECISION_SYSTEM.md`, `docs/ACTION_SYSTEM.md`, `docs/GOAL_SELECTION_SYSTEM.md`, `docs/SIMULATION_ENGINE.md` (encart de statut), `PROGRESS.md`, `HANDOFF.md`, `CHANGELOG.md`, `README.md`. Aucun fichier applicatif, schéma SQLite, migration, worker, IPC, preload, UI ou LLM modifié.
- Tranche implémentation Phase 3C — tranche 1 : `src/shared/simulation-rules.ts`, `src/main/services/simulation-parameters.service.ts`, `src/main/services/character-tick.service.ts` (retour vide des nouveaux tableaux), `docs/AUTONOMOUS_DECISION_SYSTEM.md` (§12.4), `PROGRESS.md`, `HANDOFF.md`, `CHANGELOG.md`, `README.md`.
- Tranche implémentation Phase 3C — tranche 2 : `src/shared/decision.ts`, `src/shared/simulation-rules.ts`, `docs/AUTONOMOUS_DECISION_SYSTEM.md` (calibration, services, état), `PROGRESS.md`, `HANDOFF.md`, `CHANGELOG.md`, `README.md`. Aucun appel à ces services depuis le tick.
- Tranche implémentation Phase 3C — tranche 3 : `src/main/services/character-tick.service.ts`, `src/main/services/decision-engine.service.ts`, `src/main/services/world-store.service.ts`, `tests/simulation.test.ts`, `tests/simulation-long.test.ts`, `tests/character-tick.test.ts`, `docs/AUTONOMOUS_DECISION_SYSTEM.md`, `docs/ACTION_SYSTEM.md`, `docs/GOAL_SELECTION_SYSTEM.md`, `PROGRESS.md`, `HANDOFF.md`, `CHANGELOG.md`, `README.md`.
- Tranche conception Phase 3D (documentaire) : `docs/DATABASE.md`, `docs/ARCHITECTURE.md`, `docs/SIMULATION_ENGINE.md`, `docs/EVENT_AND_MEMORY_SYSTEM.md`, `README.md`, `PROGRESS.md`, `HANDOFF.md`, `CHANGELOG.md`. Aucun fichier applicatif, schéma SQLite, migration, worker, IPC, preload, UI ni appel LLM modifié.
- Tranche implémentation Phase 3D-A : `src/shared/action.ts`, `src/shared/decision.ts`, `src/shared/simulation-rules.ts`, `src/main/services/action-runtime.service.ts`, `src/main/services/character-tick.service.ts`, `src/main/services/world-store.service.ts`, `tests/simulation.test.ts` (timeout documenté du test long), `docs/DECISION_HISTORY_SYSTEM.md`, `docs/PHASE_3D_DESIGN.md`, `docs/DATABASE.md`, `README.md`, `PROGRESS.md`, `HANDOFF.md`, `CHANGELOG.md`.
- Tranche implémentation Phase 3D-B : `src/main/ipc/world.ipc.ts`, `src/main/services/simulation-manager.service.ts`, `src/main/services/world-store.service.ts`, `docs/SAFE_PERSISTENCE.md`, `docs/WORLD_STORE_REFACTORING.md`, `docs/DATABASE.md`, `docs/PHASE_3D_DESIGN.md`, `docs/DECISION_HISTORY_SYSTEM.md`, `docs/ARCHITECTURE.md`, `docs/SIMULATION_ENGINE.md`, `docs/CHARACTER_STATE_ARCHITECTURE.md`, `docs/SIMULATION_TIME_AND_ENGINE.md`, `docs/AUTONOMOUS_DECISION_SYSTEM.md`, `docs/CHARACTER_TICK_RULES.md`, `README.md`, `PROGRESS.md`, `HANDOFF.md`, `CHANGELOG.md`, `.gitignore` (benchmark local ignoré sans suppression).
- Arbitrages Phase 3D-C (mission documentaire du 2026-11-26) : `docs/PHASE_3D_DESIGN.md`, `docs/WORKER_TICK_PROTOCOL.md`, `docs/SAFE_PERSISTENCE.md`, `docs/WORLD_STORE_REFACTORING.md`, `docs/DECISION_HISTORY_SYSTEM.md`, `docs/CHARACTER_STATE_ARCHITECTURE.md`, `docs/SIMULATION_TIME_AND_ENGINE.md`, `docs/ARCHITECTURE.md`, `README.md`, `PROGRESS.md`, `HANDOFF.md`, `CHANGELOG.md`. Aucun fichier applicatif, test, schéma, canal IPC, worker, benchmark ni donnée utilisateur modifié.
- Tranche implémentation Phase 3D-C1/C2 : `src/shared/action.ts`, `src/shared/simulation-rules.ts`, `src/main/services/action-registry.service.ts`, `src/main/services/simulation-parameters.service.ts`, `src/main/services/character-tick.service.ts`, `src/main/services/decision-record.service.ts`, `src/main/services/world-store.service.ts`, `tests/decision-golden-hash.test.ts`, plus les documents de suivi et techniques concernés.
- Tranche implémentation Phase 3D-C3/C4 : `src/main/simulation/tick-compute.worker.ts` (commentaire de statut), `src/main/simulation/tick-compute-client.service.ts` (nouveau), `src/main/services/simulation-manager.service.ts`, `src/main/services/world-store.service.ts`, `src/main/ipc/world.ipc.ts`, `src/main/ipc/character.ipc.ts`, `tests/simulation-manager-lock.test.ts`, `tests/compute-worker-test-helpers.ts` (nouveau), `tests/tick-compute-client.test.ts` (nouveau), `tests/simulation-worker-integration.test.ts` (nouveau), plus les documents de suivi et techniques concernés.

## Tests réussis

> Dernière vérification complète : tranche 3D-C3/C4 (2026-11-27). Les validations ont été
> exécutées séquentiellement, sans benchmark ni scénario 50/100 personnages superflus.

- `./.tools/node/versions/v26.13.1-linux-x64/bin/node scripts/check-deps.mjs` : **OK**.
- `./.tools/node/versions/v26.13.1-linux-x64/bin/node scripts/typecheck.mjs` : **OK** (4 tsconfigs).
- `./.tools/node/versions/v26.13.1-linux-x64/bin/node scripts/test.mjs` : **148/148 passés** (15 fichiers, dont les nouveaux tests Phase 3B).
- `./.tools/node/versions/v26.13.1-linux-x64/bin/node scripts/build.mjs` : **OK**.
- **Validation tranche conception Phase 3B (documentaire)** : check-deps OK, typecheck 4 configs OK, tests **102/102 passés** (10 fichiers, aucun code modifié), build OK. Vérification croisée : 21 traits / 10 émotions / 8 besoins présents, 13 traits utilisés et 8 exclus avec justification, 2 diagrammes Mermaid, 5 liens de documentation valides.
- **Smoke Electron réel Linux** (2026-11-24, `--no-sandbox --disable-gpu`, CDP, 2 lancements avec redémarrage réel) : création monde `SMOKE-SIM` (seed 123, 2 personnages), start tick 0 running, pause, step -> tick 1, vitesse 10x, fermeture, relance restaurée (tick 1, paused, `rngState=2246822416`, world `simulation_paused`), resume, step -> tick 2, suppression monde smoke, `SMOKE_OK`. DB utilisateur sauvegardée/restaurée (`/tmp/dl-worlds-backup.sqlite`) avant commit.
- **Validation tranche implémentation Phase 3B** : check-deps OK, typecheck 4 configs OK, tests **148/148 passés** (15 fichiers), build OK. Simulations longes 24/72/168/720/3000 ticks + 6 profils documentés : bornes 0–100 respectées, déterminisme confirmé, pas d'oscillation artificielle ni de saturation sans cause active, PRNG inchangé.
- **Validation tranche conception Phase 3C (documentaire)** : check-deps OK, typecheck 4 configs OK, tests **148/148 passés** (15 fichiers, aucun code modifié), build OK. Vérification croisée : 3 documents créés avec diagrammes Mermaid, contrats TypeScript proposés, distinction décisions définitives / hypothèses / reporté, audit Git (HEAD = `origin/main` = `1b39145`, arbre propre avant tranche), aucun secret ni fichier généré ajouté.
- **Validation tranche implémentation Phase 3C — tranche 1** : check-deps OK, typecheck 4 configs OK, tests **158/158 passés** (16 fichiers). Aucun build rejoué : contrats purs uniquement, aucun bundle modifié. Audit Git avant tranche : HEAD local = `origin/main` = `c18e481`, arbre propre, `git fetch origin --dry-run` sans changement.
- **Validation tranche implémentation Phase 3C — tranche 2** : check-deps OK, typecheck 4 configs OK, tests **209/209 passés** (22 fichiers, dont 51 tests des services purs), build OK. Audit Git avant tranche : HEAD local = `origin/main` = `033fced`, arbre propre. Aucun appel des services depuis le tick : comportement Phase 3B inchangé.
- **Validation tranche implémentation Phase 3C — tranche 3** : check-deps OK (via build), typecheck 4 configs OK, tests **215/215 passés** (22 fichiers), build OK. Scénarios SQLite : runtime persistant, rejeu après réouverture, rollback intégral sur runtime corrompu, deux personnages, `current_goals_json` inchangé. Longs : 24/72/168/720/3000 ticks + 6 profils, anti-boucle et bornes vérifiés.
- **Validation tranche conception Phase 3D (documentaire)** : check-deps OK, typecheck 4 configs OK, tests **215/215 passés** (22 fichiers), build OK. Vérification croisée : 6 nouveaux documents, 4 documents techniques mis à jour, audit indépendant intégré, liens Markdown locaux valides, `git diff --check` OK, aucun fichier applicatif modifié.
- **Validation tranche implémentation Phase 3D-A** : check-deps OK, typecheck 4 configs OK, tests **252/252 passés** (25 fichiers : 215 existants + 37 nouveaux), build OK. Tests ciblés 37/37 (10 sérialisation, 9 SQLite, 18 Golden Hash). Vérification migration legacy (`schema_migrations` `3D-1`, colonnes et index présents dans le fichier persisté), rollback sans orphelin, conservation après suppression d'instance, cascade monde, doublons rejetés, tailles BLOB mesurées à 10/50/100 personnages. Golden Hash 18 scénarios inchangé. Aucun secret ni fichier généré ajouté, aucun canal IPC/preload/renderer/worker modifié.
- **Validation tranche implémentation Phase 3D-B** : sauvegarde externe 22/22 fichiers vérifiée avant toute validation ; check-deps OK, typecheck 4 configs OK, tests **264/264 passés** (27 fichiers, benchmark et test long explicitement exclus), test long isolé **9/9** en 6,00 s, build de production OK (2 145 modules). Surveillance : RAM disponible minimale 7 587 MiB, swap 0, RSS max 259 232 KiB, charge max 1,80 pour la suite globale ; test long : RAM min 7 836 MiB, swap 0, RSS max 262 072 KiB, charge max 1,44 ; build : RAM min 7 767 MiB, swap 0, RSS max 255 648 KiB, charge max 0,77. Aucun seuil d'arrêt franchi, aucun processus résiduel. Pannes injectées : fsync refusé, hash altéré, `rename` `EPERM` simulé, échec après rename, restauration mémoire/disque octet pour octet, sérialisation deux mondes, file libérée après erreur et timeout, suppression pendant tick et suppressions concurrentes. `worlds.sqlite` utilisateur intact (24 576 octets, SHA-256 `562c36d1fc672bc47569eef56656a7dd32b5c11b13130ebff8ebad9bf4898182`). Benchmarks locaux non rejoués pendant la validation finale : 3 personnages 63,68 ms au tick 10 / 377,56 ms au tick 200 ; 10 personnages 548,45 ms ; 50 personnages 1 329,12 ms ; 100 personnages 1 652,77 ms ; 3×10 mondes 1 254,09 ms/tick. Aucune mesure 3D-A comparable à effectif égal : ces chiffres ne prouvent pas une amélioration.

- **Validation tranche implémentation Phase 3D-C1/C2** : typecheck 4 configs OK ; ciblés 15/15 (protocole 8, tick-writer 4, parité 3) ; Golden Hash ordinaires **18/18** inchangés ; suite complète **279/279** (30 fichiers, benchmark et tests longs exclus, rejouée après mise à jour documentaire) ; matrice Golden Hash longue **96/96** en instance Vitest isolée (165,66 s) ; build de production OK avec check-deps intégré. Aucun test de benchmark ni simulation longue 3B rejoué : aucun changement de règle, de PRNG ni de persistance ; le harnais worker utilise le bundle `dist/main/simulation/tick-compute.worker.js` produit par ce build.
- **Validation tranche implémentation Phase 3D-C3/clôture 3D-C4** : check-deps OK ; typecheck 4 configs OK ; ciblés **57/57** (protocole, tick-writer, parité, client worker 10, verrou manager 7, intégration 7, Golden Hash) ; suite complète **298/298** (32 fichiers, benchmark et tests longs exclus) ; matrice Golden Hash longue **96/96** en instance Vitest isolée (158,84 s) ; simulation longue 3B **9/9** (5,59 s, rejouée car la frontière d'écriture du tick a été partagée) ; build de production OK avec check-deps intégré (2 145 modules). Surveillance : aucun processus Node/Vitest/Electron résiduel après les validations ; mémoire disponible 6 508 MiB, swap 0, charge 1,25 au contrôle final. Aucun benchmark lancé, aucune donnée utilisateur modifiée, aucun secret ajouté.

## Tests échoués

- Lors d'un lancement **parallèle** des quatre validations (check-deps, typecheck, tests,
  build), le scénario « 3000 ticks » de `tests/simulation-long.test.ts` a dépassé son timeout
  de 5 s (147/148). Relance isolée immédiate : **148/148 OK**. Aucun code modifié ; ne pas
  paralléliser ces commandes sur cet environnement. En tranche 3, le scénario équivalent a de nouveau frôlé le timeout sous charge : un délai explicite de 20 s lui est désormais attribué dans `tests/simulation-long.test.ts`, sans modifier le moteur.

## Bugs connus

- Aucun bug applicatif confirmé. Le blocage lancement Electron dev sur Linux restreint (AppArmor/userns, `chrome-sandbox` non setuid) est corrigé en dev par détection + `--no-sandbox` **processus dev uniquement** avec avertissement (voir Problèmes techniques).

## Problèmes techniques

- Réseau instable pendant sessions précédentes : téléchargements Electron interrompus ; résolu via archive officielle vérifiée SHA-256. `npm install` a nécessité `--prefer-online --fetch-retries=5` après ERESOLVE transitoire.
- **Linux restreint (AppArmor/userns)** : `chrome-sandbox` du zip Electron est 0755 (pas setuid root) et `kernel.apparmor_restrict_unprivileged_userns=1` bloque le sandbox userns non privilégié. `scripts/dev.mjs` détecte ce cas et lance Electron dev avec `--no-sandbox` **uniquement pour ce processus**, avec avertissement explicite. `src/main/security/window.ts` reste inchangé (`contextIsolation:true`, `nodeIntegration:false`, `sandbox:true`, `webSecurity:true`). Correction propre : profil AppArmor dédié ou `chrome-sandbox` root:root 4755 (implications sécurité, action manuelle hors scripts).
- Bug corrigé : preload sandboxé bundlé Rolldown.
- Bug corrigé : résolution `app.getAppPath()`/WASM en dev via `ROOT` + fallback `process.cwd()`.
- Bug corrigé (tranche bibliothèque) : index `template_id` créé avant migration sur bases legacy → « no such column » au smoke réel ; ordre corrigé + test de migration legacy. Le smoke réel sur base existante est indispensable (les tests sur base neuve ne couvraient pas ce cas).
- **Performance 3D-B/3D-C** : la durabilité ajoutée (temporaire, double hash, `fsync` fichier/répertoire) coûte plus cher que l'ancien `writeFileSync` direct. `persist()` réexporte toujours toute la base, avec double copie mémoire et double SHA-256 ; `decision_records` croît sans purge, `VACUUM` ni rétention. Depuis 3D-C3, le verrou global est relâché pendant l'attente du worker et repris uniquement pour la validation et la persistance ; aucune optimisation opportuniste n'a été appliquée.

## Prochaine tâche précise

Les tranches **3D-A, 3D-B et 3D-C1 à 3D-C4 sont terminées, validées, commitées et poussées**. Ne pas les recommencer. La mission s'arrête ici : ne pas démarrer **3D-D** (IPC de lecture et inspecteur UI) sans validation explicite distincte. Le calcul de production passe désormais par le worker de calcul via le client isolé, sans repli synchrone ; `stepSimulation()` reste uniquement la référence de test. La limitation de performance documentée (`persist()` réexporte toute la base, coût croissant avec l'historique) reste ouverte : hash en flux, persistance groupée et rétention de l'historique ne sont pas implémentés. La politique `forkFromStopped` reste documentée et **non implémentée**. Ne pas démarrer relations/événements canoniques/souvenirs/mort/LLM sans documentation de conception dédiée.
