import { copyFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, ensureLocalNode, fail } from './runtime.mjs';

ensureLocalNode(import.meta.url);

const source = join(ROOT, 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm');
const targetDir = join(ROOT, 'resources', 'sqlite');
const target = join(targetDir, 'sql-wasm.wasm');

if (!existsSync(source)) {
  fail(`Fichier WASM source absent : ${source}\nLancer d'abord scripts/bootstrap.sh (ou bootstrap.ps1).`);
}
if (statSync(source).size === 0) fail(`Fichier WASM source vide : ${source}`);

mkdirSync(targetDir, { recursive: true });
copyFileSync(source, target);
console.log(`[DIGITAL LIFE] WASM embarqué : ${target} (${statSync(target).size} octets)`);
