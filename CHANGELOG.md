# CHANGELOG

Format : entrées datées, catégories Added / Changed / Fixed / Removed / Technical decisions.

## 2026-11-24 — Phase 2 (conception du système d'évolution des personnages, documentaire)

### Added
- `docs/CHARACTER_STATE_ARCHITECTURE.md` : audit de l'existant, séparation stable/dynamique,
  contrat `initialState` immuable après démarrage / `currentState` évolutif, règles de
  cohérence, structures TypeScript proposées, scénarios de non-régression.
- `docs/RELATIONSHIP_SYSTEM.md` : refonte/extension de la note Phase 4 en contrat complet
  (relations asymétriques `ownerId → targetId`, absence = neutre, 9 dimensions 0-100,
  types dérivés calculés, table additive `relationships` proposée, exemples, intégrité).
- `docs/EVENT_AND_MEMORY_SYSTEM.md` : distinction état courant / journal d'événements
  factuel immuable / souvenirs personnels subjectifs, structures `WorldEvent`/`Memory`,
  consolidation/oubli `faded` sans suppression physique, frontière LLM, tests prévus.
- `docs/SIMULATION_TIME_AND_ENGINE.md` : options de tick/fréquence (provisoires),
  `SimulationClock`, déterminisme PRNG sérialisable, ordre stable, snapshot puis application,
  transaction par tick, pause/reprise, frontière worker/main/IPC, paramètres à calibrer.

### Changed
- `PROGRESS.md`, `HANDOFF.md`, `README.md` mis à jour pour refléter la tranche de conception
  Phase 2 ; Phase 1 reste la dernière tranche code validée/poussée (`669c785`).

### Technical decisions
- Tranche **strictement documentaire** : aucun moteur, worker, tick, relation/événement/mémoire
  opérationnel, appel OpenRouter/LLM, modification de schéma/IPC/UI, ou donnée utilisateur.
- `initialState` devient immuable après `worlds.status = 'simulation_started'` ; seul
  `currentState` (et structures dynamiques) évolue en simulation.
- Une transaction SQLite par tick ; `Date.now()` interdit dans les règles ; PRNG métier
  sérialisable requis avant implémentation.
- Tables `relationships`/`events`/`memories`/`simulation_clock` proposées en additif seulement,
  jamais dans cette tranche.

## 2026-11-24 — Phase 1 (suppression d'une instance de personnage)

### Added
- **Suppression d'instance** : service `deleteCharacterInstance(id, worldId)` dans
  `world-store.service.ts` (validation des ids, garde `assertWorldPreparation`, contrôle
  d'appartenance `id` + `world_id`, `DELETE` ciblé, resynchronisation du compteur,
  persistance SQLite). Aucune modification de schéma ; le modèle et les autres mondes
  ne sont jamais touchés.
- **IPC/preload dédiés** : canal `character:delete` et méthode
  `deleteCharacter(id, worldId): Promise<{ deleted: boolean }>` (ids validés côté main).
- **UI** : action « Supprimer » sur chaque carte de personnage et « Supprimer ce personnage »
  dans la fiche, composant `ConfirmDeleteCharacterDialog` (personnage et monde identifiés,
  suppression définitive pour ce monde, annulation/confirmation), notification de succès,
  affichage des erreurs IPC, retour automatique à la liste après suppression depuis la fiche.
- **Tests** : `tests/character-deletion.test.ts` (13 cas service dont cross-world, statut
  verrouillé, modèle conservé, compteur, persistance, ids invalides) et
  `tests/character-deletion-ui.test.tsx` (5 cas jsdom dont annulation, actualisation,
  retour à la liste, erreur IPC). Total 88/88 tests (8 fichiers).

### Changed
- `WorldView` : cartes converties en `<div>` avec bouton d'ouverture interne (plus de boutons
  imbriqués), banners succès/erreur réutilisés, rafraîchissement liste + compteur après suppression.
- `CharacterDetail` : prop optionnelle `onDelete` (absente pour les modèles de bibliothèque).
- Documentation mise à jour : `PROGRESS.md`, `HANDOFF.md`, `README.md`,
  `docs/CHARACTER_SYSTEM.md`, `docs/DATABASE.md`.
- Smoke Electron réel (2 phases avec redémarrage) validé ; base utilisateur restaurée
  byte-identique après nettoyage.

### Fixed
- Aucun bug applicatif. Faux échec du harness smoke B (valeur numérique testée avec
  `.every(v === true)`) corrigé dans le script de test, séquence rejouée avec succès.

### Removed
- Rien.

### Technical decisions
- Suppression refusée côté main si `worlds.status !== 'preparation'`, sans dépendre d'un
  masquage de bouton dans le renderer.
- Double prédicat `id` + `world_id` sur le `DELETE`, précédé d'un `SELECT` d'appartenance :
  une manipulation IPC ne peut viser que l'instance du monde demandé. Messages d'erreur
  distincts : identifiants invalides / monde inexistant / personnage introuvable dans ce monde.
- `template_id` reste informatif (pas de FK, pas de cascade) : supprimer une instance
  n'affecte jamais le modèle ni ses autres instances.

## 2026-11-23 — Phase 1 (création manuelle de personnages + bibliothèque réutilisable)

### Added
- **Bibliothèque personnelle** : table `character_templates`, service CRUD complet
  (`createTemplate`, `listTemplates`, `getTemplate`, `updateTemplate`, `deleteTemplate`,
  `instantiateTemplate`), IPC/preload dédiés (`template:*`), écran `LibraryView`
  (cartes, recherche par nom, états chargement/vide/erreur/aucun résultat, dates).
- **Création manuelle** : formulaire `CharacterForm` en 6 étapes (identité, 21 traits avec
  libellés/descriptions FR et sliders, 10 émotions, 8 besoins, 1+2 objectifs, récapitulatif),
  option « monde seul » ou « monde + bibliothèque », bouton « Générer une personnalité
  cohérente » réutilisant le générateur déterministe (`generateDraftState`, IPC `character:random-draft`).
- **Ajout depuis la bibliothèque** dans l'écran monde : `AddFromLibraryDialog`
  (sélection → aperçu → confirmation → copie indépendante → actualisation immédiate).
- **Action « Utiliser »** depuis la bibliothèque : `UseInWorldDialog` (choix du monde puis instanciation).
- **Modification d'instance** en phase de préparation depuis la fiche personnage ;
  modification de modèle depuis la bibliothèque ; suppressions avec confirmation.
- Validation centralisée côté main : `character-validation.service.ts` (identifiants, chaînes,
  âge 18-65, genre, entiers 0-100, 21/10/8 clés exactes, objectifs 1 principal + 2 secondaires,
  existence monde/modèle).
- Types partagés : `CharacterTemplate`, `CharacterInstance` (alias `Character`), `CharacterState`
  (initial/courant), `CharacterDraft`, clés `TRAIT_KEYS`/`EMOTION_KEYS`/`NEED_KEYS`.
- `worlds.status` (`preparation` | `simulation_started`) + garde `assertWorldPreparation`
  (verrouillage futur, aucun faux démarrage de simulation).
- Tests : `tests/character-library.test.ts` (création, rejets de validation, CRUD bibliothèque,
  réutilisation, indépendance modèle/instances, isolation inter-mondes, verrouillage,
  **migration additive d'une base legacy**) et `tests/character-library-ui.test.tsx`
  (navigation bibliothèque, états, création/modification/suppression avec confirmation,
  ajout depuis la bibliothèque, actualisation immédiate du monde, « Utiliser »).

### Changed
- Table `characters` étendue additivement : `template_id` (référence informative, sans cascade),
  `updated_at`, `initial_*_json` / `current_*_json` (backfill depuis les colonnes legacy `*_json`,
  conservées en miroir). Migration non destructive, anciens mondes/personnages préservés.
- `CharacterDetail`, `WorldView`, générateur et tests existants adaptés à `currentState`/`initialState`.
- `WorldView` : boutons « Créer un personnage » / « Ajouter depuis ma bibliothèque » /
  « Modifier ce personnage » ; libellés FR factorisés dans `character-labels.ts`.
- `App.tsx` : entrée de navigation « Ma bibliothèque ».
- `getDb` réinitialise le singleton en cas d'échec d'ouverture (plus de promesse rejetée persistante).

### Fixed
- **Migration legacy** : l'index `idx_characters_template_id` était créé avant l'ajout de la
  colonne `template_id` sur les bases existantes (« no such column » détecté au smoke réel) ;
  index désormais créé après migration. Test de non-régression sur base Phase 1 ajouté.

### Technical decisions
- **Modèle vs instance** : instancier = copie profonde avec nouvel UUID ; aucune synchronisation
  automatique modèle ↔ instances ; suppression d'un modèle → `template_id = NULL`, instances intactes.
- `initialState`/`currentState` séparés dès maintenant pour éviter une refonte au démarrage
  de la simulation (Phase 3) ; en préparation, les deux sont réalignés à chaque édition.
- Pas de FK entre `characters.template_id` et `character_templates` (référence purement informative).
- Aucune simulation, action, interaction, relation, événement, mémoire, mort, LLM dans cette tranche.

## 2026-11-23 — Phase 1 (reprise/consultation de monde)

### Added
- IPC/preload : canal `world:get` + `window.digitalLife.getWorld(id)` pour charger un monde par identifiant depuis SQLite.
- Service `world-store` : `getWorld(id)` avec validation, erreur "Monde introuvable", mise à jour `lastOpenedAt/updatedAt`.
- UI renderer : `WorldView` (métadonnées monde, liste/cartes personnages, états chargement/erreur/introuvable/vide, actualisation), `CharacterDetail` (identité, bio, 21 traits, 10 émotions, 8 besoins, objectif principal + 2 secondaires), `StatBar` réutilisable.
- Navigation : bouton "Reprendre" fonctionnel, retour liste personnages, retour menu principal.
- Tests : couverture service `getWorld`/isolation/persistance après redémarrage, UI jsdom pour reprise, monde vide, monde introuvable, erreur IPC, retours navigation.

### Changed
- `App.tsx` : état `selectedWorldId` et affichage conditionnel `WorldView` / menu.
- Contrat IPC partagé et preload étendus avec `WORLD_GET`/`getWorld`.
- Dépendances dev : `@testing-library/react`, `@testing-library/dom`, `jsdom` pour tests UI renderer.

### Fixed
- Test IPC Phase 0 mis à jour pour inclure `WORLD_GET`.

### Technical decisions
- Consultation en lecture seule : aucune modification des modèles de simulation; pas de moteur, pas d'actions/relations/événements/mémoire/mort/LLM.
- Données affichées exclusivement depuis SQLite via IPC sécurisé; le renderer n'accède pas directement à la DB.

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
