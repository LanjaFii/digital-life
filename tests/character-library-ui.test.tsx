// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import App from '../src/renderer/App';
import { LibraryView } from '../src/renderer/components/LibraryView';
import { WorldView } from '../src/renderer/components/WorldView';
import type { DigitalLifeApi } from '../src/shared/ipc';
import { EMOTION_KEYS, NEED_KEYS, TRAIT_KEYS, type Character, type CharacterDraft, type CharacterTemplate } from '../src/shared/character';
import type { WorldSummary } from '../src/shared/world';

function makeState(): CharacterDraft {
  return {
    firstName: 'Alice',
    lastName: 'Martin',
    age: 30,
    gender: 'female',
    biography: 'Une acrobate du quotidien.',
    traits: Object.fromEntries(TRAIT_KEYS.map((k) => [k, k === 'sociability' ? 85 : 50])) as unknown as CharacterDraft['traits'],
    emotions: Object.fromEntries(EMOTION_KEYS.map((k) => [k, 50])) as unknown as CharacterDraft['emotions'],
    needs: Object.fromEntries(NEED_KEYS.map((k) => [k, 80])) as unknown as CharacterDraft['needs'],
    goals: [
      { id: 'gp', label: 'Trouver sa place', kind: 'primary' },
      { id: 'gs1', label: 'Se faire des amis', kind: 'secondary' },
      { id: 'gs2', label: 'Explorer la ville', kind: 'secondary' },
    ],
  };
}

function makeTemplate(overrides: Partial<CharacterTemplate> = {}): CharacterTemplate {
  const draft = makeState();
  return {
    id: 'tpl-1',
    ...draft,
    traits: { ...draft.traits },
    emotions: { ...draft.emotions },
    needs: { ...draft.needs },
    goals: draft.goals.map((g) => ({ ...g })),
    createdAt: '2026-01-01T10:00:00.000Z',
    updatedAt: '2026-01-01T10:00:00.000Z',
    ...overrides,
  };
}

function makeWorld(overrides: Partial<WorldSummary> = {}): WorldSummary {
  return {
    id: 'world-1',
    name: 'Monde Test',
    seed: 123,
    characterCount: 0,
    generationMode: 'empty',
    status: 'preparation',
    createdAt: '2026-01-01T10:00:00.000Z',
    updatedAt: '2026-01-01T10:00:00.000Z',
    lastOpenedAt: null,
    ...overrides,
  };
}

function makeInstance(overrides: Partial<Character> = {}): Character {
  const draft = makeState();
  const state = {
    traits: { ...draft.traits },
    emotions: { ...draft.emotions },
    needs: { ...draft.needs },
    goals: draft.goals.map((g) => ({ ...g })),
  };
  return {
    id: 'char-1',
    worldId: 'world-1',
    templateId: 'tpl-1',
    firstName: draft.firstName,
    lastName: draft.lastName,
    age: draft.age,
    gender: draft.gender,
    biography: draft.biography,
    initialState: state,
    currentState: { ...state, traits: { ...state.traits }, emotions: { ...state.emotions }, needs: { ...state.needs }, goals: state.goals.map((g) => ({ ...g })) },
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
    listCharacters: vi.fn().mockResolvedValue({ characters: [] }),
    createCharacter: vi.fn().mockResolvedValue({ character: makeInstance() }),
    updateCharacter: vi.fn().mockResolvedValue(makeInstance()),
    generateRandomDraft: vi.fn().mockResolvedValue({ traits: makeState().traits, emotions: makeState().emotions, needs: makeState().needs }),
    listTemplates: vi.fn().mockResolvedValue({ templates: [] }),
    getTemplate: vi.fn().mockResolvedValue(makeTemplate()),
    createTemplate: vi.fn().mockResolvedValue(makeTemplate()),
    updateTemplate: vi.fn().mockResolvedValue(makeTemplate({ firstName: 'Alicia' })),
    deleteTemplate: vi.fn().mockResolvedValue({ deleted: true }),
    instantiateTemplate: vi.fn().mockResolvedValue(makeInstance()),
    ...overrides,
  };
  Object.defineProperty(window, 'digitalLife', { value: api, configurable: true, writable: true });
  return api;
}

/** Remplit l'identité (étape 1) puis avance jusqu'aux objectifs. */
function fillIdentityAndAdvance({ firstName = 'Alice', lastName = 'Martin' } = {}) {
  fireEvent.change(screen.getByLabelText(/Prénom/), { target: { value: firstName } });
  fireEvent.change(screen.getByLabelText(/^Nom/), { target: { value: lastName } });
  fireEvent.click(screen.getByRole('button', { name: /Suivant/i })); // → Personnalité
  fireEvent.click(screen.getByRole('button', { name: /Suivant/i })); // → Émotions
  fireEvent.click(screen.getByRole('button', { name: /Suivant/i })); // → Besoins
  fireEvent.click(screen.getByRole('button', { name: /Suivant/i })); // → Objectifs
}

function fillGoalsAndAdvance() {
  fireEvent.change(screen.getByLabelText(/Objectif principal/), { target: { value: 'Trouver sa place' } });
  fireEvent.change(screen.getByLabelText(/Objectif secondaire 1/), { target: { value: 'Se faire des amis' } });
  fireEvent.change(screen.getByLabelText(/Objectif secondaire 2/), { target: { value: 'Explorer la ville' } });
  fireEvent.click(screen.getByRole('button', { name: /Suivant/i })); // → Récapitulatif
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe('Navigation et états de la bibliothèque', () => {
  it('navigue du menu principal vers la bibliothèque (test 28)', async () => {
    const api = installApi();
    render(<App />);
    await screen.findByText('Monde Test');
    fireEvent.click(screen.getByRole('button', { name: /Ma bibliothèque/i }));
    await screen.findByRole('heading', { name: 'Ma bibliothèque' });
    expect(api.listTemplates).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /Menu principal/i }));
    await screen.findByText('Sauvegardes locales');
  });

  it('affiche une bibliothèque vide (test 29)', async () => {
    installApi();
    render(<LibraryView onBackToMenu={() => {}} />);
    await screen.findByText('Bibliothèque vide');
    expect(screen.getAllByRole('button', { name: /Créer un modèle/i }).length).toBeGreaterThan(0);
  });

  it('affiche une erreur de récupération', async () => {
    installApi({ listTemplates: vi.fn().mockRejectedValue(new Error('Lecture impossible')) });
    render(<LibraryView onBackToMenu={() => {}} />);
    await screen.findByRole('alert');
    expect(screen.getByText('Lecture impossible')).toBeTruthy();
  });

  it('recherche par nom et affiche aucun résultat', async () => {
    installApi({ listTemplates: vi.fn().mockResolvedValue({ templates: [makeTemplate()] }) });
    render(<LibraryView onBackToMenu={() => {}} />);
    await screen.findByText('Alice Martin');
    fireEvent.change(screen.getByLabelText(/Rechercher un modèle/i), { target: { value: 'alice' } });
    expect(screen.getByText('Alice Martin')).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/Rechercher un modèle/i), { target: { value: 'zzz' } });
    expect(screen.getByText('Aucun résultat')).toBeTruthy();
  });
});

describe('Création et modification de modèle (test 30)', () => {
  it('crée un modèle via le formulaire en 6 étapes', async () => {
    const template = makeTemplate();
    const api = installApi({
      listTemplates: vi.fn()
        .mockResolvedValueOnce({ templates: [] })
        .mockResolvedValue({ templates: [template] }),
    });
    render(<LibraryView onBackToMenu={() => {}} />);
    await screen.findByText('Bibliothèque vide');
    fireEvent.click(screen.getAllByRole('button', { name: /Créer un modèle/i })[0]);
    await screen.findByRole('dialog', { name: 'Créer un modèle' });

    fillIdentityAndAdvance();
    fillGoalsAndAdvance();
    await screen.findByText(/Aperçu personnalité/);
    fireEvent.click(screen.getByRole('button', { name: /Enregistrer dans la bibliothèque/i }));

    await waitFor(() => expect(api.createTemplate).toHaveBeenCalledTimes(1));
    const input = (api.createTemplate as ReturnType<typeof vi.fn>).mock.calls[0][0] as CharacterDraft;
    expect(input.firstName).toBe('Alice');
    expect(input.goals.filter((g) => g.kind === 'primary')).toHaveLength(1);
    expect(input.goals.filter((g) => g.kind === 'secondary')).toHaveLength(2);
    await screen.findByText('Alice Martin');
    expect(screen.queryByRole('dialog', { name: 'Créer un modèle' })).toBeNull();
  });

  it('modifie un modèle existant', async () => {
    const template = makeTemplate();
    const updated = makeTemplate({ firstName: 'Alicia', updatedAt: '2026-02-01T10:00:00.000Z' });
    const api = installApi({
      listTemplates: vi.fn()
        .mockResolvedValueOnce({ templates: [template] })
        .mockResolvedValue({ templates: [updated] }),
      updateTemplate: vi.fn().mockResolvedValue(updated),
    });
    render(<LibraryView onBackToMenu={() => {}} />);
    await screen.findByText('Alice Martin');
    fireEvent.click(screen.getByRole('button', { name: /Modifier/i }));
    await screen.findByRole('dialog', { name: 'Modifier Alice Martin' });

    fireEvent.change(screen.getByLabelText(/Prénom/), { target: { value: 'Alicia' } });
    fireEvent.click(screen.getByRole('button', { name: /Suivant/i }));
    fireEvent.click(screen.getByRole('button', { name: /Suivant/i }));
    fireEvent.click(screen.getByRole('button', { name: /Suivant/i }));
    fireEvent.click(screen.getByRole('button', { name: /Suivant/i }));
    fireEvent.click(screen.getByRole('button', { name: /Suivant/i }));
    fireEvent.click(screen.getByRole('button', { name: /Enregistrer les modifications/i }));

    await waitFor(() => expect(api.updateTemplate).toHaveBeenCalledTimes(1));
    const input = (api.updateTemplate as ReturnType<typeof vi.fn>).mock.calls[0][0] as { id: string; firstName: string };
    expect(input.id).toBe('tpl-1');
    expect(input.firstName).toBe('Alicia');
    await screen.findByText('Alicia Martin');
  });

  it('bloque l’étape identité tant que les champs obligatoires sont vides', async () => {
    installApi();
    render(<LibraryView onBackToMenu={() => {}} />);
    await screen.findByText('Bibliothèque vide');
    fireEvent.click(screen.getAllByRole('button', { name: /Créer un modèle/i })[0]);
    await screen.findByRole('dialog', { name: 'Créer un modèle' });
    expect((screen.getByRole('button', { name: /Suivant/i }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/Prénom/), { target: { value: 'Alice' } });
    fireEvent.change(screen.getByLabelText(/^Nom/), { target: { value: 'Martin' } });
    expect((screen.getByRole('button', { name: /Suivant/i }) as HTMLButtonElement).disabled).toBe(false);
  });
});

describe('Suppression avec confirmation (test 31)', () => {
  it('demande confirmation puis supprime le modèle', async () => {
    const api = installApi({
      listTemplates: vi.fn()
        .mockResolvedValueOnce({ templates: [makeTemplate()] })
        .mockResolvedValue({ templates: [] }),
    });
    render(<LibraryView onBackToMenu={() => {}} />);
    await screen.findByText('Alice Martin');
    fireEvent.click(screen.getByRole('button', { name: /Supprimer/i }));
    await screen.findByRole('dialog', { name: 'Confirmer la suppression' });
    expect(api.deleteTemplate).not.toHaveBeenCalled();
    expect(screen.getByText(/ne seront pas supprimés/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Supprimer définitivement/i }));
    await waitFor(() => expect(api.deleteTemplate).toHaveBeenCalledWith('tpl-1'));
    await screen.findByText('Bibliothèque vide');
  });

  it('annuler ne supprime rien', async () => {
    const api = installApi({ listTemplates: vi.fn().mockResolvedValue({ templates: [makeTemplate()] }) });
    render(<LibraryView onBackToMenu={() => {}} />);
    await screen.findByText('Alice Martin');
    fireEvent.click(screen.getByRole('button', { name: /Supprimer/i }));
    await screen.findByRole('dialog', { name: 'Confirmer la suppression' });
    fireEvent.click(screen.getByRole('button', { name: /Annuler/i }));
    expect(api.deleteTemplate).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog', { name: 'Confirmer la suppression' })).toBeNull();
    expect(screen.getByText('Alice Martin')).toBeTruthy();
  });
});

describe('Utiliser un modèle dans un monde depuis la bibliothèque', () => {
  it('sélectionne un monde et instancie le modèle', async () => {
    const api = installApi({ listTemplates: vi.fn().mockResolvedValue({ templates: [makeTemplate()] }) });
    render(<LibraryView onBackToMenu={() => {}} />);
    await screen.findByText('Alice Martin');
    fireEvent.click(screen.getByRole('button', { name: /Utiliser/i }));
    await screen.findByRole('dialog', { name: 'Utiliser dans un monde' });
    fireEvent.click(screen.getByRole('button', { name: /Monde Test/i }));
    fireEvent.click(screen.getByRole('button', { name: /Ajouter au monde/i }));
    await waitFor(() => expect(api.instantiateTemplate).toHaveBeenCalledWith({ templateId: 'tpl-1', worldId: 'world-1' }));
    await screen.findByText('Personnage ajouté');
  });
});

describe('Monde : ajout depuis la bibliothèque (test 32) et actualisation (test 33)', () => {
  it('sélection → aperçu → confirmation → instance et monde actualisé', async () => {
    const instance = makeInstance();
    const api = installApi({
      listTemplates: vi.fn().mockResolvedValue({ templates: [makeTemplate()] }),
      listCharacters: vi.fn()
        .mockResolvedValueOnce({ characters: [] })
        .mockResolvedValue({ characters: [instance] }),
      getWorld: vi.fn().mockResolvedValue(makeWorld({ characterCount: 1 })),
    });
    render(<WorldView worldId="world-1" onBackToMenu={() => {}} />);
    await screen.findByText('Aucun personnage');
    fireEvent.click(screen.getByRole('button', { name: /Ajouter depuis ma bibliothèque/i }));
    await screen.findByRole('dialog', { name: 'Ajouter depuis la bibliothèque' });
    expect((screen.getByRole('button', { name: /Ajouter au monde/i }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: /Alice Martin/i }));
    // Aperçu du modèle sélectionné.
    expect(screen.getByText(/copie indépendante sera créée/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Ajouter au monde/i }));
    await waitFor(() => expect(api.instantiateTemplate).toHaveBeenCalledWith({ templateId: 'tpl-1', worldId: 'world-1' }));
    // Le monde est actualisé : le personnage apparaît immédiatement.
    await screen.findByText('Alice Martin');
    expect(api.listCharacters).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('dialog', { name: 'Ajouter depuis la bibliothèque' })).toBeNull();
  });

  it('création manuelle : le monde est actualisé immédiatement (test 33)', async () => {
    const instance = makeInstance({ id: 'char-new', templateId: null });
    const api = installApi({
      listCharacters: vi.fn()
        .mockResolvedValueOnce({ characters: [] })
        .mockResolvedValue({ characters: [instance] }),
      createCharacter: vi.fn().mockResolvedValue({ character: instance, template: makeTemplate() }),
    });
    render(<WorldView worldId="world-1" onBackToMenu={() => {}} />);
    await screen.findByText('Aucun personnage');
    fireEvent.click(screen.getByRole('button', { name: /Créer un personnage/i }));
    await screen.findByRole('dialog', { name: 'Créer un personnage' });

    fillIdentityAndAdvance();
    fillGoalsAndAdvance();
    await screen.findByText(/Aperçu personnalité/);
    // Option « monde + bibliothèque » cochée par défaut.
    const checkbox = screen.getByLabelText(/Enregistrer aussi ce modèle/i) as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: /Ajouter au monde/i }));

    await waitFor(() => expect(api.createCharacter).toHaveBeenCalledTimes(1));
    const input = (api.createCharacter as ReturnType<typeof vi.fn>).mock.calls[0][0] as { worldId: string; saveAsTemplate: boolean };
    expect(input.worldId).toBe('world-1');
    expect(input.saveAsTemplate).toBe(true);
    await screen.findByText('Alice Martin');
    expect(api.listCharacters).toHaveBeenCalledTimes(2);
  });

  it('création manuelle : option monde uniquement', async () => {
    const instance = makeInstance({ id: 'char-new', templateId: null });
    const api = installApi({
      listCharacters: vi.fn()
        .mockResolvedValueOnce({ characters: [] })
        .mockResolvedValue({ characters: [instance] }),
      createCharacter: vi.fn().mockResolvedValue({ character: instance }),
    });
    render(<WorldView worldId="world-1" onBackToMenu={() => {}} />);
    await screen.findByText('Aucun personnage');
    fireEvent.click(screen.getByRole('button', { name: /Créer un personnage/i }));
    await screen.findByRole('dialog', { name: 'Créer un personnage' });
    fillIdentityAndAdvance();
    fillGoalsAndAdvance();
    await screen.findByText(/Aperçu personnalité/);
    fireEvent.click(screen.getByLabelText(/Enregistrer aussi ce modèle/i));
    fireEvent.click(screen.getByRole('button', { name: /Ajouter au monde/i }));
    await waitFor(() => expect(api.createCharacter).toHaveBeenCalledTimes(1));
    const input = (api.createCharacter as ReturnType<typeof vi.fn>).mock.calls[0][0] as { saveAsTemplate: boolean };
    expect(input.saveAsTemplate).toBe(false);
    await screen.findByText('Alice Martin');
  });

  it('modification d’une instance depuis le monde', async () => {
    const instance = makeInstance();
    const updated = makeInstance({ firstName: 'Alicia' });
    const api = installApi({
      listCharacters: vi.fn()
        .mockResolvedValueOnce({ characters: [instance] })
        .mockResolvedValue({ characters: [updated] }),
      updateCharacter: vi.fn().mockResolvedValue(updated),
    });
    render(<WorldView worldId="world-1" onBackToMenu={() => {}} />);
    await screen.findByText('Alice Martin');
    fireEvent.click(screen.getByRole('button', { name: /Alice Martin/i }));
    await screen.findByRole('button', { name: /Modifier ce personnage/i });
    fireEvent.click(screen.getByRole('button', { name: /Modifier ce personnage/i }));
    await screen.findByRole('dialog', { name: 'Modifier Alice Martin' });
    fireEvent.change(screen.getByLabelText(/Prénom/), { target: { value: 'Alicia' } });
    for (let i = 0; i < 5; i += 1) fireEvent.click(screen.getByRole('button', { name: /Suivant/i }));
    fireEvent.click(screen.getByRole('button', { name: /Enregistrer les modifications/i }));
    await waitFor(() => expect(api.updateCharacter).toHaveBeenCalledTimes(1));
    const [id, worldId] = (api.updateCharacter as ReturnType<typeof vi.fn>).mock.calls[0] as [string, string];
    expect(id).toBe('char-1');
    expect(worldId).toBe('world-1');
    await screen.findByText('Alicia Martin');
  });
});
