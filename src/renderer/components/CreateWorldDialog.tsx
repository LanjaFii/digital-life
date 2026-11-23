import { useState, type FormEvent } from 'react';
import { Dices, Sparkles, X } from 'lucide-react';
import type { CreateWorldInput, WorldGenerationMode } from '../../shared/world';

interface Props {
  onClose: () => void;
  onCreate: (input: CreateWorldInput) => Promise<void>;
}

function randomSeed(): number {
  return Math.floor(Math.random() * 2_147_483_647);
}

export function CreateWorldDialog({ onClose, onCreate }: Props) {
  const [name, setName] = useState('');
  const [seedMode, setSeedMode] = useState<'random' | 'custom'>('random');
  const [seed, setSeed] = useState<number>(randomSeed());
  const [generationMode, setGenerationMode] = useState<WorldGenerationMode>('random');
  const [characterCount, setCharacterCount] = useState(5);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await onCreate({
        name: name.trim(),
        seed: seedMode === 'custom' ? seed : randomSeed(),
        generationMode,
        characterCount: generationMode === 'random' ? characterCount : 0,
      });
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="dialog-backdrop" role="dialog" aria-modal="true" aria-label="Créer un monde">
      <div className="dialog">
        <div className="dialog-header">
          <div>
            <p className="eyebrow">Nouvelle simulation</p>
            <h2>Créer un monde</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Fermer">
            <X size={18} />
          </button>
        </div>

        <form className="dialog-body" onSubmit={handleSubmit}>
          <label className="field">
            <span>Nom du monde</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              placeholder="Ex. Cirque des Échos"
              required
            />
          </label>

          <div className="field">
            <span>Seed du monde</span>
            <div className="segmented">
              <button type="button" className={seedMode === 'random' ? 'active' : ''} onClick={() => setSeedMode('random')}>
                <Dices size={14} /> Aléatoire
              </button>
              <button type="button" className={seedMode === 'custom' ? 'active' : ''} onClick={() => setSeedMode('custom')}>
                Personnalisée
              </button>
            </div>
            {seedMode === 'custom' ? (
              <input
                type="number"
                value={seed}
                onChange={(e) => setSeed(Number(e.target.value))}
                aria-label="Seed personnalisée"
              />
            ) : (
              <p className="field-hint">Une seed aléatoire sera générée à la création.</p>
            )}
          </div>

          <div className="field">
            <span>Population initiale</span>
            <div className="segmented">
              <button type="button" className={generationMode === 'random' ? 'active' : ''} onClick={() => setGenerationMode('random')}>
                <Sparkles size={14} /> Personnages aléatoires
              </button>
              <button type="button" className={generationMode === 'empty' ? 'active' : ''} onClick={() => setGenerationMode('empty')}>
                Monde vide
              </button>
            </div>
            {generationMode === 'random' ? (
              <label className="field nested">
                <span>Nombre de personnages</span>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={characterCount}
                  onChange={(e) => setCharacterCount(Number(e.target.value))}
                />
              </label>
            ) : (
              <p className="field-hint">Le monde sera créé sans personnage. La génération sera ajoutée dans une phase ultérieure.</p>
            )}
          </div>

          {error ? <div className="error-banner">{error}</div> : null}

          <div className="dialog-actions">
            <button type="button" className="button ghost" onClick={onClose} disabled={submitting}>Annuler</button>
            <button type="submit" className="button primary" disabled={submitting || !name.trim()}>
              {submitting ? 'Création…' : 'Créer le monde'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}