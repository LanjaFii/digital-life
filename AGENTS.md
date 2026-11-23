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
4. Mettre à jour `README.md` et le(s) `docs/*.md` concerné(s).
5. Relancer `bash scripts/test.sh` et `bash scripts/build.sh` avant de déclarer terminé.

## 10. Protocole de reprise

1. Lire AGENTS.md, PROGRESS.md, HANDOFF.md.
2. Examiner le code réel (source de vérité).
3. Vérifier les fonctionnalités présentes par les tests.
4. Ne pas recréer ce qui existe.
5. Continuer par la prochaine tâche indiquée dans PROGRESS.md.
