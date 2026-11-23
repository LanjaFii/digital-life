# Build et distribution

## Build local

```bash
bash scripts/build.sh     # Linux/macOS
.\scripts\build.ps1       # Windows
```

Étapes : nettoyage de `dist/`, compilation main (tsc), compilation preload (tsc),
build renderer (Vite), copie du WASM, vérification des dépendances.

## Distribution Windows

Après le build :
```bash
node scripts/package.mjs win    # [Planifié, phase 8]
```
Sortie prévue : `build/DIGITAL LIFE Setup.exe` (NSIS). electron-builder 26.18.0.

## Distribution Linux

```bash
node scripts/package.mjs linux  # [Planifié, phase 8]
```
Sorties prévues : AppImage et archive tar.gz dans `build/`.

## Dépendances natives

Aucune compilation native n'est requise pour l'instant : sql.js est du WebAssembly.
electron-builder peut nécessiter selon la distribution Linux :
- `fuse` (AppImage) ;
- bibliothèques GTK/GTK3, libX11, libxss, libasound2 pour l'exécution d'Electron.
Ces paquets système sont à installer manuellement par l'utilisateur si nécessaire ;
le projet n'exécute jamais `sudo`.

## Vérification hors ligne

Après installation, l'application doit fonctionner sans réseau, sauf pour les
dialogues enrichis OpenRouter. Le WASM est local et les dépendances sont dans
`node_modules` (puis empaquetées).
