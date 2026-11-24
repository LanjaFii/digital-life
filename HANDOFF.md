# HANDOFF.md — Transfert de contexte

## Où en est le développement

Phase 0 validée. Phase 1 fonctionnelle (CRUD instances complet), dernière tranche code
validée et poussée : `669c785101aa0a10e6f69506d870b283c77a1510` (suppression d'instance,
88/88 tests). **Tranche courante : conception architecturale Phase 2 (documentaire uniquement)**.
Aucun moteur, worker, tick, évolution dynamique, relation/événement/mémoire opérationnel,
appel OpenRouter/LLM, ni modification de schéma/IPC/UI n'a été implémenté.

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
- **Suppression d'instance (tranche 2026-11-24)** :
  - service `deleteCharacterInstance(id, worldId)` : trim/validation des ids, `assertWorldPreparation`,
    `SELECT id ... WHERE id = ? AND world_id = ?` avant suppression, `DELETE` avec les deux
    prédicats, `syncWorldCharacterCount`, `persist` ; modèle jamais touché, aucun changement de schéma ;
  - IPC `character:delete` (`id`, `worldId` validés côté main) + preload `deleteCharacter(id, worldId)` ;
  - UI : actions « Supprimer » sur chaque carte et « Supprimer ce personnage » dans la fiche,
    `ConfirmDeleteCharacterDialog` (nom du personnage, monde, caractère définitif, annulation),
    actualisation liste/compteur, retour à la liste depuis la fiche, notification `role="status"`,
    erreurs IPC en `role="alert"` ; cartes passées de `<button>` à `<div>` + bouton interne
    pour éviter les boutons imbriqués ; `onDelete` optionnel sur `CharacterDetail` (inchangé
    pour les modèles de bibliothèque) ;
  - tests : `tests/character-deletion.test.ts` (13 tests service : suppression valide, monde
    vide/sans correspondance, id inexistant, cross-world, statut verrouillé, modèle conservé,
    instances des autres mondes conservées, compteur, persistance après reset, ids invalides,
    monde inexistant, autres personnages inchangés, instance sans modèle) et
    `tests/character-deletion-ui.test.tsx` (5 tests jsdom : confirmation/annulation,
    actualisation + notification, erreur IPC, retour à la liste depuis la fiche, annulation
    depuis la fiche). Total **88/88** (8 fichiers) ;
  - smoke réel : annulation, suppression carte (compteur 4→3), suppression de l'instance
    d'un modèle (modèle et instance B intacts), suppression fiche (compteur 3→1 + retour liste),
    refus IPC cross-world et id vide, persistance après redémarrage, nettoyage + DB restaurée
    byte-identique.

- **Conception Phase 2 (tranche documentaire, 2026-11-24)** :
  - audit confirmé : `CharacterState` 21/10/8, `initialState`/`currentState`, legacy `*_json`
    miroir, `SeededRng` sans sérialisation, `src/main/simulation/` vide, aucune relation/événement/mémoire/tick/worker/LLM ;
  - docs créés/étendus : `docs/CHARACTER_STATE_ARCHITECTURE.md`,
    `docs/RELATIONSHIP_SYSTEM.md`, `docs/EVENT_AND_MEMORY_SYSTEM.md`,
    `docs/SIMULATION_TIME_AND_ENGINE.md` (Mermaid, contrats TS/SQLite additifs proposés) ;
  - décisions proposées : `initialState` immuable après `simulation_started`, worker seul
    écrivain de `currentState`, transaction par tick, PRNG métier sérialisable (`rngState`),
    relations asymétriques `ownerId→targetId`, journal d'événements immuable, souvenirs
    subjectifs `active/faded` jamais supprimés physiquement, temps logique (tick) jamais
    `Date.now()`, LLM hors décisions/état/événements ;
  - **aucun code/schéma/IPC/UI modifié** ; paramètres de tick/fréquence/snapshot restent
    provisoires et explicitement à calibrer.

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
- Suppression d'instance : pas de suppression en cascade ; la suppression est conditionnée
  aux deux prédicats `id` **et** `world_id` (contrôle d'appartenance avant `DELETE`), afin
  qu'une manipulation IPC ne puisse pas toucher le personnage d'un autre monde. Le modèle
  reste intact (référence `template_id` informative, pas de FK). Aucune modification de schéma.

## Problèmes rencontrés

- **Migration legacy** : premier smoke réel sur base existante → « no such column:
  template_id » (index créé avant l'ALTER). Corrigé + test de non-régression. Leçon :
  toujours tester la migration sur une base au schéma précédent, pas seulement une base neuve.
- Linux restreint (AppArmor/userns) : voir `docs/TROUBLESHOOTING.md` (historique, résolu dev-only).
- Harness smoke B : la première exécution a affiché un faux échec car une valeur numérique
  (`cardsA`) était incluse dans un `.every(v === true)` ; le harness a été corrigé et la
  séquence complète A+B rejouée avec succès. Aucun bug applicatif.

## Fichiers importants à examiner

`AGENTS.md`, `PROGRESS.md`, `HANDOFF.md`,
`docs/CHARACTER_STATE_ARCHITECTURE.md`, `docs/RELATIONSHIP_SYSTEM.md`,
`docs/EVENT_AND_MEMORY_SYSTEM.md`, `docs/SIMULATION_TIME_AND_ENGINE.md`,
`docs/SIMULATION_ENGINE.md`, `docs/EVENT_SYSTEM.md`, `docs/MEMORY_SYSTEM.md`,
`docs/DATABASE.md`, `docs/CHARACTER_SYSTEM.md`,
`src/shared/character.ts`, `src/shared/world.ts`, `src/shared/ipc.ts`,
`src/main/services/world-store.service.ts`, `src/main/services/prng.ts`,
`src/main/services/character-validation.service.ts`, `src/main/ipc/character.ipc.ts`,
`src/preload/preload.ts`.

## Commande de relance

Linux : `bash scripts/bootstrap.sh && bash scripts/dev.sh`
Windows : `.\scripts\bootstrap.ps1` puis `.\scripts\dev.ps1`
Tests : `bash scripts/test.sh` — Typecheck : Node local + `scripts/typecheck.mjs`.

## Prochaine tâche recommandée

1. **Valider puis committer/pousser cette tranche documentaire** après vérifications (liens,
   Mermaid, checks, diff sans secret/généré, `git ls-remote` == HEAD, working tree propre).
2. Avant toute implémentation Phase 3, trancher les paramètres provisoires du doc temps
   (durée tick, fréquence 1x, vitesses, snapshots) et concevoir l'API `SeededRng.getState()/setState()`
   + la table additive `simulation_clock`.
3. Première implémentation cible (après contrat validé) : squelette worker/simulation main-only,
   commandes IPC de contrôle, `SimulationClock` persisté, transaction par tick, sans LLM ni
   relations/événements/mémoires complets. Ne pas implémenter relations/événements/mémoires/mort/LLM
   avant les phases prévues.
