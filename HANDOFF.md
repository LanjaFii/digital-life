# HANDOFF.md — Transfert de contexte

## Où en est le développement

- **Branche** : `main`, remote `git@github.com:LanjaFii/digital-life.git`.
- **HEAD au démarrage de la conception 3D** : `276384eb993e91f80a309e0864a54dbe1fdf8d53`, identique à `origin/main`, arbre propre.
- **Tranche courante** : **Phase 3D — conception documentaire terminée, non implémentée**. Six documents de conception créés et quatre documents techniques mis à jour. Phase 3C reste la dernière tranche code livrée (contrats, catalogue, sept services purs, intégration au tick et `current_action_json`). Aucun code applicatif, IPC, preload, UI, worker ni appel LLM modifié par la Phase 3D.
- **État moteur réel** : horloge/PRNG sérialisable, tick SQLite atomique, évolution passive
  déterministe des 8 besoins et 10 émotions **puis** objectifs immédiats, scoring, décision,
  effets numériques et runtime persistés. Les artefacts du résultat (`decisions`,
  `actionDeltas`, `actionRuntimeStates`, `deltas`, `warnings`) sont désormais **remplis**. Aucun
  environnement, lieu, objet, ressource partagée, relation, événement, souvenir, mort ni
  dialogue n'existe.

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

## Décisions de conception Phase 3D (à valider avant implémentation)

- **Ordre des tranches** : 3D-A historique → 3D-B persistance/verrous → 3D-C worker de calcul → 3D-D IPC/UI. Aucune implémentation avant validation explicite.
- **Workers** : le planificateur existant reste inchangé ; un second worker calcule tout le tick ou aucun hybride n'est accepté.
- **SQLite** : main seul propriétaire. Historique complet compressé, `UNIQUE(world_id, tick, character_id)`, FK monde en cascade, aucune FK vers `characters`.
- **Atomicité** : verrou global repris après le calcul, relecture de l'horloge, `beforeBuffer` avant `BEGIN`, transaction courte, `afterBuffer`, `temp + fsync + SHA-256 + rename`, restauration mémoire si une étape échoue.
- **Verrous** : ordre unique monde → global ; le verrou monde couvre toute l'attente du worker, le verrou global uniquement les accès SQLite ; le nettoyage inefficace de `worldLocks` est à corriger en 3D-B ; `WORLD_DELETE` doit passer par un helper manager orchestré.
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
  `COMMIT`, un seul `persist(db)`, rollback complet sur erreur (hook
  `_setTickFailureForTests()`).
- **Services Phase 3B** : `personality-influence`, `needs-evolution`,
  `emotion-evolution`, `character-tick` ; centièmes, `roundHalfEven` via `quantize`,
  `safety` sans déclin, anti-saturation par marge vers la baseline, PRNG non consommé par ces règles seules (la décision 3C peut le tirer sur ex æquo),
  `TickDelta[]` calculés mais non exposés via IPC/UI.
- **Worker/Manager** : worker planification/signaux uniquement ; main valide, verrou par
  monde, anti double-tick, broadcast ; aucune écriture SQLite depuis le worker. Messages
  `start`/`step` déclarés mais non utilisés par le manager ; `worldLocks` n'est pas réellement
  nettoyé après libération (comparaison sur une promesse chaînée).
- **Persistance** : `persist(db)` fait `db.export()` puis `writeFileSync` sur le fichier cible.
  `getWorld()` écrit `last_opened_at`/`updated_at` puis persiste : ce n'est pas une lecture pure.
  `WORLD_DELETE` appelle `deleteWorld()` puis `simulationClearWorld()` séparément.
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
- Les explications complètes ne sont toujours pas persistées : elles sont calculées puis
  abandonnées après écriture de l'état. La table `decision_records` est **conçue** en Phase 3D,
  pas implémentée. Aucune purge automatique n'est prévue dans la conception.
- Le verrou global d'écriture, la persistance atomique et le worker de calcul sont **conçus**
  mais absents du code : ne pas supposer qu'ils protègent déjà les ticks.
- Le nettoyage de `worldLocks` est inefficace dans le code actuel ; à corriger explicitement
  en 3D-B sans modifier la sémantique de sérialisation.
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
  `simulation_stopped`.
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

1. **Validation explicite de la conception Phase 3D** par l'utilisateur, y compris les quatre
   décisions ouvertes de `docs/PHASE_3D_DESIGN.md` §10 (rétention/archivage, export manuel,
   timeout worker 30 s, `engineVersion`). Aucune implémentation ne doit commencer avant cette
   validation.
2. Si validée : tranche **3D-A** uniquement — `DecisionRecordV1`, `decision_records`,
   écriture transactionnelle, validation stricte, tests de migration et rollback. Ne pas
   toucher au worker, au verrou global ni à l'UI dans cette tranche.
3. Après 3D-A : tranches 3D-B (persistance/verrous), 3D-C (worker + Golden Hash), puis 3D-D
   (IPC/UI). La politique `simulation_stopped` reste inchangée ; `forkFromStopped` reste reporté.
