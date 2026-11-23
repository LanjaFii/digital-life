# PROGRESS.md — Suivi central du développement

## État actuel

- **Phase** : Phase 1 — Menu principal et gestion des mondes (en cours).
- **Avancement approximatif** : 55 % (Phase 1).
- **Dernière mise à jour** : 2026-11-23.
- **Git** : dépôt initialisé, remote `git@github.com:LanjaFii/digital-life.git`, branche `main` suivie, commit initial `73cfcb5` poussé et vérifié sur `origin/main`.

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

- [x] Fondation persistance mondes : `WorldStore` sql.js (SQLite local `data/saves/worlds.sqlite`), IPC `world:list/create/delete`, preload exposé, tests.
- [x] Menu principal UI : liste des mondes sauvegardés depuis SQLite, états chargement/erreur/vide, bouton actualiser.
- [x] Création de monde UI : nom, seed aléatoire ou personnalisée, mode monde vide/personnages aléatoires, nombre de personnages configurable (1-50) en mode aléatoire.
- [x] Suppression de monde avec confirmation modale.
- [x] Bouton "Reprendre" visible mais désactivé (non implémenté).
- [x] Génération effective des personnages aléatoires : modèle personnage initial (identité, 21 traits, 10 émotions, 8 besoins, objectifs), PRNG seedé déterministe, persistance SQLite table `characters` isolée par `world_id`, IPC/preload `listCharacters`.
- [ ] Reprise/chargement réel d'une simulation sauvegardée (écran/état dédié, sans moteur).

## Fonctionnalités non commencées

- [ ] Phase 1 (reste) : reprise/chargement réel d'un monde sauvegardé ; ajout manuel de personnages dans un monde vide (ultérieur).
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

## Fichiers modifiés

- Phase 0 : `tsconfig.base.json`, `tsconfig.test.json`, `src/main/ipc/app.ipc.ts`, `scripts/check-deps.mjs`, `scripts/dev.mjs`, `scripts/build.mjs`, `src/main/services/resource.service.ts`, docs mineures.
- Phase 1 menu : `src/shared/ipc.ts`, `src/preload/preload.ts`, `src/main/main.ts`, `src/renderer/App.tsx`, `src/renderer/styles/global.css`, `tests/phase0.test.ts`.
- Phase 1 personnages : `src/shared/ipc.ts` (canal `character:list`), `src/shared/world.ts`, `src/main/services/world-store.service.ts` (table `characters`, migration, génération/persistance/liste/suppression), `src/main/ipc/world.ipc.ts`, `src/preload/preload.ts`, `tests/phase0.test.ts`, `docs/CHARACTER_SYSTEM.md`, `PROGRESS.md`, `HANDOFF.md`, `CHANGELOG.md`, `README.md`.

## Tests réussis

- `./.tools/node/versions/v26.13.1-linux-x64/bin/node scripts/typecheck.mjs` : **OK** (4 tsconfigs).
- `./.tools/node/versions/v26.13.1-linux-x64/bin/node scripts/test.mjs` : **20/20 tests passés** (`tests/phase0.test.ts`, `tests/world-store.test.ts`, `tests/character-generation.test.ts`).
- `./.tools/node/versions/v26.13.1-linux-x64/bin/node scripts/build.mjs` : **OK**.
- `./.tools/node/versions/v26.13.1-linux-x64/bin/node scripts/check-deps.mjs` : **OK**.
- Smoke test CDP UI menu (2026-11-23, env restreint, flags Electron de diagnostic) : menu rendu, création/suppression/reprendre désactivé vérifiés.

## Tests échoués

- Aucun.

## Bugs connus

- Aucun bug applicatif confirmé après correctifs Phase 0.

## Problèmes techniques

- Réseau instable pendant les sessions précédentes : téléchargements Electron interrompus (ECONNRESET/timeouts). Résolu en téléchargeant l'archive officielle vérifiée SHA-256.
- `npm install` a nécessité `--prefer-online --fetch-retries=5` après un ERESOLVE transitoire.
- Smoke test dans cet environnement Linux nécessite des flags Electron `--no-sandbox --disable-gpu --disable-gpu-sandbox --in-process-gpu` à cause des restrictions apparmor/userns sur `chrome-sandbox` et du GPU. Les défauts de sécurité du code ne sont pas modifiés.
- Bug corrigé : preload sandboxé ne peut pas `require` des fichiers locaux relatifs ; le build bundle désormais le preload avec Rolldown.
- Bug corrigé : `app.getAppPath()` pouvait résoudre `dist/main` selon le mode de lancement ; `dev.mjs` passe la racine projet et `resource.service.ts` a un fallback `process.cwd()`.

## Prochaine tâche précise

Phase 1 suite : implémenter la **reprise/chargement réel d'un monde sauvegardé** (écran/état dédié lecture seule affichant métadonnées monde + personnages générés, sans moteur de simulation). Ensuite préparer l'ajout manuel de personnages dans un monde vide.
