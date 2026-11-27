/**
 * Panneau de consultation des décisions récentes (Phase 3D-D).
 *
 * Ce composant est purement lecteur : il n'envoie aucune commande au moteur et
 * ne modifie ni personnage, ni simulation. Le détail n'est demandé qu'après
 * sélection explicite d'une décision dans la liste.
 */
import { useEffect, useState } from 'react';
import { AlertTriangle, ChevronLeft, ChevronRight, History, RefreshCw } from 'lucide-react';
import { DECISION_HISTORY_DEFAULT_LIMIT } from '../../shared/decision-view';
import { useDecisionHistory, useDecisionRecord } from '../hooks/use-decision-history';
import { DecisionDetail } from './DecisionDetail';
import { actionLabel, formatScore, ruleLabel, simulatedTime } from './decision-labels';

interface Props {
  worldId: string;
  /** Tick de l'horloge : toute valeur identique évite un rechargement réseau/IPC. */
  revision: number;
  /** Filtre facultatif pour un accès depuis la fiche d'un personnage. */
  characterId?: string | null;
  title?: string;
}

export function DecisionPanel({ worldId, revision, characterId = null, title = 'Décisions récentes' }: Props) {
  const [offset, setOffset] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const history = useDecisionHistory(worldId, revision, characterId, offset, DECISION_HISTORY_DEFAULT_LIMIT);
  const detail = useDecisionRecord(worldId, selectedId);

  useEffect(() => {
    setOffset(0);
    setSelectedId(null);
  }, [worldId, characterId]);

  const canGoPrevious = offset > 0;
  const canGoNext = history.items.length === DECISION_HISTORY_DEFAULT_LIMIT;

  return (
    <section className="panel decision-panel" aria-label={title}>
      <div className="panel-header">
        <div>
          <p className="eyebrow">Explicabilité</p>
          <h2>{title}</h2>
        </div>
        <span className="count-chip">{history.items.length}</span>
      </div>

      {history.error ? (
        <div className="decision-state decision-state-error" role="alert">
          <AlertTriangle size={18} />
          <span>Impossible de lire l'historique : {history.error}</span>
          <button type="button" className="button ghost" onClick={history.retry}><RefreshCw size={14} /> Réessayer</button>
        </div>
      ) : null}

      {history.loading ? (
        <p className="decision-state"><span className="loader" aria-hidden="true" /> Chargement des décisions…</p>
      ) : null}

      {!history.loading && !history.error && history.items.length === 0 ? (
        <div className="empty-state decision-empty">
          <History size={34} strokeWidth={1.2} />
          <h3>Aucune décision enregistrée</h3>
          <p>Les décisions apparaîtront ici après l'avancement de la simulation.</p>
        </div>
      ) : null}

      {!history.error && history.items.length > 0 ? (
        <ul className="decision-summary-list">
          {history.items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className={`decision-summary ${selectedId === item.id ? 'selected' : ''}`}
                onClick={() => setSelectedId(item.id)}
              >
                <span className="decision-summary-time">{simulatedTime(item.day, item.hour)} · tick {item.tick}</span>
                <span className="decision-summary-name">{item.characterName}</span>
                <span className="decision-summary-action">{actionLabel(item.selectedActionId)}</span>
                <span className="decision-summary-score">{formatScore(item.score)}</span>
                <span className="decision-summary-reason">{item.reason}</span>
                <span className="decision-summary-rule">{ruleLabel(item.selectionRule)}</span>
                {item.warningCount > 0 ? <span className="decision-warning-badge">{item.warningCount} avertissement(s)</span> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="decision-pagination">
        <button type="button" aria-label="Reculer d'une page" className="button ghost" disabled={!canGoPrevious || history.loading} onClick={() => setOffset((value) => Math.max(0, value - DECISION_HISTORY_DEFAULT_LIMIT))}>
          <ChevronLeft size={14} /> Retour
        </button>
        <span className="muted">Depuis {offset + 1}{history.items.length > 0 ? ` à ${offset + history.items.length}` : ''}</span>
        <button type="button" aria-label="Avancer d'une page" className="button ghost" disabled={!canGoNext || history.loading} onClick={() => setOffset((value) => value + DECISION_HISTORY_DEFAULT_LIMIT)}>
          Plus <ChevronRight size={14} />
        </button>
      </div>

      {selectedId ? (
        <div className="decision-detail-frame">
          <div className="decision-detail-header">
            <h3>Détail de la décision</h3>
            <button type="button" className="button ghost" onClick={() => setSelectedId(null)}>Fermer le détail</button>
          </div>
          {detail.error ? (
            <div className="decision-state decision-state-error" role="alert">
              <AlertTriangle size={18} />
              <span>Impossible de lire le détail : {detail.error}</span>
              <button type="button" className="button ghost" onClick={detail.retry}><RefreshCw size={14} /> Réessayer</button>
            </div>
          ) : null}
          {detail.loading ? <p className="decision-state"><span className="loader" aria-hidden="true" /> Chargement du détail…</p> : null}
          {!detail.loading && !detail.error && detail.items.length === 0 ? (
            <p className="decision-state">Détail indisponible.</p>
          ) : null}
          {!detail.loading && !detail.error && detail.items.length > 0 ? <DecisionDetail record={detail.items[0]} /> : null}
        </div>
      ) : null}
    </section>
  );
}
