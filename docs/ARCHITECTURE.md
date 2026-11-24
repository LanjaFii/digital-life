# Architecture

## Processus

```
Renderer (React/Vite)  --contextBridge-->  Preload  --IPC-->  Main (Electron/Node)
                                                           ├── Simulation Manager
                                                           │   ├── Worker planificateur
                                                           │   └── Worker de calcul [Planifié 3D]
                                                           ├── SQLite (sql.js)
                                                           ├── safeStorage (clé LLM) [Planifié]
                                                           └── LLM Service (optionnel) [Planifié]
```

- **Renderer** : aucune API Node, aucun `ipcRenderer` direct, aucun secret. Il envoie des commandes simulation autorisées et reçoit des statuts validés.
- **Preload** : surface unique `window.digitalLife` définie dans `src/shared/ipc.ts`.
- **Main** : fenêtres, handlers IPC, validation, services, persistance, contrôle des workers.
- **Simulation Manager** (`src/main/services/simulation-manager.service.ts`) : verrou par monde, sérialisation des commandes/ticks, synchronisation du planificateur, broadcast `simulation:status-changed`.
- **Worker planificateur** (`src/main/simulation/simulation.worker.ts`) : intervalles et signaux `tick` par monde ; **aucun accès SQLite, aucun accès renderer, aucune règle métier**.
- **Worker de calcul** `[Planifié 3D]` (`src/main/simulation/tick-compute.worker.ts`) : calcul pur du tick uniquement ; le main reste seul propriétaire de SQLite. Voir [WORKER_TICK_PROTOCOL.md](WORKER_TICK_PROTOCOL.md).

## Répertoires

| Dossier | Rôle |
|---|---|
| `src/main/ipc` | handlers `ipcMain.handle` |
| `src/main/services` | services applicatifs (config, sauvegardes, LLM) |
| `src/main/security` | politique de sécurité des fenêtres et secrets |
| `src/main/simulation` | moteur et workers |
| `src/preload` | API exposée au renderer |
| `src/renderer` | UI React |
| `src/shared` | types partagés (aucun Node) |
| `scripts` | bootstrap et outils de développement |
| `resources/sqlite` | WASM embarqué |
| `data` | sauvegardes, paramètres, backups |
| `docs` | documentation |

## Sécurité

`WINDOW_SECURITY` impose `contextIsolation: true`, `nodeIntegration: false`,
`sandbox: true`, `webSecurity: true`. Les navigations externes sont refusées.
Aucune clé n'est stockée aujourd'hui ; elle restera dans le processus principal,
chiffrée via `safeStorage` (Phase 6).

## Simulation Phase 3A/3B/3C (implémentée)

- **Source de vérité** : SQLite `simulation_clock`, `worlds.status` et `characters.current_*_json`, écrits uniquement par le main.
- **Commandes** : `simulation:status/start/pause/resume/step/speed/stop` (IPC validé). Le renderer ne peut pas écrire l'horloge directement.
- **Tick atomique** : transaction SQLite + un seul `persist(db)` par commande/tick. Depuis la Phase 3C, le tick calcule aussi besoins, émotions, décisions, effets et runtime.
- **Explications** : `decisions`, `actionDeltas`, `actionRuntimeStates`, `deltas` et `warnings` sont calculés mais non persistés aujourd'hui ; la Phase 3D les rend auditables.
- **Déterminisme** : seed simulation = `world.seed ^ 0x85ebca6b`, `rng_state` uint32 persisté, tri des personnages par identifiant, au plus un tirage PRNG par décision en ex æquo réel.
- **Reprise** : au démarrage app, les horloges `running` sont converties en `paused` (pas d'auto-reprise).
- **Arrêt** : `simulation_stopped` conserve les données ; pas de redémarrage implicite.

## Évolutions possibles

- **Phase 3D [Planifié]** : historique des décisions, verrou global d'écriture, persistance atomique, worker de calcul dédié, inspecteur UI minimal. Voir [PHASE_3D_DESIGN.md](PHASE_3D_DESIGN.md).
- Ajouter des règles métier futures (relations, événements, souvenirs) en conservant transaction atomique et déterminisme.
- Ajouter un worker d'analyse statistique distinct du worker de calcul, sans jamais donner SQLite aux workers.
- Remplacer sql.js par better-sqlite3 uniquement si une compilation native locale est acceptée (non retenu).
- Étendre l'API preload sans jamais exposer d'objet Node.
