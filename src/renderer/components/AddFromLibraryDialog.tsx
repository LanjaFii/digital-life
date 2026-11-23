import { useCallback, useEffect, useState } from 'react';
import { Library, UserPlus } from 'lucide-react';
import type { CharacterTemplate } from '../../shared/character';
import { TRAIT_LABELS } from './character-labels';

interface Props {
  worldId: string;
  onClose: () => void;
  onAdded: () => void | Promise<void>;
}

export function AddFromLibraryDialog({ worldId, onClose, onAdded }: Props) {
  const [templates, setTemplates] = useState<CharacterTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<CharacterTemplate | null>(null);
  const [busy, setBusy] = useState(false);

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

  const confirm = async () => {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      await window.digitalLife.instantiateTemplate({ templateId: selected.id, worldId });
      await onAdded();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="dialog-backdrop" role="dialog" aria-modal="true" aria-label="Ajouter depuis la bibliothèque">
      <div className="dialog dialog-wide">
        <div className="dialog-header">
          <div><p className="eyebrow"><Library size={12} /> Bibliothèque</p><h2>Ajouter depuis ma bibliothèque</h2></div>
          <button type="button" className="button ghost" onClick={onClose} disabled={busy}>Fermer</button>
        </div>
        {error ? <div className="error-banner" role="alert">{error}</div> : null}
        <div className="dialog-body library-picker">
          {loading ? (
            <div className="empty-state"><div className="loader" aria-hidden="true" />Chargement…</div>
          ) : templates.length === 0 ? (
            <div className="empty-state"><Library size={36} /><h3>Bibliothèque vide</h3><p>Enregistre d’abord un modèle dans « Ma bibliothèque ».</p></div>
          ) : (
            <>
              <div className="library-picker-list">
                {templates.map((t) => (
                  <button key={t.id} type="button" className={`library-picker-item ${selected?.id === t.id ? 'active' : ''}`} onClick={() => setSelected(t)}>
                    <strong>{t.firstName} {t.lastName}</strong>
                    <span className="muted">{t.age} ans</span>
                  </button>
                ))}
              </div>
              <div className="library-picker-preview panel">
                {selected ? (
                  <>
                    <h3>{selected.firstName} {selected.lastName}</h3>
                    <p className="muted">{selected.age} ans · {selected.gender === 'female' ? 'Femme' : selected.gender === 'male' ? 'Homme' : 'Non binaire'}</p>
                    <p>{selected.biography || 'Aucune biographie.'}</p>
                    <div className="trait-pills">
                      {Object.entries(selected.traits).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([key, value]) => (
                        <span key={key} className="trait-pill">{TRAIT_LABELS[key] ?? key} <strong>{value}</strong></span>
                      ))}
                    </div>
                    <p className="muted">Une copie indépendante sera créée dans ce monde.</p>
                  </>
                ) : (
                  <p className="muted">Sélectionne un modèle pour voir l’aperçu.</p>
                )}
              </div>
            </>
          )}
        </div>
        <div className="dialog-actions">
          <button type="button" className="button ghost" onClick={onClose} disabled={busy}>Annuler</button>
          <button type="button" className="button primary" onClick={() => void confirm()} disabled={!selected || busy}>
            <UserPlus size={15} /> {busy ? 'Ajout…' : 'Ajouter au monde'}
          </button>
        </div>
      </div>
    </div>
  );
}
