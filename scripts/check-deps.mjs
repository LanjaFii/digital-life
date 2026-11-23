import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, NODE_VERSION, electronPath, ensureLocalNode, localNodePath } from './runtime.mjs';

ensureLocalNode(import.meta.url);

const problems = [];
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));

function check(label, ok, detail = '') {
  console.log(`${ok ? '  OK  ' : ' MANQUE'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) problems.push(label);
}

console.log('[DIGITAL LIFE] Vérification des dépendances locales\n');
check('Node.js local', process.execPath === localNodePath() && process.version === NODE_VERSION, `${process.version} (attendu ${NODE_VERSION})`);

for (const name of [...Object.keys(pkg.dependencies), ...Object.keys(pkg.devDependencies)]) {
  check(`module npm : ${name}`, existsSync(join(ROOT, 'node_modules', name, 'package.json')));
}

const electronOk = existsSync(electronPath());
check('binaire Electron', electronOk, electronOk ? electronPath() : `${electronPath()} (téléchargement réseau nécessaire)`);
check('WASM sql.js embarqué', existsSync(join(ROOT, 'resources', 'sqlite', 'sql-wasm.wasm')) &&
  statSync(join(ROOT, 'resources', 'sqlite', 'sql-wasm.wasm')).size > 0);

if (problems.length) {
  const onlyElectron = problems.length === 1 && problems[0] === 'binaire Electron';
  if (onlyElectron) {
    console.warn('\n[DIGITAL LIFE] Avertissement : binaire Electron absent. Le build/typecheck/test restent possibles, mais le lancement de l\'application nécessite ce binaire.');
    console.warn('Relancer le bootstrap quand le réseau est stable, ou définir ELECTRON_MIRROR vers un miroir accessible.');
    process.exit(0);
  }
  console.error(`\n[DIGITAL LIFE] ${problems.length} dépendance(s) manquante(s). Relancer le bootstrap.`);
  process.exit(1);
}
console.log('\n[DIGITAL LIFE] Toutes les dépendances locales sont présentes.');
