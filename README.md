# DIGITAL LIFE

Simulateur de vie autonome multi-agents. L'utilisateur définit un monde et des
conditions initiales ; les personnages évoluent ensuite librement. L'utilisateur
n'écrit pas les histoires : elles émergent des décisions, des relations et des
conséquences calculées par le moteur.

> **Statut** : Phase 0 validée, Phase 1 en cours (menu principal + génération/persistance personnages SQLite).
> Node portable, dépendances, WASM, Electron 45.4.1 (SHA-256 vérifié), typecheck,
> tests (20/20), build et smoke test IPC/UI validés. Le code réel et `PROGRESS.md` fait foi.

## Fonctionnalités

### Réellement disponibles (Phase 0)
- Application Electron démarrable avec Node.js portable local.
- IPC strict via preload (`contextIsolation`, `sandbox`, `nodeIntegration: false`).
- Interface affichant la version, l'environnement et un diagnostic de sécurité réel.
- Scripts portables Linux/Windows : bootstrap, dev, build, test.

### Planifiées (phases 1 à 8)
Menu principal, création de mondes, sauvegardes SQLite, personnages complets,
moteur multi-agents dans un worker, relations et mémoire, mort et deuil,
dialogues OpenRouter facultatifs, tableaux de bord et statistiques, packaging.

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

## Sauvegardes (phase 1+)

Emplacement prévu : `data/saves/world_001.sqlite`, etc. Backups dans
`data/backups/`. Export/import et suppression avec confirmation.
Voir `docs/DATABASE.md`.

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
