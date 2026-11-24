# DIGITAL LIFE

Simulateur de vie autonome multi-agents. L'utilisateur définit un monde et des
conditions initiales ; les personnages évoluent ensuite librement. L'utilisateur
n'écrit pas les histoires : elles émergent des décisions, des relations et des
conséquences calculées par le moteur.

> **Statut** : Phase 0 validée, Phase 1 fonctionnelle (CRUD instances complet), Phase 2 documentaire réalisée, **Phase 3A infrastructure simulation implémentée** (horloge, PRNG sérialisable, worker, IPC, persistance SQLite, UI minimale).
> Node portable, dépendances, WASM, Electron 45.4.1 (SHA-256 vérifié), typecheck,
> tests (102/102), build et smoke test Electron réel Linux validés. Le code réel et `PROGRESS.md` font foi.

## Fonctionnalités

### Réellement disponibles
- Application Electron démarrable avec Node.js portable local (Phase 0).
- IPC strict via preload (`contextIsolation`, `sandbox`, `nodeIntegration: false`).
- Diagnostic de sécurité réel (version, environnement, WASM).
- Scripts portables Linux/Windows : bootstrap, dev, build, test.
- Menu principal : création de mondes (vide ou génération aléatoire déterministe seedée),
  liste des sauvegardes, reprise et suppression de monde (Phase 1).
- Personnages complets persistés en SQLite : identité, biographie, 21 traits,
  10 émotions, 8 besoins, 1 objectif principal + 2 secondaires (Phase 1).
- Reprise/consultation d'un monde : écran monde, cartes personnages, fiche détaillée (Phase 1).
- **Création manuelle de personnages** : formulaire en 6 étapes depuis un monde,
  sliders FR, génération aléatoire cohérente optionnelle, option « monde seul » ou
  « monde + bibliothèque » (Phase 1).
- **Bibliothèque personnelle « Ma bibliothèque »** : modèles réutilisables persistants,
  recherche, détail, modification, suppression avec confirmation, action « Utiliser »
  dans un monde (Phase 1).
- **Ajout depuis la bibliothèque** dans un monde : sélection → aperçu → confirmation →
  copie indépendante ; modification d'un personnage tant que le monde est en préparation.
  Les modèles et les instances sont totalement indépendants (aucune synchronisation).
- **Suppression d'un personnage d'un monde** : action sur la carte ou la fiche, confirmation
  (nom du personnage, monde, suppression définitive), annulation possible, liste et compteur
  actualisés, retour à la liste depuis la fiche. Refusée côté main hors préparation ;
  le modèle d'origine et les instances des autres mondes restent intacts (Phase 1).
- **Infrastructure simulation Phase 3A** : horloge interne persistée (`simulation_clock`), PRNG sérialisable/restaurable, worker Node `worker_threads` piloté par le main, commandes IPC `start/pause/resume/step/setSpeed/stop/getStatus`, reprise après redémarrage (running → paused), UI minimale de contrôle du temps (jour/heure/tick/vitesse/statut). Aucun comportement autonome de personnage pour l'instant.

### Planifiées (phases 3B+ à 8)
Évolution dynamique des personnages, décisions/actions autonomes, relations et mémoire,
événements, mort et deuil, dialogues OpenRouter facultatifs, tableaux de bord et
statistiques, packaging.

### Documentation de conception (Phase 2, documentaire uniquement)
- [Architecture de l'état des personnages](docs/CHARACTER_STATE_ARCHITECTURE.md)
- [Système de relations](docs/RELATIONSHIP_SYSTEM.md)
- [Événements, historique et souvenirs](docs/EVENT_AND_MEMORY_SYSTEM.md)
- [Temps interne, ticks et moteur](docs/SIMULATION_TIME_AND_ENGINE.md)

## Installation portable

Aucun Node.js, Python ou Rust global n'est nécessaire. Aucun `sudo`.

**Linux / macOS**
```bash
bash scripts/bootstrap.sh
```

**Windows (PowerShell)**
```powershell
.\scripts\bootstrap.ps1
```

Le bootstrap télécharge Node **v26.13.1 LTS** depuis nodejs.org, vérifie son
SHA-256 avec `SHASUMS256.txt`, installe les dépendances dans `node_modules/` et
copie le WASM de sql.js dans `resources/sqlite/`.

## Démarrage

```bash
# Linux / macOS
bash scripts/dev.sh

# Windows
.\scripts\dev.ps1
```

Pour arrêter proprement : fermer la fenêtre ou presser `Ctrl+C` dans le terminal.

## Reconstruction

```bash
bash scripts/build.sh     # Windows : .\scripts\build.ps1
bash scripts/test.sh      # Windows : .\scripts\test.ps1
```

Les raccourcis `npm run dev`, `npm run build`, `npm run test`,
`npm run typecheck`, `npm run check:deps` se relancent automatiquement avec le
Node local : le Node global n'est jamais utilisé pour le travail réel.

## Distributions (phase 8)

```bash
# après bootstrap et build
node scripts/package.mjs linux   # [Planifié]
node scripts/package.mjs win     # [Planifié]
```

electron-builder 26.18.0 est configuré dans `package.json` (AppImage + tar.gz,
NSIS pour Windows). Voir `docs/BUILD_AND_DISTRIBUTION.md`.

## Configuration OpenRouter (phase 6)

La clé sera stockée chiffrée via `safeStorage` dans `data/settings/` et jamais
dans le renderer, SQLite ou les logs. Modèle initial :
`nvidia/nemotron-3-ultra-550b-a55b:free`, endpoint
`https://openrouter.ai/api/v1/chat/completions`. Tout est configurable.
Voir `docs/LLM_CONFIGURATION.md`.

## Sauvegardes

Base SQLite unique : `data/saves/worlds.sqlite` (mondes, personnages, modèles de
bibliothèque, horloges de simulation), écrite par le processus principal uniquement.
Migration additive automatique des bases existantes. Backups dans `data/backups/`,
export/import et sauvegarde périodique : **[Planifié]**. Voir `docs/DATABASE.md`.

## Documentation

- `docs/ARCHITECTURE.md` — architecture générale.
- `docs/SIMULATION_ENGINE.md` — cycle de simulation.
- `docs/CHARACTER_SYSTEM.md`, `docs/RELATIONSHIP_SYSTEM.md`, `docs/MEMORY_SYSTEM.md`.
- `docs/EVENT_SYSTEM.md`, `docs/DEATH_SYSTEM.md`.
- `docs/LLM_CONFIGURATION.md`, `docs/DATABASE.md`.
- `docs/DEVELOPMENT.md`, `docs/BUILD_AND_DISTRIBUTION.md`, `docs/TROUBLESHOOTING.md`.

## Dépannage rapide

| Problème | Solution |
|---|---|
| `Node.js local absent` | Lancer le bootstrap. |
| SHA-256 invalide | Relancer le bootstrap ; ne jamais ignorer l'erreur. |
| Electron ne s'affiche pas | Vérifier qu'un serveur d'affichage est disponible sous Linux. |
| Diagnostic WASM en échec | Relancer `npm run copy:wasm` avec le Node local. |

Détails : `docs/TROUBLESHOOTING.md`.
