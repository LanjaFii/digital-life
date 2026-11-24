# PROGRESS.md — Suivi central du développement

## État actuel

- **Phase** : **Phase 3B — Conception du premier système d'évolution dynamique des personnages** (documentaire, terminée dans cette tranche ; aucune implémentation).
- **Avancement approximatif** : Phase 1 ~85 % (CRUD préparation) ; Phase 2 documentaire terminée ; Phase 3A infrastructure implémentée/validée/committée/poussée ; Phase 3B conception documentaire terminée ; comportements autonomes non implémentés.
- **Dernière mise à jour** : 2026-11-24.
- **Git** : remote `git@github.com:LanjaFii/digital-life.git`, branche `main`. Dernier commit poussé avant cette tranche : `e0f6d0b1d032c841e5d5772098f6ab16e3b1f4dd` (`feat(phase3a): implement simulation clock infrastructure`).

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
- [x] Création manuelle de personnages : formulaire 6 étapes (identité 18-65, 21 traits sliders FR + génération aléatoire cohérente, 10 émotions, 8 besoins, 1+2 objectifs, récapitulatif), options « monde seul » / « monde + bibliothèque », validation main complète, persistance SQLite, actualisation immédiate du monde.
- [x] Bibliothèque personnelle « Ma bibliothèque » : modèles `CharacterTemplate` persistés (table `character_templates`), cartes, recherche, détail, modification, suppression avec confirmation, création sans monde, action « Utiliser » (choix monde + instanciation), états chargement/vide/erreur/aucun résultat.
- [x] Ajout depuis la bibliothèque dans un monde : sélection → aperçu → confirmation → copie indépendante (nouvel UUID) → nombre de personnages actualisé.
- [x] Indépendance totale modèle/instances : édition/suppression de modèle sans effet sur les instances ; édition d'instance sans effet sur le modèle ni les autres mondes ; `template_id` informatif remis à NULL à la suppression du modèle.
- [x] Modification d'instance en préparation ; `worlds.status` (`preparation`/`simulation_started`) + garde main `assertWorldPreparation` (verrouillage futur, pas de faux démarrage).
- [x] Migration additive : `characters.template_id/updated_at/initial_*_json/current_*_json` backfillés depuis les colonnes legacy ; anciens mondes/personnages préservés (test dédié sur base legacy).
- [x] Suppression d'une instance de personnage : action sur la carte et la fiche, confirmation modale identifiant personnage/monde et caractère définitif, annulation, suppression via IPC dédié `character:delete`, actualisation liste/compteur, retour à la liste depuis la fiche, notification de succès, erreurs IPC affichées. Garde main : statut `preparation`, ids valides, appartenance réelle au monde ; modèle original et instances des autres mondes intacts, compteur resynchronisé, persistance SQLite.

## Phase 3A — Infrastructure simulation (terminée dans cette tranche)

- [x] Audit complet (docs, git, schéma, IPC, PRNG, tests, scripts, UI).
- [x] `SeededRng` sérialisable : `normalizeSeed`, `getState()`, `setState()` avec validation uint32 ; tests de déterminisme/reprise.
- [x] Contrats partagés `src/shared/simulation.ts` (clock, status, speed, commandes, normalisation legacy).
- [x] SQLite : table additive `simulation_clock`, index, migration non destructive, validation des données.
- [x] Store simulation : `start/pause/resume/step/setSpeed/stop/getStatus`, transactions atomiques, `persist` unique, recovery `running -> paused` au démarrage.
- [x] Séparation domaine PRNG simulation : `world.seed ^ 0x85ebca6b` (génération inchangée).
- [x] Worker Node `worker_threads` (`src/main/simulation/simulation.worker.ts`) : planification/signaux uniquement, sans SQLite.
- [x] Manager main (`simulation-manager.service.ts`) : verrou par monde, anti double-tick, sync worker, broadcast statut, shutdown propre.
- [x] IPC/preload/main : canaux simulation typés/validés, événement `simulation:status-changed`, `recoverSimulationClocksAfterRestart`, `shutdownSimulationManager`.
- [x] UI WorldView minimale : contrôles start/pause/resume/step/stop, vitesses 1x/2x/5x/10x, affichage jour/heure/tick/statut depuis le main, édition personnages désactivée hors préparation.
- [x] `simulation_stopped` : arrêt volontaire, données conservées, pas de redémarrage implicite (décision documentée).

## Conception Phase 3B (documentaire, terminée dans cette tranche)

- [x] Audit du réel confirmé : 21 traits, 10 émotions, 8 besoins (`100 = satisfait`), `initialState`/`currentState`, horloge 1 tick = 1 h, PRNG sérialisable, `stepSimulation` ne fait encore évoluer que l'horloge.
- [x] `docs/NEEDS_EVOLUTION.md` : 8 besoins (définition, dérive/tick, facteurs, traits pertinents, interactions, seuils critiques, conséquences futures, récupération), formule générale, calibration provisoire, limites et tests à prévoir.
- [x] `docs/EMOTION_EVOLUTION.md` : 10 émotions (causes hausse/baisse, besoins influents, traits pertinents, interactions, récupération), baselines provisoires, matrice besoin→émotion, anti-boucles, plafonds, tests à prévoir.
- [x] `docs/CHARACTER_TICK_RULES.md` : protocole snapshot → besoins projetés → émotions → agrégation → clamp/arrondi → application différée → transaction atomique + `persist` unique ; déterminisme/PRNG ; `TickDelta[]` explicable ; contrats TS proposés ; 4 services purs futurs ; calibration 24/72/168/720/plusieurs milliers de ticks ; profils et critères d'échec ; 2 diagrammes Mermaid ; décisions définitives / provisoires / à calibrer.
- [x] Aucun code applicatif, schéma SQLite, migration, worker, IPC, preload, UI, LLM, mort, relations, événements ou souvenirs modifié.

## Fonctionnalités non commencées

- [ ] Implémentation Phase 3B : appliquer les règles conçues (besoins + émotions + influence personnalité) dans un tick atomique — **non démarrée**.
- [ ] Phase 3B+ : décisions autonomes, objectifs, actions, conséquences.
- [ ] Phases 4 à 8 : relations, événements, souvenirs, mort/deuil, LLM optionnel, interface avancée, stabilisation.

## Conception Phase 2 (documentaire, terminée dans cette tranche)

- [x] Audit de l'existant réalisé (types, SQLite/migrations, validation, persistance, IPC/preload, garde `worlds.status`, UI, tests 88/88, docs).
- [x] `docs/CHARACTER_STATE_ARCHITECTURE.md` : audit réel, séparation stable/dynamique, contrat `initialState` immuable / `currentState` évolutif, règles de cohérence, structures TS proposées, scénarios de non-régression.
- [x] `docs/RELATIONSHIP_SYSTEM.md` : relations asymétriques `ownerId → targetId`, absence = neutre, 9 dimensions 0-100, types dérivés calculés, table `relationships` additive proposée, exemples et règles d'intégrité.
- [x] `docs/EVENT_AND_MEMORY_SYSTEM.md` : distinction état courant / historique factuel / souvenirs subjectifs, types d'événements, `WorldEvent`/`Memory` proposés, immuabilité du journal, consolidation/oubli `faded`, frontière LLM, tests.
- [x] `docs/SIMULATION_TIME_AND_ENGINE.md` : options de tick/fréquence (provisoires, non finales), `SimulationClock`, déterminisme/seed/PRNG sérialisable, ordre stable, snapshot puis application, transaction par tick, pause/reprise, frontière worker/main/IPC, paramètres à calibrer.
- [x] Diagrammes Mermaid ajoutés dans les 4 documents.
- [x] Aucune modification de code, schéma, migration, IPC, worker, UI, LLM ou donnée utilisateur.

## Fichiers créés (Phase 0 / Phase 1 / Phase 2 design)

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

Ajouts tranche création manuelle + bibliothèque :
- `src/main/services/character-validation.service.ts`
- `src/main/ipc/character.ipc.ts`
- `src/renderer/components/CharacterForm.tsx`
- `src/renderer/components/LibraryView.tsx`
- `src/renderer/components/AddFromLibraryDialog.tsx`
- `src/renderer/components/UseInWorldDialog.tsx`
- `src/renderer/components/character-labels.ts`
- `tests/character-library.test.ts`, `tests/character-library-ui.test.tsx`

Ajouts tranche suppression d'instance :
- `src/renderer/components/ConfirmDeleteCharacterDialog.tsx`
- `tests/character-deletion.test.ts`, `tests/character-deletion-ui.test.tsx`

Ajouts tranche conception Phase 2 (documentaire uniquement) :
- `docs/CHARACTER_STATE_ARCHITECTURE.md`
- `docs/EVENT_AND_MEMORY_SYSTEM.md`
- `docs/SIMULATION_TIME_AND_ENGINE.md`

Ajouts tranche Phase 3A (infrastructure simulation) :
- `src/shared/simulation.ts`
- `src/main/ipc/simulation.ipc.ts`
- `src/main/services/simulation-manager.service.ts`
- `src/main/simulation/simulation.worker.ts`
- `tests/prng.test.ts`
- `tests/simulation.test.ts`

Ajouts tranche conception Phase 3B (documentaire uniquement) :
- `docs/NEEDS_EVOLUTION.md`
- `docs/EMOTION_EVOLUTION.md`
- `docs/CHARACTER_TICK_RULES.md`

## Fichiers modifiés

- Phase 0 : `tsconfig.base.json`, `tsconfig.test.json`, `src/main/ipc/app.ipc.ts`, `scripts/check-deps.mjs`, `scripts/dev.mjs`, `scripts/build.mjs`, `src/main/services/resource.service.ts`, docs mineures.
- Phase 1 menu : `src/shared/ipc.ts`, `src/preload/preload.ts`, `src/main/main.ts`, `src/renderer/App.tsx`, `src/renderer/styles/global.css`, `tests/phase0.test.ts`.
- Phase 1 personnages : `src/shared/ipc.ts`, `src/shared/world.ts`, `src/main/services/world-store.service.ts`, `src/main/ipc/world.ipc.ts`, `src/preload/preload.ts`, `tests/phase0.test.ts`, `docs/CHARACTER_SYSTEM.md`.
- Correctif dev Linux : `scripts/dev.mjs` (détection sandbox restreint, `--no-sandbox` dev uniquement, avertissement), `vite.config.ts` → `vite.config.mts`, `tsconfig.json`, `docs/TROUBLESHOOTING.md`, `docs/DEVELOPMENT.md`, `PROGRESS.md`, `HANDOFF.md`, `CHANGELOG.md`.
- Tranche reprise : `src/shared/ipc.ts`, `src/preload/preload.ts`, `src/main/ipc/world.ipc.ts`, `src/main/services/world-store.service.ts`, `src/renderer/App.tsx`, `src/renderer/styles/global.css`, `tests/phase0.test.ts`, `tests/world-store.test.ts`, `package.json`, `package-lock.json`, docs de suivi.
- Tranche création manuelle + bibliothèque : `src/shared/character.ts`, `src/shared/world.ts`, `src/shared/ipc.ts`, `src/preload/preload.ts`, `src/main/main.ts`, `src/main/services/world-store.service.ts`, `src/main/services/character-generator.service.ts`, `src/renderer/App.tsx`, `src/renderer/components/WorldView.tsx`, `src/renderer/components/CharacterDetail.tsx`, `src/renderer/styles/global.css`, `tests/phase0.test.ts`, `tests/character-generation.test.ts`, `tests/world-resume-ui.test.tsx`, `PROGRESS.md`, `HANDOFF.md`, `CHANGELOG.md`, `README.md`, `docs/CHARACTER_SYSTEM.md`, `docs/DATABASE.md`.
- Tranche suppression d'instance : `src/shared/ipc.ts`, `src/main/services/world-store.service.ts`, `src/main/ipc/character.ipc.ts`, `src/preload/preload.ts`, `src/renderer/components/WorldView.tsx`, `src/renderer/components/CharacterDetail.tsx`, `src/renderer/styles/global.css`, `tests/phase0.test.ts`, `tests/world-resume-ui.test.tsx`, `tests/character-library-ui.test.tsx`, `PROGRESS.md`, `HANDOFF.md`, `CHANGELOG.md`, `README.md`, `docs/CHARACTER_SYSTEM.md`, `docs/DATABASE.md`.
- Tranche conception Phase 2 (documentaire) : `docs/CHARACTER_STATE_ARCHITECTURE.md`, `docs/RELATIONSHIP_SYSTEM.md` (réécrit/étendu), `docs/EVENT_AND_MEMORY_SYSTEM.md`, `docs/SIMULATION_TIME_AND_ENGINE.md`, `PROGRESS.md`, `HANDOFF.md`, `CHANGELOG.md`, `README.md`.
- Tranche Phase 3A (infrastructure simulation) : `src/main/services/prng.ts`, `src/main/services/world-store.service.ts`, `src/main/ipc/world.ipc.ts`, `src/main/main.ts`, `src/preload/preload.ts`, `src/shared/ipc.ts`, `src/shared/world.ts`, `src/renderer/components/WorldView.tsx`, `src/renderer/components/UseInWorldDialog.tsx`, `src/renderer/styles/global.css`, `scripts/test.mjs`, `tests/phase0.test.ts`, `tests/character-library.test.ts`, `tests/character-library-ui.test.tsx`, `tests/character-deletion-ui.test.tsx`, `tests/world-resume-ui.test.tsx`, `docs/ARCHITECTURE.md`, `docs/DATABASE.md`, `docs/SIMULATION_TIME_AND_ENGINE.md`, `docs/DEVELOPMENT.md`, `README.md`, `CHANGELOG.md`, `PROGRESS.md`, `HANDOFF.md`.
- Tranche conception Phase 3B (documentaire) : `PROGRESS.md`, `HANDOFF.md`, `CHANGELOG.md`, `README.md` (liens docs uniquement, si pertinent). Aucun fichier applicatif modifié.

## Tests réussis

- `./.tools/node/versions/v26.13.1-linux-x64/bin/node scripts/check-deps.mjs` : **OK**.
- `./.tools/node/versions/v26.13.1-linux-x64/bin/node scripts/typecheck.mjs` : **OK** (4 tsconfigs).
- `./.tools/node/versions/v26.13.1-linux-x64/bin/node scripts/test.mjs` : **102/102 passés** (10 fichiers).
- `./.tools/node/versions/v26.13.1-linux-x64/bin/node scripts/build.mjs` : **OK**.
- **Validation tranche conception Phase 3B (documentaire)** : check-deps OK, typecheck 4 configs OK, tests **102/102 passés** (10 fichiers, aucun code modifié), build OK. Vérification croisée : 21 traits / 10 émotions / 8 besoins présents, 13 traits utilisés et 8 exclus avec justification, 2 diagrammes Mermaid, 5 liens de documentation valides.
- **Smoke Electron réel Linux** (2026-11-24, `--no-sandbox --disable-gpu`, CDP, 2 lancements avec redémarrage réel) : création monde `SMOKE-SIM` (seed 123, 2 personnages), start tick 0 running, pause, step -> tick 1, vitesse 10x, fermeture, relance restaurée (tick 1, paused, `rngState=2246822416`, world `simulation_paused`), resume, step -> tick 2, suppression monde smoke, `SMOKE_OK`. DB utilisateur sauvegardée/restaurée (`/tmp/dl-worlds-backup.sqlite`) avant commit.
## Tests échoués

- Aucun.

## Bugs connus

- Aucun bug applicatif confirmé. Le blocage lancement Electron dev sur Linux restreint (AppArmor/userns, `chrome-sandbox` non setuid) est corrigé en dev par détection + `--no-sandbox` **processus dev uniquement** avec avertissement (voir Problèmes techniques).

## Problèmes techniques

- Réseau instable pendant sessions précédentes : téléchargements Electron interrompus ; résolu via archive officielle vérifiée SHA-256. `npm install` a nécessité `--prefer-online --fetch-retries=5` après ERESOLVE transitoire.
- **Linux restreint (AppArmor/userns)** : `chrome-sandbox` du zip Electron est 0755 (pas setuid root) et `kernel.apparmor_restrict_unprivileged_userns=1` bloque le sandbox userns non privilégié. `scripts/dev.mjs` détecte ce cas et lance Electron dev avec `--no-sandbox` **uniquement pour ce processus**, avec avertissement explicite. `src/main/security/window.ts` reste inchangé (`contextIsolation:true`, `nodeIntegration:false`, `sandbox:true`, `webSecurity:true`). Correction propre : profil AppArmor dédié ou `chrome-sandbox` root:root 4755 (implications sécurité, action manuelle hors scripts).
- Bug corrigé : preload sandboxé bundlé Rolldown.
- Bug corrigé : résolution `app.getAppPath()`/WASM en dev via `ROOT` + fallback `process.cwd()`.
- Bug corrigé (tranche bibliothèque) : index `template_id` créé avant migration sur bases legacy → « no such column » au smoke réel ; ordre corrigé + test de migration legacy. Le smoke réel sur base existante est indispensable (les tests sur base neuve ne couvraient pas ce cas).

## Prochaine tâche précise

La conception Phase 3B est terminée et validée documentairement. Prochaine étape : **implémenter** les règles conçues dans un tick atomique (services purs `personality-influence` / `needs-evolution` / `emotion-evolution` / `character-tick`, application dans la même transaction que l'horloge), après validation explicite de cette tranche documentaire. Ne pas démarrer décisions/actions/relations/événements/souvenirs/mort/LLM. Trancher avant implémentation : arrondi `roundHalfEven` vs half-up, précision `number` vs centièmes, calibres définitifs des coefficients. Voir HANDOFF.md pour la recommandation détaillée.
