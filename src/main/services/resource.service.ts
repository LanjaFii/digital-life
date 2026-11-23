import { existsSync } from 'node:fs';
import { app } from 'electron';
import { join } from 'node:path';

/**
 * Résout le chemin du binaire WebAssembly sql.js.
 * - Développement : resources/sqlite/ à la racine du projet.
 * - Application empaquetée : extraResources copié dans process.resourcesPath/sqlite/.
 */
export function getWasmPath(): string {
  if (app.isPackaged) return join(process.resourcesPath, 'sqlite', 'sql-wasm.wasm');
  const fromAppPath = join(app.getAppPath(), 'resources', 'sqlite', 'sql-wasm.wasm');
  if (existsSync(fromAppPath)) return fromAppPath;
  const fromCwd = join(process.cwd(), 'resources', 'sqlite', 'sql-wasm.wasm');
  if (existsSync(fromCwd)) return fromCwd;
  return fromAppPath;
}

export function hasWasm(): boolean {
  return existsSync(getWasmPath());
}
