import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { build as rolldownBuild } from 'rolldown';
import { ROOT, ensureLocalNode, fail, run } from './runtime.mjs';

ensureLocalNode(import.meta.url);

const tsc = join(ROOT, 'node_modules', 'typescript', 'bin', 'tsc');
const vite = join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js');

async function buildPreload() {
  await rolldownBuild({
    input: join(ROOT, 'src', 'preload', 'preload.ts'),
    output: {
      file: join(ROOT, 'dist', 'preload', 'preload.js'),
      format: 'cjs',
      sourcemap: true,
    },
    platform: 'node',
    external: ['electron'],
    tsconfig: join(ROOT, 'tsconfig.preload.json'),
  });
}

try {
  console.log('[DIGITAL LIFE] Nettoyage de dist/…');
  rmSync(join(ROOT, 'dist'), { recursive: true, force: true });

  console.log('[DIGITAL LIFE] Compilation du processus principal…');
  run(process.execPath, [tsc, '-p', 'tsconfig.main.json']);

  console.log('[DIGITAL LIFE] Compilation du preload (bundle)…');
  await buildPreload();

  console.log('[DIGITAL LIFE] Compilation du renderer (Vite)…');
  run(process.execPath, [vite, 'build']);

  console.log('[DIGITAL LIFE] Copie du WASM…');
  run(process.execPath, [join(ROOT, 'scripts', 'copy-wasm.mjs')]);

  console.log('[DIGITAL LIFE] Vérification des dépendances…');
  run(process.execPath, [join(ROOT, 'scripts', 'check-deps.mjs')]);
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}

console.log('\n[DIGITAL LIFE] Build terminé : dist/main, dist/preload, dist/renderer.');
