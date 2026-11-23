import { join } from 'node:path';
import { ROOT, ensureLocalNode, fail, run } from './runtime.mjs';

ensureLocalNode(import.meta.url);

const tsc = join(ROOT, 'node_modules', 'typescript', 'bin', 'tsc');
const configs = ['tsconfig.json', 'tsconfig.main.json', 'tsconfig.preload.json', 'tsconfig.test.json'];

try {
  for (const config of configs) {
    console.log(`[DIGITAL LIFE] Typecheck : ${config}`);
    run(process.execPath, [tsc, '-p', config, '--noEmit']);
  }
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
console.log('\n[DIGITAL LIFE] Typecheck réussi pour toutes les configurations.');
