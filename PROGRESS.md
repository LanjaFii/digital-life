# PROGRESS.md — Suivi central du développement

## État actuel

- **Phase** : Phase 1 — Menu principal et gestion des mondes (en cours).
- **Avancement approximatif** : 35 % (Phase 1).
- **Dernière mise à jour** : 2026-11-23.

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
- [ ] Génération effective des personnages aléatoires dans la sauvegarde monde (Phase 1/2).
- [ ] Reprise/chargement réel d'une simulation sauvegardée.

## Fonctionnalités non commencées

- [ ] Phase 1 : menu principal, création et gestion des mondes, sauvegardes SQLite.
- [ ] Phase 2 : personnages complets.
- [ ] Phase 3 : moteur de simulation dans un worker.
- [ ] Phases 4 à 8 : relations/mémoire, mort, LLM, interface avancée, stabilisation.

## Fichiers créés (Phase 0)

Voir `find . -type f` dans le projet. Principaux : `package.json`, `vite.config.ts`,
`tsconfig*.json`, `scripts/*`, `src/main/**`, `src/preload/**`, `src/renderer/**`,
`src/shared/**`, `index.html`, `AGENTS.md`.

## Fichiers modifiés

- `tsconfig.base.json` : correction `allowSynthethicDefaultImports` → `allowSyntheticDefaultImports`.
- `tsconfig.test.json` : ajout `jsx: react-jsx` pour typecheck des fichiers `.tsx`.
- `src/main/ipc/app.ipc.ts` : correction de commentaire.
- `scripts/check-deps.mjs` : avertissement non bloquant si seul le binaire Electron manque (build/typecheck/test restent possibles hors réseau).
- `scripts/dev.mjs` : lancement d'Electron avec la racine projet (`ROOT`) pour que `app.getAppPath()` résolve correctement le projet.
- `scripts/build.mjs` : preload bundlé avec Rolldown (pas de `require` relatif externe dans le preload sandboxé).
- `src/main/services/resource.service.ts` : résolution WASM robuste (`app.getAppPath()` puis fallback `process.cwd()`).
- Docs : `docs/TROUBLESHOOTING.md`, `docs/LLM_CONFIGURATION.md`, `AGENTS.md` (typos mineures corrigées).

## Tests réussis

- `./.tools/node/versions/v26.13.1-linux-x64/bin/node scripts/test.mjs` : **12/12 tests passés** (`tests/phase0.test.ts`, `tests/world-store.test.ts`).
- `./.tools/node/versions/v26.13.1-linux-x64/bin/node scripts/typecheck.mjs` : **OK** (4 tsconfigs).
- `./.tools/node/versions/v26.13.1-linux-x64/bin/node scripts/build.mjs` : **OK**.
- `./.tools/node/versions/v26.13.1-linux-x64/bin/node scripts/check-deps.mjs` : **OK**.
- Smoke test CDP (2026-11-23, env restreint, flags Electron de diagnostic) : menu rendu, `Créer un monde` présent, état vide/liste géré, création monde via IPC visible dans l'UI, bouton `Reprendre` désactivé, bouton `Supprimer` présent.

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

Phase 1 suite : implémenter la **génération effective des personnages aléatoires** lors de la création d'un monde en mode aléatoire (structure de données personnage minimale, persistance dans la sauvegarde monde, pas encore de simulation). Puis préparer la reprise/chargement d'un monde (écran/état dédié, sans moteur).
