# CHANGELOG

Format : entrées datées, catégories Added / Changed / Fixed / Removed / Technical decisions.

## 2026-11-24 — Phase 3D (conception du moteur, documentaire, non implémentée)

### Added
- `docs/PHASE_3D_DESIGN.md` : architecture cible et découpage en quatre tranches autonomes (3D-A historique, 3D-B persistance/verrous, 3D-C worker de calcul, 3D-D IPC/UI), avec objectifs, fichiers prévus, SQLite, contrats, dépendances, tests, critères d'acceptation, risques et exclusions.
- `docs/DECISION_HISTORY_SYSTEM.md` : contrat `DecisionRecordV1`, table `decision_records`, validation stricte, migration additive, distinction avec le journal canonique Phase 5.
- `docs/WORKER_TICK_PROTOCOL.md` : protocole versionné du second worker de calcul, corrélation par `requestId`, gestion des doublons/tardifs/timeouts/recréation et plan Golden Hash.
- `docs/SAFE_PERSISTENCE.md` : persistance `temp + fsync + SHA-256 + rename`, restauration de la base mémoire, verrou global ordonné et suppression de monde sérialisée.
- `docs/WORLD_STORE_REFACTORING.md` : façade stable et extraction progressive en neuf modules, helpers de test conservés.
- `docs/DECISION_INSPECTOR_UI.md` : deux canaux IPC de lecture, filtres bornés, throttle 500 ms, jeton de requête, états et tests.

### Changed
- `PROGRESS.md` et `HANDOFF.md` : Phase 3D marquée conçue et en attente de validation ; constats corrigés sur le tick main, `getWorld()`, `worldLocks` et le renderer.
- `docs/DATABASE.md` : état réel Phase 3C, `current_action_json`, `current_goals_json`, tick atomique et tables 3D planifiées.
- `docs/ARCHITECTURE.md` : séparer worker planificateur et worker de calcul planifié, rappeler que SQLite reste dans le main.
- `docs/SIMULATION_ENGINE.md` : corriger l'affirmation selon laquelle le calcul tourne déjà dans un worker et préciser que les explications ne sont pas persistées.
- `docs/EVENT_AND_MEMORY_SYSTEM.md` : frontière entre historique technique 3D et journal canonique Phase 5.
- `README.md` : statut Phase 3D, liens de conception et correction du nombre de tests (215/215).

### Fixed
- Correction de l'audit initial : worker de calcul dédié, ordre des tranches, absence de FK historique vers `characters`, restauration mémoire après échec de `persist()`, façade de store conservée, UI en dernière tranche.
- Intégration de l'audit indépendant : payload/hash et colonnes d'historique alignés, verrous monde/global distincts, `beforeBuffer` exporté après reprise du verrou global, nettoyage de `worldLocks` corrigé dans la conception, recréation du worker sans `simulationGetStatus()`, `characterName` capturé dans `decision_records`, constats obsolètes et orthographe corrigés.

### Removed
- Aucun.

### Technical decisions
- Aucun code applicatif, schéma SQLite, migration, IPC, preload, UI, worker, donnée utilisateur ni appel LLM modifié.
- Implémentation bloquée jusqu'à validation explicite de la conception Phase 3D, y compris les décisions ouvertes de `docs/PHASE_3D_DESIGN.md` §10 : rétention/archivage, export manuel, timeout worker 30 s et `engineVersion`.
- Validations documentaires rejouées : check-deps OK, typecheck 4 configs OK, tests **215/215** (22 fichiers), build OK, `git diff --check` OK et liens Markdown locaux valides.

## 2026-11-24 — Phase 3C, tranche 3 (intégration au tick et persistance atomique)

### Added
- `src/main/services/character-tick.service.ts` : branchement des sept services sur le tick, deux jeux de candidats scorés, PRNG séquencé par `characterId`, explications et artefacts d'audit remplis.
- `src/main/services/world-store.service.ts` : colonne `characters.current_action_json` (schéma + migration additive), helpers de test `_getCharacterJsonColumnsForTests` / `_setCharacterActionJsonForTests`.
- `tests/simulation.test.ts` : 6 tests SQLite Phase 3C (subsistance, action longue, rejeu après réouverture, rollback sur runtime corrompu, deux personnages, objectifs inchangés).

### Changed
- `tests/simulation-long.test.ts` : 9 tests longs avec PRNG/runtime continus, anti-boucle sur décisions et critères documentés pour l'oscillation homeostatique du bonheur.
- `tests/character-tick.test.ts` : vérification de la traçabilité et du chaînage du PRNG.
- `docs/AUTONOMOUS_DECISION_SYSTEM.md`, `docs/ACTION_SYSTEM.md`, `docs/GOAL_SELECTION_SYSTEM.md` : statut d'implémentation et observations de calibration.
- `PROGRESS.md`, `HANDOFF.md`, `README.md` : état après la tranche 3.

### Fixed
- Anti-churn : une action n'est plus retenue depuis `idle` ou pour interrompre une action active que si son score est strictement positif et, pour une interruption, si elle traite le besoin le plus urgent. Sans cette garde, un besoin non réparable (santé, hygiène sans environnement) provoquait plus de 1300 interruptions sans bénéfice sur 3000 ticks.
- Le scénario « 3000 ticks » dispose d'un délai explicite de 20 s pour éviter les timeouts sous contention.

### Removed
- Aucun.

### Technical decisions
- Le runtime d'action, les besoins/émotions, l'horloge et `rngState` sont écrits dans une seule transaction avec un seul `persist(db)` ; un runtime corrompu reste une erreur technique avec rollback intégral.
- `current_goals_json` n'est toujours jamais écrit par le moteur ; le libellé des objectifs n'est jamais interprété.
- Une seule quantification par tick : `executeActionEffects` finalise les valeurs, l'orchestrateur ne les requantifie pas.
- Validations : typecheck 4 configs OK, tests **215/215** (22 fichiers), build OK. Commité et poussé (`9be7d27`).

## 2026-11-24 — Phase 3C, tranche 2 (services purs de décision et d'action)

### Added
- `src/main/services/goal-selection.service.ts` : urgences des besoins (criticité + tendance) et des émotions (direction), signal circadien, motivations regroupées en objectifs immédiats, tri stable, exclusions tracées.
- `src/main/services/action-candidacy.service.ts` : évaluation de toutes les préconditions (dont `any_of`, cooldown et environnement), Tier B toujours exclu, `idle` toujours faisable.
- `src/main/services/action-scoring.service.ts` : scoring déterministe et borné `[-5, 5]`, quantification à 3 décimales, traits/coût/répétition/durée/circadien, `idle = 0`.
- `src/main/services/decision-engine.service.ts` : poursuite d'action longue, interruption conditionnée par 4 critères, règles d'échec, `forced_idle`, départage par identifiant ou PRNG (un seul tirage), `DecisionExplanation` complète.
- `src/main/services/action-runtime.service.ts` : parse strict et sérialisation du runtime, transitions démarrer/poursuivre/interrompre/échouer, cooldowns, historique borné.
- `src/main/services/action-execution.service.ts` : effets nominaux modulés par les traits et bornés par la marge, baseline des émotions négatives, quantification unique, `ActionEffectDelta`, refus du Tier B et des effets non numériques.
- `tests/phase3c-fixtures.ts` et six fichiers de test : 51 tests unitaires des services (affamé, anxieux, sociable/indépendant, coûts, répétition, nuit, faisabilité, cooldown, départage rejouable, poursuite, interruption, échec, corruption, bornes d'effets).

### Changed
- `src/shared/decision.ts` : `GoalSelectionInput`, `DecisionRng`, `interruptionScored` (deuxième jeu de candidats évalué sans action active).
- `src/shared/simulation-rules.ts` : `AutonomousDecisionSnapshot.hour` issu de l'horloge logique.
- `docs/AUTONOMOUS_DECISION_SYSTEM.md` : calibration `EMOTION_WEIGHT = 10` justifiée, sept services documentés, rôle de `interruptionScored`, état d'implémentation tranche 2.
- `PROGRESS.md`, `HANDOFF.md`, `README.md` : état après la tranche 2.

### Fixed
- Aucun bug applicatif corrigé ; le tick reste strictement identique à la Phase 3B.

### Removed
- Aucun.

### Technical decisions
- `EMOTION_WEIGHT` passe de la valeur documentée `0.35` à `10` : avec `0.35`, un effet émotionnel nominal de −1 devenait −0.0035 de score et ne pouvait départager aucun scénario. La valeur reste configurable dans `DecisionParameters`.
- Une action active rend les alternatives infaisables via `no_active_action` : un second jeu de candidats calculé avec `active = null` est indispensable pour que la quatrième condition d'interruption puisse être vraie.
- Un échec d'action est une décision métier (`selectionRule = 'action_failed'`), pas une erreur de tick ; les effets déjà appliqués aux ticks précédents ne sont pas annulés.
- Un runtime corrompu reste une erreur technique avec rollback du tick ; `parseActionRuntime` ne répare jamais silencieusement.
- Validations : check-deps OK, typecheck 4 configs OK, tests **209/209** (22 fichiers), build OK.

## 2026-11-24 — Phase 3C, tranche 1 (contrats partagés et catalogue d'actions)

### Added
- `src/shared/action.ts` : 11 identifiants d'actions, catégories, préconditions (dont `any_of`), effets nominaux, coûts, durées, cooldowns, `ActionFailureRule`, intentions non numériques réservées mais jamais exécutées, runtime sérialisable et valeur par défaut.
- `src/shared/decision.ts` : motivations, objectifs immédiats, composantes de score, candidats évalués, explication complète et contrat d'entrée du moteur de sélection.
- `src/main/services/action-registry.service.ts` : catalogue statique versionné, validation stricte, lookup et listes déterministes ; Tier B déclaré mais infaisable sans environnement.
- `tests/action-registry.test.ts` : validation, identifiants, Tier A/B, `idle` sans effet, bornes de durée, absence d'effets non numériques, règle d'échec du sommeil.

### Changed
- `src/shared/simulation-rules.ts` : extension additive (snapshot étendu, paramètres de décision, cause `action_effect`, tableaux `decisions`/`actionDeltas`/`actionRuntimeStates` dans le résultat).
- `src/main/services/simulation-parameters.service.ts` : paramètres de décision par défaut, tous identifiés comme hypothèses calibrables.
- `src/main/services/character-tick.service.ts` : retourne les trois nouveaux tableaux vides en attendant l'intégration des services ; comportement Phase 3B inchangé.
- `docs/AUTONOMOUS_DECISION_SYSTEM.md` §12.4 : recette technique précise de `forkFromStopped`, explicitement **non implémentée**.
- `PROGRESS.md`, `HANDOFF.md`, `README.md` : état d'implémentation Phase 3C tranche 1.

### Fixed
- Aucun bug applicatif corrigé ; aucune valeur de simulation existante modifiée.

### Removed
- Aucun.

### Technical decisions
- `current_goals_json` reste hors de toute écriture du moteur ; `CharacterGoal.label` reste du texte libre non interprété.
- Le catalogue contient une règle d'échec documentée pour `sleep` (soif < 15, `keep_partial`) ; les effets déjà appliqués ne sont pas annulés.
- `DecisionRule` gagne `action_failed` pour distinguer l'échec métier de l'interruption ; les erreurs techniques restent des erreurs de tick avec rollback.
- `forkFromStopped` reste reporté : nouvel `id`, nouvelles lignes, source inchangée, horloge/`rngState` copiés, branche en pause, aucune réactivation silencieuse.
- Validations : check-deps OK, typecheck 4 configs OK, tests **158/158** (16 fichiers). Build non rejoué (aucun bundle modifié).

## 2026-11-24 — Phase 3C (conception du système de décisions et d'actions autonomes, documentaire)

### Added
- `docs/AUTONOMOUS_DECISION_SYSTEM.md` : audit Git/code complet, cycle de décision, snapshot cohérent et équité multi-personnages, scoring, sélection finale, protocole PRNG conditionnel, `DecisionExplanation`, adaptation sans action possible, découpe en six services purs, contrats TypeScript proposés, compatibilité transactionnelle, politique `simulation_stopped`, scénarios et critères de détection des boucles/répétitions/besoins négligés/inactivité.
- `docs/ACTION_SYSTEM.md` : catalogue extensible de 11 actions (dont `idle`), séparation Tier A immédiatement réalisable / Tier B nécessitant un environnement futur, préconditions, gains/coûts/effets nominaux, influence explicite des traits, machine à états des actions longues, interruption, échec, cooldown, règles d'extension du registre.
- `docs/GOAL_SELECTION_SYSTEM.md` : urgences des 8 besoins et 10 émotions, motivations concurrentes, objectifs immédiats non persistés, non-interprétation de `CharacterGoal.label`, hystérésis et `CharacterGoalV2` reportés, contrats proposés, tests prévus.
- Trois diagrammes Mermaid au minimum (cycle, machine à états d'action, flux services) et des contrats TypeScript **proposés**, aucun n'étant implémenté.

### Changed
- `docs/SIMULATION_ENGINE.md` : encart précisant que le cycle 16 étapes reste [Planifié] et renvoyant vers les trois documents Phase 3C.
- `README.md` : liens vers les trois nouveaux documents, statut Phase 3C documentaire, correction du nombre de tests (148/148).
- `PROGRESS.md`, `HANDOFF.md` : état Phase 3C, HEAD de départ `1b391458ee5f8bb0da27ffd05950bdfd7935b5c7`, prochaine tâche.

### Fixed
- Divergence documentaire relevée : `docs/CHARACTER_TICK_RULES.md` mentionnait un tri `localeCompare` alors que le code réel (`orderSnapshots()`) utilise une comparaison lexicographique directe ; la conception Phase 3C s'aligne sur le code.
- Relecture des contrats Phase 3C : urgence de tendance mesurée sur l'excès de dégradation (pas sur la dérive normale), alignement explicite du signe des effets émotionnels dans le score, source de `otherCharacterExists` explicitée, regroupement déterministe des motivations en objectifs immédiats, hystérésis dotée de l'état d'urgence nécessaire.

### Removed
- Aucun.

### Technical decisions
- Tranche **strictement documentaire** : aucun code applicatif, schéma SQLite, migration, worker, IPC, preload, UI ni appel LLM modifié. Aucune table `actions`, aucune colonne de runtime créée.
- Ordre de tick retenu : évolution passive Phase 3B inchangée → motivations/objectifs immédiats → candidats → scoring → décision → effets sur valeurs projetées → **quantification unique**.
- Aucune action ne modifie un autre personnage ; aucune ressource partagée n'existe en Phase 3C, donc aucun conflit d'ordre à arbitrer maintenant.
- `current_goals_json` n'est jamais écrit par le moteur ; les `label` d'objectifs (texte libre) ne sont pas interprétés (LLM interdit pour la décision).
- PRNG : au plus un tirage par personnage et par tick, uniquement en cas d'ex æquo de score ; `rngState` tracé et persisté dans la transaction ; `tieBreak: 'id'` conservé pour les rejeux de test.
- `simulation_stopped` : comportement actuel inchangé ; recommandation documentaire = nouvelle branche explicite depuis l'état arrêté, à valider avant implémentation.
- Toutes les valeurs numériques de décision sont des **hypothèses configurables** à calibrer ; seules les règles structurelles sont décidées définitivement.
- Validations : check-deps OK, typecheck 4 configs OK, tests **148/148** (15 fichiers, exécution isolée), build OK.

## 2026-11-24 — Phase 3B (implémentation de l'évolution déterministe des besoins et émotions)

### Added
- `src/shared/simulation-rules.ts` : contrats partagés des règles de tick (`SimulationParametersV1`, `CharacterTickInput/Snapshot/Result`, `TickDelta`, `NeedDelta`, `EmotionDelta`, causes explicables).
- `src/main/services/simulation-parameters.service.ts` : `DEFAULT_SIMULATION_PARAMETERS` (coefficients des 8 besoins, 10 émotions, seuils, plafonds) identifiés comme hypothèses configurables.
- `src/main/services/personality-influence.service.ts` : maths pures (clamp, `roundHalfEven`, `quantize`, facteurs/multiplicateurs de traits, pressions, baseline émotionnelle).
- `src/main/services/needs-evolution.service.ts` : projection des 8 besoins depuis le snapshot (décroissance, modificateurs de traits, accélérateurs, récupérations santé/sécurité, plafond de perte) avec deltas explicables.
- `src/main/services/emotion-evolution.service.ts` : projection des 10 émotions depuis le snapshot + besoins projetés (déficits, confort, pressions croisées, cibles, baseline personnelle, zone morte, plafonds, garde-fou anti-saturation).
- `src/main/services/character-tick.service.ts` : orchestration pure, tri déterministe des personnages, quantification finale aux centièmes, conservation stricte du PRNG.
- Tests : `tests/personality-influence.test.ts`, `tests/needs-evolution.test.ts`, `tests/emotion-evolution.test.ts`, `tests/character-tick.test.ts`, `tests/simulation-long.test.ts`, `tests/simulation-rules-fixtures.ts` ; intégration SQLite étendue dans `tests/simulation.test.ts` (rollback, réouverture, recovery, pause/step).

### Changed
- `stepSimulation` (`src/main/services/world-store.service.ts`) applique désormais l'évolution des personnages et l'horloge dans **une seule transaction** et **un seul `persist`** : `BEGIN` avant chargement du snapshot, calcul pur, écriture des `current_*_json` + miroirs legacy, `COMMIT`, rollback complet sur erreur. `initial_*` reste immuable.
- `docs/NEEDS_EVOLUTION.md`, `docs/EMOTION_EVOLUTION.md`, `docs/CHARACTER_TICK_RULES.md` : statut « implémenté », décisions définitives de précision/arrondi/safety/anti-saturation, causes de deltas enrichies, protocole de transaction corrigé.
- `PROGRESS.md`, `HANDOFF.md` mis à jour.

### Fixed
- **Stagnation des petits deltas** : passage des entiers aux centièmes (précision 2, `quantize` half-even) ; des deltas comme `-0.05` ne disparaissent plus à l'arrondi.
- **Asymétrie de `Math.round()`** sur les négatifs : `roundHalfEven()` symétrique (`-1.5 → -2`) avec tests des cas limites (`±0.5`, `±1.5`, `±2.5`).
- **Saturation artificielle de `happiness` à 100** observée vers 50 ticks sur scénario stable : pression positive plafonnée par la marge vers la baseline (cause `clamp/baseline.headroom`). Coefficients non modifiés arbitrairement.
- **Définition de `deficitPressure()`** : seuil interprété en points 0–100 comme les autres seuils (avant : mélange fraction/points).

### Removed
- Aucun.

### Technical decisions
- **Aucun changement de schéma SQLite** : les colonnes JSON existantes stockent déjà des `number` ; ni migration, ni worker, ni IPC, ni preload, ni UI modifiés.
- **Aucun PRNG consommé** : `rngState` strictement conservé ; aucun `Date.now()`/`Math.random()` dans les règles métier (horodatages de persistance uniquement).
- **Aucune autonomie ajoutée** : pas de décision, action, déplacement, relation, événement, souvenir, mort ni LLM/OpenRouter. Deltas détaillés non exposés via IPC/UI (volume).
- **Coefficients documentés conservés** : matrice émotionnelle qualitative convertie en poids numériques, tous configurables dans `SimulationParametersV1` ; validée par simulations longues 24/72/168/720/3000 ticks et six profils documentés.
- **Rollback vérifié** : hook de test `_setTickFailureForTests()` injecte une panne avant l'écriture de l'horloge ; ni personnages ni horloge ne sont modifiés. Hook non utilisé en production.
- Validations : check-deps OK, typecheck 4 configs OK, tests **148/148** (15 fichiers), build OK.

## 2026-11-24 — Phase 3B (conception du premier système d'évolution dynamique, documentaire)

### Added
- `docs/NEEDS_EVOLUTION.md` : définition des 8 besoins (100 = satisfait), dérive par tick, facteurs et traits pertinents, interactions inter-besoins, seuils critiques, conséquences futures (sans mort), conditions de récupération, formule générale et calibration provisoire.
- `docs/EMOTION_EVOLUTION.md` : définition des 10 émotions, causes de hausse/baisse, besoins influents, traits pertinents, interactions, baselines provisoires, matrice besoin→émotion, anti-boucles, plafonds et récupération.
- `docs/CHARACTER_TICK_RULES.md` : protocole de tick (snapshot → besoins projetés → émotions → agrégation → clamp/arrondi → application différée → transaction atomique + `persist` unique), déterminisme et gestion du PRNG, format `TickDelta[]`, contrats TypeScript proposés, architecture des 4 services purs futurs, calibration 24/72/168/720/plusieurs milliers de ticks, profils et critères d'échec, 2 diagrammes Mermaid.

### Changed
- `PROGRESS.md`, `HANDOFF.md` mis à jour pour refléter la conception Phase 3B ; Phase 3A reste la dernière tranche code implémentée/validée/poussée (`e0f6d0b`).

### Fixed
- Aucun.

### Removed
- Aucun.

### Technical decisions
- Tranche **strictement documentaire** : aucun code applicatif, schéma SQLite, migration, worker, IPC, preload, UI, LLM, mort, relations, événements ou souvenirs modifié ; aucune implémentation de l'évolution des personnages.
- Protocole de tick sans biais d'ordre : les émotions utilisent les besoins projetés du tick courant comme entrées de calcul uniquement, sans application prématurée.
- Aucun PRNG consommé par les règles passives Phase 3B ; `rngState` reste inchangé sauf règle future explicitement justifiée et testée par rejeu.
- `Date.now()`/`Math.random()` interdits dans les règles métier ; ordre de traitement stable ; reproductibilité après redémarrage.
- Explicabilité obligatoire des deltas via `TickDelta[]` (entityId, field, before, after, delta, causes[], ruleId).
- Décisions définitives, hypothèses provisoires et points à calibrer explicitement distingués (coefficients, arrondi `roundHalfEven` vs half-up, précision `number` vs centièmes).

## 2026-11-24 — Phase 3A (infrastructure fondamentale du moteur de simulation)

### Added
- **PRNG sérialisable** : `SeededRng.normalizeSeed()`, `getState(): uint32`, `setState(uint32)` avec validation stricte ; reprise exacte de séquence après restauration. Flux de simulation séparé du flux de génération (`simulationSeed = world.seed ^ 0x85ebca6b`).
- **Contrats partagés** : `src/shared/simulation.ts` (`SimulationClock`, `SimulationStatusView`, `SimulationSpeed`, statuts, constantes de temps, normalisation legacy `simulation_started` → `simulation_running`).
- **Persistance SQLite additive** : table `simulation_clock` (`world_id` PK/FK cascade, tick/day/hour/status/speed/rng_state/last_processed_order/created_at/updated_at) + index `idx_simulation_clock_status`. Migration non destructive.
- **Service simulation main/store** : `start/pause/resume/step/setSpeed/stop/getStatus`, récupération après redémarrage (`running` → `paused`, pas d'auto-reprise), validation des ids/statuts/vitesses, transaction SQLite par commande/tick puis `persist(db)` unique.
- **Worker de simulation** : `src/main/simulation/simulation.worker.ts` (Node `worker_threads`) gère uniquement la planification/signal `tick/step` ; aucune ouverture SQLite, aucun accès renderer. Communication main↔worker par messages structurés.
- **Manager main** : `src/main/services/simulation-manager.service.ts` (lifecycle worker, verrou par monde, anti double-tick, sync worker/état, broadcast `simulation:status-changed` vers fenêtres, arrêt propre au quit).
- **IPC/preload** : canaux `simulation:status/start/pause/resume/step/speed/stop` + événement `simulation:status-changed`, validation main, API preload typée, aucune capacité Node exposée au renderer.
- **UI minimale WorldView** : panneau « Temps interne » avec statut, jour/heure, tick, vitesse, boutons Démarrer/Pause/Reprendre/Step/Arrêter, vitesses 1x/2x/5x/10x. Statut affiché depuis le main ; boutons de modification personnages désactivés hors préparation.
- **Tests** : `tests/prng.test.ts`, `tests/simulation.test.ts`, mise à jour `tests/phase0.test.ts` et mocks UI pour le contrat API simulation.

### Changed
- `worlds.status` étendu additivement : `preparation | simulation_running | simulation_paused | simulation_stopped` ; lecture legacy `simulation_started` normalisée en `simulation_running`. La garde d'édition refuse tout statut non `preparation`.
- `scripts/test.mjs` compile `tsconfig.main.json` avant Vitest pour garantir la présence du worker JS dans `dist/`.
- `docs/DATABASE.md`, `docs/SIMULATION_TIME_AND_ENGINE.md`, `docs/ARCHITECTURE.md`, `docs/DEVELOPMENT.md`, `README.md`, `PROGRESS.md`, `HANDOFF.md` mis à jour.

### Fixed
- `UseInWorldDialog` : désactivation basée sur `status !== 'preparation'` (compatibilité avec les nouveaux statuts).

### Technical decisions
- **Tick atomique** : un tick/commande = transaction SQLite + un seul `persist(db)`. Le tick Phase 3A n'altère que l'horloge (aucune évolution de personnages/relations/événements/mémoires/LLM).
- **Worker sans SQLite** : le worker planifie et émet des signaux ; le main valide, sérialise par monde, écrit en base et diffuse l'état. Évite les accès concurrents sql.js/WASM et garde une frontière de sécurité claire.
- **Temps logique** : `Date.now()` n'intervient pas dans les règles de simulation ; il sert uniquement aux métadonnées `createdAt/updatedAt`.
- **Reprise après redémarrage** : les horloges `running` sont récupérées en `paused` au démarrage de l'app ; pas d'auto-reprise.
- **`simulation_stopped`** : arrêt volontaire, données conservées, pas de redémarrage implicite dans cette tranche (documenté ; reprise explicite/nouvelle sauvegarde à trancher plus tard).
- **Déterminisme** : PRNG simulation initialisé depuis `world.seed ^ 0x85ebca6b`, état `rng_state` persisté à chaque changement d'horloge ; `setState` refuse les états invalides.

## 2026-11-24 — Phase 2 (conception du système d'évolution des personnages, documentaire)

### Added
- `docs/CHARACTER_STATE_ARCHITECTURE.md` : audit de l'existant, séparation stable/dynamique,
  contrat `initialState` immuable après démarrage / `currentState` évolutif, règles de
  cohérence, structures TypeScript proposées, scénarios de non-régression.
- `docs/RELATIONSHIP_SYSTEM.md` : refonte/extension de la note Phase 4 en contrat complet
  (relations asymétriques `ownerId → targetId`, absence = neutre, 9 dimensions 0-100,
  types dérivés calculés, table additive `relationships` proposée, exemples, intégrité).
- `docs/EVENT_AND_MEMORY_SYSTEM.md` : distinction état courant / journal d'événements
  factuel immuable / souvenirs personnels subjectifs, structures `WorldEvent`/`Memory`,
  consolidation/oubli `faded` sans suppression physique, frontière LLM, tests prévus.
- `docs/SIMULATION_TIME_AND_ENGINE.md` : options de tick/fréquence (provisoires),
  `SimulationClock`, déterminisme PRNG sérialisable, ordre stable, snapshot puis application,
  transaction par tick, pause/reprise, frontière worker/main/IPC, paramètres à calibrer.

### Changed
- `PROGRESS.md`, `HANDOFF.md`, `README.md` mis à jour pour refléter la tranche de conception
  Phase 2 ; Phase 1 reste la dernière tranche code validée/poussée (`669c785`).

### Technical decisions
- Tranche **strictement documentaire** : aucun moteur, worker, tick, relation/événement/mémoire
  opérationnel, appel OpenRouter/LLM, modification de schéma/IPC/UI, ou donnée utilisateur.
- `initialState` devient immuable après `worlds.status = 'simulation_started'` ; seul
  `currentState` (et structures dynamiques) évolue en simulation.
- Une transaction SQLite par tick ; `Date.now()` interdit dans les règles ; PRNG métier
  sérialisable requis avant implémentation.
- Tables `relationships`/`events`/`memories`/`simulation_clock` proposées en additif seulement,
  jamais dans cette tranche.

## 2026-11-24 — Phase 1 (suppression d'une instance de personnage)

### Added
- **Suppression d'instance** : service `deleteCharacterInstance(id, worldId)` dans
  `world-store.service.ts` (validation des ids, garde `assertWorldPreparation`, contrôle
  d'appartenance `id` + `world_id`, `DELETE` ciblé, resynchronisation du compteur,
  persistance SQLite). Aucune modification de schéma ; le modèle et les autres mondes
  ne sont jamais touchés.
- **IPC/preload dédiés** : canal `character:delete` et méthode
  `deleteCharacter(id, worldId): Promise<{ deleted: boolean }>` (ids validés côté main).
- **UI** : action « Supprimer » sur chaque carte de personnage et « Supprimer ce personnage »
  dans la fiche, composant `ConfirmDeleteCharacterDialog` (personnage et monde identifiés,
  suppression définitive pour ce monde, annulation/confirmation), notification de succès,
  affichage des erreurs IPC, retour automatique à la liste après suppression depuis la fiche.
- **Tests** : `tests/character-deletion.test.ts` (13 cas service dont cross-world, statut
  verrouillé, modèle conservé, compteur, persistance, ids invalides) et
  `tests/character-deletion-ui.test.tsx` (5 cas jsdom dont annulation, actualisation,
  retour à la liste, erreur IPC). Total 88/88 tests (8 fichiers).

### Changed
- `WorldView` : cartes converties en `<div>` avec bouton d'ouverture interne (plus de boutons
  imbriqués), banners succès/erreur réutilisés, rafraîchissement liste + compteur après suppression.
- `CharacterDetail` : prop optionnelle `onDelete` (absente pour les modèles de bibliothèque).
- Documentation mise à jour : `PROGRESS.md`, `HANDOFF.md`, `README.md`,
  `docs/CHARACTER_SYSTEM.md`, `docs/DATABASE.md`.
- Smoke Electron réel (2 phases avec redémarrage) validé ; base utilisateur restaurée
  byte-identique après nettoyage.

### Fixed
- Aucun bug applicatif. Faux échec du harness smoke B (valeur numérique testée avec
  `.every(v === true)`) corrigé dans le script de test, séquence rejouée avec succès.

### Removed
- Rien.

### Technical decisions
- Suppression refusée côté main si `worlds.status !== 'preparation'`, sans dépendre d'un
  masquage de bouton dans le renderer.
- Double prédicat `id` + `world_id` sur le `DELETE`, précédé d'un `SELECT` d'appartenance :
  une manipulation IPC ne peut viser que l'instance du monde demandé. Messages d'erreur
  distincts : identifiants invalides / monde inexistant / personnage introuvable dans ce monde.
- `template_id` reste informatif (pas de FK, pas de cascade) : supprimer une instance
  n'affecte jamais le modèle ni ses autres instances.

## 2026-11-23 — Phase 1 (création manuelle de personnages + bibliothèque réutilisable)

### Added
- **Bibliothèque personnelle** : table `character_templates`, service CRUD complet
  (`createTemplate`, `listTemplates`, `getTemplate`, `updateTemplate`, `deleteTemplate`,
  `instantiateTemplate`), IPC/preload dédiés (`template:*`), écran `LibraryView`
  (cartes, recherche par nom, états chargement/vide/erreur/aucun résultat, dates).
- **Création manuelle** : formulaire `CharacterForm` en 6 étapes (identité, 21 traits avec
  libellés/descriptions FR et sliders, 10 émotions, 8 besoins, 1+2 objectifs, récapitulatif),
  option « monde seul » ou « monde + bibliothèque », bouton « Générer une personnalité
  cohérente » réutilisant le générateur déterministe (`generateDraftState`, IPC `character:random-draft`).
- **Ajout depuis la bibliothèque** dans l'écran monde : `AddFromLibraryDialog`
  (sélection → aperçu → confirmation → copie indépendante → actualisation immédiate).
- **Action « Utiliser »** depuis la bibliothèque : `UseInWorldDialog` (choix du monde puis instanciation).
- **Modification d'instance** en phase de préparation depuis la fiche personnage ;
  modification de modèle depuis la bibliothèque ; suppressions avec confirmation.
- Validation centralisée côté main : `character-validation.service.ts` (identifiants, chaînes,
  âge 18-65, genre, entiers 0-100, 21/10/8 clés exactes, objectifs 1 principal + 2 secondaires,
  existence monde/modèle).
- Types partagés : `CharacterTemplate`, `CharacterInstance` (alias `Character`), `CharacterState`
  (initial/courant), `CharacterDraft`, clés `TRAIT_KEYS`/`EMOTION_KEYS`/`NEED_KEYS`.
- `worlds.status` (`preparation` | `simulation_started`) + garde `assertWorldPreparation`
  (verrouillage futur, aucun faux démarrage de simulation).
- Tests : `tests/character-library.test.ts` (création, rejets de validation, CRUD bibliothèque,
  réutilisation, indépendance modèle/instances, isolation inter-mondes, verrouillage,
  **migration additive d'une base legacy**) et `tests/character-library-ui.test.tsx`
  (navigation bibliothèque, états, création/modification/suppression avec confirmation,
  ajout depuis la bibliothèque, actualisation immédiate du monde, « Utiliser »).

### Changed
- Table `characters` étendue additivement : `template_id` (référence informative, sans cascade),
  `updated_at`, `initial_*_json` / `current_*_json` (backfill depuis les colonnes legacy `*_json`,
  conservées en miroir). Migration non destructive, anciens mondes/personnages préservés.
- `CharacterDetail`, `WorldView`, générateur et tests existants adaptés à `currentState`/`initialState`.
- `WorldView` : boutons « Créer un personnage » / « Ajouter depuis ma bibliothèque » /
  « Modifier ce personnage » ; libellés FR factorisés dans `character-labels.ts`.
- `App.tsx` : entrée de navigation « Ma bibliothèque ».
- `getDb` réinitialise le singleton en cas d'échec d'ouverture (plus de promesse rejetée persistante).

### Fixed
- **Migration legacy** : l'index `idx_characters_template_id` était créé avant l'ajout de la
  colonne `template_id` sur les bases existantes (« no such column » détecté au smoke réel) ;
  index désormais créé après migration. Test de non-régression sur base Phase 1 ajouté.

### Technical decisions
- **Modèle vs instance** : instancier = copie profonde avec nouvel UUID ; aucune synchronisation
  automatique modèle ↔ instances ; suppression d'un modèle → `template_id = NULL`, instances intactes.
- `initialState`/`currentState` séparés dès maintenant pour éviter une refonte au démarrage
  de la simulation (Phase 3) ; en préparation, les deux sont réalignés à chaque édition.
- Pas de FK entre `characters.template_id` et `character_templates` (référence purement informative).
- Aucune simulation, action, interaction, relation, événement, mémoire, mort, LLM dans cette tranche.

## 2026-11-23 — Phase 1 (reprise/consultation de monde)

### Added
- IPC/preload : canal `world:get` + `window.digitalLife.getWorld(id)` pour charger un monde par identifiant depuis SQLite.
- Service `world-store` : `getWorld(id)` avec validation, erreur "Monde introuvable", mise à jour `lastOpenedAt/updatedAt`.
- UI renderer : `WorldView` (métadonnées monde, liste/cartes personnages, états chargement/erreur/introuvable/vide, actualisation), `CharacterDetail` (identité, bio, 21 traits, 10 émotions, 8 besoins, objectif principal + 2 secondaires), `StatBar` réutilisable.
- Navigation : bouton "Reprendre" fonctionnel, retour liste personnages, retour menu principal.
- Tests : couverture service `getWorld`/isolation/persistance après redémarrage, UI jsdom pour reprise, monde vide, monde introuvable, erreur IPC, retours navigation.

### Changed
- `App.tsx` : état `selectedWorldId` et affichage conditionnel `WorldView` / menu.
- Contrat IPC partagé et preload étendus avec `WORLD_GET`/`getWorld`.
- Dépendances dev : `@testing-library/react`, `@testing-library/dom`, `jsdom` pour tests UI renderer.

### Fixed
- Test IPC Phase 0 mis à jour pour inclure `WORLD_GET`.

### Technical decisions
- Consultation en lecture seule : aucune modification des modèles de simulation; pas de moteur, pas d'actions/relations/événements/mémoire/mort/LLM.
- Données affichées exclusivement depuis SQLite via IPC sécurisé; le renderer n'accède pas directement à la DB.

## 2026-11-23 — Correctif dev Linux (sandbox Electron) + Vite config

### Fixed
- `scripts/dev.mjs` : détection Linux restreint (AppArmor `unprivileged_userns` restreint / `chrome-sandbox` non setuid root) et lancement Electron dev avec `--no-sandbox` **uniquement pour le processus de développement**, avec avertissement explicite. Aucun changement des paramètres de sécurité de production (`WINDOW_SECURITY` inchangé).
- Avertissement Vite `configLoader: 'native'` corrigé proprement en renommant `vite.config.ts` → `vite.config.mts` et en mettant à jour `tsconfig.json`.

### Changed
- `docs/TROUBLESHOOTING.md`, `docs/DEVELOPMENT.md` : documentation du contournement dev sandbox, implications, variables `DL_DEV_NO_SANDBOX`, et options de correction propre.

### Technical decisions
- Le contournement `--no-sandbox` est isolé à `scripts/dev.mjs` (dev uniquement), jamais dans `src/main/security/window.ts` ni dans le build packagé. Il est activé automatiquement seulement quand l'environnement Linux ne permet pas de sandbox Chromium utilisable ; il peut être désactivé/forcé par variable d'environnement.

## 2026-11-23 — Phase 1 (génération personnages)

### Added
- Modèle personnage initial : `src/shared/character.ts` (identité, 21 traits, 10 émotions, 8 besoins, objectifs).
- PRNG seedé déterministe `src/main/services/prng.ts` (mulberry32), sans `Math.random()` dans le générateur.
- `src/main/services/character-generator.service.ts` : génération déterministe par seed/paramètres.
- Persistance SQLite : table `characters` (`world_id`, identité, JSON traits/émotions/besoins/objectifs), index, migration additive.
- API IPC/preload : `character:list` + `window.digitalLife.listCharacters(worldId)`, validation Main.
- Tests `tests/character-generation.test.ts` : seed identique/différente, nombre exact, monde vide, persistance SQLite, isolation, pas de doublons, rechargement après redémarrage.

### Changed
- `createWorld` génère et persiste les personnages pour `generationMode=random`; monde vide crée 0 personnage.
- `deleteWorld` supprime aussi les personnages du monde.
- Documentation `docs/CHARACTER_SYSTEM.md` mise à jour avec modèle/échelles implémentés.

### Technical decisions
- Personnages stockés dans `worlds.sqlite` (table `characters`) pour simplicité Phase 1 ; isolation par `world_id`.
- Champs complexes (traits/émotions/besoins/objectifs) en JSON pour extensibilité, identité en colonnes.

## 2026-11-23 — Phase 1 (menu principal)

### Added
- Menu principal React : liste des mondes SQLite, états chargement/erreur/vide, actualisation.
- `CreateWorldDialog` : nom, seed aléatoire/personnalisée, mode vide/aléatoire, nombre de personnages configurable.
- Suppression de monde avec confirmation modale.
- Bouton "Reprendre" présent mais désactivé (fonctionnalité non implémentée).
- `generationMode` ajouté au modèle monde, DB, IPC et tests.

### Changed
- UI renderer remplacée par le menu principal Phase 1 ; diagnostic système accessible via panneau masquable.

### Fixed
- Test Phase 0 IPC mis à jour pour refléter les canaux autorisés réels.

### Technical decisions
- La génération effective des personnages aléatoires est enregistrée comme métadonnée (`characterCount`, `generationMode`) ; la création des entités personnage sera faite dans une tranche Phase 1/2 dédiée.

## 2026-11-23 — Phase 1 (démarrage)

### Added
- `src/shared/world.ts` : types `WorldSummary`, `CreateWorldInput`, `WorldListResult`.
- `src/main/services/world-store.service.ts` : persistance SQLite sql.js (`data/saves/worlds.sqlite`) avec create/list/delete.
- `src/main/ipc/world.ipc.ts` : handlers IPC `world:list/create/delete` avec validation d'entrée.
- API preload : `listWorlds`, `createWorld`, `deleteWorld`.
- `tests/world-store.test.ts` : 3 tests (création/liste, suppression, validation nom).

### Technical decisions
- Un fichier SQLite de métadonnées `data/saves/worlds.sqlite` pour la liste des mondes ; les données de simulation par monde seront séparées en Phase 1/3.
- sql.js initialisé avec `useOldExtensionFunctions: false` et WASM local.

## 2026-11-23 — Phase 0 (validée)

### Added
- Arborescence modulaire complète (`src/main`, `preload`, `renderer`, `shared`, `scripts`, `resources`, `data`, `docs`, `tests`, `build`).
- Bootstrap portable Linux/Windows avec téléchargement Node v26.13.1 depuis nodejs.org et vérification `SHASUMS256.txt`.
- Scripts dev/build/test/typecheck/check-deps/copy-wasm utilisant le Node local.
- Contrat IPC typé, preload `contextBridge`, handlers IPC, sécurité fenêtre (contextIsolation/sandbox/nodeIntegration:false).
- Interface React minimale fonctionnelle : diagnostic et informations d'environnement.
- Documentation obligatoire : AGENTS, PROGRESS, HANDOFF, CHANGELOG, README, 12 docs.
- Tests Phase 0 (`tests/phase0.test.ts`, 8 tests).
- Binaire Electron 45.4.1 linux-x64 installé depuis archive officielle GitHub, SHA-256 vérifié.

### Changed
- `scripts/check-deps.mjs` : avertissement non bloquant si seul le binaire Electron manque.
- `scripts/dev.mjs` : lancement Electron avec la racine projet (`ROOT`) pour `app.getAppPath()` stable.
- `scripts/build.mjs` : preload bundlé avec Rolldown au lieu de `tsc` seul.

### Fixed
- Coquille TS corrigée dans `tsconfig.base.json`.
- `tsconfig.test.json` : ajout `jsx: react-jsx`.
- Coquille commentaire `src/main/ipc/app.ipc.ts`.
- Preload sandboxé : suppression du `require("../shared/ipc")` externe par bundling Rolldown.
- Résolution WASM en dev : fallback `process.cwd()` dans `resource.service.ts`.

### Removed
- Rien.

### Technical decisions
- Node v26.13.1 LTS portable ; dépendances épinglées.
- TypeScript 5.9.3 retenu (maturité) ; main CommonJS/tsc, preload bundlé Rolldown, renderer ESM/Vite.
- Aucune dépendance globale, aucun `sudo`, aucun CDN pour le WASM.
- Smoke test Electron validé via CDP ; dans cet environnement restreint, exécution avec `--no-sandbox --disable-gpu --disable-gpu-sandbox --in-process-gpu` (défauts de sécurité du code inchangés).
