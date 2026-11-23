# Architecture

## Processus

```
Renderer (React/Vite)  --contextBridge-->  Preload  --IPC-->  Main (Electron/Node)
                                                          ├── Simulation Worker
                                                          ├── SQLite (sql.js)
                                                          ├── safeStorage (clé LLM)
                                                          └── LLM Service (optionnel)
```

- **Renderer** : aucune API Node, aucun `ipcRenderer` direct, aucun secret.
- **Preload** : surface unique `window.digitalLife` définie dans `src/shared/ipc.ts`.
- **Main** : fenêtres, handlers IPC authorization, services, worker, persistance.
- **Worker** : moteur de simulation (dès la phase 3), messages structurés, aucun accès UI.

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

## Évolutions possibles

- Ajouter un second worker pour l'analyse statistique.
- Remplacer sql.js par better-sqlite3 uniquement si une compilation native locale est acceptée (non retenu).
- Étendre l'API preload sans jamais exposer d'objet Node.
