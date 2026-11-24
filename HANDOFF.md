# HANDOFF.md — Transfert de contexte

## Où en est le développement

- **Branche** : `main`, remote `git@github.com:LanjaFii/digital-life.git`.
- **HEAD au démarrage de la tranche 2** : `033fced4fca62ff90ed4c498cde751c10326bd87`
  (`feat(phase3c): add action contracts and registry`), identique à `origin/main`, arbre propre.
- **Tranche courante** : **Phase 3C — implémentation progressive**. Tranches 1 et 2
  terminées : contrats, catalogue, sept services purs et 51 tests unitaires dédiés.
  Aucun service n'est encore appelé par le tick ; aucun schéma SQLite, IPC, preload, UI
  ni appel LLM modifié.
- **État moteur réel** : horloge/PRNG sérialisable, tick SQLite atomique, évolution
  passive déterministe des 8 besoins et 10 émotions. Le résultat de tick contient toujours
  trois tableaux vides (`decisions`, `actionDeltas`, `actionRuntimeStates`) en attente de
  l'intégration (tranche 3). **Aucune décision ni action autonome n'est encore exécutée par
  le moteur.** Aucun environnement, lieu, objet, ressource partagée, relation, événement,
  souvenir, mort ni dialogue n'existe.

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
  stricte, lookup, listes deterministes.
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
  rejeable, poursuite, interruption, échec, corruption, bornes d'effets.
- `docs/AUTONOMOUS_DECISION_SYSTEM.md` : `EMOTION_WEIGHT = 10` justifié (0.35 rendait les
  émotions négligeables), sept services, rôle de `interruptionScored`, état d'implémentation.
- Validations : check-deps OK, typecheck 4 configs OK, tests **209/209** (22 fichiers), build OK.

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
  `safety` sans déclin, anti-saturation par marge vers la baseline, PRNG non consommé,
  `TickDelta[]` calculés mais non exposés via IPC/UI.
- **Worker/Manager** : worker planification/signaux uniquement ; main valide, verrou par
  monde, anti double-tick, broadcast ; aucune écriture SQLite depuis le worker.
- **Sécurité** : `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`,
  navigation externe refusée, clé OpenRouter jamais dans le renderer.

## Validation réalisée (Phase 3C)

- `./.tools/node/versions/v26.13.1-linux-x64/bin/node scripts/check-deps.mjs` : OK.
- `./.tools/node/versions/v26.13.1-linux-x64/bin/node scripts/typecheck.mjs` : OK (4 tsconfigs).
- `./.tools/node/versions/v26.13.1-linux-x64/bin/node scripts/test.mjs` : **209/209 OK** (22 fichiers).
- `./.tools/node/versions/v26.13.1-linux-x64/bin/node scripts/build.mjs` : OK.
- Aucune donnée utilisateur lue ni modifiée ; aucun smoke Electron nécessaire (services purs,
  aucun chemin runtime Electron/SQLite modifié).

## Problèmes / points d'attention

- `simulation_stopped` reste terminal pour `start/resume` : ne pas contourner cette garde
  avant validation produit de la recommandation §12 du document principal.
- Les services Phase 3C existent et sont testés, mais le tick ne les appelle pas encore.
  Ne pas présenter la simulation comme autonome avant l'intégration (tranche 3).
- Les seuils numériques de décision (scoring, urgences, durées, cooldowns, détection des
  boucles) sont des hypothèses configurables, à calibrer par simulation longue avant
  implémentation définitive.
- Aucune table ni colonne d'action n'existe : `current_action_json` est une proposition
  de migration additive future, pas un état réel.
- Les explications complètes ne sont pas persistées par défaut (volume) ; reconstruction
  par rejeu prévue, table dédiée reportée.
- Linux restreint (AppArmor/userns) : `--no-sandbox` dev uniquement via `scripts/dev.mjs`,
  sans modifier `src/main/security/window.ts`.
- Ne pas lancer check-deps, typecheck, tests et build en parallèle : sous contention, le test
  « 3000 ticks » dépasse son timeout de 5 s (147/148 observé). Relance isolée : 148/148 OK.

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
- `docs/EVENT_AND_MEMORY_SYSTEM.md`, `docs/SIMULATION_ENGINE.md` — étapes reportées.

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

1. **Finaliser la tranche Git de la tranche 2** : vérifier diff/absence secrets/data,
   committer, pousser `origin/main` sans force, vérifier hash local = distant et arbre propre.
   **Arrêt à cette étape si le push échoue.**
2. Intégrer les sept services dans `character-tick.service.ts` : construire le snapshot
   étendu par personnage, calculer les deux jeux de candidats (courant et post-interruption),
   séquencer le PRNG par `characterId` trié, appliquer les effets sur les valeurs projetées
   avant quantification, property `decisions`/`actionDeltas`/`actionRuntimeStates`.
3. Ajouter `current_action_json` (TEXT, valeur par défaut du runtime) et l'écrire dans la
   même transaction SQLite que les états, l'horloge et `rngState`, avec un seul `persist(db)`.
   Toute runtime corrompu doit provoquer un rollback complet.
4. Étendre `tests/world-store.test.ts` et `tests/simulation-long.test.ts` : affamé, fatigué,
   anxieux, sociable, indépendant, besoins concurrents, action impossible/interrompue/longue,
   plusieurs personnages, reprise après redémarrage, rejeu déterministe, rollback complet.
5. **Décision produit toujours à trancher** : politique `simulation_stopped`
   (nouvelle branche recommandée). Ne pas implémenter de reprise implicite.
