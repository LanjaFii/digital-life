import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Library, Pencil, Plus, RefreshCw, Search, Trash2, UserPlus, Users } from 'lucide-react';
import type { CharacterDraft, CharacterTemplate } from '../../shared/character';
import { CharacterForm } from './CharacterForm';
import { CharacterDetail } from './CharacterDetail';
import { UseInWorldDialog } from './UseInWorldDialog';
import { TRAIT_LABELS, draftFromCharacter } from './character-labels';
import type { CharacterInstance } from '../../shared/character';

interface Props {
  onBackToMenu: () => void;
}

function formatDate(value: string): string {
  try { return new Date(value).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }); } catch { return value; }
}

function genderLabel(gender: CharacterTemplate['gender']): string {
  if (gender === 'female') return 'Femme';
  if (gender === 'male') return 'Homme';
  return 'Non binaire';
}

function templateAsInstance(template: CharacterTemplate): CharacterInstance {
  const state = { traits: template.traits, emotions: template.emotions, needs: template.needs, goals: template.goals };
  return {
    id: template.id,
    worldId: 'library',
    templateId: template.id,
    firstName: template.firstName,
    lastName: template.lastName,
    age: template.age,
    gender: template.gender,
    biography: template.biography,
    initialState: state,
    currentState: state,
    createdAt: template.createdAt,
    updatedAt: template.updatedAt,
  };
}

export function LibraryView({ onBackToMenu }: Props) {
  const [templates, setTemplates] = useState<CharacterTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<CharacterTemplate | null>(null);
  const [detail, setDetail] = useState<CharacterTemplate | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<CharacterTemplate | null>(null);
  const [useInWorld, setUseInWorld] = useState<CharacterTemplate | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await window.digitalLife.listTemplates();
      setTemplates(result.templates);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return templates;
    return templates.filter((t) => `${t.firstName} ${t.lastName}`.toLowerCase().includes(q));
  }, [templates, query]);

  const handleCreate = async (draft: CharacterDraft) => {
    await window.digitalLife.createTemplate(draft);
    setShowCreate(false);
    await load();
  };

  const handleUpdate = async (draft: CharacterDraft) => {
    if (!editing) return;
    await window.digitalLife.updateTemplate({ id: editing.id, ...draft });
    setEditing(null);
    await load();
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    setBusyId(confirmDelete.id);
    try {
      await window.digitalLife.deleteTemplate(confirmDelete.id);
      setConfirmDelete(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  };

  if (detail) {
    return (
      <div className="library-view">
        <div className="topbar">
          <button type="button" className="button ghost" onClick={() => setDetail(null)}><ArrowLeft size={16} /> Retour à la bibliothèque</button>
          <button type="button" className="button ghost" onClick={onBackToMenu}><ArrowLeft size={16} /> Menu principal</button>
        </div>
        <CharacterDetail character={templateAsInstance(detail)} onBack={() => setDetail(null)} />
      </div>
    );
  }

  return (
    <div className="library-view">
      <div className="topbar">
        <button type="button" className="button ghost" onClick={onBackToMenu}><ArrowLeft size={16} /> Menu principal</button>
        <div className="inline-actions">
          <button type="button" className="button ghost" onClick={() => void load()}><RefreshCw size={15} /> Actualiser</button>
          <button type="button" className="button primary" onClick={() => setShowCreate(true)}><Plus size={15} /> Créer un modèle</button>
        </div>
      </div>

      <section className="panel world-hero">
        <div>
          <p className="eyebrow"><Library size={12} /> Collection personnelle</p>
          <h2 className="world-title">Ma bibliothèque</h2>
          <p className="subtitle">Modèles réutilisables. Les instances dans les mondes sont indépendantes.</p>
        </div>
        <div className="library-search">
          <Search size={16} />
          <input placeholder="Rechercher par prénom ou nom…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Rechercher un modèle" />
        </div>
      </section>

      {error ? <div className="error-banner" role="alert">{error}</div> : null}

      <section className="panel">
        <div className="panel-header">
          <div><p className="eyebrow">Modèles</p><h2>Personnages enregistrés</h2></div>
          <span className="count-chip">{filtered.length}</span>
        </div>

        {loading ? (
          <div className="empty-state"><div className="loader" aria-hidden="true" />Chargement de la bibliothèque…</div>
        ) : templates.length === 0 ? (
          <div className="empty-state">
            <Users size={40} strokeWidth={1.2} />
            <h3>Bibliothèque vide</h3>
            <p>Crée ton premier modèle de personnage pour le réutiliser dans plusieurs mondes.</p>
            <button type="button" className="button primary" onClick={() => setShowCreate(true)}><Plus size={15} /> Créer un modèle</button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-state"><Search size={36} strokeWidth={1.2} /><h3>Aucun résultat</h3><p>Aucun modèle ne correspond à « {query} ».</p></div>
        ) : (
          <div className="character-grid">
            {filtered.map((template) => {
              const traits = Object.entries(template.traits).sort((a, b) => b[1] - a[1]).slice(0, 3);
              return (
                <div key={template.id} className="character-card library-card">
                  <div className="character-card-head">
                    <div>
                      <h3>{template.firstName} {template.lastName}</h3>
                      <p className="character-sub">{genderLabel(template.gender)} · {template.age} ans</p>
                    </div>
                  </div>
                  <p className="character-bio">{template.biography || 'Aucune biographie.'}</p>
                  <div className="trait-pills">
                    {traits.map(([key, value]) => <span key={key} className="trait-pill">{TRAIT_LABELS[key] ?? key} <strong>{value}</strong></span>)}
                  </div>
                  <p className="library-dates">Créé le {formatDate(template.createdAt)} · Modifié le {formatDate(template.updatedAt)}</p>
                  <div className="library-actions">
                    <button type="button" className="button ghost" onClick={() => setDetail(template)}>Détail</button>
                    <button type="button" className="button ghost" onClick={() => setEditing(template)}><Pencil size={14} /> Modifier</button>
                    <button type="button" className="button ghost" onClick={() => setUseInWorld(template)}><UserPlus size={14} /> Utiliser</button>
                    <button type="button" className="button danger" onClick={() => setConfirmDelete(template)} disabled={busyId === template.id}><Trash2 size={14} /> Supprimer</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {showCreate ? (
        <CharacterForm mode="create" context="library" title="Créer un modèle" submitLabel="Enregistrer dans la bibliothèque" onCancel={() => setShowCreate(false)} onSubmit={(draft) => handleCreate(draft)} />
      ) : null}

      {editing ? (
        <CharacterForm mode="edit" context="library" title={`Modifier ${editing.firstName} ${editing.lastName}`} initialDraft={draftFromCharacter(editing)} submitLabel="Enregistrer les modifications" onCancel={() => setEditing(null)} onSubmit={(draft) => handleUpdate(draft)} />
      ) : null}

      {useInWorld ? (
        <UseInWorldDialog template={useInWorld} onClose={() => setUseInWorld(null)} />
      ) : null}

      {confirmDelete ? (
        <div className="dialog-backdrop" role="dialog" aria-modal="true" aria-label="Confirmer la suppression">
          <div className="dialog dialog-small">
            <div className="dialog-header"><div><p className="eyebrow">Action destructive</p><h2>Supprimer le modèle</h2></div></div>
            <div className="dialog-body">
              <p>Supprimer <strong>{confirmDelete.firstName} {confirmDelete.lastName}</strong> de la bibliothèque ?</p>
              <p className="muted">Les personnages déjà créés dans les mondes ne seront pas supprimés.</p>
              <div className="dialog-actions">
                <button type="button" className="button ghost" onClick={() => setConfirmDelete(null)} disabled={busyId === confirmDelete.id}>Annuler</button>
                <button type="button" className="button danger solid" onClick={() => void handleDelete()} disabled={busyId === confirmDelete.id}>Supprimer définitivement</button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
