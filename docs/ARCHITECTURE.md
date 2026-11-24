# Architecture

## Processus

```
Renderer (React/Vite)  --contextBridge-->  Preload  --IPC-->  Main (Electron/Node)
                                                          ├── Simulation Manager
                                                          │   └── Worker Node worker_threads
                                                          ├── SQLite (sql.js)
                                                          ├── safeStorage (clé LLM) [Planifié]
                                                          └── LLM Service (optionnel) [Planifié]
```

- **Renderer** : aucune API Node, aucun `ipcRenderer` direct, aucun secret. Il envoie des commandes simulation autorisées et reçoit des statuts validés.
- **Preload** : surface unique `window.digitalLife` définie dans `src/shared/ipc.ts`.
- **Main** : fenêtres, handlers IPC, validation, services, persistance, contrôle du worker.
- **Simulation Manager** (`src/main/services/simulation-manager.service.ts`) : verrou par monde, sérialisation des commandes/ticks, synchronisation worker, broadcast `simulation:status-changed`.
- **Worker** (`src/main/simulation/simulation.worker.ts`) : planification des ticks (setInterval) et signal `step` ; **aucun accès SQLite, aucun accès renderer**. Il ne décide pas des règles métier.

## Répertoires

| Dossier | Rôle |
|---|---|
| `src/main/ipc` | handlers `ipcMain.handle` |
| `src/main/services` | services applicatifs (config, sauvegardes, LLM) |
| `src/main/security` | politique de sécurité des fenêtres et secrets |
| `src/main/simulation` | moteur et worker |
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
La clé OpenRouter reste dans le processus principal, chiffrée via `safeStorage`.

## Simulation Phase 3A (implémentée)

- **Source de vérité** : SQLite `simulation_clock` + `worlds.status`, écrites uniquement par le main.
- **Commandes** : `simulation:status/start/pause/resume/step/speed/stop` (IPC validé). Le renderer ne peut pas écrire l'horloge directement.
- **Tick atomique** : transaction SQLite + un seul `persist(db)` par commande/tick. Le tick Phase 3A avance uniquement l'horloge (pas d'évolution autonome des personnages).
- **Déterminisme** : seed simulation = `world.seed ^ 0x85ebca6b`, `rng_state` uint32 persisté, `SeededRng.setState` validé.
- **Reprise** : au démarrage app, les horloges `running` sont converties en `paused` (pas d'auto-reprise).
- **Arrêt** : `simulation_stopped` conserve les données ; pas de redémarrage implicite dans cette tranche.

## Évolutions possibles

- Ajouter des règles métier dans le tick (besoins, émotions, décisions, relations, événements, souvenirs) tout en conservant transaction atomique et déterminisme.
- Ajouter un second worker pour l'analyse statistique.
- Remplacer sql.js par better-sqlite3 uniquement si une compilation native locale est acceptée (non retenu).
- Étendre l'API preload sans jamais exposer d'objet Node.
