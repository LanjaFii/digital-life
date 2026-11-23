# HANDOFF.md — Transfert de contexte

## Où en est le développement

Phase 0 validée. Phase 1 en cours : menu principal, génération/persistance des personnages, reprise/consultation de monde.
Git : `origin/main` vérifié à `0ae3429` avant cette tranche. Les changements de la tranche reprise sont dans le working tree et doivent être committés/poussés/vérifiés avant toute fonctionnalité suivante.

## Ce qui vient d'être réalisé

- **Tranche reprise/consultation de monde (Phase 1)** :
  - IPC/preload : ajout `WORLD_GET` / `window.digitalLife.getWorld(id)` (renderer → preload → IPC → main → SQLite). Validation d'entrée côté main.
  - Service : `getWorld(id)` charge le monde depuis SQLite, met à jour `lastOpenedAt/updatedAt`, lève une erreur si introuvable.
  - UI : bouton "Reprendre" fonctionnel dans `App.tsx`; nouvel écran `WorldView` (métadonnées monde, nombre réel de personnages, cartes personnages, états chargement/erreur/introuvable, actualisation).
  - Fiche détail : `CharacterDetail` affiche identité, bio, 21 traits, 10 émotions, 8 besoins, objectif principal + 2 secondaires avec barres de progression (`StatBar`). Échelles conformes à `docs/CHARACTER_SYSTEM.md`.
  - Navigation : retour liste personnages, retour menu principal; suppression d'un monde consulté gérée (retour menu si monde sélectionné supprimé).
  - Tests : `tests/world-store.test.ts` étendu (getWorld, introuvable, isolation inter-mondes, persistance après redémarrage); `tests/world-resume-ui.test.tsx` (jsdom) couvre reprise, monde vide, monde introuvable, erreur IPC, retour liste, retour menu.
  - Dépendances dev ajoutées pour tests UI : `@testing-library/react`, `@testing-library/dom`, `jsdom`.
- Validation réelle : check-deps OK, typecheck OK, 30/30 tests OK, build OK. Smoke Electron CDP réel (Linux restreint, `--no-sandbox --disable-gpu` dev-only, sécurité `window.ts` inchangée) : Reprendre → monde/2 cartes → fiche détail → retour liste → retour menu.

## Ce qui reste à faire

1. Permettre l'ajout manuel de personnages dans un monde vide (Phase 1, sans moteur).
2. Démarrer Phase 2 (évolution dynamique/personnages complets) seulement après validation des fondations Phase 1.
3. Ne pas implémenter simulation, interactions, relations, événements, mémoire, mort, LLM/OpenRouter avant les phases prévues.

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
`src/main/ipc/world.ipc.ts`, `src/shared/ipc.ts`, `src/preload/preload.ts`,
`src/renderer/App.tsx`, `src/renderer/components/WorldView.tsx`,
`src/renderer/components/CharacterDetail.tsx`, `tests/world-resume-ui.test.tsx`.

## Commande de relance

Linux : `bash scripts/bootstrap.sh && bash scripts/dev.sh`
Windows : `.\\scripts\\bootstrap.ps1` puis `.\\scripts\\dev.ps1`

## Prochaine tâche recommandée

Implémenter l'**ajout manuel de personnages dans un monde vide** : formulaire UI, validation main/preload, persistance SQLite dans `characters` avec `world_id` existant, rafraîchissement de la consultation monde. Ne pas démarrer le moteur de simulation, les interactions, relations, événements, mémoire, mort ou l'intégration LLM.
