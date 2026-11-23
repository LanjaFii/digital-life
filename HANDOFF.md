# HANDOFF.md — Transfert de contexte

## Où en est le développement

Phase 0 validée. Phase 1 en cours : menu principal + génération/persistance initiale des personnages.
Git : `main` suit `origin/main`, commit initial `73cfcb5` poussé et vérifié. La tranche personnages est en cours de finalisation (commit/push à faire après validation).

## Ce qui vient d'être réalisé

- Git initialisé, `.gitignore` adapté, commit `chore: initialize Digital Life project` (`73cfcb5`) poussé sur `origin/main`, SSH GitHub vérifié.
- Modèle personnage initial partagé : `src/shared/character.ts` (identité, 21 traits, 10 émotions, 8 besoins, objectifs).
- PRNG seedé déterministe : `src/main/services/prng.ts` (mulberry32, aucun `Math.random()` dans le générateur).
- Générateur : `src/main/services/character-generator.service.ts` (déterministe, seed + paramètres => mêmes personnages).
- Persistance SQLite : table `characters` dans `data/saves/worlds.sqlite`, migration additive, index `world_id`, suppression en cascade explicite à la suppression du monde.
- `createWorld` génère et persiste les personnages quand `generationMode=random`; monde vide => aucun personnage.
- IPC/preload/shared : canal `character:list`, `window.digitalLife.listCharacters(worldId)`, validation entrée Main.
- Tests : `tests/character-generation.test.ts` (8 tests) couvrant seed identique/différente, nombre exact, monde vide, persistance, isolation, pas de doublons, rechargement après redémarrage.

## Ce qui reste à faire

1. Implémenter la reprise/chargement réel d'un monde sauvegardé (écran/état dédié lecture seule, métadonnées + personnages, sans moteur).
2. Permettre l'ajout manuel de personnages dans un monde vide (Phase 1/2).
3. Démarrer Phase 2+ seulement après validation des fondations.

## Décisions techniques

- TypeScript 5.9.3 ; main/preload CommonJS compilés tsc, preload bundlé Rolldown, renderer ESM/Vite.
- sql.js WASM local ; DB SQLite `data/saves/worlds.sqlite` avec tables `worlds` et `characters`.
- Génération personnages déterministe : PRNG mulberry32 seedé, aucun `Math.random()` dans le générateur ; même seed+paramètres => mêmes personnages.
- Traits/émotions/besoins/objectifs persistés en JSON dans SQLite pour extensibilité Phase 1 ; identité en colonnes dédiées.

## Problèmes rencontrés

- Environnement Linux avec restrictions apparmor/userns : `chrome-sandbox` SUID non configuré et GPU process instable. Smoke test validé avec `--no-sandbox --disable-gpu --disable-gpu-sandbox --in-process-gpu`. Ne pas modifier les défauts de sécurité du code ; documenter si nécessaire pour ce type d'environnement.
- `npm install` a nécessité `--prefer-online --fetch-retries=5` après un ERESOLVE transitoire.
- Interruptions ECONNRESET sur les appels d'écriture/outils ; fichiers vérifiés après reprise.

## Fichiers importants à examiner

`AGENTS.md`, `PROGRESS.md`, `HANDOFF.md`, `src/main/services/world-store.service.ts`,
`src/main/services/character-generator.service.ts`, `src/shared/character.ts`,
`src/shared/ipc.ts`, `src/main/ipc/world.ipc.ts`, `src/preload/preload.ts`, `tests/character-generation.test.ts`.

## Commande de relance

Linux : `bash scripts/bootstrap.sh && bash scripts/dev.sh`
Windows : `.\\scripts\\bootstrap.ps1` puis `.\\scripts\\dev.ps1`

## Prochaine tâche recommandée

Implémenter la **reprise/chargement réel d'un monde sauvegardé** : écran/état dédié lecture seule affichant métadonnées du monde et liste des personnages (via `listCharacters`), sans moteur de simulation. Ensuite permettre l'ajout manuel de personnages dans un monde vide.
