# AGENTS.md — Instructions permanentes pour agents IA

## 1. Présentation

**DIGITAL LIFE** est un simulateur de vie autonome multi-agents distribué sous forme
d'application desktop Electron. L'utilisateur définit des conditions initiales
(environnement, personnages, règles) puis observe des histoires émerger des décisions
des agents. L'utilisateur n'écrit pas les histoires et ne contrôle pas les personnages.

Priorités, par ordre décroissant :
1. cohérence et explicabilité du moteur de simulation ;
2. persistance et intégrité des données ;
3. architecture maintenable et modularité ;
4. qualité de l'interface ;
5. effets visuels.

## 2. Stack technique (versions Phase 0)

- Node.js portable local : **v26.13.1 LTS** (`scripts/node-version.txt`, source officielle nodejs.org + SHASUMS256.txt).
- Electron 45.4.1 — React 19.3.1 — TypeScript 5.9.3 — Vite 8.3.8.
- SQLite via sql.js 1.17.0 (WASM embarqué dans `resources/sqlite/`).
- Zustand 5.1.0 — Recharts 3.11.0 — lucide-react 1.78.0.
- Vitest 5.1.1 — electron-builder 26.18.0.

## 3. Architecture

```
src/main/        processus principal Electron (IPC, services, sécurité, simulation)
src/preload/     API strictement définie exposée via contextBridge
src/renderer/    interface React (composants, pages, layouts, stores, hooks, styles)
src/shared/      types et constantes partagés (aucun code Node)
tests/           tests Vitest (moteur, persistance, API, simulation longue)
scripts/         bootstrap portable, dev, build, test, vérification des dépendances
resources/       ressources embarquées (WASM sql.js)
data/            sauvegardes, paramètres, backups (données utilisateur, non versionnées)
docs/            documentation systèmes et utilisateur
```

Règles d'architecture :
- Le renderer n'accède **jamais** directement à Node, à `ipcRenderer` ou à la clé API.
- Toutes les opérations sensibles passent par `src/preload/preload.ts` puis `ipcMain.handle`.
- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`.
- Le moteur de simulation tournera dans un worker thread du processus principal (dès la phase 3).
- La clé OpenRouter sera stockée via `safeStorage` et utilisée uniquement dans le processus principal (phase 6).
- Aucune décision métier ne dépend du LLM ; le LLM enrichit seulement les dialogues.

Référence architecturale absolue :
- Avant toute nouvelle fonctionnalité ou modification architecturale : lire `AGENTS.md`,
  consulter les documents concernés (`docs/ARCHITECTURE.md`, `docs/DATABASE.md`,
  `docs/SIMULATION_ENGINE.md`, `docs/CHARACTER_STATE_ARCHITECTURE.md`,
  `docs/EVENT_AND_MEMORY_SYSTEM.md`, `docs/SIMULATION_TIME_AND_ENGINE.md`,
  `docs/PHASE_3D_DESIGN.md` et les documents spécialisés pertinents), examiner le code
  réellement existant et comprendre les décisions techniques déjà prises.
- Respecter les contrats, interfaces, conventions et responsabilités existants ; vérifier
  que la solution envisagée ne contredit aucune décision antérieure.
- En cas de contradiction entre documentation et implémentation, ne pas choisir
  arbitrairement : identifier la divergence et proposer une résolution.
- Ne jamais remplacer une architecture existante par une solution plus simple sans
  justification technique et validation préalable.

## 4. Conventions de code

- TypeScript strict, noms de fichiers en kebab-case, composants React en PascalCase.
- Commentaires et documentation en français.
- Un fichier = une responsabilité. Aucune fonctionnalité dans un monolithe.
- Pas de code mort, pas de bouton sans action, pas de fonctionnalité simulée présentée comme réelle.
- Préfixer les features non implémentées par `[Planifié]` dans la documentation.
- Utiliser des valeurs par défaut cohérentes et documenter chaque paramètre.
- Tests unitaires pour chaque nouveau système, test de simulation longue avant validation.

## 5. Règles de développement (rappel des règles absolues)

1. Ne jamais tout développer dans un seul fichier.
2. Ne jamais créer de fonctionnalités fictives présentées comme fonctionnelles.
3. Ne jamais laisser de boutons sans action.
4. Ne jamais supprimer une fonctionnalité existante lors d'une amélioration.
5. Ne jamais placer la clé API dans le frontend.
6. Ne jamais rendre la simulation dépendante d'OpenRouter.
7. Ne jamais bloquer l'interface pendant une simulation ou un appel API.
8. Ne jamais perdre les données d'une simulation après un redémarrage.
9. Toujours documenter les fonctionnalités importantes.
10. Toujours tester les modifications avant de les déclarer terminées.
11. Toujours maintenir PROGRESS.md et HANDOFF.md.
12. Ne jamais installer de dépendances de développement globalement.

Discipline de développement :
- Travailler par tranches cohérentes et clairement délimitées.
- Préserver la séparation des responsabilités ; privilégier des services indépendants,
  des contrats typés et des fonctions testables.
- Maintenir le déterminisme du moteur ; éviter les dépendances inutiles et les abstractions
  prématurées.
- Ne pas introduire de logique métier dans le renderer ; respecter les frontières de sécurité
  Electron et les responsabilités du processus principal.
- Ne pas contourner les mécanismes de persistance, de validation ou de verrouillage existants ;
  préserver la compatibilité des données et des migrations.
- Justifier chaque décision nouvelle par rapport à l'architecture actuelle.

Interdictions complémentaires : pas de `sudo`, pas de modification des variables
d'environnement globales, pas de CDN pour une ressource essentielle, pas de Node global
dans les scripts (`scripts/runtime.mjs` force le relance avec le binaire local).

## 6. Commandes disponibles

Depuis la racine du projet :

| Action | Linux / macOS | Windows (PowerShell) |
|---|---|---|
| Bootstrap complet | `bash scripts/bootstrap.sh` | `.\\scripts\\bootstrap.ps1` |
| Développement | `bash scripts/dev.sh` | `.\\scripts\\dev.ps1` |
| Build | `bash scripts/build.sh` | `.\\scripts\\build.ps1` |
| Tests | `bash scripts/test.sh` | `.\\scripts\\test.ps1` |
| Typecheck | Node local + `scripts/typecheck.mjs` | idem |
| Vérif. dépendances | Node local + `scripts/check-deps.mjs` | idem |

Les raccourcis `npm run dev/build/test/typecheck/check:deps` existent mais les scripts
`.mjs` se relancent automatiquement avec le Node local : le Node global n'est jamais
utilisé pour le travail réel.

## 7. Sécurité

- Clé API : `safeStorage.encryptString` → fichier chiffré dans `data/settings/`.
- Aucune clé dans SQLite, les logs, le renderer ou le code source.
- Aucune navigation externe depuis les fenêtres ; `setWindowOpenHandler` refuse tout.
- Expliquer toute limitation `safeStorage` indisponible dans la documentation.

## 8. Fonctionnement du moteur (cible, phases 3+)

Chaque cycle : temps → besoins → émotions → objectifs → mémoire pertinente → actions
possibles → évaluation → décision (PRNG.seedé + explication) → exécution → interactions
→ conséquences → événements → relations → souvenirs → morts → persistance incrémentale.
Le LLM ne participe jamais aux étapes de décision ou de conséquence.

## 9. Procédure obligatoire de mise à jour de la documentation

Après chaque fonctionnalité terminée et testée :

1. Mettre à jour `PROGRESS.md` (phase, pourcentage, terminé/en cours/non commencé,
   fichiers créés/modifiés, tests réussis/échoués, bugs, prochaine tâche).
2. Mettre à jour `HANDOFF.md` (état exact, décisions techniques, problèmes, fichiers
   à examiner, commande de relance, prochaine tâche).
3. Ajouter une entrée datée dans `CHANGELOG.md` (Added/Changed/Fixed/Removed/Technical decisions).
4. Mettre à jour `AGENTS.md` si les règles changent, `README.md` et le(s) `docs/*.md` concerné(s).
5. Relancer `bash scripts/test.sh` et `bash scripts/build.sh` avant de déclarer terminé.
6. Documenter les limites connues, les décisions reportées et les prochaines étapes
   recommandées : un nouvel agent doit comprendre l'état exact sans deviner.

## 10. Protocole de reprise

1. Lire AGENTS.md, PROGRESS.md, HANDOFF.md.
2. Examiner le code réel (source de vérité).
3. Vérifier les fonctionnalités présentes par les tests.
4. Ne pas recréer ce qui existe.
5. Continuer par la prochaine tâche indiquée dans PROGRESS.md.

## 11. Méthode de validation et de livraison

Conserver la séquence suivante pour chaque tranche, avec une granularité adaptée aux risques réels :

1. Auditer l'état initial (Git, documents, configuration, environnement).
2. Comprendre le périmètre et ses dépendances.
3. Implémenter progressivement une tranche cohérente.
4. Exécuter les tests pertinents.
5. Corriger les problèmes avant de déclarer la tranche terminée.
6. Effectuer les vérifications TypeScript et build lorsque nécessaires, toujours avant
   la livraison d'une tranche fonctionnelle.
7. Mettre à jour la documentation (voir §9).
8. Examiner les différences Git, y compris le contenu exact du commit prévu.
9. Vérifier l'absence de secrets, de données locales et de fichiers générés versionnés.
10. Créer un commit descriptif (voir §12).
11. Pousser sur `origin/main`, sans force.
12. Vérifier le hash distant et la propreté de l'arbre de travail.

Regrouper les opérations indépendantes et peu risquées dans une mission globale : ne pas
multiplier les demandes d'autorisation pour des commandes ordinaires. Demander une
autorisation avant toute opération destructive, migration risquée, modification de données
utilisateur, benchmark lourd ou changement architectural dépassant le périmètre validé.

## 12. Conventions Git

- Messages de commit en anglais.
- Convention `Conventional Commits` : `type(portée): description courte`, par exemple
  `docs: clarify durable development rules` ou `feat(3d-c): add tick compute worker`.
- Description courte, précise et représentative des modifications réelles.
- Ne pas modifier les anciens commits uniquement pour uniformiser leur langue.
- Ne jamais utiliser `git push --force`.

## 13. Autonomie et responsabilité

- Dans un périmètre autorisé : analyser les besoins, identifier les dépendances, proposer
  la meilleure approche compatible avec l'architecture, exécuter les opérations sûres,
  valider les résultats et signaler les difficultés réelles.
- Ne pas demander de permission pour chaque commande ordinaire.
- Ne jamais prendre une décision architecturale importante à la place de l'utilisateur.
- À la fin de chaque tranche, donner un avis indépendant sur les prochaines étapes
  recommandées, sans démarrer la phase suivante avant validation explicite.
