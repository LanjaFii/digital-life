import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IPC_CHANNELS } from '../src/shared/ipc';
import { readDecisionHistory, readDecisionRecord } from '../src/main/services/decision-read.service';

type Handler = (event: unknown, ...args: unknown[]) => unknown;
const handlers = new Map<string, Handler>();

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: Handler) => { handlers.set(channel, handler); },
  },
}));

vi.mock('../src/main/services/decision-read.service', () => ({
  readDecisionHistory: vi.fn().mockResolvedValue([]),
  readDecisionRecord: vi.fn().mockResolvedValue({ id: 'w:1:c' }),
}));

async function register(): Promise<void> {
  const { registerDecisionIpc } = await import('../src/main/ipc/decision.ipc');
  registerDecisionIpc();
}

beforeEach(() => {
  handlers.clear();
  vi.mocked(readDecisionHistory).mockClear();
  vi.mocked(readDecisionRecord).mockClear();
});

describe('canaux IPC de consultation des décisions (3D-D)', () => {
  it('enregistre uniquement deux canaux de lecture', async () => {
    await register();
    expect([...handlers.keys()].sort()).toEqual([
      IPC_CHANNELS.DECISION_HISTORY, IPC_CHANNELS.DECISION_RECORD,
    ].sort());
  });

  it('valide et normalise une requête d’historique avant lecture', async () => {
    await register();
    const handler = handlers.get(IPC_CHANNELS.DECISION_HISTORY);
    if (!handler) throw new Error('Handler manquant.');
    expect(() => handler({}, { worldId: '' })).toThrow(/worldId invalide/);
    expect(() => handler({}, { worldId: 'w', limit: 501 })).toThrow(/limit/);
    expect(() => handler({}, { worldId: 'w', offset: -1 })).toThrow(/offset/);
    expect(readDecisionHistory).not.toHaveBeenCalled();

    await handler({}, { worldId: ' w ', limit: 2, offset: 1 });
    expect(readDecisionHistory).toHaveBeenCalledWith({ worldId: 'w', limit: 2, offset: 1 });
  });

  it('exige le monde et un identifiant valide pour le détail', async () => {
    await register();
    const handler = handlers.get(IPC_CHANNELS.DECISION_RECORD);
    if (!handler) throw new Error('Handler manquant.');
    expect(() => handler({}, undefined, 'w:1:c')).toThrow(/worldId invalide/);
    expect(() => handler({}, 'w', 'invalide')).toThrow(/décision invalide/);
    expect(readDecisionRecord).not.toHaveBeenCalled();

    await handler({}, ' w ', 'w:1:c');
    expect(readDecisionRecord).toHaveBeenCalledWith('w', 'w:1:c');
  });
});
