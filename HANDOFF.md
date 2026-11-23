# HANDOFF.md — Transfert de contexte

## Où en est le développement

Phase 0 validée. Phase 1 en cours : menu principal + génération/persistance initiale des personnages.
Git : `main` suit `origin/main`, `2ef639f` poussé et vérifié. Correctif dev Linux prêt à être commité/poussé après validation.

## Ce qui vient d'être réalisé

- Tranche personnages (commit `2ef639f`) : modèle `src/shared/character.ts`, PRNG `prng.ts`, générateur déterministe, table SQLite `characters`, IPC/preload `character:list`, tests 20/20, docs mises à jour.
- **Correctif lancement dev Linux** : `scripts/dev.mjs` détecte environnement restreint (AppArmor `apparmor_restrict_unprivileged_userns=1` + `chrome-sandbox` non setuid root) et lance Electron avec `--no-sandbox` **uniquement pour le processus dev**, avec avertissement explicite. Variables : `DL_DEV_NO_SANDBOX=0|1`. `src/main/security/window.ts` inchangé.
- **Vite warning corrigé** : `vite.config.ts` renommé en `vite.config.mts` (ESM natif), `tsconfig.json` mis à jour ; plus d'avertissement `configLoader: 'native'`.
- Validation réelle : check-deps OK, typecheck OK, 20/20 tests OK, build OK, Electron dev lancé réellement (processus main/zygote/gpu/network/renderer actifs).

## Ce qui reste à faire

1. Implémenter la reprise/chargement réel d'un monde sauvegardé (écran/état dédié lecture seule, métadonnées + personnages, sans moteur).
2. Permettre l'ajout manuel de personnages dans un monde vide (Phase 1/2).
3. Démarrer Phase 2+ seulement après validation des fondations.

## Décisions techniques

- TypeScript 5.9.3 ; main/preload CommonJS compilés tsc, preload bundlé Rolldown, renderer ESM/Vite.
- sql.js WASM local ; DB SQLite `data/saves/worlds.sqlite` avec tables `worlds` et `characters`.
- Génération personnages déterministe : PRNG mulberry32 seedé, aucun `Math.random()` dans le générateur.
- **Sandbox dev Linux** : contournement `--no-sandbox` isolé à `scripts/dev.mjs`, activé uniquement si sandbox Chromium inutilisable (AppArmor userns restreint + chrome-sandbox non setuid). Aucune modification de `src/main/security/window.ts` / production. Correction propre = profil AppArmor ou chrome-sandbox setuid root (manuel, implications sécurité).

## Problèmes rencontrés

- **SUID sandbox Electron / AppArmor userns** : `chrome-sandbox` 0755 non-root et `apparmor_restrict_unprivileged_userns=1` empêchent le sandbox Chromium. Diagnostic confirmé (`--disable-setuid-sandbox` → FATAL "No usable sandbox"; `--no-sandbox --version` OK). Correction dev : détection + `--no-sandbox` dev-only avec avertissement. Pas de changement SUID, pas de sudo, pas de désactivation sandbox production.
- `npm install` a nécessité `--prefer-online --fetch-retries=5` après un ERESOLVE transitoire (historique).

## Fichiers importants à examiner

`AGENTS.md`, `PROGRESS.md`, `HANDOFF.md`, `src/main/services/world-store.service.ts`,
`src/main/services/character-generator.service.ts`, `src/shared/character.ts`,
`src/shared/ipc.ts`, `src/main/ipc/world.ipc.ts`, `src/preload/preload.ts`, `tests/character-generation.test.ts`.

## Commande de relance

Linux : `bash scripts/bootstrap.sh && bash scripts/dev.sh`
Windows : `.\\scripts\\bootstrap.ps1` puis `.\\scripts\\dev.ps1`

## Prochaine tâche recommandée

Implémenter la **reprise/chargement réel d'un monde sauvegardé** : écran/état dédié lecture seule affichant métadonnées du monde et liste des personnages (via `listCharacters`), sans moteur de simulation. Ensuite permettre l'ajout manuel de personnages dans un monde vide.
