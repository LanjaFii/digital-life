import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Calendar, CheckCircle2, Dna, Hash, Users, AlertTriangle, RefreshCw, Plus, Library, Pencil, Trash2, X } from 'lucide-react';
import type { Character, CharacterDraft } from '../../shared/character';
import type { WorldSummary } from '../../shared/world';
import { CharacterDetail } from './CharacterDetail';
import { CharacterForm } from './CharacterForm';
import { AddFromLibraryDialog } from './AddFromLibraryDialog';
import { ConfirmDeleteCharacterDialog } from './ConfirmDeleteCharacterDialog';
import { EMOTION_LABELS, TRAIT_LABELS, draftFromCharacter } from './character-labels';

interface Props {
  worldId: string;
  onBackToMenu: () => void;
}

function formatDate(value: string): string {
  try {
    return new Date(value).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return value;
  }
}

function genderLabel(gender: Character['gender']): string {
  if (gender === 'female') return 'Femme';
  if (gender === 'male') return 'Homme';
  return 'Non binaire';
}

function dominantEmotion(character: Character): { key: string; label: string; value: number } {
  const entries = Object.entries(character.currentState.emotions);
  entries.sort((a, b) => b[1] - a[1]);
  const [key, value] = entries[0] ?? ['happiness', 0];
  return { key, label: EMOTION_LABELS[key] ?? key, value };
}

function representativeTraits(character: Character): Array<{ key: string; label: string; value: number }> {
  return Object.entries(character.currentState.traits)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([key, value]) => ({ key, label: TRAIT_LABELS[key] ?? key, value }));
}

export function WorldView({ worldId, onBackToMenu }: Props) {
  const [world, setWorld] = useState<WorldSummary | null>(null);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showLibraryPicker, setShowLibraryPicker] = useState(false);
  const [editingCharacter, setEditingCharacter] = useState<Character | null>(null);
  const [confirmDeleteCharacter, setConfirmDeleteCharacter] = useState<Character | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextWorld, charsResult] = await Promise.all([
        window.digitalLife.getWorld(worldId),
        window.digitalLife.listCharacters(worldId),
      ]);
      setWorld(nextWorld);
      setCharacters(charsResult.characters);
      setSelectedCharacterId((current) => (current && charsResult.characters.some((c) => c.id === current) ? current : null));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setWorld(null);
      setCharacters([]);
    } finally {
      setLoading(false);
    }
  }, [worldId]);

  useEffect(() => {
    void load();
  }, [load]);

  const selectedCharacter = selectedCharacterId ? characters.find((c) => c.id === selectedCharacterId) ?? null : null;

  const handleCreate = async (draft: CharacterDraft, saveAsTemplate: boolean) => {
    await window.digitalLife.createCharacter({ worldId, ...draft, saveAsTemplate });
    setShowCreate(false);
    await load();
  };

  const handleUpdate = async (draft: CharacterDraft) => {
    if (!editingCharacter) return;
    await window.digitalLife.updateCharacter(editingCharacter.id, worldId, { id: editingCharacter.id, worldId, ...draft });
    setEditingCharacter(null);
    await load();
  };

  const handleDeleteCharacter = async () => {
    if (!confirmDeleteCharacter) return;
    const target = confirmDeleteCharacter;
    setDeletingId(target.id);
    setActionError(null);
    setNotice(null);
    try {
      const result = await window.digitalLife.deleteCharacter(target.id, worldId);
      setConfirmDeleteCharacter(null);
      // Si la fiche du personnage supprimé était ouverte, revenir à la liste.
      if (selectedCharacterId === target.id) setSelectedCharacterId(null);
      await load();
      if (result.deleted) setNotice(`${target.firstName} ${target.lastName} a été supprimé de ce monde.`);
    } catch (cause) {
      setConfirmDeleteCharacter(null);
      setActionError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setDeletingId(null);
    }
  };

  const banners = (
    <>
      {notice ? (
        <div className="notice success" role="status">
          <CheckCircle2 size={16} /> <span>{notice}</span>
          <button type="button" className="banner-close" aria-label="Fermer la notification" onClick={() => setNotice(null)}><X size={14} /></button>
        </div>
      ) : null}
      {actionError ? (
        <div className="error-banner" role="alert">
          <AlertTriangle size={16} /> <span>{actionError}</span>
          <button type="button" className="banner-close" aria-label="Fermer l'erreur" onClick={() => setActionError(null)}><X size={14} /></button>
        </div>
      ) : null}
    </>
  );

  const confirmDialog = confirmDeleteCharacter ? (
    <ConfirmDeleteCharacterDialog
      character={confirmDeleteCharacter}
      worldName={world?.name ?? 'ce monde'}
      busy={deletingId === confirmDeleteCharacter.id}
      onConfirm={() => void handleDeleteCharacter()}
      onCancel={() => setConfirmDeleteCharacter(null)}
    />
  ) : null;

  if (loading) {
    return (
      <div className="world-view">
        <div className="topbar">
          <button type="button" className="button ghost" onClick={onBackToMenu}><ArrowLeft size={16} /> Menu principal</button>
        </div>
        <div className="panel empty-state"><div className="loader" aria-hidden="true" />Chargement du monde…</div>
      </div>
    );
  }

  if (error || !world) {
    return (
      <div className="world-view">
        <div className="topbar">
          <button type="button" className="button ghost" onClick={onBackToMenu}><ArrowLeft size={16} /> Menu principal</button>
        </div>
        <div className="panel empty-state error-state" role="alert">
          <AlertTriangle size={34} />
          <h3>Impossible d'ouvrir ce monde</h3>
          <p>{error ?? 'Monde introuvable.'}</p>
          <div className="inline-actions">
            <button type="button" className="button ghost" onClick={() => void load()}><RefreshCw size={15} /> Réessayer</button>
            <button type="button" className="button primary" onClick={onBackToMenu}>Retour au menu</button>
          </div>
        </div>
      </div>
    );
  }

  if (selectedCharacter) {
    return (
      <div className="world-view">
        <div className="topbar">
          <button type="button" className="button ghost" onClick={onBackToMenu}><ArrowLeft size={16} /> Menu principal</button>
          <button type="button" className="button ghost" onClick={() => setEditingCharacter(selectedCharacter)}><Pencil size={15} /> Modifier ce personnage</button>
        </div>
        {banners}
        <CharacterDetail
          character={selectedCharacter}
          onBack={() => setSelectedCharacterId(null)}
          onDelete={() => setConfirmDeleteCharacter(selectedCharacter)}
        />
        {editingCharacter ? (
          <CharacterForm mode="edit" context="world" title={`Modifier ${editingCharacter.firstName} ${editingCharacter.lastName}`} initialDraft={draftFromCharacter(editingCharacter)} submitLabel="Enregistrer les modifications" onCancel={() => setEditingCharacter(null)} onSubmit={(draft) => handleUpdate(draft)} />
        ) : null}
        {confirmDialog}
      </div>
    );
  }

  return (
    <div className="world-view">
      <div className="topbar">
        <button type="button" className="button ghost" onClick={onBackToMenu}><ArrowLeft size={16} /> Menu principal</button>
        <div className="inline-actions">
          <button type="button" className="button ghost" onClick={() => void load()}><RefreshCw size={15} /> Actualiser</button>
          <button type="button" className="button ghost" onClick={() => setShowLibraryPicker(true)}><Library size={15} /> Ajouter depuis ma bibliothèque</button>
          <button type="button" className="button primary" onClick={() => setShowCreate(true)}><Plus size={15} /> Créer un personnage</button>
        </div>
      </div>

      {banners}

      <section className="panel world-hero">
        <div>
          <p className="eyebrow">Monde sauvegardé</p>
          <h2 className="world-title">{world.name}</h2>
          <p className="subtitle">Monde en préparation : personnages modifiables. Le moteur de simulation n'est pas encore actif.</p>
        </div>
        <div className="world-info-grid">
          <div className="info-tile"><span className="info-icon"><Calendar size={15} /></span><div><p className="info-label">Création</p><p className="info-value">{formatDate(world.createdAt)}</p></div></div>
          <div className="info-tile"><span className="info-icon"><Hash size={15} /></span><div><p className="info-label">Seed</p><p className="info-value">{world.seed}</p></div></div>
          <div className="info-tile"><span className="info-icon"><Dna size={15} /></span><div><p className="info-label">Génération</p><p className="info-value">{world.generationMode === 'random' ? 'Aléatoire' : 'Vide'}</p></div></div>
          <div className="info-tile"><span className="info-icon"><Users size={15} /></span><div><p className="info-label">Personnages</p><p className="info-value">{characters.length}</p></div></div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Population</p>
            <h2>Personnages</h2>
          </div>
          <span className="count-chip">{characters.length}</span>
        </div>

        {characters.length === 0 ? (
          <div className="empty-state">
            <Users size={40} strokeWidth={1.2} />
            <h3>Aucun personnage</h3>
            <p>Ce monde est vide pour l'instant. Crée un personnage ou ajoute un modèle depuis ta bibliothèque.</p>
          </div>
        ) : (
          <div className="character-grid">
            {characters.map((character) => {
              const dominant = dominantEmotion(character);
              const traits = representativeTraits(character);
              return (
                <div key={character.id} className="character-card">
                  <button
                    type="button"
                    className="character-card-open"
                    onClick={() => setSelectedCharacterId(character.id)}
                  >
                    <div className="character-card-head">
                      <div>
                        <h3>{character.firstName} {character.lastName}</h3>
                        <p className="character-sub">{genderLabel(character.gender)} · {character.age} ans</p>
                      </div>
                      <span className="emotion-chip">{dominant.label} {dominant.value}</span>
                    </div>
                    <p className="character-bio">{character.biography}</p>
                    <div className="trait-pills">
                      {traits.map((trait) => (
                        <span key={trait.key} className="trait-pill">{trait.label} <strong>{trait.value}</strong></span>
                      ))}
                    </div>
                  </button>
                  <div className="character-card-actions">
                    <button type="button" className="button danger" onClick={() => setConfirmDeleteCharacter(character)}>
                      <Trash2 size={14} /> Supprimer
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {showCreate ? (
        <CharacterForm mode="create" context="world" title="Créer un personnage" submitLabel="Ajouter au monde" onCancel={() => setShowCreate(false)} onSubmit={(draft, saveAsTemplate) => handleCreate(draft, saveAsTemplate)} />
      ) : null}

      {showLibraryPicker ? (
        <AddFromLibraryDialog worldId={worldId} onClose={() => setShowLibraryPicker(false)} onAdded={() => load()} />
      ) : null}

      {confirmDialog}
    </div>
  );
}
