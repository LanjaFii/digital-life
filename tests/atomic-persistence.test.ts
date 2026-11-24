import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const tmp = mkdtempSync(join(tmpdir(), 'dl-atomic-'));

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getAppPath: () => tmp,
    getPath: () => tmp,
  },
  BrowserWindow: {
    getAllWindows: () => [],
  },
}));

vi.mock('../src/main/services/resource.service', () => ({
  getWasmPath: () => join(process.cwd(), 'resources', 'sqlite', 'sql-wasm.wasm'),
}));

import {
  atomicPersist,
  cleanupStalePersistenceTemp,
  getPersistenceTempPath,
  type PersistenceFailureStage,
} from '../src/main/services/persistence.service';
import {
  _exportDatabaseForTests,
  _resetWorldStoreForTests,
  _setPersistenceFailureForTests,
  createWorld,
  getSimulationStatus,
  listWorlds,
  startSimulation,
  stepSimulation,
} from '../src/main/services/world-store.service';

function dbPath(): string {
  return join(tmp, 'data', 'saves', 'worlds.sqlite');
}

function bytes(text: string): Uint8Array {
  return new Uint8Array(Buffer.from(text, 'utf8'));
}

function expectThrown(promise: Promise<unknown>, pattern: RegExp): Promise<void> {
  return expect(promise).rejects.toThrow(pattern).then(() => undefined);
}

beforeEach(async () => {
  _setPersistenceFailureForTests(null);
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  mkdirSync(join(tmp, 'data', 'saves'), { recursive: true });
  await _resetWorldStoreForTests();
});

describe('Écriture atomique (unité)', () => {
  it('remplace le fichier cible et supprime le temporaire', () => {
    writeFileSync(dbPath(), Buffer.from('ancienne valeur'));
    const next = bytes('nouvelle valeur');
    const result = atomicPersist(dbPath(), next);

    expect(result.committed).toBe(true);
    expect(readFileSync(dbPath(), 'utf8')).toBe('nouvelle valeur');
    expect(() => readFileSync(getPersistenceTempPath(dbPath()))).toThrow();
  });

  it.each<PersistenceFailureStage>(['beforeWrite', 'beforeFsync', 'beforeRename'])(
    'échoue sur %s sans toucher au fichier cible',
    (stage) => {
      writeFileSync(dbPath(), Buffer.from('intact'));
      _setPersistenceFailureForTests((injected) => {
        if (injected === stage) throw new Error(`panne ${stage}`);
      });
      expect(() => atomicPersist(dbPath(), bytes('remplacement'))).toThrow(`panne ${stage}`);
      expect(readFileSync(dbPath(), 'utf8')).toBe('intact');
      expect(() => readFileSync(getPersistenceTempPath(dbPath()))).toThrow();
    },
  );

  it('échoue sur un fsync du fichier sans toucher au fichier cible', () => {
    writeFileSync(dbPath(), Buffer.from('intact'));
    expect(() => atomicPersist(dbPath(), bytes('remplacement'), {
      fsync: () => {
        throw new Error('fsync refusé');
      },
    })).toThrow('fsync refusé');
    expect(readFileSync(dbPath(), 'utf8')).toBe('intact');
    expect(() => readFileSync(getPersistenceTempPath(dbPath()))).toThrow();
  });

  it('détecte un hash incorrect et supprime le temporaire', () => {
    writeFileSync(dbPath(), Buffer.from('intact'));
    _setPersistenceFailureForTests((stage, context) => {
      if (stage === 'beforeVerify') writeFileSync(context.tempPath, Buffer.from('corrompu'));
    });
    expect(() => atomicPersist(dbPath(), bytes('remplacement'))).toThrow(/SHA-256/);
    expect(readFileSync(dbPath(), 'utf8')).toBe('intact');
    expect(() => readFileSync(getPersistenceTempPath(dbPath()))).toThrow();
  });

  it('conserve le nouveau fichier si une erreur survient après le renommage', () => {
    writeFileSync(dbPath(), Buffer.from('ancien'));
    _setPersistenceFailureForTests((stage) => {
      if (stage === 'afterRename') throw new Error('hook post-rename');
    });
    const result = atomicPersist(dbPath(), bytes('nouveau'));
    expect(result.committed).toBe(true);
    expect(result.directoryFsyncError).toMatch(/hook post-rename/);
    expect(readFileSync(dbPath(), 'utf8')).toBe('nouveau');
  });

  it('simule Windows : rename EPERM reste une erreur dure sans repli par copie', () => {
    writeFileSync(dbPath(), Buffer.from('intact'));
    _setPersistenceFailureForTests((stage) => {
      if (stage === 'beforeRename') {
        const error = new Error('EPERM') as NodeJS.ErrnoException;
        error.code = 'EPERM';
        throw error;
      }
    });
    expect(() => atomicPersist(dbPath(), bytes('remplacement'), { platform: 'win32' })).toThrow('EPERM');
    expect(readFileSync(dbPath(), 'utf8')).toBe('intact');
    expect(() => readFileSync(getPersistenceTempPath(dbPath()))).toThrow();
  });

  it('nettoie un temporaire résiduel sans toucher à la sauvegarde valide', () => {
    writeFileSync(dbPath(), Buffer.from('valide'));
    writeFileSync(getPersistenceTempPath(dbPath()), Buffer.from('résidu'));
    cleanupStalePersistenceTemp(dbPath());
    expect(readFileSync(dbPath(), 'utf8')).toBe('valide');
    expect(() => readFileSync(getPersistenceTempPath(dbPath()))).toThrow();
  });
});

describe('Persistance atomique intégrée au tick', () => {
  it('restaure exactement la mémoire et le disque si le renommage échoue après COMMIT', async () => {
    const world = await createWorld({ name: 'Rollback disque', generationMode: 'random', characterCount: 1, seed: 7 });
    await startSimulation(world.id, 1);
    const beforeDisk = readFileSync(dbPath());
    const beforeMemory = await _exportDatabaseForTests();
    expect(Buffer.from(beforeMemory).equals(beforeDisk)).toBe(true);

    _setPersistenceFailureForTests((stage) => {
      if (stage === 'beforeRename') throw new Error('rename refusé');
    });
    await expectThrown(stepSimulation(world.id), /rename refusé/);

    expect(Buffer.from(await _exportDatabaseForTests()).equals(beforeMemory)).toBe(true);
    expect(Buffer.from(beforeDisk).equals(readFileSync(dbPath()))).toBe(true);
    expect((await getSimulationStatus(world.id)).clock?.tick).toBe(0);

    _setPersistenceFailureForTests(null);
    const next = await stepSimulation(world.id);
    expect(next.clock?.tick).toBe(1);
    expect(Buffer.from(beforeDisk).equals(readFileSync(dbPath()))).toBe(false);
  });

  it('restaure la mémoire quand la vérification du hash échoue', async () => {
    const world = await createWorld({ name: 'Hash disque', generationMode: 'random', characterCount: 1, seed: 11 });
    await startSimulation(world.id, 1);
    const beforeMemory = await _exportDatabaseForTests();

    _setPersistenceFailureForTests((stage, context) => {
      if (stage === 'beforeVerify') writeFileSync(context.tempPath, Buffer.from('altéré'));
    });
    await expectThrown(stepSimulation(world.id), /SHA-256/);

    expect(Buffer.from(await _exportDatabaseForTests()).equals(beforeMemory)).toBe(true);
    expect((await getSimulationStatus(world.id)).clock?.tick).toBe(0);
  });

  it('sérialise deux ticks de mondes différents sans perte ni divergence mémoire/disque', async () => {
    const a = await createWorld({ name: 'Monde A', generationMode: 'random', characterCount: 1, seed: 101 });
    const b = await createWorld({ name: 'Monde B', generationMode: 'random', characterCount: 1, seed: 202 });
    await startSimulation(a.id, 1);
    await startSimulation(b.id, 1);

    await Promise.all([stepSimulation(a.id), stepSimulation(b.id)]);

    expect((await getSimulationStatus(a.id)).clock?.tick).toBe(1);
    expect((await getSimulationStatus(b.id)).clock?.tick).toBe(1);
    expect(Buffer.from(await _exportDatabaseForTests()).equals(readFileSync(dbPath()))).toBe(true);
  });

  it('supprime un temporaire résiduel au prochain démarrage sans importer son contenu', async () => {
    writeFileSync(getPersistenceTempPath(dbPath()), Buffer.from('temporaire corrompu'));
    const worlds = await listWorlds();
    expect(worlds.worlds).toHaveLength(0);
    expect(() => readFileSync(getPersistenceTempPath(dbPath()))).toThrow();
    expect(readFileSync(dbPath()).length).toBeGreaterThan(0);
  });
});
