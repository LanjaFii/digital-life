# PROGRESS.md — Suivi central du développement

## État actuel

- **Phase** : Phase 1 — Menu principal et gestion des mondes (en cours).
- **Avancement approximatif** : 65 % (Phase 1).
- **Dernière mise à jour** : 2026-11-23.
- **Git** : dépôt initialisé, remote `git@github.com:LanjaFii/digital-life.git`, branche `main` suivie. `origin/main` vérifié à `0ae3429` avant cette tranche ; commit/push de la tranche reprise à effectuer et vérifier dans cette session.

## Fonctionnalités terminées

- [x] Examen de l'environnement (Linux x86_64, Ubuntu 26.04.1, Node global ignoré).
- [x] Choix des versions stables et compatibles (voir AGENTS.md).
- [x] Arborescence modulaire créée (main / preload / renderer / shared / scripts / docs / data / tests).
- [x] package.json, tsconfigs (base, renderer, main, preload, tests), vite.config.ts.
- [x] Scripts portables : bootstrap.sh/.ps1, dev.sh/.ps1, build.sh/.ps1, test.sh/.ps1, ensure-node, runtime, copy-wasm, check-deps, dev/build/test/typecheck .mjs.
- [x] Contrat IPC partagé + preload contextBridge + handlers IPC + fenêtre sécurisée (contextIsolation, sandbox, nodeIntegration=false).
- [x] Squelette React (App, DiagnosticList, styles) avec diagnostic IPC réel et bouton d'actualisation fonctionnel.
- [x] Documentation obligatoire créée : AGENTS, PROGRESS, HANDOFF, CHANGELOG, README, 12 docs.
- [x] Tests Phase 0 créés (`tests/phase0.test.ts`).
- [x] Bootstrap exécuté : Node v26.13.1 installé localement, SHA-256 vérifié, dépendances npm installées, WASM sql.js copié.
- [x] Binaire Electron 45.4.1 linux-x64 installé depuis l'archive officielle GitHub, SHA-256 vérifié (`e1d077c7a087d7e344350ea0c5cd2b7dc5af3d9bf7979474f38e0fc1a560b875`).
- [x] Validations réussies : typecheck (4 configs), tests Vitest (8/8), build (main/preload/renderer).
- [x] Smoke test Electron validé via CDP : fenêtre/page `DIGITAL LIFE` chargée, `window.digitalLife` exposé, IPC `app:get-info` et `app:diagnostic` OK (diagnostic `ok: true`).

## Fonctionnalités en cours (Phase 1)

- [x] Fondation persistance mondes : `WorldStore` sql.js (SQLite local `data/saves/worlds.sqlite`), IPC `world:list/create/delete/get`, preload exposé, tests.
- [x] Menu principal UI : liste des mondes sauvegardés depuis SQLite, états chargement/erreur/vide, bouton actualiser.
- [x] Création de monde UI : nom, seed aléatoire ou personnalisée, mode monde vide/personnages aléatoires, nombre de personnages configurable (1-50) en mode aléatoire.
- [x] Suppression de monde avec confirmation modale.
- [x] Génération effective des personnages aléatoires : modèle personnage initial (identité, 21 traits, 10 émotions, 8 besoins, objectifs), PRNG seedé déterministe, persistance SQLite table `characters` isolée par `world_id`, IPC/preload `listCharacters`.
- [x] Reprise/chargement réel d'un monde sauvegardé : bouton "Reprendre" fonctionnel, chargement SQLite monde + personnages via IPC/preload, écran monde (métadonnées + cartes personnages), fiche personnage détaillée (21 traits, 10 émotions, 8 besoins, objectifs), navigation retour liste/menu, états chargement/erreur/monde introuvable, isolation par monde.

## Fonctionnalités non commencées

- [ ] Phase 1 (reste) : ajout manuel de personnages dans un monde vide (ultérieur).
- [ ] Phase 2 : personnages complets (évolution dynamique, édition avancée).
- [ ] Phase 3 : moteur de simulation dans un worker.
- [ ] Phases 4 à 8 : relations/mémoire, mort, LLM, interface avancée, stabilisation.

## Fichiers créés (Phase 0 / Phase 1)

Principaux Phase 0 : `package.json`, `vite.config.ts`, `tsconfig*.json`, `scripts/*`,
`src/main/**`, `src/preload/**`, `src/renderer/**`, `src/shared/**`, `index.html`, docs.

Ajouts Phase 1 (menu + personnages) :
- `src/shared/world.ts`, `src/shared/character.ts`
- `src/main/services/world-store.service.ts`, `src/main/services/prng.ts`, `src/main/services/character-generator.service.ts`
- `src/main/ipc/world.ipc.ts`
- `src/renderer/components/CreateWorldDialog.tsx`
- `tests/world-store.test.ts`, `tests/character-generation.test.ts`

Ajouts tranche reprise :
- `src/renderer/components/WorldView.tsx`
- `src/renderer/components/CharacterDetail.tsx`
- `src/renderer/components/StatBar.tsx`
- `tests/world-resume-ui.test.tsx`

## Fichiers modifiés

- Phase 0 : `tsconfig.base.json`, `tsconfig.test.json`, `src/main/ipc/app.ipc.ts`, `scripts/check-deps.mjs`, `scripts/dev.mjs`, `scripts/build.mjs`, `src/main/services/resource.service.ts`, docs mineures.
- Phase 1 menu : `src/shared/ipc.ts`, `src/preload/preload.ts`, `src/main/main.ts`, `src/renderer/App.tsx`, `src/renderer/styles/global.css`, `tests/phase0.test.ts`.
- Phase 1 personnages : `src/shared/ipc.ts`, `src/shared/world.ts`, `src/main/services/world-store.service.ts`, `src/main/ipc/world.ipc.ts`, `src/preload/preload.ts`, `tests/phase0.test.ts`, `docs/CHARACTER_SYSTEM.md`.
- Correctif dev Linux : `scripts/dev.mjs` (détection sandbox restreint, `--no-sandbox` dev uniquement, avertissement), `vite.config.ts` → `vite.config.mts`, `tsconfig.json`, `docs/TROUBLESHOOTING.md`, `docs/DEVELOPMENT.md`, `PROGRESS.md`, `HANDOFF.md`, `CHANGELOG.md`.
- Tranche reprise : `src/shared/ipc.ts`, `src/preload/preload.ts`, `src/main/ipc/world.ipc.ts`, `src/main/services/world-store.service.ts`, `src/renderer/App.tsx`, `src/renderer/styles/global.css`, `tests/phase0.test.ts`, `tests/world-store.test.ts`, `package.json`, `package-lock.json`, docs de suivi.

## Tests réussis

- `./.tools/node/versions/v26.13.1-linux-x64/bin/node scripts/check-deps.mjs` : **OK**.
- `./.tools/node/versions/v26.13.1-linux-x64/bin/node scripts/typecheck.mjs` : **OK** (4 tsconfigs).
- `./.tools/node/versions/v26.13.1-linux-x64/bin/node scripts/test.mjs` : **30/30 passés** (`tests/phase0.test.ts`, `tests/world-store.test.ts`, `tests/character-generation.test.ts`, `tests/world-resume-ui.test.tsx`).
- `./.tools/node/versions/v26.13.1-linux-x64/bin/node scripts/build.mjs` : **OK**.
- **Lancement réel Electron dev** (Linux restreint, 2026-11-23) : Vite + Electron lancés avec `--no-sandbox --disable-gpu --remote-debugging-port=9229` (config dev uniquement, `src/main/security/window.ts` inchangé). Smoke CDP : création monde test, menu → Reprendre → écran monde avec 2 cartes personnages, clic carte → fiche personnage (traits/émotions/besoins/objectifs visibles), retour liste personnages, retour menu principal. Monde smoke supprimé.

## Tests échoués

- Aucun.

## Bugs connus

- Aucun bug applicatif confirmé. Le blocage lancement Electron dev sur Linux restreint (AppArmor/userns, `chrome-sandbox` non setuid) est corrigé en dev par détection + `--no-sandbox` **processus dev uniquement** avec avertissement (voir Problèmes techniques).

## Problèmes techniques

- Réseau instable pendant sessions précédentes : téléchargements Electron interrompus ; résolu via archive officielle vérifiée SHA-256. `npm install` a nécessité `--prefer-online --fetch-retries=5` après ERESOLVE transitoire.
- **Linux restreint (AppArmor/userns)** : `chrome-sandbox` du zip Electron est 0755 (pas setuid root) et `kernel.apparmor_restrict_unprivileged_userns=1` bloque le sandbox userns non privilégié. `scripts/dev.mjs` détecte ce cas et lance Electron dev avec `--no-sandbox` **uniquement pour ce processus**, avec avertissement explicite. `src/main/security/window.ts` reste inchangé (`contextIsolation:true`, `nodeIntegration:false`, `sandbox:true`, `webSecurity:true`). Correction propre : profil AppArmor dédié ou `chrome-sandbox` root:root 4755 (implications sécurité, action manuelle hors scripts).
- Bug corrigé : preload sandboxé bundlé Rolldown.
- Bug corrigé : résolution `app.getAppPath()`/WASM en dev via `ROOT` + fallback `process.cwd()`.

## Prochaine tâche précise

Phase 1 suite : permettre l'**ajout manuel de personnages dans un monde vide** (formulaire création personnage, validation, persistance SQLite, affichage immédiat dans la consultation monde), sans moteur de simulation ni évolution dynamique.
