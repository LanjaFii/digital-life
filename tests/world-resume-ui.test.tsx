// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import App from '../src/renderer/App';
import type { DigitalLifeApi } from '../src/shared/ipc';
import type { Character } from '../src/shared/character';
import type { SimulationStatusView } from '../src/shared/simulation';
import type { WorldSummary } from '../src/shared/world';

function makeWorld(overrides: Partial<WorldSummary> = {}): WorldSummary {
  return {
    id: 'world-1',
    name: 'Monde Test',
    seed: 123,
    characterCount: 2,
    generationMode: 'random',
    status: 'preparation',
    createdAt: '2026-01-01T10:00:00.000Z',
    updatedAt: '2026-01-01T10:00:00.000Z',
    lastOpenedAt: null,
    ...overrides,
  };
}

function makeCharacter(overrides: Partial<Character> = {}): Character {
  const state = {
    traits: {
      sociability: 70, empathy: 65, aggression: 20, patience: 60, impulsivity: 30, curiosity: 75,
      intelligence: 72, creativity: 68, honesty: 80, altruism: 66, ambition: 55, courage: 58,
      timidity: 40, distrust: 35, optimism: 62, humor: 50, jealousy: 25, discipline: 64,
      independence: 60, loyalty: 77, resilience: 69,
    },
    emotions: {
      happiness: 72, sadness: 20, stress: 30, anxiety: 25, anger: 10, fear: 15,
      confidence: 68, loneliness: 22, motivation: 74, satisfaction: 66,
    },
    needs: { hunger: 80, thirst: 82, energy: 75, sleep: 78, health: 90, hygiene: 85, socialization: 70, safety: 88 },
    goals: [
      { id: 'g1', label: 'Trouver un équilibre stable au quotidien', kind: 'primary' as const },
      { id: 'g2', label: 'Explorer les environs', kind: 'secondary' as const },
      { id: 'g3', label: 'Gérer mieux son stress', kind: 'secondary' as const },
    ],
  };
  return {
    id: 'char-1',
    worldId: 'world-1',
    templateId: null,
    firstName: 'Alice',
    lastName: 'Martin',
    age: 28,
    gender: 'female',
    biography: 'Alice observe le monde avec calme.',
    initialState: state,
    currentState: state,
    createdAt: '2026-01-01T10:00:00.000Z',
    updatedAt: '2026-01-01T10:00:00.000Z',
    ...overrides,
  };
}

function installApi(overrides: Partial<DigitalLifeApi> = {}): DigitalLifeApi {
  const api: DigitalLifeApi = {
    getAppInfo: vi.fn().mockResolvedValue({ name: 'DIGITAL LIFE', version: '0.0.1', platform: 'linux', arch: 'x64', nodeVersion: 'v26', electronVersion: '45' }),
    getDiagnostic: vi.fn().mockResolvedValue({ ok: true, checks: [] }),
    listWorlds: vi.fn().mockResolvedValue({ worlds: [makeWorld()] }),
    createWorld: vi.fn(),
    deleteWorld: vi.fn().mockResolvedValue({ deleted: true }),
    getWorld: vi.fn().mockResolvedValue(makeWorld()),
    listCharacters: vi.fn().mockResolvedValue({ characters: [makeCharacter(), makeCharacter({ id: 'char-2', firstName: 'Bob', lastName: 'Durand', gender: 'male', age: 34 })] }),
    createCharacter: vi.fn(),
    updateCharacter: vi.fn(),
    deleteCharacter: vi.fn().mockResolvedValue({ deleted: true }),
    generateRandomDraft: vi.fn(),
    listTemplates: vi.fn().mockResolvedValue({ templates: [] }),
    getTemplate: vi.fn(),
    createTemplate: vi.fn(),
    updateTemplate: vi.fn(),
    deleteTemplate: vi.fn().mockResolvedValue({ deleted: true }),
    instantiateTemplate: vi.fn(),
    simulationGetStatus: vi.fn().mockResolvedValue({ worldId: 'world-1', worldStatus: 'preparation', clock: null, isActive: false }),
    simulationStart: vi.fn(),
    simulationPause: vi.fn(),
    simulationResume: vi.fn(),
    simulationStep: vi.fn(),
    simulationSetSpeed: vi.fn(),
    simulationStop: vi.fn(),
    getDecisionHistory: vi.fn().mockResolvedValue([]),
    getDecisionRecord: vi.fn(),
    onSimulationStatusChanged: vi.fn().mockReturnValue(() => {}),
    ...overrides,
  };
  Object.defineProperty(window, 'digitalLife', { value: api, configurable: true, writable: true });
  return api;
}

describe('Reprise de monde (UI)', () => {
  beforeEach(() => {
    installApi();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('affiche un monde avec plusieurs personnages après clic sur Reprendre', async () => {
    render(<App />);
    await screen.findByText('Monde Test');
    fireEvent.click(screen.getByRole('button', { name: /Reprendre/i }));
    await screen.findByRole('heading', { name: 'Personnages' });
    expect(screen.getByText('Alice Martin')).toBeTruthy();
    expect(screen.getByText('Bob Durand')).toBeTruthy();
    expect(screen.getByText(/Monde en préparation/i)).toBeTruthy();
  });

  it('affiche un monde vide sans personnages', async () => {
    installApi({
      getWorld: vi.fn().mockResolvedValue(makeWorld({ characterCount: 0, generationMode: 'empty' })),
      listCharacters: vi.fn().mockResolvedValue({ characters: [] }),
    });
    render(<App />);
    await screen.findByText('Monde Test');
    fireEvent.click(screen.getByRole('button', { name: /Reprendre/i }));
    await screen.findByText('Aucun personnage');
  });

  it('affiche une erreur si le monde est introuvable', async () => {
    installApi({ getWorld: vi.fn().mockRejectedValue(new Error('Monde introuvable.')) });
    render(<App />);
    await screen.findByText('Monde Test');
    fireEvent.click(screen.getByRole('button', { name: /Reprendre/i }));
    await screen.findByText(/Impossible d'ouvrir ce monde/i);
    expect(screen.getByText(/Monde introuvable/i)).toBeTruthy();
  });

  it('affiche une erreur en cas d’erreur IPC personnages', async () => {
    installApi({ listCharacters: vi.fn().mockRejectedValue(new Error('IPC failure')) });
    render(<App />);
    await screen.findByText('Monde Test');
    fireEvent.click(screen.getByRole('button', { name: /Reprendre/i }));
    await screen.findByText(/Impossible d'ouvrir ce monde/i);
    expect(screen.getByText(/IPC failure/i)).toBeTruthy();
  });

  it('permet de revenir à la liste des personnages depuis la fiche détail', async () => {
    render(<App />);
    await screen.findByText('Monde Test');
    fireEvent.click(screen.getByRole('button', { name: /Reprendre/i }));
    await screen.findByText('Alice Martin');
    fireEvent.click(screen.getByRole('button', { name: /Alice Martin/i }));
    await screen.findByText('Fiche personnage');
    expect(screen.getByText('Trouver un équilibre stable au quotidien')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Retour aux personnages/i }));
    await screen.findByText('Alice Martin');
    expect(screen.queryByText('Fiche personnage')).toBeNull();
  });

  it('permet de revenir au menu principal', async () => {
    const api = installApi();
    render(<App />);
    await screen.findByText('Monde Test');
    fireEvent.click(screen.getByRole('button', { name: /Reprendre/i }));
    await screen.findByRole('heading', { name: 'Personnages' });
    fireEvent.click(screen.getByRole('button', { name: /Menu principal/i }));
    await screen.findByText('Sauvegardes locales');
    expect(api.listWorlds).toHaveBeenCalled();
  });

  it('garde un seul abonnement au statut et ne recharge pas sur un tick identique', async () => {
    let emit: ((status: SimulationStatusView) => void) | null = null;
    const getDecisionHistory = vi.fn().mockResolvedValue([{
      id: 'world-1:1:char-1', characterId: 'char-1', characterName: 'Alice Martin',
      tick: 1, day: 1, hour: 1, previousActionId: null, selectedActionId: 'eat',
      selectionRule: 'score_tiebreak_id', score: 1.25, reason: 'La faim est prioritaire.',
      warningCount: 0,
    }]);
    const api = installApi({
      getDecisionHistory,
      onSimulationStatusChanged: vi.fn((callback: (status: SimulationStatusView) => void) => {
        emit = callback;
        return () => {};
      }),
    });
    const baseStatus: SimulationStatusView = {
      worldId: 'world-1', worldStatus: 'preparation', clock: null, isActive: false,
    };

    render(<App />);
    await screen.findByText('Monde Test');
    fireEvent.click(screen.getByRole('button', { name: /Reprendre/i }));
    await screen.findByRole('heading', { name: 'Décisions récentes' });
    expect(api.onSimulationStatusChanged).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(getDecisionHistory).toHaveBeenCalledTimes(1));

    act(() => emit?.({ ...baseStatus, clock: { ...(baseStatus.clock ?? {}), worldId: 'world-1', tick: 0 } as NonNullable<SimulationStatusView['clock']> }));
    await act(async () => { await Promise.resolve(); });
    expect(getDecisionHistory).toHaveBeenCalledTimes(1);

    await new Promise((resolve) => setTimeout(resolve, 520));
    act(() => emit?.({ ...baseStatus, clock: { ...(baseStatus.clock ?? {}), worldId: 'world-1', tick: 1 } as NonNullable<SimulationStatusView['clock']> }));
    await waitFor(() => expect(getDecisionHistory).toHaveBeenCalledTimes(2));
  });
});
