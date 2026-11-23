import { join } from 'node:path';
import { ROOT, ensureLocalNode, fail, run } from './runtime.mjs';

ensureLocalNode(import.meta.url);

const vitest = join(ROOT, 'node_modules', 'vitest', 'vitest.mjs');
const args = process.argv.slice(2);
try {
  run(process.execPath, [vitest, 'run', ...args]);
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
