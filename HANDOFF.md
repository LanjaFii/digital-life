# HANDOFF.md — Transfert de contexte

## Où en est le développement

Phase 0 validée. Phase 1 : menu principal, génération/persistance, reprise/consultation,
**création manuelle de personnages et bibliothèque réutilisable** — tranche terminée,
testée (70/70), buildée, smoke Electron réel 10 parcours validé, committée/poussée sur
`origin/main` (hash vérifié par `git ls-remote --heads origin main`, working tree propre).
Tranche précédente : `470523a` (reprise/consultation).

## Ce qui vient d'être réalisé

- **Architecture modèle/instance** (`src/shared/character.ts`) :
  - `CharacterTemplate` : modèle de bibliothèque (identité + paramètres de départ + dates).
  - `CharacterInstance` (alias `Character`) : personnage d'un monde, `worldId`,
    `templateId` informatif nullable, `initialState` + `currentState` (`CharacterState`
    = traits/émotions/besoins/objectifs), `createdAt`/`updatedAt`.
  - `CharacterDraft` pour création/édition ; clés exactes `TRAIT_KEYS` (21),
    `EMOTION_KEYS` (10), `NEED_KEYS` (8).
- **SQLite** (`world-store.service.ts`) : nouvelle table `character_templates` ;
  `characters` étendue additivement (`template_id`, `updated_at`, `initial_*_json`,
  `current_*_json`, backfill legacy) ; `worlds.status` (`preparation`/`simulation_started`).
  Migration non destructive vérifiée par test dédié **et** au smoke sur la base réelle.
- **Indépendance** : instanciation = copie profonde + nouvel UUID ; aucune synchronisation
  modèle ↔ instances ; suppression modèle → `template_id = NULL`, instances intactes ;
  garde `assertWorldPreparation` (verrouillage futur, pas de faux démarrage).
- **UI** : `CharacterForm` (6 étapes, sliders FR, génération aléatoire cohérente via
  `character:random-draft`), `LibraryView` (« Ma bibliothèque » : cartes, recherche,
  détail, modifier, supprimer avec confirmation, créer sans monde, « Utiliser »),
  `AddFromLibraryDialog` (sélection → aperçu → confirmation → actualisation monde),
  `UseInWorldDialog` (choix du monde), édition d'instance depuis la fiche personnage.
- **Validation main** : `character-validation.service.ts` (chaînes/longueurs, âge 18-65,
  genre, entiers 0-100, 21/10/8 clés, 1 principal + 2 secondaires, existence monde/modèle).
- **IPC/preload** : `character:create/update/random-draft`, `template:list/get/create/update/delete/instantiate`.
- **Tests** : `tests/character-library.test.ts` (24 tests service dont migration legacy),
  `tests/character-library-ui.test.tsx` (13 tests UI jsdom). Total **70/70**.
- **Smoke réel** (CDP, 2 lancements Electron avec redémarrage) : les 10 parcours de la
  séquence validés (création → bibliothèque → redémarrage → édition modèle → 2 mondes →
  édition instance → indépendance A=85/B=20/C=95/modèle=95 → suppression modèle →
  instances intactes). Base utilisateur restaurée après smoke.

## Décisions techniques

- Pas de FK `characters.template_id` → `character_templates` : référence purement
  informative, suppression sans cascade.
- `initialState`/`currentState` séparés dès maintenant (pas de refonte à la Phase 3) ;
  en préparation, édition d'instance réaligne les deux (pas encore de simulation).
- Colonnes legacy `*_json` conservées en miroir de l'état courant (compatibilité descendante).
- Index créés **après** les migrations additives (bug legacy corrigé, ne pas régresser).
- `getDb` réinitialise le singleton si l'ouverture échoue.
- Génération aléatoire déterministe inchangée ; `generateDraftState(seed)` réutilisé par
  le bouton « personnalité cohérente » du formulaire.
- Sandbox dev Linux : contournement `--no-sandbox` isolé à `scripts/dev.mjs` (dev uniquement),
  `src/main/security/window.ts` inchangé.

## Problèmes rencontrés

- **Migration legacy** : premier smoke réel sur base existante → « no such column:
  template_id » (index créé avant l'ALTER). Corrigé + test de non-régression. Leçon :
  toujours tester la migration sur une base au schéma précédent, pas seulement une base neuve.
- Linux restreint (AppArmor/userns) : voir `docs/TROUBLESHOOTING.md` (historique, résolu dev-only).

## Fichiers importants à examiner

`AGENTS.md`, `PROGRESS.md`, `docs/CHARACTER_SYSTEM.md`, `docs/DATABASE.md`,
`src/shared/character.ts`, `src/main/services/world-store.service.ts`,
`src/main/services/character-validation.service.ts`, `src/main/ipc/character.ipc.ts`,
`src/renderer/components/CharacterForm.tsx`, `src/renderer/components/LibraryView.tsx`,
`src/renderer/components/WorldView.tsx`, `tests/character-library.test.ts`,
`tests/character-library-ui.test.tsx`.

## Commande de relance

Linux : `bash scripts/bootstrap.sh && bash scripts/dev.sh`
Windows : `.\scripts\bootstrap.ps1` puis `.\scripts\dev.ps1`
Tests : `bash scripts/test.sh` — Typecheck : Node local + `scripts/typecheck.mjs`.

## Prochaine tâche recommandée

1. **Suppression d'une instance d'un monde en préparation** (avec confirmation,
   resynchronisation du `character_count`) : c'est la seule opération CRUD instance
   manquante ; petite tranche symétrique de la suppression de modèle.
2. Ensuite, préparer la **Phase 2** (évolution dynamique des besoins/émotions) en
   définissant le contrat `initialState` → `currentState`, puis la Phase 3 (worker,
   démarrage réel de simulation, verrouillage UI via `worlds.status`).
3. Ne pas implémenter interactions, relations, événements, mémoire, mort, LLM/OpenRouter
   avant les phases prévues.
