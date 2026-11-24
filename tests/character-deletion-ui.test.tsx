// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { WorldView } from '../src/renderer/components/WorldView';
import type { DigitalLifeApi } from '../src/shared/ipc';
import { EMOTION_KEYS, NEED_KEYS, TRAIT_KEYS, type Character } from '../src/shared/character';
import type { WorldSummary } from '../src/shared/world';

function makeWorld(overrides: Partial<WorldSummary> = {}): WorldSummary {
  return {
    id: 'world-1',
    name: 'Monde Alpha',
    seed: 42,
    characterCount: 2,
    generationMode: 'empty',
    status: 'preparation',
    createdAt: '2026-01-01T10:00:00.000Z',
    updatedAt: '2026-01-01T10:00:00.000Z',
    lastOpenedAt: null,
    ...overrides,
  };
}

function makeCharacter(overrides: Partial<Character> = {}): Character {
  const state = {
    traits: Object.fromEntries(TRAIT_KEYS.map((k) => [k, 50])) as unknown as Character['currentState']['traits'],
    emotions: Object.fromEntries(EMOTION_KEYS.map((k) => [k, 50])) as unknown as Character['currentState']['emotions'],
    needs: Object.fromEntries(NEED_KEYS.map((k) => [k, 80])) as unknown as Character['currentState']['needs'],
    goals: [
      { id: 'gp', label: 'Trouver sa place', kind: 'primary' as const },
      { id: 'gs1', label: 'Se faire des amis', kind: 'secondary' as const },
      { id: 'gs2', label: 'Explorer la ville', kind: 'secondary' as const },
    ],
  };
  return {
    id: 'char-1',
    worldId: 'world-1',
    templateId: 'tpl-1',
    firstName: 'Alice',
    lastName: 'Martin',
    age: 30,
    gender: 'female',
    biography: 'Une acrobate du quotidien.',
    initialState: state,
    currentState: state,
    createdAt: '2026-01-01T10:00:00.000Z',
    updatedAt: '2026-01-01T10:00:00.000Z',
    ...overrides,
  };
}

/** Deux personnages au départ ; après suppression, il n'en reste qu'un. */
function installApi(overrides: Partial<DigitalLifeApi> = {}): DigitalLifeApi {
  const api: DigitalLifeApi = {
    getAppInfo: vi.fn(),
    getDiagnostic: vi.fn(),
    listWorlds: vi.fn(),
    createWorld: vi.fn(),
    deleteWorld: vi.fn(),
    getWorld: vi.fn()
      .mockResolvedValueOnce(makeWorld({ characterCount: 2 }))
      .mockResolvedValue(makeWorld({ characterCount: 1 })),
    listCharacters: vi.fn()
      .mockResolvedValueOnce({ characters: [makeCharacter(), makeCharacter({ id: 'char-2', firstName: 'Bob', lastName: 'Durand' })] })
      .mockResolvedValue({ characters: [makeCharacter({ id: 'char-2', firstName: 'Bob', lastName: 'Durand' })] }),
    createCharacter: vi.fn(),
    updateCharacter: vi.fn(),
    deleteCharacter: vi.fn().mockResolvedValue({ deleted: true }),
    generateRandomDraft: vi.fn(),
    listTemplates: vi.fn(),
    getTemplate: vi.fn(),
    createTemplate: vi.fn(),
    updateTemplate: vi.fn(),
    deleteTemplate: vi.fn(),
    instantiateTemplate: vi.fn(),
    simulationGetStatus: vi.fn().mockResolvedValue({ worldId: 'world-1', worldStatus: 'preparation', clock: null, isActive: false }),
    simulationStart: vi.fn().mockResolvedValue({ worldId: 'world-1', worldStatus: 'simulation_running', clock: { worldId: 'world-1', tick: 0, day: 1, hour: 0, status: 'running', speed: 1, rngState: 1, lastProcessedOrder: 0, createdAt: '', updatedAt: '' }, isActive: true }),
    simulationPause: vi.fn(),
    simulationResume: vi.fn(),
    simulationStep: vi.fn(),
    simulationSetSpeed: vi.fn(),
    simulationStop: vi.fn(),
    onSimulationStatusChanged: vi.fn().mockReturnValue(() => {}),
    ...overrides,
  };
  Object.defineProperty(window, 'digitalLife', { value: api, configurable: true, writable: true });
  return api;
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => cleanup());

describe('Suppression d’instance depuis la carte du monde', () => {
  it('affiche une confirmation identifiant le personnage et le monde, puis annule', async () => {
    const api = installApi();
    render(<WorldView worldId="world-1" onBackToMenu={() => {}} />);
    await screen.findByText('Alice Martin');

    expect(screen.getAllByRole('button', { name: /^Supprimer$/i })).toHaveLength(2);
    fireEvent.click(screen.getAllByRole('button', { name: /^Supprimer$/i })[0]);

    const dialog = await screen.findByRole('dialog', { name: 'Confirmer la suppression du personnage' });
    expect(dialog.textContent).toContain('Alice Martin');
    expect(dialog.textContent).toContain('Monde Alpha');
    expect(dialog.textContent).toContain('définitive pour ce monde');
    expect(dialog.textContent).toContain('bibliothèque');
    expect(api.deleteCharacter).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /^Annuler$/i }));
    expect(screen.queryByRole('dialog', { name: 'Confirmer la suppression du personnage' })).toBeNull();
    expect(api.deleteCharacter).not.toHaveBeenCalled();
    expect(screen.getByText('Alice Martin')).toBeTruthy();
  });

  it('confirme : supprime l’instance, actualise la liste et le compteur, affiche une notification', async () => {
    const api = installApi();
    render(<WorldView worldId="world-1" onBackToMenu={() => {}} />);
    await screen.findByText('Alice Martin');
    expect(screen.getAllByText('2').length).toBeGreaterThan(0);

    fireEvent.click(screen.getAllByRole('button', { name: /^Supprimer$/i })[0]);
    await screen.findByRole('dialog', { name: 'Confirmer la suppression du personnage' });
    fireEvent.click(screen.getByRole('button', { name: /Supprimer définitivement/i }));

    await waitFor(() => expect(api.deleteCharacter).toHaveBeenCalledWith('char-1', 'world-1'));
    await screen.findByRole('status');
    expect(screen.getByRole('status').textContent).toContain('Alice Martin');
    await waitFor(() => expect(screen.queryByText('Alice Martin')).toBeNull());
    expect(screen.getByText('Bob Durand')).toBeTruthy();
    expect((api.listCharacters as ReturnType<typeof vi.fn>).mock.calls.length).toBe(2);
    expect((api.getWorld as ReturnType<typeof vi.fn>).mock.calls.length).toBe(2);
    expect(screen.queryByText('2')).toBeNull();
    expect(screen.getAllByText('1').length).toBeGreaterThan(0);
  });

  it('affiche l’erreur IPC sans casser l’écran ni supprimer localement', async () => {
    const api = installApi({ deleteCharacter: vi.fn().mockRejectedValue(new Error('IPC indisponible')) });
    render(<WorldView worldId="world-1" onBackToMenu={() => {}} />);
    await screen.findByText('Alice Martin');
    fireEvent.click(screen.getAllByRole('button', { name: /^Supprimer$/i })[0]);
    await screen.findByRole('dialog', { name: 'Confirmer la suppression du personnage' });
    fireEvent.click(screen.getByRole('button', { name: /Supprimer définitivement/i }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('IPC indisponible');
    expect(screen.queryByRole('dialog', { name: 'Confirmer la suppression du personnage' })).toBeNull();
    expect(screen.getByText('Alice Martin')).toBeTruthy();
    expect(screen.queryByRole('status')).toBeNull();
  });
});

describe('Suppression depuis la fiche détaillée', () => {
  it('la fiche propose la suppression et revient à la liste après confirmation', async () => {
    const api = installApi();
    render(<WorldView worldId="world-1" onBackToMenu={() => {}} />);
    await screen.findByText('Alice Martin');

    fireEvent.click(screen.getByRole('button', { name: /Alice Martin/ }));
    await screen.findByText('Fiche personnage');
    fireEvent.click(screen.getByRole('button', { name: /Supprimer ce personnage/i }));
    const dialog = await screen.findByRole('dialog', { name: 'Confirmer la suppression du personnage' });
    expect(dialog.textContent).toContain('Alice Martin');

    fireEvent.click(screen.getByRole('button', { name: /Supprimer définitivement/i }));
    await waitFor(() => expect(api.deleteCharacter).toHaveBeenCalledWith('char-1', 'world-1'));
    // Retour automatique à la liste des personnages.
    await waitFor(() => expect(screen.queryByText('Fiche personnage')).toBeNull());
    expect(screen.getByRole('heading', { name: 'Personnages' })).toBeTruthy();
    expect(screen.getByText('Bob Durand')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toContain('supprimé');
  });

  it('annuler depuis la fiche ne supprime rien et conserve la fiche ouverte', async () => {
    const api = installApi();
    render(<WorldView worldId="world-1" onBackToMenu={() => {}} />);
    await screen.findByText('Alice Martin');
    fireEvent.click(screen.getByRole('button', { name: /Alice Martin/ }));
    await screen.findByText('Fiche personnage');
    fireEvent.click(screen.getByRole('button', { name: /Supprimer ce personnage/i }));
    await screen.findByRole('dialog', { name: 'Confirmer la suppression du personnage' });
    fireEvent.click(screen.getByRole('button', { name: /^Annuler$/i }));

    expect(screen.queryByRole('dialog', { name: 'Confirmer la suppression du personnage' })).toBeNull();
    expect(screen.getByText('Fiche personnage')).toBeTruthy();
    expect(api.deleteCharacter).not.toHaveBeenCalled();
  });
});
