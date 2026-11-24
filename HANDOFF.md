# HANDOFF.md — Transfert de contexte

## Où en est le développement

- **Branche** : `main`, remote `git@github.com:LanjaFii/digital-life.git`.
- **Dernier commit poussé avant cette tranche** : `e0f6d0b1d032c841e5d5772098f6ab16e3b1f4dd` (`feat(phase3a): implement simulation clock infrastructure`).
- **Tranche courante** : **Phase 3B — conception documentaire du premier système d'évolution dynamique des personnages**, terminée. Aucune implémentation, aucun code applicatif modifié.
- **Périmètre réalisé** : PRNG sérialisable, horloge simulation persistée SQLite, worker Node `worker_threads` piloté par le main, commandes IPC/preload/main, UI minimale de contrôle, reprise après redémarrage. **Aucun comportement autonome** (besoins/émotions/décisions/actions/relations/événements/souvenirs/mort/LLM).

## Ce qui vient d'être réalisé (Phase 3A)

- **PRNG** (`src/main/services/prng.ts`) : `normalizeSeed`, `getState(): uint32`, `setState(uint32)` avec validation stricte. La génération de personnages existante reste inchangée.
- **Contrats partagés** (`src/shared/simulation.ts`) : `SimulationClock`, `SimulationStatusView`, vitesses 1/2/5/10, constantes temps (`24 ticks/jour`, `1 tick = 1h`, `60s/tick à 1x`), normalisation `simulation_started` legacy → `simulation_running`.
- **SQLite/store** (`src/main/services/world-store.service.ts`) : table additive `simulation_clock` (FK cascade `world_id`), index status, migrations additives. Fonctions : `getSimulationStatus/start/pause/resume/step/setSpeed/stop`, `recoverSimulationClocksAfterRestart`, helpers test. Chaque commande/tick = transaction SQLite + `persist(db)` unique. Tick Phase 3A = avance horloge uniquement.
- **Domaine PRNG simulation** : `simulationSeed = (world.seed ^ 0x85ebca6b) >>> 0`, séparé du flux de génération.
- **Statuts monde** : `preparation | simulation_running | simulation_paused | simulation_stopped` (+ lecture legacy `simulation_started`). Édition manuelle des personnages refusée dès que le monde n'est plus en préparation.
- **Worker** (`src/main/simulation/simulation.worker.ts`) : planifie les ticks par `setInterval` selon vitesse, émet `tick`/`step`; commandes `configure/start/pause/stop/setSpeed/step/shutdown`; pas d'accès SQLite/renderer.
- **Manager main** (`src/main/services/simulation-manager.service.ts`) : crée le worker, verrou par monde, anti double-tick, valide et applique tick via store, sync worker, broadcast `simulation:status-changed`, shutdown propre.
- **IPC/preload** : `simulation:status/start/pause/resume/step/speed/stop` + `simulation:status-changed`. Validation des ids/vitesses côté main ; renderer reçoit uniquement des statuts validés.
- **UI** (`src/renderer/components/WorldView.tsx`) : panneau temps interne, jour/heure/tick, statut, Start/Pause/Resume/Step/Stop, vitesses 1x/2x/5x/10x, état issu du main. Boutons création/modif/suppression personnages désactivés hors préparation.
- **Tests ajoutés/mis à jour** : `tests/prng.test.ts`, `tests/simulation.test.ts`, mise à jour `tests/phase0.test.ts`, mocks UI simulation dans tests renderer.

## Ce qui vient d'être réalisé (Phase 3B — conception uniquement)

- `docs/NEEDS_EVOLUTION.md` : 8 besoins (100 = satisfait), dérive/tick, traits pertinents, interactions, seuils, récupération, calibration provisoire.
- `docs/EMOTION_EVOLUTION.md` : 10 émotions, baselines, matrice besoin→émotion, anti-boucles, plafonds, récupération.
- `docs/CHARACTER_TICK_RULES.md` : protocole snapshot → besoins projetés → émotions → agrégation → clamp/arrondi → application différée → transaction atomique + `persist` unique ; déterminisme/PRNG ; `TickDelta[]` ; contrats TS proposés ; 4 services purs ; calibration 24/72/168/720/plusieurs milliers de ticks ; 2 diagrammes Mermaid.
- Aucun fichier applicatif, schéma SQLite, migration, worker, IPC, preload, UI, LLM, mort, relations, événements ou souvenirs touché.

## État actuel (2026-11-24)

- **Phase 3B implémentée, validée et prête à committer.** HEAD avant tranche : `a07d75a7f80c0d49a2e0c9475aa3254d64dd2cae`, branche `main`, arbre propre au démarrage.
- Quatre services purs ajoutés + orchestration intégrée dans `stepSimulation` (une transaction, un `persist`). Aucun changement de schéma SQLite, worker, IPC, preload ou UI.
- Tests : **148/148 passés** (15 fichiers), typecheck 4 configs OK, check-deps OK, build OK.
- Prochaine action : finalisation Git (commit + push `origin/main` sans force + vérification hashes/arbre propre), puis arrêt. Ne pas démarrer la Phase 3C sans validation explicite.

## Décisions de conception Phase 3B

- **Besoins projetés** : les émotions lisent les besoins projetés du tick courant comme entrée de calcul, sans application prématurée ; évite un retard artificiel d'une heure.
- **Snapshot strict** : tous les calculs partent de l'état de début de tick ; aucun biais d'ordre.
- **PRNG non consommé** en Phase 3B : règles passives déterministes ; `rngState` reste inchangé sauf règle future explicitement justifiée.
- **Tick atomique** : états personnages + horloge dans une seule transaction et un seul `persist`.
- **Services purs** : `personality-influence`, `needs-evolution`, `emotion-evolution`, `character-tick`, testables hors Electron/SQLite/renderer.
- **Décisions définitives / provisoires / à calibrer** clairement séparées dans `docs/CHARACTER_TICK_RULES.md` §9.

## Décisions techniques

- **Worker sans SQLite** : le worker ne touche pas la base ; le main reste seul écrivain SQLite. Justification : sql.js/WASM + persistance fichier unique rendent les accès concurrents fragiles ; la frontière main garde la validation, les transactions et la sécurité.
- **Tick atomique** : une commande/tick = transaction + `persist(db)` unique. Pas d'état partiel.
- **Reprise** : au démarrage app, `recoverSimulationClocksAfterRestart()` convertit les horloges `running` en `paused`. Pas d'auto-reprise.
- **`simulation_stopped`** : arrêt volontaire, données conservées. Redémarrage implicite refusé dans cette tranche (`startSimulation` rejette explicitement). Reprise explicite/nouvelle sauvegarde à trancher avant Phase 3B.
- **`Date.now()` interdit dans les règles** : utilisé uniquement pour `createdAt/updatedAt`.
- **Compatibilité statuts** : `simulation_started` accepté en lecture, normalisé en `simulation_running`.
- **Sécurité Electron inchangée** : `contextIsolation`, `sandbox`, `nodeIntegration:false`, `webSecurity:true`, navigation externe refusée, aucun Node exposé au renderer.
- **Précision Phase 3B** : valeurs stockées en centièmes (2 décimales) dans les colonnes JSON existantes ; `roundHalfEven` via `quantize()`. Raison : les petits deltas (`-0.05`) disparaîtraient en entiers et créeraient une stagnation artificielle.
- **Coefficients Phase 3B** : conservés tels que documentés dans `SimulationParametersV1` (`version: 1`) ; la matrice émotionnelle qualitative a été convertie en poids numériques sans ajustement arbitraire.
- **`safety`** : pas de déclin naturel, retour vers baseline 65 (`+0.2/tick`, modulé par `resilience`) ; alternative `-0.1/tick` rejetée comme artificielle sans événement.
- **Anti-saturation** : la pression positive issue du confort est plafonnée par la marge vers la baseline (cause `baseline.headroom`). Décision prise après observation en simulation longue d'un `happiness` bloqué à 100 en ~50 ticks sur scénario stable. La pression négative (déficits) reste libre.
- **Rollback testé** : hook `_setTickFailureForTests()` injecte une panne après écriture des personnages mais avant l'horloge ; le test vérifie que ni personnages ni horloge ne sont modifiés. Hook jamais utilisé en production.
- **Écriture persistée** : `emotions_json`/`needs_json` (miroirs legacy) ET `current_emotions_json`/`current_needs_json` sont mis à jour ensemble ; `initial_*` reste immuable.

## Validation réalisée

- `./.tools/node/versions/v26.13.1-linux-x64/bin/node scripts/check-deps.mjs` : OK.
- `./.tools/node/versions/v26.13.1-linux-x64/bin/node scripts/typecheck.mjs` : OK (4 tsconfigs).
- `./.tools/node/versions/v26.13.1-linux-x64/bin/node scripts/test.mjs` : **148/148 OK** (15 fichiers).
- `./.tools/node/versions/v26.13.1-linux-x64/bin/node scripts/build.mjs` : OK.
- **Smoke Electron réel Linux** (CDP, `--no-sandbox --disable-gpu`, 2 lancements) : création monde `SMOKE-SIM` (seed 123, 2 persos), start tick 0 running, pause, step -> 1, speed 10x, fermeture, relance restaurée tick 1/paused/rngState `2246822416`/`simulation_paused`, resume, step -> 2, suppression smoke, `SMOKE_OK`. DB utilisateur sauvegardée puis restaurée depuis `/tmp/dl-worlds-backup.sqlite`.

## Problèmes / points d'attention

- Le smoke test a modifié `data/saves/worlds.sqlite` pendant l'exécution ; la sauvegarde `/tmp/dl-worlds-backup.sqlite` a été restaurée. Vérifier que le DB n'est pas inclus dans le commit (gitignored).
- `simulation_stopped` ne permet pas de redémarrage implicite : c'est volontaire. Si le produit veut "reprendre un monde arrêté", définir une transition explicite avant de l'implémenter.
- Le worker est compilé en JS dans `dist/main/simulation/simulation.worker.js` ; `scripts/test.mjs` lance `tsc -p tsconfig.main.json` avant Vitest pour garantir sa présence.
- Le tick applique désormais des règles **passives** (besoins/émotions) mais aucune décision, action, relation, événement, souvenir, mort ni dialogue. Ne pas présenter la simulation comme autonome pour autant.
- Les deltas détaillés sont calculés mais volontairement non exposés via IPC/UI dans cette tranche (volume) ; seule l'évolution des valeurs est visible naturellement dans la fiche personnage.

## Fichiers importants à examiner

- `src/shared/simulation.ts` — contrat clock/statuts/commandes.
- `src/main/services/prng.ts` — sérialisation/restauration PRNG.
- `src/main/services/world-store.service.ts` — schéma, migrations, transactions, recovery, commandes simulation.
- `src/main/services/simulation-manager.service.ts` — worker lifecycle, lock, anti double-tick, broadcast.
- `src/main/simulation/simulation.worker.ts` — planification ticks/step.
- `src/main/ipc/simulation.ipc.ts`, `src/preload/preload.ts`, `src/shared/ipc.ts` — contrat IPC.
- `src/main/main.ts` — recovery startup + shutdown.
- `src/renderer/components/WorldView.tsx` — UI minimale contrôle simulation.
- `tests/prng.test.ts`, `tests/simulation.test.ts`, `tests/phase0.test.ts`.
- `docs/SIMULATION_TIME_AND_ENGINE.md`, `docs/DATABASE.md`, `docs/ARCHITECTURE.md`.
- `docs/NEEDS_EVOLUTION.md`, `docs/EMOTION_EVOLUTION.md`, `docs/CHARACTER_TICK_RULES.md` — conception Phase 3B (source de vérité, mise à jour au statut implémenté).
- `src/shared/simulation-rules.ts` — contrats des règles et paramètres versionnés.
- `src/main/services/simulation-parameters.service.ts` — coefficients par défaut (hypothèses configurables).
- `src/main/services/personality-influence.service.ts` — maths pures, arrondi half-even, traits.
- `src/main/services/needs-evolution.service.ts` — 8 besoins projetés + deltas.
- `src/main/services/emotion-evolution.service.ts` — 10 émotions projetées + deltas.
- `src/main/services/character-tick.service.ts` — orchestration déterministe du tick.
- `tests/personality-influence.test.ts`, `tests/needs-evolution.test.ts`, `tests/emotion-evolution.test.ts`, `tests/character-tick.test.ts`, `tests/simulation-long.test.ts`, `tests/simulation-rules-fixtures.ts`.

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

1. **Finaliser la tranche Git** : vérifier diff/absence secrets/data, committer, pousser `origin/main` sans force, vérifier hash distant et arbre propre. **Arrêt à cette étape si le push échoue.**
2. Ensuite uniquement après validation explicite : Phase 3C (décisions/actions autonomes) avec sa propre documentation de conception.
3. **Décision produit toujours à trancher** : politique de reprise d'un monde `simulation_stopped` (nouvelle sauvegarde vs reprise explicite). Ne pas implémenter implicitement.
