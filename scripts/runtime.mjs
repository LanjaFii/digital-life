import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const NODE_VERSION = readFileSync(join(ROOT, 'scripts', 'node-version.txt'), 'utf8').trim();

function archKey() {
  const a = process.arch;
  if (a === 'x64' || a === 'ia32') return 'x64';
  if (a === 'arm64') return 'arm64';
  throw new Error(`Architecture non prise en charge : ${a}`);
}

export function platformKey() {
  if (process.platform === 'linux') return 'linux';
  if (process.platform === 'darwin') return 'darwin';
  if (process.platform === 'win32') return 'win';
  throw new Error(`Système d'exploitation non pris en charge : ${process.platform}`);
}

export function localNodeDir() {
  return join(ROOT, '.tools', 'node', 'versions', `${NODE_VERSION}-${platformKey()}-${archKey()}`);
}

export function localNodePath() {
  return join(localNodeDir(), process.platform === 'win32' ? 'node.exe' : join('bin', 'node'));
}

export function npmCliPath() {
  return join(localNodeDir(), 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js');
}

export function electronPath() {
  const dist = join(ROOT, 'node_modules', 'electron', 'dist');
  const exe = process.platform === 'win32' ? 'electron.exe' : 'electron';
  return join(dist, exe);
}

export function binPath(name) {
  const ext = process.platform === 'win32' ? '.cmd' : '';
  return join(ROOT, 'node_modules', '.bin', `${name}${ext}`);
}

/**
 * Garantit que le script courant est exécuté PAR le Node.js local du projet.
 * Si ce n'est pas le cas, le script se relance avec le binaire local et transmet
 * tous les arguments. Aucun Node.js global n'est utilisé pour le travail réel.
 */
export function ensureLocalNode(scriptUrl) {
  if (!existsSync(localNodePath())) {
    throw new Error(
      `Node.js local absent : ${localNodePath()}\n` +
        `Lancer d'abord : ${process.platform === 'win32' ? 'scripts\\bootstrap.ps1' : 'bash scripts/bootstrap.sh'}`,
    );
  }
  if (resolve(process.execPath) !== resolve(localNodePath())) {
    const result = spawnSync(
      localNodePath(),
      [fileURLToPath(scriptUrl), ...process.argv.slice(2)],
      { cwd: ROOT, stdio: 'inherit', env: { ...process.env, PATH: `${dirname(localNodePath())}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH ?? ''}` } },
    );
    process.exit(result.status ?? 1);
  }
}

/** Exécute une commande et lève une erreur claire en cas d'échec. */
export function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: ROOT, stdio: 'inherit', ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`Commande échouée (${result.status}) : ${command} ${args.join(' ')}`);
  }
  return result;
}

export function fail(message) {
  console.error(`\n[DIGITAL LIFE] ${message}\n`);
  process.exit(1);
}
