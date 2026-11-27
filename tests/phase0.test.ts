import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { IPC_CHANNELS } from '../src/shared/ipc';
import { isAllowedUrl, WINDOW_SECURITY } from '../src/main/security/window';

const root = process.cwd();
const read = (relative: string) => readFileSync(join(root, relative), 'utf8');

describe('Phase 0 — configuration portable', () => {
  it('épingle une version LTS de Node.js', () => {
    expect(read('scripts/node-version.txt').trim()).toBe('v26.13.1');
  });

  it('contient toutes les dépendances requises', () => {
    const pkg = JSON.parse(read('package.json'));
    for (const name of ['electron', 'react', 'react-dom', 'vite', 'typescript', 'vitest', 'sql.js', 'zustand', 'recharts', 'lucide-react', 'electron-builder']) {
      expect(pkg.dependencies?.[name] ?? pkg.devDependencies?.[name], name).toBeDefined();
    }
  });

  it('fournit les scripts Linux et Windows obligatoires', () => {
    for (const name of ['bootstrap', 'dev', 'build']) {
      expect(existsSync(join(root, 'scripts', `${name}.sh`))).toBe(true);
      expect(existsSync(join(root, 'scripts', `${name}.ps1`))).toBe(true);
    }
  });

  it('embarque le WASM sql.js dans le projet', () => {
    const wasm = join(root, 'resources', 'sqlite', 'sql-wasm.wasm');
    expect(existsSync(wasm), wasm).toBe(true);
  });
});

describe('Sécurité IPC', () => {
  it('expose uniquement les canaux autorisés', () => {
    expect(IPC_CHANNELS).toEqual({
      GET_APP_INFO: 'app:get-info',
      GET_DIAGNOSTIC: 'app:diagnostic',
      WORLD_LIST: 'world:list',
      WORLD_CREATE: 'world:create',
      WORLD_DELETE: 'world:delete',
      WORLD_GET: 'world:get',
      CHARACTER_LIST: 'character:list',
      CHARACTER_CREATE: 'character:create',
      CHARACTER_UPDATE: 'character:update',
      CHARACTER_DELETE: 'character:delete',
      CHARACTER_RANDOM_DRAFT: 'character:random-draft',
      TEMPLATE_LIST: 'template:list',
      TEMPLATE_GET: 'template:get',
      TEMPLATE_CREATE: 'template:create',
      TEMPLATE_UPDATE: 'template:update',
      TEMPLATE_DELETE: 'template:delete',
      TEMPLATE_INSTANTIATE: 'template:instantiate',
      SIMULATION_STATUS: 'simulation:status',
      SIMULATION_START: 'simulation:start',
      SIMULATION_PAUSE: 'simulation:pause',
      SIMULATION_RESUME: 'simulation:resume',
      SIMULATION_STEP: 'simulation:step',
      SIMULATION_SPEED: 'simulation:speed',
      SIMULATION_STOP: 'simulation:stop',
      SIMULATION_STATUS_CHANGED: 'simulation:status-changed',
      DECISION_HISTORY: 'decision:history',
      DECISION_RECORD: 'decision:record',
    });
  });

  it('active contextIsolation et sandbox, désactive nodeIntegration', () => {
    expect(WINDOW_SECURITY.contextIsolation).toBe(true);
    expect(WINDOW_SECURITY.sandbox).toBe(true);
    expect(WINDOW_SECURITY.nodeIntegration).toBe(false);
  });

  it('refuse les navigations externes', () => {
    expect(isAllowedUrl('https://exemple.com')).toBe(false);
    expect(isAllowedUrl('file:///tmp/test.html')).toBe(true);
    expect(isAllowedUrl('http://127.0.0.1:5173', 'http://127.0.0.1:5173')).toBe(true);
  });

  it('ne place aucune clé API dans le renderer', () => {
    const renderer = read('src/renderer/App.tsx') + read('src/renderer/main.tsx');
    expect(renderer.toLowerCase()).not.toContain('apikey');
  });
});
