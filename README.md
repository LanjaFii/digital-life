# DIGITAL LIFE

Simulateur de vie autonome multi-agents. L'utilisateur définit un monde et des
conditions initiales ; les personnages évoluent ensuite librement. L'utilisateur
n'écrit pas les histoires : elles émergent des décisions, des relations et des
conséquences calculées par le moteur.

> **Statut** : Phase 0 validée, Phase 1 fonctionnelle (CRUD instances complet), Phase 2 documentaire réalisée, **Phase 3A infrastructure simulation implémentée** (horloge, PRNG sérialisable, worker, IPC, persistance SQLite, UI minimale), **Phase 3B implémentée** (évolution déterministe des 8 besoins et 10 émotions au tick, services purs + transaction SQLite atomique), **Phase 3C tranche 3 terminée** (décisions et actions autonomes déterministes intégrées au tick, runtime et PRNG persistés atomiquement), **Phase 3D complète** (historique des décisions ; persistance atomique et verrous ; worker de calcul branché ; IPC de lecture et inspecteur UI). Relations, événements, souvenirs, mort et LLM non implémentés.
> Node portable, dépendances, WASM, Electron 45.4.1 (SHA-256 vérifié), typecheck,
> tests (suite complète 335/335 hors tests longs et benchmark ; matrice Golden Hash longue 96/96 ; 18 Golden Hash
> ordinaires inchangés ; test long isolé antérieur 9/9), build et smoke test Electron réel Linux validés.
> Les sous-tranches **3D-C1 à 3D-C4 et 3D-D sont implémentées** : protocole versionné,
> canonicalisation partagée, frontière d'écriture, worker de calcul et client dédié
> (corrélation, timeout 30 s, annulation, verrous monde), puis deux canaux de lecture et
> l'inspecteur React. Le code réel et `PROGRESS.md` font foi.

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
- **Infrastructure simulation Phase 3A** : horloge interne persistée (`simulation_clock`), PRNG sérialisable/restaurable, worker Node `worker_threads` piloté par le main, commandes IPC `start/pause/resume/step/setSpeed/stop/getStatus`, reprise après redémarrage (running → paused), UI minimale de contrôle du temps (jour/heure/tick/vitesse/statut).
- **Évolution Phase 3B** : à chaque tick, les 8 besoins et 10 émotions évoluent selon des règles déterministes et explicables (services purs, traits de personnalité, snapshot immuable, arrondi half-even aux centièmes), appliquées dans la même transaction SQLite que l'horloge. Les valeurs actualisées sont visibles dans la fiche personnage ; aucune nouvelle UI.
- **Décisions/actions Phase 3C (tranche 3)** : à chaque tick, objectifs immédiats, évaluation des actions réalisables, décision explicable (PRNG seulement en ex æquo), effets numériques et machine à états des actions longues ; runtime d'action (`current_action_json`), états et `rngState` persistés dans la même transaction. Aucun appel LLM, aucune ressource ni lieu inventé. Aucune nouvelle UI.
- **Historique des décisions (Phase 3D-A, consultable depuis 3D-D)** : une ligne complète et compressée par personnage et par tick dans `decision_records`, écrite dans la même transaction que l'état, avec hash SHA-256 de la charge utile, versions du moteur/registre/paramètres et validation stricte à la lecture. Anciennes sauvegardes lisibles (migration `3D-1`), aucune purge ni backfill.
- **Persistance et verrous (Phase 3D-B)** : toute mutation est sérialisée par un verrou global ordonné après le verrou du monde ; le fichier SQLite est remplacé par `temp + fsync + SHA-256 + rename` et la base mémoire est restaurée depuis le dernier état disque validé si une étape échoue avant `rename`. Suppression de monde sérialisée, aucun changement de schéma ni de calcul.
- **Calcul du tick en worker dédié (Phase 3D-C3)** : le tick est préparé sous verrou global court, calculé dans `tick-compute.worker.ts` via un client isolé (`requestId` monotone, timeout fixe 30 s, doublons et réponses tardives ignorés), puis validé et persis dans le main sous verrou monde → global. Aucun repli synchrone ; erreur manuelle propagée à l'IPC, erreur automatique journalisée sans écriture. Suppression de monde : tombeau et annulation avant toute attente de verrou. Aucune UI ajoutée.
- **Inspecteur de décisions (Phase 3D-D)** : panneau « Décisions récentes » dans l'écran monde et accès facultatif depuis la fiche personnage. Deux canaux IPC lecture seule (`decision:history`, `decision:record`), `worldId` obligatoire, résumés bornés (50 par page, 500 maximum) et détail structuré en douze sections. Aucun BLOB brut, aucune mutation de simulation, aucun graphique ; rafraîchissement au plus toutes les 500 ms sur changement de tick.

### Planifiées (phases 4 à 8 et tranches ultérieures)
**Phase 3D [conçue et livrée ; 3D-A à 3D-D implémentées]** : l'IPC de lecture et l'inspecteur
minimal sont livrés. Restent à implémenter : relations et mémoire, événements canoniques, mort
et deuil, dialogues OpenRouter facultatifs, tableaux de bord et statistiques, packaging. Restent
reportés : `forkFromStopped`, hystérésis des objectifs, actions Tier B (environnement),
purge/archivage de l'historique, optimisations de persistance.
Les décisions validées (rétention sans purge, pas d'export, timeout worker 30 s fixe,
checksum sur le noyau Golden Hash sans `decisionRecords`, verrou monde sur toute écriture
ciblée, annulation avant verrous à la suppression, `engineVersion = 'phase3d.1'`, ordre des
verrous) sont documentées dans [PHASE_3D_DESIGN.md](docs/PHASE_3D_DESIGN.md) §2.1 et §10.
La limitation de performance subsiste :
`persist()` réexporte toute la base à chaque tick, avec un coût croissant avec l'historique ;
voir [SAFE_PERSISTENCE.md](docs/SAFE_PERSISTENCE.md) §10.

### Documentation de conception et de règles implémentées
- [Architecture de l'état des personnages](docs/CHARACTER_STATE_ARCHITECTURE.md)
- [Système de relations](docs/RELATIONSHIP_SYSTEM.md)
- [Événements, historique et souvenirs](docs/EVENT_AND_MEMORY_SYSTEM.md)
- [Temps interne, ticks et moteur](docs/SIMULATION_TIME_AND_ENGINE.md)
- [Évolution des besoins (Phase 3B implémentée)](docs/NEEDS_EVOLUTION.md)
- [Évolution des émotions (Phase 3B implémentée)](docs/EMOTION_EVOLUTION.md)
- [Règles de tick personnage (Phase 3B implémentée)](docs/CHARACTER_TICK_RULES.md)
- [Système de décisions autonomes (Phase 3C implémentée)](docs/AUTONOMOUS_DECISION_SYSTEM.md)
- [Système d'actions (Phase 3C implémentée)](docs/ACTION_SYSTEM.md)
- [Sélection des objectifs et motivations (Phase 3C implémentée)](docs/GOAL_SELECTION_SYSTEM.md)
- [Phase 3D — Consolidation du moteur (3D-A à 3D-C4 implémentées)](docs/PHASE_3D_DESIGN.md)
- [Historique technique des décisions (Phase 3D-A implémentée)](docs/DECISION_HISTORY_SYSTEM.md)
- [Protocole de calcul du tick en worker (3D-C1 à 3D-C4 implémentées)](docs/WORKER_TICK_PROTOCOL.md)
- [Persistance sécurisée de SQLite (Phase 3D-B implémentée)](docs/SAFE_PERSISTENCE.md)
- [Refactorisation progressive du store (3D-B partielle livrée)](docs/WORLD_STORE_REFACTORING.md)
- [Inspecteur de décisions — UI minimale (Phase 3D planifiée)](docs/DECISION_INSPECTOR_UI.md)

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
Migration additive automatique des bases existantes ; depuis 3D-B, écriture atomique
`temporaire + fsync + SHA-256 + rename` avec restauration mémoire en cas d'échec avant
`rename`. Backups dans `data/backups/`, export/import et sauvegarde périodique :
**[Planifié]**. Voir `docs/DATABASE.md` et `docs/SAFE_PERSISTENCE.md`.

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
