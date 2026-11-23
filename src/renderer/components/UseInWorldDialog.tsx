import { useCallback, useEffect, useState } from 'react';
import { Globe2, UserPlus } from 'lucide-react';
import type { CharacterTemplate } from '../../shared/character';
import type { WorldSummary } from '../../shared/world';

interface Props {
  template: CharacterTemplate;
  onClose: () => void;
}

/** Choisit un monde puis instancie le modèle (copie indépendante). */
export function UseInWorldDialog({ template, onClose }: Props) {
  const [worlds, setWorlds] = useState<WorldSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedWorldId, setSelectedWorldId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await window.digitalLife.listWorlds();
      setWorlds(result.worlds);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const confirm = async () => {
    if (!selectedWorldId) return;
    setBusy(true);
    setError(null);
    try {
      await window.digitalLife.instantiateTemplate({ templateId: template.id, worldId: selectedWorldId });
      const world = worlds.find((w) => w.id === selectedWorldId);
      setDone(world?.name ?? 'le monde');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="dialog-backdrop" role="dialog" aria-modal="true" aria-label="Utiliser dans un monde">
      <div className="dialog">
        <div className="dialog-header">
          <div>
            <p className="eyebrow"><Globe2 size={12} /> Instanciation</p>
            <h2>Utiliser {template.firstName} {template.lastName} dans un monde</h2>
          </div>
          <button type="button" className="button ghost" onClick={onClose} disabled={busy}>Fermer</button>
        </div>
        {error ? <div className="error-banner" role="alert">{error}</div> : null}
        <div className="dialog-body">
          {done ? (
            <div className="empty-state">
              <UserPlus size={36} strokeWidth={1.2} />
              <h3>Personnage ajouté</h3>
              <p>Une copie indépendante de {template.firstName} a été créée dans « {done} ».</p>
            </div>
          ) : loading ? (
            <div className="empty-state"><div className="loader" aria-hidden="true" />Chargement des mondes…</div>
          ) : worlds.length === 0 ? (
            <div className="empty-state">
              <Globe2 size={36} strokeWidth={1.2} />
              <h3>Aucun monde</h3>
              <p>Crée d’abord un monde depuis le menu principal.</p>
            </div>
          ) : (
            <>
              <p className="muted">Choisis le monde qui recevra une copie indépendante du modèle.</p>
              <div className="library-picker-list">
                {worlds.map((w) => (
                  <button
                    key={w.id}
                    type="button"
                    className={`library-picker-item ${selectedWorldId === w.id ? 'active' : ''}`}
                    onClick={() => setSelectedWorldId(w.id)}
                    disabled={w.status === 'simulation_started'}
                  >
                    <strong>{w.name}</strong>
                    <span className="muted">{w.characterCount} personnage{w.characterCount > 1 ? 's' : ''}</span>
                  </button>
                ))}
              </div>
            </>
          )}
          <div className="dialog-actions">
            <button type="button" className="button ghost" onClick={onClose} disabled={busy}>{done ? 'Fermer' : 'Annuler'}</button>
            {!done ? (
              <button type="button" className="button primary" onClick={() => void confirm()} disabled={!selectedWorldId || busy}>
                <UserPlus size={15} /> {busy ? 'Ajout…' : 'Ajouter au monde'}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
