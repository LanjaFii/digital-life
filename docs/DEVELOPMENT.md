# Développement

## Initialiser le projet

```bash
bash scripts/bootstrap.sh          # Linux/macOS
.\scripts\bootstrap.ps1            # Windows
```

## Démarrer / arrêter

```bash
bash scripts/dev.sh                # Ctrl+C ou fermeture de la fenêtre pour arrêter
```

Sur Linux restreint (AppArmor userns + `chrome-sandbox` non setuid), `scripts/dev.mjs` peut lancer Electron en dev avec `--no-sandbox` **uniquement pour ce processus**, en affichant un avertissement. Ce contournement ne modifie pas les paramètres de sécurité de production. Voir `docs/TROUBLESHOOTING.md`. Variables : `DL_DEV_NO_SANDBOX=0` (désactiver contournement) / `1` (forcer).

## Reconstruire et tester

```bash
bash scripts/build.sh
bash scripts/test.sh
# typecheck : node local + scripts/typecheck.mjs
```

Tous les scripts utilisent le Node local `.tools/node/versions/<version>-<os>-<arch>`.

## Modifier les paramètres de simulation

Les constantes Phase 3A sont centralisées dans `src/shared/simulation.ts`
(`SIMULATION_SPEEDS`, `SIMULATION_TICKS_PER_DAY`, `SIMULATION_HOURS_PER_TICK`,
`SIMULATION_MS_PER_TICK_AT_1X`). Modifier une valeur nécessite : mise à jour du
module partagé, tests de régression (horloge, persistance, worker/UI), mise à jour
de `docs/SIMULATION_TIME_AND_ENGINE.md` et `docs/DATABASE.md`.

## Ajouter une nouvelle action

1. Ajouter l'identifiant dans l'union `ActionType` (phase 3).
2. Implémenter son évaluation dans `src/main/simulation/action-scoring.ts`.
3. Implémenter son exécution dans `src/main/simulation/action-executor.ts`.
4. Ajouter ses conséquences dans le système d'événements.
5. Écrire un test unitaire et un test d'intégration court.

## Ajouter un nouveau type d'événement

Voir `docs/EVENT_SYSTEM.md`, section « Ajouter un type d'événement ».

## Convention de validation

Aucune fonctionnalité n'est déclarée terminée sans : typecheck, tests, build et
mise à jour de PROGRESS.md / HANDOFF.md / CHANGELOG.md.
