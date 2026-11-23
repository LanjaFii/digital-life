# HANDOFF.md — Transfert de contexte

## Où en est le développement

Phase 0 validée. Phase 1 en cours : menu principal fonctionnel (liste/création/suppression) branché sur SQLite local.
Node portable local v26.13.1, dépendances npm, WASM sql.js, Electron 45.4.1 linux-x64 (SHA-256 vérifié) présents.

## Ce qui vient d'être réalisé

- Menu principal UI (`src/renderer/App.tsx`, `styles/global.css`) : ambiance sombre/immersive, liste des mondes SQLite, états chargement/erreur/vide, diagnostic système masquable.
- Création monde : `CreateWorldDialog` (nom, seed aléatoire/personnalisée, mode vide/aléatoire, nombre de personnages 1-50).
- Suppression : confirmation modale avant suppression.
- Reprise : bouton visible mais désactivé (non implémenté).
- Backend étendu : `generationMode` dans `WorldSummary/CreateWorldInput/DB`, migration légère `generation_mode`, validation IPC.
- Tests : 12/12 passés ; typecheck/build OK ; smoke CDP UI OK.

## Ce qui reste à faire

1. Générer effectivement les personnages aléatoires lors de la création (données personnage minimales, persistance par monde/fichier ou table dédiée, sans simulation).
2. Implémenter la reprise/chargement réel d'un monde sauvegardé (écran état monde).
3. Ajouter slots/sauvegardes multiples déjà couvertes par mondes, mais améliorer métadonnées/UX si nécessaire.

## Décisions techniques

- TypeScript 5.9.3 plutôt que 7.0.2 : maturité et compatibilité des outils.
- Commun JS (CommonJS) pour main/preload compilés par tsc ; ESM pour le renderer via Vite.
- sql.js WASM copié dans `resources/sqlite/` et chargé depuis le disque local uniquement.
- Les scripts `.mjs` se relancent avec le Node local même si l'utilisateur tape `npm run ...`.

## Problèmes rencontrés

- Environnement Linux avec restrictions apparmor/userns : `chrome-sandbox` SUID non configuré et GPU process instable. Smoke test validé avec `--no-sandbox --disable-gpu --disable-gpu-sandbox --in-process-gpu`. Ne pas modifier les défauts de sécurité du code ; documenter si nécessaire pour ce type d'environnement.
- `npm install` a nécessité `--prefer-online --fetch-retries=5` après un ERESOLVE transitoire.
- Interruptions ECONNRESET sur les appels d'écriture/outils ; fichiers vérifiés après reprise.

## Fichiers importants à examiner

`AGENTS.md`, `PROGRESS.md`, `scripts/bootstrap.sh`, `scripts/runtime.mjs`,
`src/main/main.ts`, `src/preload/preload.ts`, `src/shared/ipc.ts`, `src/renderer/App.tsx`.

## Commande de relance

Linux : `bash scripts/bootstrap.sh && bash scripts/dev.sh`
Windows : `.\\scripts\\bootstrap.ps1` puis `.\\scripts\\dev.ps1`

## Prochaine tâche recommandée

Implémenter la **génération effective des personnages aléatoires** pour les mondes `generationMode=random` (modèle personnage minimal, seedée, persistée), puis brancher la reprise à un écran de détail monde lecture seule. Ne pas démarrer le moteur de simulation.
