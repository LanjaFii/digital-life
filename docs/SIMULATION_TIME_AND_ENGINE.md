# Temps interne, ticks et moteur — conception Phase 2 / implémentation Phase 3A

> **Statut : Phase 3A implémentée (infrastructure).** L'horloge, le PRNG sérialisable, la
> persistance `simulation_clock`, le worker Node `worker_threads`, les commandes IPC/main
> et l'UI minimale de contrôle existent. **Aucun comportement autonome de personnage,
> relation, événement, souvenir, mort ou appel LLM n'est implémenté** : un tick avance
> uniquement l'horloge de façon atomique et déterministe.

## État d'implémentation Phase 3A

| Élément | État | Réalité |
|---|---|---|
| `SeededRng.getState()/setState()` | Implémenté | uint32, validation stricte, normalisation seed. |
| `simulation_clock` | Implémenté | Table additive SQLite, une horloge par monde, migration non destructive. |
| Worker | Implémenté | `src/main/simulation/simulation.worker.ts` (Node `worker_threads`), planification/signaux uniquement, pas de SQLite. |
| Manager main | Implémenté | Validation, verrou par monde, anti double-tick, sync worker, broadcast statut. |
| IPC/preload | Implémenté | `simulation:status/start/pause/resume/step/speed/stop` + `simulation:status-changed`. |
| UI minimale | Implémenté | WorldView : statut, jour/heure, tick, start/pause/resume/step/stop, vitesse 1x/2x/5x/10x. |
| Reprise après redémarrage | Implémenté | Horloges `running` récupérées en `paused` au démarrage ; pas d'auto-reprise. |
| Tick métier | Non implémenté | Le tick n'altère pas les personnages/relations/événements/mémoires. |
| LLM / mort / relations / événements / souvenirs | Non implémenté | Hors périmètre Phase 3A. |

## 1. Audit : patrimoine réel pour le temps

| Élément | Réel aujourd'hui | Conséquence pour la conception |
|---|---|---|
| `worlds.seed` | INTEGER, généré aléatoirement ou fourni, utilisé par `generateCharactersForWorld()` | Point de départ naturel du PRNG métier, mais il faut une **sous-seed d'exécution** distincte de la sous-seed de génération. |
| `SeededRng` (`src/main/services/prng.ts`) | mulberry32, `next/int/pick/chance`, état sérialisable (`getState/setState`) | Implémenté en Phase 3A ; `setState` refuse les états non uint32. |
| `worlds.status` | `preparation` par défaut, garde main étendue aux statuts simulation | Implémenté : `simulation_running/paused/stopped`, lecture legacy `simulation_started` normalisée. |
| `characters.updated_at` | date ISO de dernière écriture | Horodatage **réel**, pas un temps simulé ; ne pas l'utiliser comme horloge de simulation. |
| `src/main/simulation/` | `simulation.worker.ts` | Worker de planification implémenté ; logique métier de tick reste à ajouter en Phase 3B+. |
| Persistance | `db.export()` + `writeFileSync` après chaque mutation | Un tick complet = **une seule écriture disque** (transaction + export) pour éviter un état partiel. |
| IPC | canaux stricts, renderer sans Node | Les commandes (`start/pause/step/speed`) devront être des canaux dédiés, validés main, sans accès DB côté renderer. |
| UI | aucune simulation, aucun bouton de démarrage | Ne pas ajouter de faux bouton : la commande n'existera qu'avec le moteur. |

## 2. Modèle de temps : définitions et options

### 2.1 Vocabulaire

- **Tick** : unité atomique de calcul. Un tick traite un cycle complet pour tous les
  personnages vivants du monde (voir §4).
- **Pas de temps simulé** : quantité de temps fictif représentée par un tick (ex. 1 heure).
- **Fréquence réelle** : nombre de ticks par seconde murale à vitesse 1x.
- **Vitesse** : multiplicateur appliqué à la fréquence réelle ; ne modifie **jamais** la
  durée simulée d'un tick (sinon les résultats changeraient).
- **Horloge réelle** (`Date.now()`) : utilisée uniquement pour `created_at`/`updated_at`
  et le diagnostic ; **jamais** dans une règle de simulation.

### 2.2 Options pour la durée d'un tick (à arbitrer, pas de choix définitif)

| Option | Avantages | Inconvénients |
|---|---|---|
| A. 1 tick = 1 minute simulée | Fin pour besoins/émotions ; 1 440 ticks/jour | Coût disque et CPU élevé pour une journée ; journal volumineux. |
| B. 1 tick = 1 heure simulée (24 ticks/jour) | Compromis naturel ; cohérent avec les docs actuelles (24 cycles/jour) | Dérive des besoins à calibrer (≈ 4-5 points/tick). |
| C. 1 tick = 1 action individuelle | Explicabilité fine, ordre simple | « Journée » variable ; synchronisation des personnages complexe. |
| D. Tick variable (saut au prochain événement) | CPU minimal | Reproductibilité plus délicate, ordre et sommeil à redéfinir. |

**Recommandation provisoire : option B** (1 tick = 1 heure simulée, 24 ticks/jour), parce
qu'elle s'aligne sur `docs/SIMULATION_ENGINE.md` et permet une dérive lisible des besoins.
À valider après une simulation longue ; la durée doit être un **paramètre stocké par monde
ou global**, pas une constante dispersée dans le code.

### 2.3 Options pour la fréquence réelle

| Option | Avantages | Inconvénients |
|---|---|---|
| 1 tick / 60 s à 1x | Calme, faible charge, cohérent avec le défaut actuel | Observation lente pour l'utilisateur. |
| 1 tick / 5 s à 1x | Démonstration rapide | Beaucoup d'écritures disque, usure et journal massif. |
| Tick à la demande (`step`) + auto optionnel | Contrôle total, reproductibilité simple | Moins « vivant » par défaut. |

**Recommandation provisoire : 1 tick / 60 s à 1x**, avec vitesses 1x/2x/5x/10x et bouton
`step`. Le *défaut* reste à confirmer ; le paramètre doit être configurable sans modifier
le calcul (la vitesse n'influe que sur le minuteur).

## 3. État de simulation à persister

```ts
// src/shared/simulation.ts — [Planifié], aucun code Node
export interface SimulationClock {
  tick: number;               // entier, 0 au démarrage
  day: number;                // dérivé de tick, stocké pour clarté/UI
  hour: number;               // 0-23, dérivé de tick
  status: 'paused' | 'running' | 'finished'; // distinct de worlds.status
  speed: 1 | 2 | 5 | 10;
  /** État brut du PRNG, sérialisé pour reprise exacte. */
  rngState: number;
  lastProcessedOrder: number; // rang du dernier personnage traité
}

export interface SimulationCommand {
  kind: 'start' | 'pause' | 'resume' | 'step' | 'speed' | 'stop';
  speed?: number;
  worldId: string;
}
```

- Un tick = une transaction SQLite : `BEGIN` → calcul en mémoire → écritures
  `characters.current_*`, `relationships`, `events`, `memories`, `worlds.simulation_clock`
  → `COMMIT` → un seul `persist(db)`.
- `rngState` est écrit **après** le dernier tirage du tick ; une reprise reprend exactement
  à ce point. `SeededRng` doit donc exposer `getState()/setState()` **[Planifié]**.
- `worlds.status` passe à `simulation_started` au premier `start` ; le retour en
  `preparation` n'est pas prévu (données verrouillées définitivement). Une réinitialisation
  complète du monde sera une fonctionnalité distincte, documentée, jamais un simple
  retour en arrière.
- Le statut `paused/running` de `SimulationClock` est distinct de `worlds.status` : le
  monde reste `simulation_started` même en pause, donc les gardes restent actives.

### 3.1 Table SQLite additive (`simulation_clock` — implémentée Phase 3A)

`world_id` TEXT PK (FK → `worlds(id) ON DELETE CASCADE`), `tick` INTEGER NOT NULL,
`day` INTEGER, `hour` INTEGER, `status` TEXT, `speed` INTEGER, `rng_state` INTEGER,
`last_processed_order` INTEGER, `updated_at` TEXT. Aucune colonne existante n'est modifiée ;
les bases Phase 1/2 restent lisibles sans cette table.

## 4. Déterminisme et séparation des générateurs

### 4.1 Définition contractuelle

> Même `initialState`, même seed, même séquence de commandes et mêmes entrées externes
> ⇒ mêmes `currentState`, événements, relations et souvenirs, dans le même ordre.

Le déterminisme est une **propriété testable**, pas une intention : il doit être vérifié
par un test qui rejoue deux fois la même simulation et compare les résultats (voir §8).

### 4.2 Sous-seeds et domaines séparés

Le `worlds.seed` sert déjà à la génération initiale avec `generateCharactersForWorld()`
(une sous-seed par index). Le moteur ne doit **pas** réutiliser ce flux, sinon ajouter un
personnage ou régénérer un aperçu modifierait la séquence des décisions.

```ts
// [Planifié] dérivation explicite, à implémenter dans un service de seed dédié
const generationRng = new SeededRng(world.seed ^ 0x9e3779b9); // déjà utilisé (à isoler)
const simulationRng = new SeededRng(world.seed ^ 0x85ebca6b); // décisions métier
// Règles : un seul flux pour les décisions, aucun tirage pour l'UI ou le debugging.
```

Règles obligatoires :

1. **Un seul PRNG métier par monde** pour toutes les décisions, conséquences et cascades.
   Un tirage supplémentaire dans une règle change tous les suivants : toute modification
   d'une règle est donc un changement de version de simulation (à documenter).
2. **Aucun `Math.random()`**, aucun `Date.now()` dans une règle, aucun ordre issu d'un
   `Set`/`Map` non trié ni d'une requête SQL sans `ORDER BY`.
3. **Les IPs ne tirent pas dans le PRNG métier** : les entrées utilisateur (pause,
   vitesse, `step`) sont des commandes, pas des aléas. Le bouton `step` avance exactement
   un tick, quelle que soit la vitesse affichée.
4. **Le LLM ne tire pas et ne décide pas** : même en mode enrichi (phase 6), il ne reçoit
   que des extraits de souvenirs et produit uniquement un texte de dialogue candidat.
   Le moteur valide et intègre ce texte sans laisser le LLM écrire un état, un événement,
   une relation ou une décision (voir `docs/LLM_CONFIGURATION.md`).
5. **`rngState` sauvegardé par tick** (voir §3) : la reprise est une continuation, pas un
   redémarrage de la séquence depuis la seed initiale.

### 4.3 Entrées externes et reproductibilité

Les seules entrées externes acceptables sont : la seed initiale, la séquence de commandes
(`start`, `pause`, `resume`, `step`, `speed`) et les éventuels dialogues LLM (phase 6).
Pour garantir le rejeu, chaque commande est horodatée en **tick**, pas en milliseconde :
« pause au tick 42 » est reproductible, « pause à 12:03:17 » ne l'est pas. Si l'enrichissement
LLM est actif, un rejeu strict nécessite d'enregistrer les réponses utilisées (ou de
désactiver l'enrichissement en mode rejeu) : décision à prendre avant la phase 6.

## 5. Ordre de traitement dans un tick

Un tick suit le cycle des 16 étapes décrit dans `docs/SIMULATION_ENGINE.md`. Le point
critique pour le déterminisme est l'**ordre de traitement des personnages**.

### 5.1 Ordre proposé

```ts
// [Planifié] calculé une fois par tick, avant tout tirage
const order = await listLivingCharacterIds(db, worldId)
  .sort((a, b) => a.localeCompare(b, 'en', { numeric: true })); // UUID stable
```

- Tri par `id` (UUID) : stable entre deux exécutions, indépendant de l'ordre d'insertion
  SQLite et de la locale de la machine. `localeCompare` avec locale fixée `en` et
  `numeric: true` garantit un résultat identique sur tout environnement.
- Les personnages morts (**[Planifié, phase 5]**) sont exclus de l'ordre mais conservés
  en base ; leur `id` reste dans les événements et les relations.
- `last_processed_order` permet de détecter un tick interrompu : si une écriture a eu
  lieu sans `COMMIT`, la transaction est annulée et l'état reste au tick précédent.
  Ce champ ne sert **pas** à reprendre un tick à moitié calculé : un tick est atomique.

### 5.2 Snapshot et applications des conséquences

```mermaid
flowchart TD
    T0[\"Tick T : lecture d'un snapshot cohérent\"] --> O[\"Ordre déterministe des personnages\"]
    O --> D1[\"Pour chaque personnage : décision (PRNG + explication)\"]
    D1 --> A[\"Actions collectées en mémoire\"]
    A --> C[\"Conséquences calculées dans l'ordre\"] --> EV[\"Événements T (order croissant)\"] --> REL[\"Relations\"] --> MEM[\"Souvenirs\"] --> ST[\"currentState\"] --> TX[\"Une transaction + un persist\"] --> T1[\"Tick T+1\"]
```

Règle : **décider sur un snapshot, appliquer ensuite**. Un personnage ne voit jamais
l'état déjà modifié d'un autre personnage du même tick. Les interactions sont donc
résolues à partir de l'état de début de tick, puis leurs conséquences sont appliquées
dans un ordre fixe (décision → action → interaction → conséquence → relation → souvenir).
Cela rend le résultat indépendant de la vitesse d'exécution et du thread.

### 5.3 Cas particuliers à documenter avant implémentation

- **Ajout d'un personnage en cours de simulation** : non prévu par les gardes actuelles
  (création interdite en `simulation_started`). Si ouvert plus tard, son état initial doit
  être daté du tick courant et ne pas rétroagir sur le passé.
- **Suppression d'un personnage en cours de simulation** : aujourd'hui interdite par
  `assertWorldPreparation`. La mort (phase 5) est un statut, **pas** une suppression.
- **Événements simultanés** : le champ `order` de `WorldEvent` (voir
  `docs/EVENT_AND_MEMORY_SYSTEM.md`) les départage ; deux événements du même tick ne
  peuvent pas avoir le même `order`.

## 6. Sauvegarde, pause et reprise

### 6.1 Règles de sauvegarde

- **Une transaction par tick** (état + relations + événements + souvenirs + horloge).
  `db.export()` puis `writeFileSync` une seule fois après `COMMIT`, comme pour les autres
  mutations (voir `docs/DATABASE.md`). Un crash ne peut donc laisser qu'un tick complet
  ou l'état du tick précédent, jamais un état intermédiaire.
- **Snapshots périodiques** **[Planifié]** : copies complètes de la base tous les `N`
  ticks, en plus de la persistance incrémentale. Leur fréquence est un paramètre à calibrer
  (coût disque vs fenêtre de récupération). Aucun snapshot n'est à implémenter maintenant.
- **Aucune écriture depuis le renderer** : tout passe par le service main et le worker.
- **Aucun secret dans la base** : ni clé OpenRouter, ni jeton, ni donnée de diagnostic
  sensible (voir `docs/LLM_CONFIGURATION.md`).

### 6.2 Pause et reprise

- `pause` arrête le minuteur, **pas** le calcul en cours : un tick démarré est terminé et
  persisté avant que la pause ne prenne effet. Le message de commande est traité à une
  frontière de tick (jamais au milieu d'une transaction).
- `resume` reprend le minuteur à partir de l'état `SimulationClock` persisté, sans
  recalculer le temps écoulé pendant la pause : le temps simulé est **logique**, pas
  proportionnel au temps réel écoulé.
- `step` exécute exactement un tick même si le statut est `paused`. `speed` ne change pas
  le résultat d'un tick, seulement l'intervalle entre deux ticks automatiques.
- Au redémarrage de l'application, le monde reste `simulation_started` et l'horloge est
  lue depuis `simulation_clock`. Aucun tick n'est joué automatiquement tant que l'utilisateur
  n'a pas demandé `resume` : la reprise est explicite.
- Si `simulation_clock` est absente (base Phase 1/2 migrée), le monde est en
  `preparation` : aucun démarrage implicite. Si `worlds.status = simulation_started` sans
  horloge (cas anormal), le service doit signaler une incohérence, pas inventer tick 0.

### 6.3 Reproductibilité après reprise : checklist

1. Restore `tick`, `rngState`, `status`, `speed` depuis la table `simulation_clock`.
2. Restaurer les `currentState` (jamais recalculés depuis `initialState`).
3. Restaurer relations, événements et souvenirs avec leurs `tick`/`order` d'origine.
4. Reprendre le PRNG métier exactement au dernier tirage du tick précédent.
5. Vérifier qu'aucun `Date.now()` n'a été réintroduit dans une règle.
6. Rejouer le même scénario depuis la même sauvegarde → résultats identiques.

## 7. Frontière main / worker / IPC

```mermaid
flowchart LR
    R[\"Renderer React\"] -- \"window.digitalLife (preload)\" --> P[\"Preload\"] -- \"IPC : simulation:start/pause/step/speed/get-status\" --> M[\"Main\"] -- \"messages structurés\" --> W[\"Worker [Planifié]\"]
    W -- \"TickResult (états, relations, événements)\" --> M
    M -- \"validation + transaction + persist\" --> DB[(\"SQLite (main uniquement)\")]
    M -- \"événements de progression\" --> P --> R
    W -. \"aucun accès SQLite, aucun secret, aucun LLM\" .-> X[\"LLM (phase 6, main uniquement)\"]
```

- Le worker **[Planifié, phase 3]** exécute le cycle et retourne des résultats sérialisables ;
  il ne touche **jamais** SQLite ni l'UI. Le main valide, applique la transaction et
  persiste. C'est la frontière de confiance : validation des données et autorisation
  restent côté main.
- Le renderer ne reçoit que des vues (`WorldView`, fiches, journal) et des commandes ;
  jamais d'objet de base ni de clé. `contextIsolation: true`, `nodeIntegration: false`,
  `sandbox: true` restent obligatoires (`docs/ARCHITECTURE.md`).
- Les canaux IPC de simulation **[Planifié]** : `simulation:start`, `simulation:pause`,
  `simulation:resume`, `simulation:step`, `simulation:speed`, `simulation:status`,
  `simulation:events` (abonnement aux progression). Chaque canal est ajouté à
  `src/shared/ipc.ts`, `src/preload/preload.ts` et `src/main/ipc/` en même temps —
  aucun bouton sans action réelle (règle AGENTS.md).
- L'interface ne doit jamais bloquer : minuteur et calcul dans le worker, attente non
  bloquante dans le main, rendu React indépendant du tick.

## 8. Tests à prévoir quand l'implémentation viendra

1. Même seed + mêmes commandes + même état initial → mêmes `currentState`, événements,
   relations et souvenirs (test de rejeu complet).
2. `SeededRng.getState()/setState()` : reprise de séquence exacte après restauration.
3. Ordre de traitement stable : deux exécutions avec des lignes SQL insérées dans un ordre
   différent produisent le même ordre de décisions.
4. Un tick = une transaction : échec simulé → rollback complet, `tick` inchangé.
5. `pause` au milieu d'un tick : le tick en cours est terminé, aucune commande n'est
   appliquée à l'intérieur d'une transaction.
6. `step` avance d'exactement un tick, quelle que soit la vitesse ; `speed` ne change
   aucun résultat calculé.
7. Redémarrage : état, `rngState` et `tick` restaurés ; aucun tick automatique au lancement.
8. Base sans `simulation_clock` : aucun démarrage implicite, lecture Phase 1/2 intacte.
9. Plusieurs vitesses puis rejeu : seules les commandes horodatées en tick comptent.
10. Simulation longue (≥ 1 000 ticks) : pas de dérive de valeurs hors bornes, pas de
    fuite mémoire, taille du journal et du disque mesurée (calibrage de §2.2/2.3).
11. Aucun appel réseau pendant un tick classique ; le mode LLM désactivé fonctionne
    hors ligne.

## 9. Paramètres à calibrer (décisions non finales)

| Paramètre | Valeur provisoire | À valider par |
|---|---|---|
| Durée d'un tick | 1 heure simulée (24/jour) | simulation longue, lisibilité des besoins |
| Fréquence à 1x | 1 tick / 60 s | ressenti UI, charge CPU/disque |
| Vitesses | 1x / 2x / 5x / 10x + `step` | tests UI et stabilité du worker |
| Dérive des besoins par tick | ≈ 4-5 points (à déduire de 24 ticks/jour) | simulation longue |
| Fréquence des snapshots | à définir | coût disque / fenêtre de récupération |
| Profondeur max de cascade d'événements | à définir | tests de boucles |
| Dérive des traits | ±1 point par `N` ticks (si retenue) | équilibrage long terme |

Ces valeurs sont des **hypothèses de conception** : elles doivent rester configurables
et ne jamais être codées en dur dans les règles de simulation.

## 10. Questions ouvertes

- Le temps doit-il être stocké par monde ou global ? Proposition : **par monde** dans
  `simulation_clock`, chaque sauvegarde étant indépendante.
- Faut-il autoriser la réinitialisation d'un monde (retour à `preparation`) ? Proposition :
  non dans un premier temps ; une « nouvelle partie à partir de la même seed » sera une
  **nouvelle sauvegarde**, pas une réécriture de l'historique.
- Le rejeu doit-il être une fonctionnalité utilisateur (phase 7) ou seulement un outil de
  test ? À arbitrer avec l'UI.
- Comment gérer un tick très long (beaucoup de personnages) sans bloquer le minuteur ?
  Proposition : file de ticks avec signalement d'intervalle maximal, pas de ticks
  « rattrapés » en rafale après une pause.

## Liens

- `docs/SIMULATION_ENGINE.md` — cycle cible des 16 étapes et structure de décision.
- `docs/CHARACTER_STATE_ARCHITECTURE.md` — état initial/courant, snapshot et cohérence.
- `docs/RELATIONSHIP_SYSTEM.md` — tick des interactions et ordre d'écriture.
- `docs/EVENT_AND_MEMORY_SYSTEM.md` — `tick`/`order` des événements et souvenirs.
- `docs/DATABASE.md` — schéma réel, migrations additives et persistance.
- `docs/ARCHITECTURE.md` — frontière renderer/preload/main/worker.
- `docs/LLM_CONFIGURATION.md` — enrichment optionnel, sans effet sur les décisions.
