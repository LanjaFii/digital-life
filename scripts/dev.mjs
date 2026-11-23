import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, electronPath, ensureLocalNode, fail } from './runtime.mjs';

ensureLocalNode(import.meta.url);

const viteBin = join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js');
const devServerUrl = 'http://127.0.0.1:5173';

if (!existsSync(viteBin)) fail('Vite absent. Lancer scripts/bootstrap.sh (ou bootstrap.ps1).');
if (!existsSync(electronPath())) fail('Binaire Electron absent. Lancer scripts/bootstrap.sh (ou bootstrap.ps1).');

let electronChild = null;
let shuttingDown = false;

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of [electronChild, viteChild]) {
    if (child && !child.killed) child.kill('SIGTERM');
  }
  setTimeout(() => process.exit(code), 300).unref();
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

console.log('[DIGITAL LIFE] Démarrage du serveur Vite…');
const viteChild = spawn(process.execPath, [viteBin], {
  cwd: ROOT,
  stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, NODE_ENV: 'development' },
});

let started = false;
function startElectron() {
  if (started || shuttingDown) return;
  started = true;
  console.log('[DIGITAL LIFE] Serveur prêt, lancement d’Electron…');
  electronChild = spawn(electronPath(), [ROOT], {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, NODE_ENV: 'development', VITE_DEV_SERVER_URL: devServerUrl },
  });
  electronChild.on('exit', (code) => shutdown(code ?? 0));
  electronChild.on('error', (err) => {
    console.error('[DIGITAL LIFE] Impossible de lancer Electron :', err);
    shutdown(1);
  });
}

const readyTimeout = setTimeout(() => {
  if (!started) {
    console.error('[DIGITAL LIFE] Délai dépassé : le serveur Vite ne répond pas.');
    shutdown(1);
  }
}, 60000);
readyTimeout.unref();

const onData = (chunk) => {
  const text = chunk.toString();
  process.stdout.write(text);
  if (!started && /(Local:|ready in|VITE v)/i.test(text)) {
    clearTimeout(readyTimeout);
    // Le message "ready in" peut précéder l'URL : on attend un court instant.
    setTimeout(startElectron, 400).unref();
  }
};
viteChild.stdout.on('data', onData);
viteChild.stderr.on('data', (chunk) => process.stderr.write(chunk));
viteChild.on('exit', (code) => {
  if (!shuttingDown) {
    console.error(`[DIGITAL LIFE] Serveur Vite terminé (code ${code}).`);
    shutdown(code ?? 1);
  }
});
viteChild.on('error', (err) => {
  console.error('[DIGITAL LIFE] Impossible de lancer Vite :', err);
  shutdown(1);
});
