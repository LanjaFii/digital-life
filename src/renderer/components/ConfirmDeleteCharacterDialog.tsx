import { AlertTriangle } from 'lucide-react';
import type { Character } from '../../shared/character';

interface Props {
  character: Character;
  worldName: string;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Confirmation de suppression définitive d'une seule instance de personnage. */
export function ConfirmDeleteCharacterDialog({ character, worldName, busy, onConfirm, onCancel }: Props) {
  return (
    <div className="dialog-backdrop" role="dialog" aria-modal="true" aria-label="Confirmer la suppression du personnage">
      <div className="dialog dialog-small">
        <div className="dialog-header">
          <div>
            <p className="eyebrow"><AlertTriangle size={12} /> Action destructive</p>
            <h2>Supprimer le personnage</h2>
          </div>
        </div>
        <div className="dialog-body">
          <p>
            Supprimer <strong>{character.firstName} {character.lastName}</strong> (ID {character.id.slice(0, 8)}) du monde <strong>{worldName}</strong> ?
          </p>
          <p className="muted">
            Cette suppression est définitive pour ce monde. Le modèle original de la bibliothèque
            et les personnages des autres mondes ne seront pas touchés.
          </p>
          <div className="dialog-actions">
            <button type="button" className="button ghost" onClick={onCancel} disabled={busy}>Annuler</button>
            <button type="button" className="button danger solid" onClick={onConfirm} disabled={busy}>
              {busy ? 'Suppression…' : 'Supprimer définitivement'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
