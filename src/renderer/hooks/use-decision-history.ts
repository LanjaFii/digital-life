/**
 * Consultation React de l'historique des décisions (Phase 3D-D).
 *
 * Le renderer ne connaît que l'API typée exposée par le preload. Ce hook ne
 * déclenche aucune mutation : il recharge uniquement quand le tick de
 * l'horloge simulée change, avec un throttle de 500 ms et un jeton qui rend
 * obsolètes les réponses d'une requête dépassée.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { DecisionRecordV1 } from '../../shared/decision';
import { DECISION_HISTORY_DEFAULT_LIMIT, type DecisionSummaryView } from '../../shared/decision-view';

/** Fenêtre minimale entre deux chargements de la liste. */
export const DECISION_HISTORY_THROTTLE_MS = 500;

interface AsyncView<T> {
  items: T[];
  loading: boolean;
  error: string | null;
}

function initialView<T>(): AsyncView<T> {
  return { items: [], loading: false, error: null };
}

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

/** Charge la liste des résumés ; `revision` doit être le tick de l'horloge. */
export function useDecisionHistory(
  worldId: string,
  revision: number,
  characterId?: string | null,
  offset = 0,
  limit = DECISION_HISTORY_DEFAULT_LIMIT,
): AsyncView<DecisionSummaryView> & { retry: () => void } {
  const [view, setView] = useState<AsyncView<DecisionSummaryView>>(initialView);
  const [attempt, setAttempt] = useState(0);
  const tokenRef = useRef(0);
  const lastRequestRef = useRef<number>(-Infinity);

  useEffect(() => {
    tokenRef.current += 1;
    const token = tokenRef.current;
    if (!worldId) {
      setView(initialView());
      return;
    }

    let timer: ReturnType<typeof setTimeout> | null = null;
    const execute = () => {
      lastRequestRef.current = Date.now();
      setView((current) => ({ ...current, loading: true, error: null }));
      const query = {
        worldId,
        ...(characterId ? { characterId } : {}),
        limit,
        offset,
      };
      void window.digitalLife.getDecisionHistory(query).then(
        (items) => {
          if (tokenRef.current === token) setView({ items, loading: false, error: null });
        },
        (cause: unknown) => {
          if (tokenRef.current === token) {
            setView({ items: [], loading: false, error: messageOf(cause) });
          }
        },
      );
    };

    const elapsed = Date.now() - lastRequestRef.current;
    if (elapsed >= DECISION_HISTORY_THROTTLE_MS) {
      execute();
    } else {
      timer = setTimeout(execute, DECISION_HISTORY_THROTTLE_MS - elapsed);
    }
    return () => {
      if (timer !== null) clearTimeout(timer);
    };
  }, [worldId, revision, characterId, offset, limit, attempt]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  return { ...view, retry };
}

/** Charge le détail d'une décision seulement après sélection d'un identifiant. */
export function useDecisionRecord(
  worldId: string,
  recordId: string | null,
): AsyncView<DecisionRecordV1> & { retry: () => void } {
  const [view, setView] = useState<AsyncView<DecisionRecordV1>>(initialView);
  const [attempt, setAttempt] = useState(0);
  const tokenRef = useRef(0);

  useEffect(() => {
    tokenRef.current += 1;
    const token = tokenRef.current;
    if (!worldId || !recordId) {
      setView(initialView());
      return;
    }
    setView((current) => ({ ...current, loading: true, error: null }));
    void window.digitalLife.getDecisionRecord(worldId, recordId).then(
      (record) => {
        if (tokenRef.current === token) setView({ items: [record], loading: false, error: null });
      },
      (cause: unknown) => {
        if (tokenRef.current === token) setView({ items: [], loading: false, error: messageOf(cause) });
      },
    );
  }, [worldId, recordId, attempt]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  return { ...view, retry };
}
