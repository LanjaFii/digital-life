// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { finalizeDecisionRecord } from '../src/main/services/decision-record.service';
import { useDecisionHistory, useDecisionRecord } from '../src/renderer/hooks/use-decision-history';
import { DecisionPanel } from '../src/renderer/components/DecisionPanel';
import type { DecisionRecordV1 } from '../src/shared/decision';
import type { DecisionSummaryView } from '../src/shared/decision-view';
import type { DigitalLifeApi } from '../src/shared/ipc';
import { makeDecisionPayload } from './decision-record-fixtures';
import { makeSnapshot } from './simulation-rules-fixtures';

function makeSummary(overrides: Partial<DecisionSummaryView> = {}): DecisionSummaryView {
  return {
    id: 'world-1:1:char-a', characterId: 'char-a', characterName: 'Ada Lovelace',
    tick: 1, day: 1, hour: 1, previousActionId: null, selectedActionId: 'eat',
    selectionRule: 'score_tiebreak_id', score: 1.25, reason: 'La faim est prioritaire.',
    warningCount: 0, ...overrides,
  };
}

function makeRecord(): DecisionRecordV1 {
  return finalizeDecisionRecord(makeDecisionPayload({
    worldId: 'world-1', tick: 1, day: 1, hour: 1,
    characters: [makeSnapshot({ characterId: 'char-a' })],
    characterNameByCharacterId: { 'char-a': 'Ada Lovelace' },
  }), '2026-01-01T01:00:00.000Z');
}

function installApi(overrides: Partial<DigitalLifeApi> = {}): DigitalLifeApi {
  const api: DigitalLifeApi = {
    getAppInfo: vi.fn(), getDiagnostic: vi.fn(), listWorlds: vi.fn(), createWorld: vi.fn(),
    deleteWorld: vi.fn(), getWorld: vi.fn(), listCharacters: vi.fn(), createCharacter: vi.fn(),
    updateCharacter: vi.fn(), deleteCharacter: vi.fn(), generateRandomDraft: vi.fn(),
    listTemplates: vi.fn(), getTemplate: vi.fn(), createTemplate: vi.fn(), updateTemplate: vi.fn(),
    deleteTemplate: vi.fn(), instantiateTemplate: vi.fn(), simulationGetStatus: vi.fn(),
    simulationStart: vi.fn(), simulationPause: vi.fn(), simulationResume: vi.fn(),
    simulationStep: vi.fn(), simulationSetSpeed: vi.fn(), simulationStop: vi.fn(),
    getDecisionHistory: vi.fn().mockResolvedValue([makeSummary()]),
    getDecisionRecord: vi.fn().mockResolvedValue(makeRecord()),
    onSimulationStatusChanged: vi.fn().mockReturnValue(() => {}),
    ...overrides,
  };
  Object.defineProperty(window, 'digitalLife', { value: api, configurable: true, writable: true });
  return api;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('hook de consultation des décisions', () => {
  it('recharge au changement de tick, jamais sur un tick identique', async () => {
    const getDecisionHistory = vi.fn().mockResolvedValue([makeSummary()]);
    installApi({ getDecisionHistory });
    const { rerender } = renderHook(({ tick }) => useDecisionHistory('world-1', tick), {
      initialProps: { tick: 1 },
    });
    await waitFor(() => expect(getDecisionHistory).toHaveBeenCalledTimes(1));
    expect(getDecisionHistory).toHaveBeenCalledWith({
      worldId: 'world-1', limit: 50, offset: 0,
    });

    rerender({ tick: 1 });
    await act(async () => { await Promise.resolve(); });
    expect(getDecisionHistory).toHaveBeenCalledTimes(1);
  });

  it('ignore une réponse obsolète et propose un réessai en erreur', async () => {
    let resolveFirst: (items: DecisionSummaryView[]) => void = () => {};
    const fresh = makeSummary({ id: 'world-1:2:char-a', tick: 2 });
    const getDecisionHistory = vi.fn()
      .mockImplementationOnce(() => new Promise<DecisionSummaryView[]>((resolve) => { resolveFirst = resolve; }))
      .mockRejectedValueOnce(new Error('IPC indisponible'))
      .mockResolvedValueOnce([fresh]);
    installApi({ getDecisionHistory });
    const { result, rerender } = renderHook(({ tick }) => useDecisionHistory('world-1', tick), {
      initialProps: { tick: 1 },
    });
    await waitFor(() => expect(getDecisionHistory).toHaveBeenCalledTimes(1));

    // Le throttle impose d'attendre la fenêtre de 500 ms avant une nouvelle requête.
    await new Promise((resolve) => setTimeout(resolve, 520));
    rerender({ tick: 2 });
    await waitFor(() => expect(getDecisionHistory).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.error).toBe('IPC indisponible'));

    resolveFirst([makeSummary()]);
    await act(async () => { await Promise.resolve(); });
    expect(result.current.items).toEqual([]);
    expect(result.current.error).toBe('IPC indisponible');

    act(() => result.current.retry());
    await waitFor(() => expect(result.current.items).toEqual([fresh]));
    expect(result.current.error).toBeNull();
  });

  it('ne charge le détail qu’après sélection', async () => {
    const record = makeRecord();
    const api = installApi({ getDecisionRecord: vi.fn().mockResolvedValue(record) });
    const recordId = record.id;
    const { result, rerender } = renderHook(({ id }) => useDecisionRecord('world-1', id), {
      initialProps: { id: null as string | null },
    });
    expect(api.getDecisionRecord).not.toHaveBeenCalled();
    expect(result.current.items).toEqual([]);

    rerender({ id: recordId });
    await waitFor(() => expect(result.current.items).toEqual([record]));
    expect(api.getDecisionRecord).toHaveBeenCalledWith('world-1', recordId);
  });
});

describe('panneau Decision Inspector', () => {
  it('affiche une liste, charge le détail en douze sections et ne mute rien', async () => {
    const record = makeRecord();
    const api = installApi({ getDecisionRecord: vi.fn().mockResolvedValue(record) });
    render(<DecisionPanel worldId="world-1" revision={1} />);

    expect(await screen.findByText('Ada Lovelace')).toBeTruthy();
    expect(api.getDecisionRecord).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Ada Lovelace').closest('button') as HTMLButtonElement);

    expect(await screen.findByText('Détail de la décision')).toBeTruthy();
    expect(document.querySelectorAll('.decision-section')).toHaveLength(12);
    expect(screen.getByText(/Identité et contexte/)).toBeTruthy();
    expect(screen.getByText(/Traçabilité et avertissements/)).toBeTruthy();
    expect(screen.getAllByText(/Explication du moteur/).length).toBeGreaterThan(0);
    expect(screen.queryByText(record.payloadSha256)).toBeNull();

    for (const name of [
      'simulationStep', 'simulationStart', 'simulationPause', 'simulationResume',
      'simulationStop', 'simulationSetSpeed', 'deleteCharacter', 'updateCharacter',
    ] as const) {
      expect(api[name], name).not.toHaveBeenCalled();
    }
  });

  it('gère la pagination par offset', async () => {
    const getDecisionHistory = vi.fn().mockImplementation(async ({ offset }: { offset: number }) => [
      makeSummary({ id: `world-1:${1 + offset}:char-a`, tick: 1 + offset }),
      ...Array.from({ length: 49 }, (_, index) => makeSummary({ id: `world-1:${1 + offset}:char-${index + 2}`, characterId: `char-${index + 2}` })),
    ]);
    installApi({ getDecisionHistory });
    render(<DecisionPanel worldId="world-1" revision={1} />);

    await waitFor(() => expect(getDecisionHistory).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: "Avancer d'une page" }));
    await waitFor(() => expect(getDecisionHistory).toHaveBeenCalledTimes(2));
    expect(getDecisionHistory).toHaveBeenLastCalledWith({
      worldId: 'world-1', limit: 50, offset: 50,
    });
    expect(screen.getByText(/Depuis 51 à 100/)).toBeTruthy();
  });

  it('affiche un état vide et un état d’erreur avec réessai', async () => {
    const getDecisionHistory = vi.fn()
      .mockRejectedValueOnce(new Error('Lecture refusée'))
      .mockResolvedValueOnce([]);
    installApi({ getDecisionHistory });
    render(<DecisionPanel worldId="world-1" revision={1} />);

    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByText(/Lecture refusée/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(await screen.findByText('Aucune décision enregistrée')).toBeTruthy();
  });

  it('filtre l’historique depuis une fiche personnage', async () => {
    const getDecisionHistory = vi.fn().mockResolvedValue([makeSummary()]);
    installApi({ getDecisionHistory });
    render(<DecisionPanel worldId="world-1" revision={2} characterId="char-a" title="Décisions de ce personnage" />);

    await waitFor(() => expect(getDecisionHistory).toHaveBeenCalledWith({
      worldId: 'world-1', characterId: 'char-a', limit: 50, offset: 0,
    }));
    expect(screen.getByText('Décisions de ce personnage')).toBeTruthy();
  });
});
