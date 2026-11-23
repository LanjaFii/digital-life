# Dépannage

## Bootstrap

**`Node.js local absent`** → lancer `bash scripts/bootstrap.sh` (ou `bootstrap.ps1`).

**Échec SHA-256** → ne jamais ignorer. Supprimer le fichier dans
`.tools/node/cache/`, relancer le bootstrap. Vérifier l'horloge système et la
connexion vers nodejs.org.

**`curl: (28) Operation timed out`** → le script réessaie 3 fois. Si le réseau est
très lent, relancer le bootstrap ; le téléchargement partiel est ignoré.

## Dépendances npm

**`module npm manquant`** → relancer le bootstrap ou utiliser le Node local :
`.tools/node/versions/<version>-<os>-<arch>/bin/node <chemin>/npm-cli.js install`.

**WASM absent** → `npm run copy:wasm` (avec le Node local via le script).

## Electron

**Binaire Electron manquant** → le bootstrap installe les paquets npm, mais le binaire
Electron peut nécessiter un téléchargement séparé. Si le réseau est instable, relancer :

```bash
# depuis la racine, avec Node local
ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ \
  .tools/node/versions/v26.13.1-linux-x64/bin/node node_modules/electron/install.js
```

Ou télécharger manuellement le zip officiel correspondant à la version/OS/arch,
l'extraire dans `node_modules/electron/dist`, puis écrire le nom de l'exécutable dans
`node_modules/electron/path.txt` (ex. `electron` sous Linux).

**La fenêtre ne s'ouvre pas sous Linux** → vérifier l'affichage (`DISPLAY` ou
`WAYLAND_DISPLAY`). Electron nécessite un serveur graphique.

**Écran noir** → vérifier la console du terminal : le dev server Vite doit être
démarré. Le script `dev.mjs` lance Electron dès que Vite signale sa disponibilité.

**`FATAL: The SUID sandbox helper binary was found, but is not configured correctly` / `No usable sandbox!`** →
cause fréquente sur Ubuntu 23.10+ avec `kernel.apparmor_restrict_unprivileged_userns=1` lorsque
`node_modules/electron/dist/chrome-sandbox` n'est pas setuid root (0755). Le zip Electron officiel ne conserve pas le bit SUID.

- **Dev uniquement** : `scripts/dev.mjs` détecte ce cas Linux restreint et lance Electron avec `--no-sandbox` **uniquement pour ce processus de développement**, avec un avertissement explicite. Cela désactive le sandbox processus Chromium ; ce n'est pas appliqué en production/packagé, et `webPreferences.sandbox` reste `true` dans le code.
- **Contrôle** : `DL_DEV_NO_SANDBOX=0` désactive le contournement auto (si votre environnement est correctement configuré). `DL_DEV_NO_SANDBOX=1` force le contournement dev (diagnostic uniquement).
- **Correction propre** : configurer un profil AppArmor adapté pour le binaire Electron ou installer `chrome-sandbox` en `root:root` mode `4755`. Cette dernière option a des implications sécurité (exécutable setuid root) et ne doit être faite qu'en connaissance de cause, manuellement, hors scripts du projet.
- **Ne pas** modifier `src/main/security/window.ts` ni désactiver la sandbox globalement.

## Simulation (phases futures)

**Simulation bloquée** → vérifier les logs du worker, le cooldown des actions et
la file d'événements.

**Données perdues** → ne jamais éditer directement un fichier `.sqlite` pendant que
l'application tourne. Utiliser les backups de `data/backups/`.

## Clé API

**`safeStorage indisponible`** → l'application l'indiquera clairement. Ne jamais
mettre la clé dans la configuration SQLite ni dans le renderer. Utiliser la
solution locale chiffrée documentée dans `docs/LLM_CONFIGURATION.md`.
