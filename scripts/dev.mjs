import { spawn } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
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
function linuxSandboxArgs() {
  if (process.platform !== 'linux') return [];
  const forced = process.env.DL_DEV_NO_SANDBOX;
  if (forced === '0') return [];
  if (forced === '1') {
    console.warn('[DIGITAL LIFE] AVERTISSEMENT: DL_DEV_NO_SANDBOX=1 => lancement dev avec --no-sandbox (sandbox Chromium désactivée pour ce processus).');
    return ['--no-sandbox'];
  }

  const sandboxBin = join(ROOT, 'node_modules', 'electron', 'dist', 'chrome-sandbox');
  try {
    const st = statSync(sandboxBin);
    const isSetuidRoot = st.uid === 0 && (st.mode & 0o4000) === 0o4000;
    if (isSetuidRoot) return [];
  } catch {
    // Si on ne peut pas statuer le binaire, on ne force rien : Electron décidera.
  }

  let apparmorRestricted = false;
  try {
    apparmorRestricted = readFileSync('/proc/sys/kernel/apparmor_restrict_unprivileged_userns', 'utf8').trim() === '1';
  } catch {
    apparmorRestricted = false;
  }

  let unprivilegedUserns = true;
  try {
    unprivilegedUserns = readFileSync('/proc/sys/kernel/unprivileged_userns_clone', 'utf8').trim() !== '0';
  } catch {
    unprivilegedUserns = true;
  }

  // Sur Ubuntu 23.10+ avec AppArmor restreignant les userns non privilégiés,
  // le sandbox Chromium userns peut être inutilisable si chrome-sandbox n'est pas setuid root.
  if (apparmorRestricted || !unprivilegedUserns) {
    console.warn('[DIGITAL LIFE] AVERTISSEMENT: Environnement Linux restreint détecté (chrome-sandbox non setuid root et userns non privilégiés restreints/indisponibles).');
    console.warn('[DIGITAL LIFE] Lancement dev avec --no-sandbox UNIQUEMENT pour ce processus de développement. La sécurité de production n’est pas modifiée.');
    console.warn('[DIGITAL LIFE] Pour utiliser le sandbox, configurez correctement l’environnement (profil AppArmor/chrome-sandbox setuid root) puis relancez avec DL_DEV_NO_SANDBOX=0.');
    return ['--no-sandbox'];
  }

  return [];
}

function startElectron() {
  if (started || shuttingDown) return;
  started = true;
  const sandboxArgs = linuxSandboxArgs();
  console.log('[DIGITAL LIFE] Serveur prêt, lancement d’Electron…');
  electronChild = spawn(electronPath(), [...sandboxArgs, ROOT], {
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
