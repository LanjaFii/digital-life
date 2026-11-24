import { describe, expect, it } from 'vitest';
import { withDbWrite } from '../src/main/services/db-write-lock.service';

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('Verrou global d’écriture SQLite', () => {
  it('sérialise deux opérations concurrentes sans chevauchement', async () => {
    const events: string[] = [];
    const first = deferred();
    const running = withDbWrite(async () => {
      events.push('debut-1');
      await first.promise;
      events.push('fin-1');
    });
    const second = withDbWrite(async () => {
      events.push('debut-2');
    });

    await new Promise((resolve) => setImmediate(resolve));
    expect(events).toEqual(['debut-1']);
    first.resolve();
    await Promise.all([running, second]);
    expect(events).toEqual(['debut-1', 'fin-1', 'debut-2']);
  });

  it('relâche la file après une erreur', async () => {
    const events: string[] = [];
    const failed = withDbWrite(async () => {
      events.push('debut-1');
      throw new Error('panne');
    });
    const next = withDbWrite(async () => {
      events.push('debut-2');
      return 42;
    });

    await expect(failed).rejects.toThrow('panne');
    await expect(next).resolves.toBe(42);
    expect(events).toEqual(['debut-1', 'debut-2']);
  });

  it('permet à des mondes différents de s’inscrire dans la même file', async () => {
    const order: string[] = [];
    const gate = deferred();
    const a = withDbWrite(async () => {
      order.push('A');
      await gate.promise;
    });
    const b = withDbWrite(async () => {
      order.push('B');
    });
    await new Promise((resolve) => setImmediate(resolve));
    expect(order).toEqual(['A']);
    gate.resolve();
    await Promise.all([a, b]);
    expect(order).toEqual(['A', 'B']);
  });
});
