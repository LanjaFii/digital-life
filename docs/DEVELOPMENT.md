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

## Reconstruire et tester

```bash
bash scripts/build.sh
bash scripts/test.sh
# typecheck : node local + scripts/typecheck.mjs
```

Tous les scripts utilisent le Node local `.tools/node/versions/<version>-<os>-<arch>`.

## Modifier les paramètres de simulation

Les valeurs par défaut sont définies dans le module de configuration du monde
(phase 1). Modifier une valeur par défaut nécessite : mise à jour du code,
mise à jour de `docs/SIMULATION_ENGINE.md` ou du document concerné, test, entrée
dans CHANGELOG.md.

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
