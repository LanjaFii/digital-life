# CHANGELOG

Format : entrées datées, catégories Added / Changed / Fixed / Removed / Technical decisions.

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
