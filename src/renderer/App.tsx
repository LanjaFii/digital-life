import { useCallback, useEffect, useState } from 'react';
import { Globe2, Plus, RefreshCw, Trash2, Play, ShieldCheck, AlertTriangle, Library } from 'lucide-react';
import type { DiagnosticResult } from '../shared/ipc';
import type { CreateWorldInput, WorldSummary } from '../shared/world';
import { DiagnosticList } from './components/DiagnosticList';
import { CreateWorldDialog } from './components/CreateWorldDialog';
import { WorldView } from './components/WorldView';
import { LibraryView } from './components/LibraryView';

function formatDate(value: string): string {
  try {
    return new Date(value).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return value;
  }
}

export default function App() {
  const [worlds, setWorlds] = useState<WorldSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<WorldSummary | null>(null);
  const [showDiag, setShowDiag] = useState(false);
  const [diagnostic, setDiagnostic] = useState<DiagnosticResult | null>(null);
  const [selectedWorldId, setSelectedWorldId] = useState<string | null>(null);
  const [showLibrary, setShowLibrary] = useState(false);

  const loadWorlds = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await window.digitalLife.listWorlds();
      setWorlds(result.worlds);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDiagnostic = useCallback(async () => {
    try {
      setDiagnostic(await window.digitalLife.getDiagnostic());
    } catch {
      setDiagnostic(null);
    }
  }, []);

  useEffect(() => {
    void loadWorlds();
    void loadDiagnostic();
  }, [loadWorlds, loadDiagnostic]);

  async function handleCreate(input: CreateWorldInput) {
    await window.digitalLife.createWorld(input);
    await loadWorlds();
  }

  async function handleDelete(world: WorldSummary) {
    setDeletingId(world.id);
    setError(null);
    try {
      await window.digitalLife.deleteWorld(world.id);
      setConfirmDelete(null);
      if (selectedWorldId === world.id) setSelectedWorldId(null);
      await loadWorlds();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setDeletingId(null);
    }
  }

  function handleOpenWorld(worldId: string) {
    setError(null);
    setSelectedWorldId(worldId);
  }

  function handleBackToMenu() {
    setSelectedWorldId(null);
    void loadWorlds();
  }

  return (
    <div className="app-shell">
      <div className="ambient ambient-a" aria-hidden="true" />
      <div className="ambient ambient-b" aria-hidden="true" />

      {selectedWorldId ? (
        <WorldView worldId={selectedWorldId} onBackToMenu={handleBackToMenu} />
      ) : showLibrary ? (
        <LibraryView onBackToMenu={() => setShowLibrary(false)} />
      ) : (
        <>
          <header className="hero">
            <div>
              <p className="eyebrow">Simulateur de vie autonome</p>
              <h1>DIGITAL <span>LIFE</span></h1>
              <p className="subtitle">Observe des mondes émerger. N'interviens pas dans les histoires — crée les conditions, puis regarde.</p>
            </div>
            <div className="hero-actions">
              <button type="button" className="button ghost" onClick={() => setShowLibrary(true)}>
                <Library size={16} /> Ma bibliothèque
              </button>
              <button type="button" className="button ghost" onClick={() => { setShowDiag((v) => !v); void loadDiagnostic(); }}>
                <ShieldCheck size={16} /> Diagnostic
              </button>
              <button type="button" className="button primary" onClick={() => setShowCreate(true)}>
                <Plus size={16} /> Créer un monde
              </button>
            </div>
          </header>

          {error ? (
            <div className="error-banner" role="alert"><AlertTriangle size={16} /> <span>{error}</span></div>
          ) : null}

          <main className="content-grid">
            <section className="panel worlds-panel">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Sauvegardes locales</p>
                  <h2>Mondes</h2>
                </div>
                <button type="button" className="button ghost" onClick={() => void loadWorlds()} disabled={loading}>
                  <RefreshCw size={15} className={loading ? 'spin' : ''} /> Actualiser
                </button>
              </div>

              {loading ? (
                <div className="empty-state"><div className="loader" aria-hidden="true" />Chargement des mondes…</div>
              ) : worlds.length === 0 ? (
                <div className="empty-state">
                  <Globe2 size={42} strokeWidth={1.2} />
                  <h3>Aucun monde sauvegardé</h3>
                  <p>Crée ton premier monde pour initialiser une simulation. Les sauvegardes sont stockées localement en SQLite.</p>
                  <button type="button" className="button primary" onClick={() => setShowCreate(true)}>
                    <Plus size={16} /> Créer un monde
                  </button>
                </div>
              ) : (
                <ul className="world-list">
                  {worlds.map((world) => (
                    <li key={world.id} className="world-card">
                      <div className="world-main">
                        <div className="world-title-row">
                          <h3>{world.name}</h3>
                          <span className={`mode-chip ${world.generationMode}`}>
                            {world.generationMode === 'random' ? 'Aléatoire' : 'Vide'}
                          </span>
                        </div>
                        <div className="world-meta">
                          <span>Seed <strong>{world.seed}</strong></span>
                          <span>{world.characterCount} personnage{world.characterCount > 1 ? 's' : ''}</span>
                          <span>Créé le {formatDate(world.createdAt)}</span>
                        </div>
                      </div>
                      <div className="world-actions">
                        <button type="button" className="button ghost" onClick={() => handleOpenWorld(world.id)}>
                          <Play size={15} /> Reprendre
                        </button>
                        <button
                          type="button"
                          className="button danger"
                          onClick={() => setConfirmDelete(world)}
                          disabled={deletingId === world.id}
                        >
                          <Trash2 size={15} /> {deletingId === world.id ? 'Suppression…' : 'Supprimer'}
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {showDiag ? (
              <section className="panel diag-panel">
                <div className="panel-header">
                  <div>
                    <p className="eyebrow">Système</p>
                    <h2>Diagnostic</h2>
                  </div>
                  <button type="button" className="button ghost" onClick={() => void loadDiagnostic()}>
                    <RefreshCw size={15} /> Actualiser
                  </button>
                </div>
                {diagnostic ? (
                  <>
                    <p className={diagnostic.ok ? 'status ok' : 'status failed'}>
                      {diagnostic.ok ? 'Tous les contrôles passent.' : 'Des contrôles ont échoué.'}
                    </p>
                    <DiagnosticList checks={diagnostic.checks} />
                  </>
                ) : <p className="muted">Diagnostic indisponible.</p>}
              </section>
            ) : null}
          </main>

          {showCreate ? <CreateWorldDialog onClose={() => setShowCreate(false)} onCreate={handleCreate} /> : null}

          {confirmDelete ? (
            <div className="dialog-backdrop" role="dialog" aria-modal="true" aria-label="Confirmer la suppression">
              <div className="dialog dialog-small">
                <div className="dialog-header">
                  <div>
                    <p className="eyebrow">Action destructive</p>
                    <h2>Supprimer le monde</h2>
                  </div>
                </div>
                <div className="dialog-body">
                  <p>Supprimer <strong>{confirmDelete.name}</strong> ? Cette action efface la sauvegarde locale de ce monde.</p>
                  <div className="dialog-actions">
                    <button type="button" className="button ghost" onClick={() => setConfirmDelete(null)} disabled={deletingId === confirmDelete.id}>Annuler</button>
                    <button type="button" className="button danger solid" onClick={() => void handleDelete(confirmDelete)} disabled={deletingId === confirmDelete.id}>
                      {deletingId === confirmDelete.id ? 'Suppression…' : 'Supprimer définitivement'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}