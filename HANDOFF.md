# HANDOFF.md — Transfert de contexte

## Où en est le développement

- **Branche** : `main`, remote `git@github.com:LanjaFii/digital-life.git`.
- **Dernier commit poussé avant cette tranche** : `993936dd1804a7524429800aba23937c980e2d8e` (`docs(phase2): define character evolution architecture contracts`).
- **Tranche courante** : **Phase 3A — infrastructure fondamentale du moteur de simulation**, implémentée et validée localement (tests/typecheck/build/smoke Electron réel OK). Cette tranche doit être commitée/poussée après mise à jour documentaire.
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

## Décisions techniques

- **Worker sans SQLite** : le worker ne touche pas la base ; le main reste seul écrivain SQLite. Justification : sql.js/WASM + persistance fichier unique rendent les accès concurrents fragiles ; la frontière main garde la validation, les transactions et la sécurité.
- **Tick atomique** : une commande/tick = transaction + `persist(db)` unique. Pas d'état partiel.
- **Reprise** : au démarrage app, `recoverSimulationClocksAfterRestart()` convertit les horloges `running` en `paused`. Pas d'auto-reprise.
- **`simulation_stopped`** : arrêt volontaire, données conservées. Redémarrage implicite refusé dans cette tranche (`startSimulation` rejette explicitement). Reprise explicite/nouvelle sauvegarde à trancher avant Phase 3B.
- **`Date.now()` interdit dans les règles** : utilisé uniquement pour `createdAt/updatedAt`.
- **Compatibilité statuts** : `simulation_started` accepté en lecture, normalisé en `simulation_running`.
- **Sécurité Electron inchangée** : `contextIsolation`, `sandbox`, `nodeIntegration:false`, `webSecurity:true`, navigation externe refusée, aucun Node exposé au renderer.

## Validation réalisée

- `./.tools/node/versions/v26.13.1-linux-x64/bin/node scripts/check-deps.mjs` : OK.
- `./.tools/node/versions/v26.13.1-linux-x64/bin/node scripts/typecheck.mjs` : OK (4 tsconfigs).
- `./.tools/node/versions/v26.13.1-linux-x64/bin/node scripts/test.mjs` : **102/102 OK** (10 fichiers).
- `./.tools/node/versions/v26.13.1-linux-x64/bin/node scripts/build.mjs` : OK.
- **Smoke Electron réel Linux** (CDP, `--no-sandbox --disable-gpu`, 2 lancements) : création monde `SMOKE-SIM` (seed 123, 2 persos), start tick 0 running, pause, step -> 1, speed 10x, fermeture, relance restaurée tick 1/paused/rngState `2246822416`/`simulation_paused`, resume, step -> 2, suppression smoke, `SMOKE_OK`. DB utilisateur sauvegardée puis restaurée depuis `/tmp/dl-worlds-backup.sqlite`.

## Problèmes / points d'attention

- Le smoke test a modifié `data/saves/worlds.sqlite` pendant l'exécution ; la sauvegarde `/tmp/dl-worlds-backup.sqlite` a été restaurée. Vérifier que le DB n'est pas inclus dans le commit (gitignored).
- `simulation_stopped` ne permet pas de redémarrage implicite : c'est volontaire. Si le produit veut "reprendre un monde arrêté", définir une transition explicite avant de l'implémenter.
- Le worker est compilé en JS dans `dist/main/simulation/simulation.worker.js` ; `scripts/test.mjs` lance `tsc -p tsconfig.main.json` avant Vitest pour garantir sa présence.
- Le tick n'applique aucune règle métier. Ne pas présenter la simulation comme autonome.

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

1. **Finaliser la tranche Git** : vérifier diff/absence secrets/data, committer, pousser `origin/main` sans force, vérifier hash distant et arbre propre.
2. **Phase 3B (conception puis implémentation prudente)** : définir le contrat du tick métier avant de coder (ordre déterministe, snapshot, transaction par tick, `rngState` avancé pendant tick, pas de `Date.now()` dans règles). Premier scope recommandé : dérive simple besoins/émotions sur tick, sans relations/événements/mémoires/LLM.
3. **Décision produit à trancher** : politique de reprise d'un monde `simulation_stopped` (nouvelle sauvegarde vs reprise explicite). Ne pas implémenter implicitement.
