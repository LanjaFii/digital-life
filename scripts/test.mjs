import { join } from 'node:path';
import { ROOT, ensureLocalNode, fail, run } from './runtime.mjs';

ensureLocalNode(import.meta.url);

const vitest = join(ROOT, 'node_modules', 'vitest', 'vitest.mjs');
const tsc = join(ROOT, 'node_modules', 'typescript', 'bin', 'tsc');
const args = process.argv.slice(2);
try {
  // Le worker de simulation est chargé par Node (worker_threads) : il doit exister en JS.
  run(process.execPath, [tsc, '-p', 'tsconfig.main.json']);
  run(process.execPath, [vitest, 'run', ...args]);
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
